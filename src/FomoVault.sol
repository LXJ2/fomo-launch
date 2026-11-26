// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Initializable} from "@openzeppelin-contracts-upgradeable/proxy/utils/Initializable.sol";
import {DirectLaunchVaultBase} from "./flap/DirectLaunchVaultBase.sol";
import {VaultUISchema, VaultMethodSchema, FieldDescriptor} from "./flap/IVaultSchemas.sol";

interface IFomoRouter {
    function swapExactETHForTokensSupportingFeeOnTransferTokens(
        uint256 minOut,
        address[] calldata path,
        address recipient,
        uint256 deadline
    ) external payable;
}

contract FomoVault is DirectLaunchVaultBase, Initializable {
    uint256 public constant WINDOW = 3 minutes;
    uint256 public constant MIN_BUY = 0.1 ether;

    address public taxToken;
    address public launcher;
    address public router;
    address public wrappedNative;
    uint256 public round;
    uint256 public deadline;
    uint256 public prize;
    uint256 public nextPrize;
    uint256 public count;
    address[5] private recent;
    mapping(address => uint256) public claimable;
    bool private entered;

    event QualifiedBuy(uint256 indexed round, address indexed buyer, uint256 spent, uint256 deadline);
    event RoundSettled(uint256 indexed round, address[5] winners, uint256 count, uint256 share);
    event RewardClaimed(address indexed winner, address indexed recipient, uint256 amount);

    error InvalidBuy();
    error RoundNotExpired();
    error NothingToClaim();
    error Reentered();
    error TransferFailed();

    modifier nonReentrant() {
        if (entered) revert Reentered();
        entered = true;
        _;
        entered = false;
    }

    constructor() {
        _disableInitializers();
    }

    function initialize(address token_, address launcher_, address router_, address wrapped_) external initializer {
        if (token_ == address(0) || launcher_ == address(0) || router_.code.length == 0 || wrapped_.code.length == 0) {
            revert InvalidBuy();
        }
        taxToken = token_;
        launcher = launcher_;
        router = router_;
        wrappedNative = wrapped_;
        round = 1;
    }

    receive() external payable {
        // Record actual native BNB delivered by Flap. Late receipts belong to the next round.
        if (deadline != 0 && block.timestamp >= deadline) nextPrize += msg.value;
        else prize += msg.value;
    }

    function leaderboard() external view returns (address[5] memory) {
        return recent;
    }

    function buyAndEnter(uint256 minOut, uint256 tradeDeadline) external payable nonReentrant {
        if (msg.value <= MIN_BUY || minOut == 0 || block.timestamp > tradeDeadline) revert InvalidBuy();
        if (deadline != 0 && block.timestamp >= deadline) _settle();

        address[] memory path = new address[](2);
        path[0] = wrappedNative;
        path[1] = taxToken;
        IFomoRouter(router).swapExactETHForTokensSupportingFeeOnTransferTokens{value: msg.value}(
            minOut, path, msg.sender, tradeDeadline
        );

        uint256 position;
        while (position < count && recent[position] != msg.sender) ++position;
        if (position == count && count < 5) ++count;
        if (position == 5) position = 4;
        while (position != 0) {
            recent[position] = recent[position - 1];
            --position;
        }
        recent[0] = msg.sender;
        deadline = block.timestamp + WINDOW;
        emit QualifiedBuy(round, msg.sender, msg.value, deadline);
    }

    function settle() external nonReentrant {
        if (deadline == 0 || block.timestamp < deadline) revert RoundNotExpired();
        _settle();
    }

    function _settle() private {
        // Empty windows roll their full balance forward once. Resume on the next buy.
        uint256 share = count == 0 ? 0 : prize / count;
        for (uint256 i; i < count; ++i) {
            claimable[recent[i]] += share;
        }
        emit RoundSettled(round, recent, count, share);

        prize = prize - share * count + nextPrize;
        nextPrize = 0;
        deadline = count == 0 ? 0 : block.timestamp + WINDOW;
        delete recent;
        count = 0;
        ++round;
    }

    function claimReward(address payable recipient) external nonReentrant {
        if (recipient == address(0)) revert TransferFailed();
        uint256 amount = claimable[msg.sender];
        if (amount == 0) revert NothingToClaim();
        claimable[msg.sender] = 0;
        (bool ok,) = recipient.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit RewardClaimed(msg.sender, recipient, amount);
    }

    function description() public pure override returns (string memory) {
        return "FOMO Launch. 50% of token trading tax is routed here and 50% to liquidity. Each round shares native BNB receipts equally among its last five distinct qualifying buyers.";
    }

    function vaultUISchema() public pure override returns (VaultUISchema memory schema) {
        schema.vaultType = "FOMO Launch";
        schema.description = "Three-minute rounds. Use the FOMO Launcher UI to quote and enter a buy.";
        schema.methods = new VaultMethodSchema[](4);
        schema.methods[0].name = "settle";
        schema.methods[0].description = "Settle an expired round";
        schema.methods[0].isWriteMethod = true;
        schema.methods[1].name = "claimReward";
        schema.methods[1].description = "Claim available BNB rewards";
        schema.methods[1].isWriteMethod = true;
        schema.methods[1].inputs = new FieldDescriptor[](1);
        schema.methods[1].inputs[0] = FieldDescriptor("recipient", "address", "Reward recipient", 0);
        schema.methods[2].name = "buyAndEnter";
        schema.methods[2].description = "Buy through the V2 router and enter the current round";
        schema.methods[2].isWriteMethod = true;
        schema.methods[2].inputs = new FieldDescriptor[](3);
        schema.methods[2].inputs[0] = FieldDescriptor("amount", "msg.value", "BNB spend (strictly over 0.1)", 18);
        schema.methods[2].inputs[1] = FieldDescriptor("minOut", "uint256", "Minimum tokens after tax and slippage", 18);
        schema.methods[2].inputs[2] = FieldDescriptor("tradeDeadline", "time", "Swap expiration", 0);
        schema.methods[3].name = "claimable";
        schema.methods[3].description = "Read an address's BNB rewards";
        schema.methods[3].inputs = new FieldDescriptor[](1);
        schema.methods[3].inputs[0] = FieldDescriptor("account", "address", "Winner address", 0);
        schema.methods[3].outputs = new FieldDescriptor[](1);
        schema.methods[3].outputs[0] = FieldDescriptor("amount", "uint256", "Claimable BNB", 18);
    }
}
