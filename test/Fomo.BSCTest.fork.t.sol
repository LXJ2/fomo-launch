// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {ForkBase} from "./ForkBase.sol";
import {ForkAddresses} from "./ForkAddresses.sol";
import {FomoLauncher, FomoConfig} from "../src/FomoLauncher.sol";
import {FomoLauncherFactory} from "../src/FomoLauncherFactory.sol";
import {FomoVaultFactory} from "../src/FomoVaultFactory.sol";
import {FomoVault} from "../src/FomoVault.sol";

contract FomoForkTest is ForkBase {
    function _addrs() internal pure override returns (ForkAddresses.Addrs memory) {
        return ForkAddresses.bscTest();
    }

    function testLaunchTradeTaxAndTwoRounds() public {
        FomoLauncherFactory launcherFactory = new FomoLauncherFactory(portalAddr, guardian);
        FomoVaultFactory vaultFactory = new FomoVaultFactory(address(launcherFactory), v2Router, wbnb);
        vm.startPrank(admin);
        portal.setLauncherFactoryMultiplier(address(launcherFactory), 10_000, true);
        portal.setVaultFactoryMultiplier(address(vaultFactory), 10_000, true);
        vm.stopPrank();

        FomoConfig memory config = FomoConfig({
            name: "FOMO Launch",
            symbol: "FOMO",
            meta: "ipfs://fomo-test",
            salt: _mineSalt("fomo-launch"),
            targetRaise: 10 ether,
            saleDuration: 1 days,
            vaultFactory: address(vaultFactory),
            taxDuration: 30 days
        });
        uint256 fee = portal.SALT_LOCK_FEE();
        vm.prank(creator);
        FomoLauncher launcher =
            FomoLauncher(portal.newLauncher{value: fee}(address(launcherFactory), abi.encode(config)));
        vm.prank(alice);
        launcher.contribute{value: 10 ether}();
        assertTrue(launcher.launched());
        assertTrue(launcher.pool().code.length != 0);
        vm.prank(alice);
        launcher.claim();

        FomoVault vault = FomoVault(payable(launcher.vault()));
        _generateTaxAndDispatch(launcher.token());
        uint256 pot = vault.prize();
        assertGt(pot, 0, "real tax must arrive at vault");

        vm.prank(alice);
        vault.buyAndEnter{value: 0.11 ether}(1, block.timestamp + 30);
        vm.warp(block.timestamp + 179);
        vm.prank(bob);
        vault.buyAndEnter{value: 0.11 ether}(1, block.timestamp + 30);
        assertEq(vault.deadline(), block.timestamp + 180);
        vm.warp(vault.deadline());
        vault.settle();
        assertEq(vault.round(), 2);
        assertGe(vault.claimable(alice), pot / 2);
        assertEq(vault.claimable(alice), vault.claimable(bob));
        uint256 before = alice.balance;
        uint256 reward = vault.claimable(alice);
        vm.prank(alice);
        vault.claimReward(payable(alice));
        assertEq(alice.balance - before, reward);
        vm.prank(bob);
        vault.buyAndEnter{value: 0.11 ether}(1, block.timestamp + 30);
        assertEq(vault.leaderboard()[0], bob);
        assertEq(vault.round(), 2);
    }
}
