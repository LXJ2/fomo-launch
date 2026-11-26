// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Test} from "forge-std/Test.sol";
import {ERC1967Proxy} from "@openzeppelin/proxy/ERC1967/ERC1967Proxy.sol";
import {FomoVault} from "../src/FomoVault.sol";

contract RouterStub {
    address public recipient;
    uint256 public spent;

    function swapExactETHForTokensSupportingFeeOnTransferTokens(uint256 minOut, address[] calldata, address to, uint256)
        external
        payable
    {
        require(minOut == 1, "slippage");
        recipient = to;
        spent = msg.value;
    }
}

contract FomoVaultTest is Test {
    FomoVault vault;
    RouterStub router;

    function setUp() public {
        router = new RouterStub();
        vault = FomoVault(
            payable(address(
                    new ERC1967Proxy(
                        address(new FomoVault()),
                        abi.encodeCall(
                            FomoVault.initialize, (address(42), address(this), address(router), address(router))
                        )
                    )
                ))
        );
        vm.deal(address(this), 10 ether);
    }

    function testLastFiveDistinctBuyersAndCutoff() public {
        _fund(5 ether);
        for (uint160 i = 1; i <= 6; i++) {
            _buy(_buyer(i));
        }
        _buy(_buyer(3));
        assertEq(vault.count(), 5);
        address[5] memory top = vault.leaderboard();
        assertEq(top[0], _buyer(3));
        assertEq(top[4], _buyer(2));
        uint256 cutoff = vault.deadline();
        vm.warp(cutoff);
        _fund(2 ether);
        assertEq(vault.prize(), 5 ether);
        assertEq(vault.nextPrize(), 2 ether);
        _buy(_buyer(7));
        assertEq(vault.round(), 2);
        assertEq(vault.prize(), 2 ether);
        assertEq(vault.deadline(), cutoff + 3 minutes);
        assertEq(vault.claimable(_buyer(1)), 0);
        for (uint160 i = 2; i <= 6; i++) {
            assertEq(vault.claimable(_buyer(i)), 1 ether);
        }
        vm.prank(_buyer(3));
        vault.claimReward(payable(_buyer(1)));
        assertEq(vault.claimable(_buyer(3)), 0);
        assertEq(_buyer(1).balance, 1.89 ether);
    }

    function testThresholdAndFailedSwapLeaveStateIntact() public {
        vm.expectRevert(FomoVault.InvalidBuy.selector);
        vault.buyAndEnter{value: 0.1 ether}(1, block.timestamp);
        _buy(_buyer(1));
        vm.warp(vault.deadline());
        vm.expectRevert(bytes("slippage"));
        vault.buyAndEnter{value: 0.11 ether}(2, block.timestamp);
        assertEq(vault.round(), 1);
        assertEq(vault.count(), 1);
    }

    function testEmptyWindowAndDustRollOver() public {
        _buy(_buyer(1));
        vm.warp(block.timestamp + 20);
        _buy(_buyer(2));
        assertEq(vault.deadline(), block.timestamp + 180);
        _fund(5 wei);
        vm.warp(vault.deadline());
        vault.settle();
        assertEq(vault.prize(), 1 wei);
        assertEq(vault.claimable(_buyer(1)), 2 wei);
        vm.warp(vault.deadline());
        vault.settle();
        assertEq(vault.prize(), 1 wei);
        assertEq(vault.deadline(), 0);
        _buy(_buyer(3));
        assertEq(vault.round(), 3);
        assertEq(vault.count(), 1);
        vm.warp(vault.deadline());
        vault.settle();
        assertEq(vault.claimable(_buyer(3)), 1 wei);
    }

    function _buyer(uint160 i) private pure returns (address) {
        return address(0x1000 + i);
    }

    function _buy(address buyer) private {
        vm.deal(buyer, 1 ether);
        vm.prank(buyer);
        vault.buyAndEnter{value: 0.11 ether}(1, block.timestamp);
        assertEq(router.recipient(), buyer);
        assertEq(router.spent(), 0.11 ether);
    }

    function _fund(uint256 amount) private {
        (bool ok,) = address(vault).call{value: amount}("");
        assertTrue(ok);
    }
}
