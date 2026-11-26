// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import {Script, console2} from "forge-std/Script.sol";
import {FomoLauncher, FomoConfig} from "../src/FomoLauncher.sol";
import {FomoLauncherFactory} from "../src/FomoLauncherFactory.sol";
import {FomoVaultFactory} from "../src/FomoVaultFactory.sol";
import {IPortal} from "../src/flap/IPortal.sol";
import {LaunchVaultAddresses} from "../src/flap/LaunchVaultAddresses.sol";

contract FomoDeploy is Script {
    address internal constant ROUTER = 0xc9D63ddCB9549578057EAB6A83a543DdFEE2b8c3;
    address internal constant WBNB = 0xae13d989daC2f0dEbFf460aC112a837C89BAa7cd;

    modifier testnetOnly() {
        require(block.chainid == 97, "BSC Testnet only");
        _;
    }

    function deployFactories() external testnetOnly {
        address portal = LaunchVaultAddresses.hub();
        require(portal.code.length != 0, "Portal missing");
        vm.startBroadcast();
        FomoLauncherFactory launcherFactory = new FomoLauncherFactory(portal, LaunchVaultAddresses.guardian());
        FomoVaultFactory vaultFactory = new FomoVaultFactory(address(launcherFactory), ROUTER, WBNB);
        vm.stopBroadcast();
        console2.log("Launcher Factory", address(launcherFactory));
        console2.log("Vault Factory", address(vaultFactory));
    }

    function createLauncher() external testnetOnly {
        IPortal portal = IPortal(LaunchVaultAddresses.hub());
        address factory = vm.envAddress("FOMO_LAUNCHER_FACTORY");
        address vaultFactory = vm.envAddress("FOMO_VAULT_FACTORY");
        (bool enabled,) = portal.launcherFactoryMultiplier(factory);
        require(enabled, "Flap must enable Launcher Factory");
        require(FomoVaultFactory(vaultFactory).launcherFactory() == factory, "Factory mismatch");

        uint256 taxDuration = vm.envOr("FOMO_TAX_SECONDS", uint256(30 days));
        require(taxDuration > 0 && taxDuration <= type(uint32).max, "Invalid tax duration");
        FomoConfig memory config = FomoConfig({
            name: vm.envOr("FOMO_TOKEN_NAME", string("FOMO Launch")),
            symbol: vm.envOr("FOMO_TOKEN_SYMBOL", string("FOMO")),
            meta: vm.envString("FOMO_TOKEN_META"),
            salt: vm.envBytes32("FOMO_TOKEN_SALT"),
            targetRaise: vm.envUint("FOMO_TARGET_WEI"),
            saleDuration: vm.envOr("FOMO_SALE_SECONDS", uint256(1 days)),
            vaultFactory: vaultFactory,
            taxDuration: uint32(taxDuration)
        });
        uint256 fee = portal.SALT_LOCK_FEE();
        vm.startBroadcast();
        address launcher = portal.newLauncher{value: fee}(factory, abi.encode(config));
        vm.stopBroadcast();
        console2.log("Launcher", launcher);
    }

    function contribute() external testnetOnly {
        FomoLauncher launcher = FomoLauncher(vm.envAddress("FOMO_LAUNCHER"));
        IPortal portal = IPortal(LaunchVaultAddresses.hub());
        require(portal.getLauncher(address(launcher)).launcherFactory != address(0), "Launcher not registered");
        uint256 amount = vm.envUint("FOMO_CONTRIBUTION_WEI");
        vm.startBroadcast();
        launcher.contribute{value: amount}();
        vm.stopBroadcast();
        console2.log("Token", launcher.token());
        console2.log("Pool", launcher.pool());
        console2.log("Vault", launcher.vault());
    }
}
