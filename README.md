# FOMO Launch

FOMO Launch raises native BNB through a Flap Pool Launch Launcher. The raise and 50% of the token supply seed the V2 pool. Contributors can claim the remaining supply pro rata, or refund their contribution if the raise expires below its target.

The token is configured with 3% buy tax and 5% sell tax. The Flap processor allocates 50% of the tax to the FOMO Vault and 50% to liquidity. Buy with strictly more than 0.1 tBNB through `buyAndEnter` to start or reset the 180-second deadline. Each round awards equal shares to the last five distinct qualifying addresses, or to all qualifying addresses if there are fewer than five.

The Vault treats delivered native BNB as prize revenue. Tax sometimes needs trades to reach Flap's liquidation threshold before `dispatch()` can pay the Vault. Payments received at or after the deadline are reserved for the next round. Anyone can settle an expired round, and the next qualified buy can settle it atomically. Unclaimed rewards remain payable across rounds. An empty window carries the prize forward and waits for a qualifying buy. The game has no fixed round count. New tax revenue lasts for the configured Flap tax period, which defaults to 30 days in the deployment script.

Live demo: [fomo-launch-seven.vercel.app](https://fomo-launch-seven.vercel.app/)

## Interface

The standalone UI supports English and Chinese, with a persistent language selector. Without a configured Launcher, it opens in demo mode: simulated buys, expiry, settlement and reward claims require no wallet. Demo balances are illustrative; live prize accounting depends on actual BNB delivered to the Vault.

## Validation and deployment status

Three local Vault unit tests and one BSC Testnet fork integration test passed during development. The fork test covers Launcher creation, token launch, tax delivery, two rounds and reward claiming, with Factory authorization simulated locally. This repository does not yet provide evidence of a public BSC Testnet launch. Factory review and activation by Flap are required before the public end-to-end deployment.

## Build and test

Requires Node.js, npm, and a current Foundry release with Cancun support.

```sh
npm ci
npm run build
npm run dev
forge test --match-contract FomoVaultTest -vv
BSC_TESTNET_RPC_URL=https://bsc-testnet.publicnode.com forge test --match-contract FomoForkTest -vv
```

The fork test uses the real BSC Testnet Portal, router and processor. It enables both factories only in the local simulation. The frontend accepts a Launcher address via the form or the `?launcher=0x…` query parameter.

## Broadcast on BSC Testnet

1. Create an encrypted Foundry account locally and fund its public address with test BNB. Keep the key and password out of this repository.
2. Copy `.env.example` to `.env`. Deploy both factories with the command below and record their addresses from the Foundry broadcast receipts.
3. Give Flap both factory addresses and source for review and enablement. Confirm the minimum amount of tBNB that needs to go into the pool.
4. Run `node script/mine-salt.mjs` to generate a valid salt for the current testnet token implementation. Set the two factory addresses, metadata URI, salt, and target in `.env`, then run the launcher command below. The Portal charges the on-chain salt-lock fee.
5. Set `FOMO_LAUNCHER` and `FOMO_CONTRIBUTION_WEI` to broadcast a contribution. The exact final contribution launches the token automatically. Publish the resulting Launcher, pool, Vault and token addresses from the receipts.
6. Set the Launcher and expected Launcher Factory in `web/config.json` and rebuild the frontend. Generate the Flap Launcher detail ZIP with `node script/flap-package.mjs <launcher-factory-address> <official-template-checkout>`. Follow [FLAP_SUBMISSION.md](FLAP_SUBMISSION.md) for evidence, Workbench review and judge access.

```sh
forge script script/FomoDeploy.s.sol:FomoDeploy --sig 'deployFactories()' --rpc-url https://bsc-testnet.publicnode.com --account YOUR_ACCOUNT --broadcast
forge script script/FomoDeploy.s.sol:FomoDeploy --sig 'createLauncher()' --rpc-url https://bsc-testnet.publicnode.com --account YOUR_ACCOUNT --broadcast
forge script script/FomoDeploy.s.sol:FomoDeploy --sig 'contribute()' --rpc-url https://bsc-testnet.publicnode.com --account YOUR_ACCOUNT --broadcast
```

The launch integration is adapted from [FlapPoolLaunchVaultExample](https://github.com/flap-sh/FlapPoolLaunchVaultExample/tree/29334f689774f6b3a39720b3fc802ab0d6a61718). The Launcher detail is adapted from the [Flap Launcher runtime template](https://github.com/flap-sh/flap-vault-component-template/tree/3a7fa025f7a73dd6b6ff4eecce4e990bf33e1a06/examples/launcher-runtime/launcher-detail-demo).
