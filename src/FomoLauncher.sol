// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;
import {IPortalTypes, IPortal} from "src/flap/IPortal.sol";

import {Initializable} from "@openzeppelin-contracts-upgradeable/proxy/utils/Initializable.sol";
import {LauncherBase} from "src/flap/LauncherBase.sol";
import {Distribution, DistributionTarget} from "src/flap/Distribution.sol";
import {IStrategy} from "src/flap/IStrategy.sol";
import {LaunchExtensionHelper} from "src/flap/LaunchExtensionHelper.sol";
import {SafeTransferLib} from "solady/utils/SafeTransferLib.sol";
import {LauncherDescription} from "src/flap/LauncherHelper.sol";

// Display copy for `description()`. Chinese constants must be `unicode` literals.
string constant MINT_TITLE_ZH = "FOMO Launch";
string constant MINT_TITLE_EN = "FOMO Launch";
string constant MINT_SUMMARY_ZH =
    unicode"持续募集 BNB 直至达到目标。募集的 BNB 与 50% 的代币供应一起注入流动性池，另外 50% 由贡献者按出资比例领取。未达到目标时，出资可以退回。";
string constant MINT_SUMMARY_EN =
    "BNB is collected until the target is met. The raise and 50% of the supply then seed the pool; the other 50% is claimed by contributors in proportion to their share. If the target is missed, contributions are refunded.";

struct FomoConfig {
    string name;
    string symbol;
    string meta;
    bytes32 salt;
    uint256 targetRaise;
    uint256 saleDuration;
    address vaultFactory;
    uint32 taxDuration;
}

