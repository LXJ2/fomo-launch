# FOMO Launch | Flap Pool Launch Track

FOMO Launch is a directory of independent BSC Testnet launches. Each project raises liquidity through a Flap Launcher Factory, then starts its own three-minute FOMO rounds. Qualifying buys reset the clock. The last five distinct buyers share half of the trading tax received for the round, and later rounds continue while prior winners can still claim. The remaining trading tax goes to liquidity.

[Interactive demo](https://fomo-launch-seven.vercel.app/?view=launchpad) opens the public prototype in demo mode. For judging, use the same URL with `?launcher=0x…` after registering a real Launcher and verify that the live project is accessible.

## Submission evidence

Fill these from successful public BSC Testnet transactions. The fork test uses real protocol contracts but simulates Factory authorization locally.

| Requirement | Source to verify | Public testnet evidence to attach |
| --- | --- | --- |
| Launcher Factory | `src/FomoLauncherFactory.sol` and `src/FomoLauncher.sol` | Factory address and Portal `newLauncher` transaction |
| Launch a token | `src/FomoLauncher.sol` | Final contribution transaction, Launcher, token and V2 pool addresses |
| Tax-funded Vault | `src/FomoVaultFactory.sol` and `src/FomoVault.sol` | Vault Factory and Vault addresses, tax dispatch, qualified buys, settlement and reward claim transactions |
| Custom UI | `web/` and `flap-ui/` | Standalone project deep link and Flap-validated Launcher ZIP or preview link |

## Handoff order

1. Use a funded BSC Testnet signer and the deployment commands in [README.md](README.md) to send both Factory deployments.
2. Send the two Factory addresses and source to Flap for review. Ask for enablement and the applicable minimum pool quote. Read the live Launcher Factory flag with `launcherFactoryMultiplier(address)` on the Pool Launch Portal before creating the Launcher.
3. Create a Launcher through `Portal.newLauncher`, submit the final contribution, and record the public deployment evidence in the table. On the real project page, use qualifying buys, dispatch processed taxes before round expiry, settle and claim. Capture a second-round buy to establish that the round advances.
4. Build the three-file Launcher ZIP against the deployed Factory.

   ```sh
   node script/flap-package.mjs 0xYOUR_LAUNCHER_FACTORY /path/to/Flap-template-checkout
   ```

   Use Flap's official Launcher runtime template checkout with its dependencies installed. This command checks the Factory on chain 97 and runs Flap's source checker. Send the resulting `submission/fomo-launcher-ui.zip` for Flap Workbench review. The Launcher detail uses the Flap wallet bridge for contributions, token claims and refunds, and links to the standalone arena for post-launch actions.
5. Set `web/config.json` with the actual Factory and default Launcher, rebuild, and verify the real project page from the judge's account. Share the evidence table and the short explanation above.

Flap reference documentation is available in the [Pool Launch build guide](https://docs.flap.sh/en/flap/v2/developers/pool-launch/build-on-pool-launch) and the [Launcher UI template guide](https://github.com/flap-sh/flap-vault-component-template/blob/test/pool-launch-developer-preview/examples/launcher-runtime/README.md).
