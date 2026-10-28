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

Proxy source path and rollup manager compiler settings per agglayer-contracts tag (from `hardhat.config.ts`). Exceptions:

- `v10.0.0-rc.0` to `v10.0.0-rc.2`: the proxy file override used `shanghai` while the rollup manager used `cancun`. In that checkout, set the `evmVersion` of the proxy file override to `cancun` before running the tool
- `v10.1.0-rc.9`: uses 100 runs (`v10.1.0-rc.8` and `v10.1.0-rc.10` use 500 runs)

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

The proxy constructor argument is the implementation the proxy was **deployed** with (the rollup type `consensusImplementation` at creation time). If the rollup was later upgraded, the current ERC-1967 implementation differs from it, and the proxy verification will fail (Etherscan typically answers `Fail - Unable to verify`; the script prints a hint pointing to this section). In that case set `proxyConstructorImplementation` to the original implementation address: the implementation of the first `Upgraded(address)` event emitted by the proxy, in its creation transaction.

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

- Etherscan V1 endpoints are deprecated. `hardhat.config.ts` defines `customChains` entries for `sepolia` and `mainnet` using the Etherscan V2 API (`https://api.etherscan.io/v2/api?chainid=<chainId>`), like `opSepolia`. hardhat-verify selects the chain config by the chain ID of the connected network and `customChains` take precedence over its built-in chains. To use another chain, add a `customChains` entry the same way
- The installed `@nomicfoundation/hardhat-verify` (1.1.1) drops the query string of the API URL in its GET requests (already verified check and verification status polling), so the `chainid` parameter of V2 URLs would be lost. The script restores it at runtime
- `@openzeppelin/hardhat-upgrades` overrides the verification of ERC-1967 proxies: for each proxy it also checks the current implementation and the admin (the AgglayerManager), tries the OpenZeppelin proxy artifacts first and then falls back to `proxyContract`, and links the proxy to its implementation on Etherscan. The resulting `Failed to verify TransparentUpgradeableProxy ... Bytecode does not match ...` log is expected when the fallback succeeds
- Etherscan marks contracts with the same bytecode as an already verified one as verified ("similar match"), so most rollup proxies are reported as `already verified`
- Validated on Sepolia: already verified proxies (bali rollup 92) and a fresh verification of a proxy created by a `v10` rollup manager (bali rollup 38, `proxyConstructorImplementation` set, `contracts/v2/lib/PolygonTransparentProxy.sol` with 0.8.28, 500 runs, `cancun`)
