// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {LibClone} from "solady/utils/LibClone.sol";
import {UpgradeableBeacon} from "solady/utils/UpgradeableBeacon.sol";
import {LauncherFactoryBase} from "src/flap/LauncherFactoryBase.sol";
import {FomoLauncher, FomoConfig} from "./FomoLauncher.sol";
import {LauncherDataSchema, FieldDescriptor} from "src/flap/IVaultSchemas.sol";

contract FomoLauncherFactory is LauncherFactoryBase {
    address public immutable hub;
    address public immutable guardian;
    address public immutable beacon;

    event FomoLauncherCreated(
        address indexed factory, address indexed launcher, address indexed creator, bytes32 launchSalt
    );
    event FlapLauncherImplementationUpgraded(address implementation);

    error ZeroAddress();
    error InvalidConfig();

    constructor(address hub_, address guardian_) {
        if (hub_ == address(0) || guardian_ == address(0)) revert ZeroAddress();
        hub = hub_;
        guardian = guardian_;

        FomoLauncher impl = new FomoLauncher();
        beacon = address(new UpgradeableBeacon(address(this), address(impl)));
    }

    function _getHub() internal view override returns (address) {
        return hub;
    }

    function _getGuardian() internal view override returns (address) {
        return guardian;
    }

    function _newLauncher(address creator, bytes calldata data) internal override returns (address launcher) {
        FomoConfig memory config = abi.decode(data, (FomoConfig));

        if (keccak256(data) != keccak256(abi.encode(config))) revert InvalidConfig();
        launcher = LibClone.deployDeterministicERC1967BeaconProxy(beacon, config.salt);
        FomoLauncher(launcher).initialize{value: msg.value}(hub, creator, config);

        emit FomoLauncherCreated(address(this), launcher, creator, config.salt);
    }

    function upgradeVaultImplementation(address newImplementation) external override onlyGuardian {
        UpgradeableBeacon(beacon).upgradeTo(newImplementation);
        emit FlapLauncherImplementationUpgraded(newImplementation);
    }

    function beaconImplementation() external view returns (address) {
        return UpgradeableBeacon(beacon).implementation();
    }

    function launcherDataSchema() external pure override returns (LauncherDataSchema memory schema) {
        schema.description =
            "Contribution round: BNB is collected until the target is met. The raise and 50% of the supply then seed the pool; the other 50% is claimed by contributors in proportion to their share. If the target is missed, contributions are refunded.";
        schema.isArray = false;

        FieldDescriptor[] memory fields = new FieldDescriptor[](8);
        fields[0] = FieldDescriptor({name: "name", fieldType: "string", description: "Token name", decimals: 0});
        fields[1] = FieldDescriptor({name: "symbol", fieldType: "string", description: "Token symbol", decimals: 0});
        fields[2] = FieldDescriptor({name: "meta", fieldType: "string", description: "Metadata URI", decimals: 0});
        fields[3] = FieldDescriptor({
            name: "salt",
            fieldType: "bytes32",
            description: "CREATE2 salt; vanity-mined so the token address ends in 0x7777",
            decimals: 0
        });
        fields[4] = FieldDescriptor({
            name: "targetRaise",
            fieldType: "uint256",
            description: "BNB target that must be reached before the launch (also the pool quote)",
            decimals: 18
        });
        fields[5] = FieldDescriptor({
            name: "saleDuration", fieldType: "uint256", description: "Contribution window in seconds", decimals: 0
        });
        fields[6] = FieldDescriptor("vaultFactory", "address", "Enabled FOMO Vault Factory", 0);
        fields[7] = FieldDescriptor("taxDuration", "uint32", "Tax duration in seconds within Portal limits", 0);
        schema.fields = fields;
    }
}