contract FomoLauncher is LauncherBase, Initializable, IStrategy {
    using SafeTransferLib for address;

    uint256 public constant TOTAL_SUPPLY = 1_000_000 ether;
    uint256 public constant POOL_TOKEN = TOTAL_SUPPLY / 2;
    uint256 internal constant DISTRIBUTED_TOKEN = TOTAL_SUPPLY - POOL_TOKEN;

    address public hub;
    address public creator;
    bytes32 public launchSalt;
    uint256 public targetRaise;
    uint256 public saleDeadline;

    string public name;
    string public symbol;
    string public meta;
    address public vaultFactory;
    uint32 public taxDuration;
    address public vault;

    uint256 public raised;
    mapping(address account => uint256 amount) public contributions;

    bool public launched;
    bool internal launching;
    bool internal distributionInitialized;

    address public token;
    address public pool;
    mapping(address account => uint256 amount) public claimed;

    event Contributed(address indexed account, uint256 amount);
    event Launched(address indexed token, address indexed pool, uint256 poolQuote, uint256 poolToken);
    event Claimed(address indexed account, uint256 amount);
    event Refunded(address indexed account, uint256 amount);

    error InvalidConfig();
    error SaleClosed();
    error ZeroContribution();
    error TargetExceeded();
    error LaunchInProgress();
    error UnauthorizedDistribution();
    error DistributionNotInitialized();
    error NothingToClaim();
    error RefundUnavailable();
    error NothingToRefund();
    error EthTransferFailed();

    constructor() {
        _disableInitializers();
    }

    function initialize(address hub_, address creator_, FomoConfig calldata c) external payable initializer {
        if (hub_ == address(0) || creator_ == address(0)) revert InvalidConfig();
        if (c.salt == bytes32(0) || c.targetRaise == 0 || c.saleDuration == 0) revert InvalidConfig();

        if (c.vaultFactory.code.length == 0 || c.taxDuration == 0 || c.targetRaise > type(uint128).max) {
            revert InvalidConfig();
        }
        vaultFactory = c.vaultFactory;
        taxDuration = c.taxDuration;
        hub = hub_;
        creator = creator_;
        launchSalt = c.salt;
        targetRaise = c.targetRaise;
        saleDeadline = block.timestamp + c.saleDuration;
        name = c.name;
        symbol = c.symbol;
        meta = c.meta;

        uint256 fee = IPortal(hub_).SALT_LOCK_FEE();
        // Exactly the fee: anything extra would stay here, since neither a refund nor the launch can spend it.
        if (msg.value != fee) revert InvalidConfig();
        IPortal(hub_).lockSalt{value: fee}(c.salt, uint8(IPortalTypes.LaunchKind.DIRECT_V2_POOL_TAX));
    }

    function _getHub() internal view override returns (address) {
        return hub;
    }

    function _description() internal view override returns (LauncherDescription memory d) {
        d.name = name;
        d.symbol = symbol;
        d.quoteToken = address(0); // native BNB, matching `_buildParams`' p.quoteToken
        d.targetRaise = targetRaise; // native has 18 decimals already
        d.poolTokenRatio = (POOL_TOKEN * 1e18) / TOTAL_SUPPLY;
        d.titleZh = MINT_TITLE_ZH;
        d.titleEn = MINT_TITLE_EN;
        d.summaryZh = MINT_SUMMARY_ZH;
        d.summaryEn = MINT_SUMMARY_EN;
    }

    // Contribution round

    function contribute() external payable {
        if (launching) revert LaunchInProgress();
        if (block.timestamp >= saleDeadline) revert SaleClosed();
        if (msg.value == 0) revert ZeroContribution();
        if (raised + msg.value > targetRaise) revert TargetExceeded();

        raised += msg.value;
        contributions[msg.sender] += msg.value;
        emit Contributed(msg.sender, msg.value);

        if (raised == targetRaise) _launch();
    }

    function refund() external {
        if (launched || raised == targetRaise || block.timestamp < saleDeadline) revert RefundUnavailable();

        uint256 amount = contributions[msg.sender];
        if (amount == 0) revert NothingToRefund();

        contributions[msg.sender] = 0;
        raised -= amount;

        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert EthTransferFailed();
        emit Refunded(msg.sender, amount);
    }

    // Launch and distribution

    function _launch() private {
        IPortalTypes.CreateTaxTokenParams memory p = _buildParams();
        Distribution memory dist = Distribution({
            target: DistributionTarget.EXPLICIT,
            strategy: address(this), // the Portal calls initializeDistribution on us
            amount: uint128(DISTRIBUTED_TOKEN),
            configData: ""
        });
        IPortalTypes.CreatorBuyParams memory creatorBuy;

        // `LauncherBase._launchOnHub` takes calldata parameters, and these are built in memory, so the same
        // Portal entry point is called directly.
        launching = true;
        (address token_, address pool_) = IPortal(hub).launchTaxTokenV2{value: targetRaise}(p, dist, creatorBuy);
        launching = false;

        if (!distributionInitialized || token != token_) revert DistributionNotInitialized();
        address actualFactory;
        (vault, actualFactory) = IPortal(hub).getLaunchVault(token_);
        if (vault == address(0) || actualFactory != vaultFactory) revert InvalidConfig();
        launched = true;
        token = token_;
        pool = pool_;
        emit Launched(token_, pool_, targetRaise, POOL_TOKEN);
    }

    function initializeDistribution(address token_, uint256 amount, bytes calldata, bytes32) external override onlyHub {
        if (!launching || distributionInitialized) revert UnauthorizedDistribution();
        if (token_ == address(0) || amount != DISTRIBUTED_TOKEN) revert InvalidConfig();

        distributionInitialized = true;
        token = token_;

        token_.safeTransferFrom(msg.sender, address(this), amount);
        emit FlapDistributionInitialized(token_, amount);
    }

    function claim() external {
        if (!launched) revert DistributionNotInitialized();

        uint256 entitled = (contributions[msg.sender] * DISTRIBUTED_TOKEN) / targetRaise;
        uint256 amount = entitled - claimed[msg.sender];
        if (amount == 0) revert NothingToClaim();

        claimed[msg.sender] = entitled;
        token.safeTransfer(msg.sender, amount);
        emit Claimed(msg.sender, amount);
    }

    // Launch parameters

    function _buildParams() private view returns (IPortalTypes.CreateTaxTokenParams memory p) {
        p.name = name;
        p.symbol = symbol;
        p.meta = meta;
        p.totalSupply = TOTAL_SUPPLY;
        p.salt = launchSalt;
        p.quoteToken = address(0); // native BNB
        p.dexId = 0;
        p.poolQuote = targetRaise;
        p.poolToken = POOL_TOKEN;
        p.buyTaxRate = 300;
        p.sellTaxRate = 500;
        p.taxDuration = taxDuration;
        p.antiFarmerDuration = 1 days;
        p.feeConfigs = _feeConfigs();
        p.antiSniperMode = 0;
        p.exemptWindow = 0;
        p.exemptAddrs = new address[](0);
        p.creatorBuyQuote = 0;
        // Show the end user, not this contract, as the creator on the launch event. The Portal accepts the
        // creator extension from a recorded Launcher; vault, salt and payment still use this contract.
        (p.extensionID, p.extensionData) = LaunchExtensionHelper.encodeCreator(creator);
        p.commissionReceiver = address(0);
    }

    function _feeConfigs() private view returns (IPortalTypes.FeeConfig[] memory fees) {
        fees = new IPortalTypes.FeeConfig[](2);
        fees[0] = IPortalTypes.FeeConfig(
            IPortalTypes.FeeSlotType.VAULT,
            5000,
            abi.encode(IPortalTypes.FeeConfigVault(vaultFactory, abi.encode(address(this))))
        );
        fees[1] = IPortalTypes.FeeConfig(IPortalTypes.FeeSlotType.LP_BPS, 5000, "");
    }
}

