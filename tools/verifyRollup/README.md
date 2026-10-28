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
    - `proxyContract` (optional, default `contracts/lib/PolygonTransparentProxy.sol:PolygonTransparentProxy`): fully qualified name of the proxy contract. Can be overridden per entry. See [Older rollups](#older-rollups)
    - `verifyImplementation` (optional, default `true`): also verify the implementation contract. Can be overridden per entry
    - `dryRun` (optional, default `false`): resolve addresses and print the verification arguments without calling Etherscan
    - `rollups`: array of rollups to verify. Each entry:
        - `rollupAddress`: rollup proxy address, **or**
        - `rollupID`: rollup ID, resolved to the proxy address with `AgglayerManager.rollupIDToRollupData`
        - If both are set, `rollupID` is resolved and the entry fails if it does not match `rollupAddress`. If `rollupManagerAddress` is not set, a warning is logged and `rollupAddress` is used
        - `proxyContract` (optional): overrides the global value for this entry
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

For each rollup, the implementation and admin addresses are read from the ERC-1967 slots of the proxy. The proxy is verified as `proxyContract` (default `contracts/lib/PolygonTransparentProxy.sol:PolygonTransparentProxy`) with constructor arguments `[implementation, admin, '0x']`, which is how `AgglayerManager` deploys it.

### Older rollups

The proxy bytecode comes from the rollup manager version that **created** the rollup: `AgglayerManager` deploys the proxy with `new PolygonTransparentProxy(...)`, so it is compiled with the rollup manager compiler settings of that version. The defaults of this checkout (`contracts/lib/PolygonTransparentProxy.sol`, solc 0.8.28, 100 runs, `cancun`) match rollups created by a rollup manager built from `v12.1.0-rc.4` or later. Rollups created by older rollup managers can fail (different compiler settings or proxy source path), typically with `BuildInfoCompilerVersionMismatchError` or `DeployedBytecodeMismatchError` (the script prints a hint pointing to this section).

Proxy source path and rollup manager compiler settings per agglayer-contracts tag (from `hardhat.config.ts`; in `v10.0.0-rc.0` to `v10.0.0-rc.2` the proxy file override used `shanghai` while the rollup manager used `cancun`):

|                          Tags                           |                            `proxyContract`                             |      Compiler settings       |
| :-----------------------------------------------------: | :--------------------------------------------------------------------: | :--------------------------: |
| `v4.0.0-fork.7` to `v9.0.0` (includes `v8.0.0-fork.12`) | `contracts/v2/lib/PolygonTransparentProxy.sol:PolygonTransparentProxy` | 0.8.20, 500 runs, `shanghai` |
|            `v10.0.0-rc.0` to `v10.1.0-rc.10`            | `contracts/v2/lib/PolygonTransparentProxy.sol:PolygonTransparentProxy` |  0.8.28, 500 runs, `cancun`  |
|            `v11.0.0-rc.0` to `v12.1.0-rc.3`             | `contracts/v2/lib/PolygonTransparentProxy.sol:PolygonTransparentProxy` |  0.8.28, 100 runs, `cancun`  |
|                `v12.1.0-rc.4` and later                 |  `contracts/lib/PolygonTransparentProxy.sol:PolygonTransparentProxy`   |  0.8.28, 100 runs, `cancun`  |

To verify a rollup created by an older rollup manager:

- Checkout the agglayer-contracts tag matching the rollup manager version that created the rollup (`git tag` lists them), and run `npm i` there
- Copy `tools/verifyRollup/` into that checkout (the script imports `AgglayerManager` typechain types, so for tags where the manager was named `PolygonRollupManager`, use `rollupAddress` entries or adapt the import)
- Set `proxyContract` to the path of that tag (see table above) and run the tool from that checkout

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
    - Before verifying, the script checks on Etherscan whether the contract is already verified (`already verified`, treated as success). Failures are logged and the script continues with the next rollup
    - The script exits with a non-zero code if any verification failed

## Notes

- The tool has not yet been validated end to end against Etherscan
- The installed `@nomicfoundation/hardhat-verify` uses the Etherscan V1 API for built-in networks such as `mainnet` and `sepolia`. If Etherscan rejects V1 requests, add a `customChains` entry in `hardhat.config.ts` using `https://api.etherscan.io/v2/api?chainid=<chainId>` as `apiURL`, like the existing `opSepolia` entry
