// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {LibClone} from "solady/utils/LibClone.sol";
import {UpgradeableBeacon} from "solady/utils/UpgradeableBeacon.sol";
import {DirectLaunchVaultFactoryBase} from "./flap/DirectLaunchVaultFactoryBase.sol";
import {IPortal, IPortalTypes} from "./flap/IPortal.sol";
import {Distribution} from "./flap/Distribution.sol";
import {FieldDescriptor, VaultDataSchema, FactoryPolicy} from "./flap/IVaultSchemas.sol";
import {FomoVault} from "./FomoVault.sol";

contract FomoVaultFactory is DirectLaunchVaultFactoryBase {
    address public immutable launcherFactory;
    address public immutable router;
    address public immutable wrappedNative;
    address public immutable beacon;
    error InvalidFomoLaunch();

    constructor(address launcherFactory_, address router_, address wrapped_) {
        if (launcherFactory_.code.length == 0 || router_.code.length == 0 || wrapped_.code.length == 0) {
            revert InvalidFomoLaunch();
        }
        launcherFactory = launcherFactory_;
        router = router_;
        wrappedNative = wrapped_;
        beacon = address(new UpgradeableBeacon(address(this), address(new FomoVault())));
    }

    function newVault(address token, address creator, uint8 kind, bytes calldata params)
        external
        override
        onlyHub
        returns (address vault)
    {
        (IPortalTypes.CreateTaxTokenParams memory p, Distribution memory d, bytes memory data) =
            _validateLaunch(token, creator, kind, params);
        _requireNoReserveDistribution(d);
        if (
            p.quoteToken != address(0) || p.dexId != 0 || data.length != 32 || abi.decode(data, (address)) != creator
                || IPortal(_getHub()).getLauncher(creator).launcherFactory != launcherFactory
        ) revert InvalidFomoLaunch();
        if (
            p.feeConfigs.length != 2 || p.feeConfigs[0].feeType != IPortalTypes.FeeSlotType.VAULT
                || p.feeConfigs[0].bps != 5000 || p.feeConfigs[1].feeType != IPortalTypes.FeeSlotType.LP_BPS
                || p.feeConfigs[1].bps != 5000
        ) revert InvalidFomoLaunch();
        vault = LibClone.deployDeterministicERC1967BeaconProxy(beacon, bytes32(uint256(uint160(token))));
        FomoVault(payable(vault)).initialize(token, creator, router, wrappedNative);
    }

    function upgradeVaultImplementation(address newImplementation) external override onlyGuardian {
        UpgradeableBeacon(beacon).upgradeTo(newImplementation);
    }

    function factorySpecVersion() public pure override returns (string memory) {
        return "pl-v1";
    }

    function isQuoteTokenSupported(address quoteToken) public pure override returns (bool) {
        return quoteToken == address(0);
    }

    function vaultDataSchema() public pure override returns (VaultDataSchema memory schema) {
        schema.description = "FOMO Launch Vault. Data is provided by the paired Launcher.";
        schema.fields = new FieldDescriptor[](1);
        schema.fields[0] = FieldDescriptor("launcher", "address", "Paired Launcher", 0);
    }

    function tokenCreationPolicies() public pure override returns (FactoryPolicy[] memory policies) {
        policies = new FactoryPolicy[](2);
        policies[0] = FactoryPolicy("quoteToken", "eq", abi.encode(address(0)), "Native BNB only");
        policies[1] = FactoryPolicy("vaultSlotBps", "eq", abi.encode(uint256(5000)), "50% to FOMO Vault");
    }
}
