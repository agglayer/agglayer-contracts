# Verify Rollup
Script to verify one or more rollup (aggchain) contracts on Etherscan:
- the rollup proxy (`PolygonTransparentProxy`, deployed by `AgglayerManager`)
- optionally, the implementation contract behind the proxy

## Install
```
npm i
```

## Setup
- Config file `verifyRollup.json`:
  - `rollupManagerAddress`: AgglayerManager address. Only required if some entry uses `rollupID`
  - `verifyImplementation` (optional, default `true`): also verify the implementation contract. Can be overridden per entry
  - `dryRun` (optional, default `false`): resolve addresses and print the verification arguments without calling Etherscan
  - `rollups`: array of rollups to verify. Each entry:
    - `rollupAddress`: rollup proxy address, **or**
    - `rollupID`: rollup ID, resolved to the proxy address with `AgglayerManager.rollupIDToRollupData`
    - `verifyImplementation` (optional): overrides the global value for this entry
    - `implementationContract` (optional): fully qualified name of the implementation, e.g. `contracts/aggchains/AggchainFEP.sol:AggchainFEP`
    - `implementationConstructorArgs` (optional): implementation constructor arguments
    - `proxyConstructorImplementation` (optional): implementation address used as proxy constructor argument. See [Upgraded rollups](#upgraded-rollups)
- A network should be selected when running the script
  - examples: `--network sepolia` or `--network mainnet`
  - This uses variables set in `hardhat.config.ts`
  - Which uses some environment variables that should be set in `.env`
  - The Etherscan API key of the selected network (`etherscan.apiKey.<network>` in `hardhat.config.ts`, e.g. `ETHERSCAN_API_KEY` for `mainnet` and `sepolia`) must be set, otherwise the script fails before verifying anything
> All paths are from root repository

### Proxy
For each rollup, the implementation and admin addresses are read from the ERC-1967 slots of the proxy. The proxy is verified as `contracts/lib/PolygonTransparentProxy.sol:PolygonTransparentProxy` with constructor arguments `[implementation, admin, '0x']`, which is how `AgglayerManager` deploys it.

### Implementation
Implementation constructor arguments depend on the consensus type, so they are not derived by the script. If `implementationContract` or `implementationConstructorArgs` is missing for an entry, the implementation verification is skipped (logged and shown as `skipped` in the summary). For reference:
- `AggchainFEP` / `AggchainECDSAMultisig`: `[globalExitRootManager, pol, bridge, rollupManager, aggLayerGateway]`
- `PolygonValidiumEtrog` / `PolygonZkEVMEtrog`: `[globalExitRootManager, pol, bridge, rollupManager]`

The implementation must be compiled with the same sources and compiler settings it was deployed with (checkout the matching tag).

The example file values are illustrative: set the `implementationContract` matching the consensus type of each rollup.

### Upgraded rollups
The proxy constructor argument is the implementation the proxy was **deployed** with (the rollup type `consensusImplementation` at creation time). If the rollup was later upgraded, the current ERC-1967 implementation differs from it, and the proxy verification will fail. In that case set `proxyConstructorImplementation` to the original implementation address.

## Usage
> All commands are done from root repository.

- Copy configuration file:
```
cp tools/verifyRollup/verifyRollup.json.example tools/verifyRollup/verifyRollup.json
```
- Set your parameters
- Run tool:
```
npx hardhat run tools/verifyRollup/verifyRollup.ts --network <network>
```
- Output:
  - Per rollup logs and a final summary table with status `verified`, `already verified`, `skipped`, `dry run` or `failed`
  - "Already verified" is treated as success. Failures are logged and the script continues with the next rollup
  - The script exits with a non-zero code if any verification failed
