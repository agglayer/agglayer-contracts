# Init migration
Script to call `initMigration` function in the `AgglayerManager.sol` smart contract.

## Install
```
npm i
```

## Setup
### initMigration
- Config file
  - `type`: Specify the type of rollup creation, only available:
        - `EOA`: If creating the rollup from a wallet, the script will execute the creation of the rollup on the specified network
        - `Multisig`: If creating the rollup from a multisig, the script will output the calldata of the transaction to execute for creating the rollup
        - `Timelock`: If creating the rollup through a timelock, the script will output the execute and schedule data to send to the timelock contract
  - `polygonRollupManagerAddress`: `AgglayerManager.sol` SC address
  - `timelockDelay (optional)`: at least it should be the minimum delay of the timelock smart contract
  - `deployerPvtKey`: private key deployer
    - First option will load `deployerPvtKey`. Otherwise, `process.env.MNEMONIC` will be loaded from the `.env` file
  - `maxFeePerGas`: set custom gas
  - `maxPriorityFeePerGas`: set custom gas
  - `multiplierGas`: set custom gas
  - `rollupID`: Identifier of the rollup to upgrade (must be a StateTransition rollup: validium or zkevm)
  - `newRollupTypeId`: Identifier for the target ALGateway (aggchain) rollup type
  - `upgradeData`: calldata executed on the rollup proxy during the upgrade, e.g. `AggchainECDSAMultisig.migrateFromLegacyConsensus()`
> All paths are from root repository

### Before migrating
Since AgglayerManager v2.0.0 StateTransition rollups can no longer sequence nor verify batches. `initMigration` reverts with `AllSequencedMustBeVerified` while the rollup has sequenced batches that were never verified (`lastBatchSequenced != lastVerifiedBatch`, see `rollupIDToRollupDataV2`). Remove them first with `rollbackBatches(rollupAddress, lastVerifiedBatch)`, callable by the `UPDATE_ROLLUP_ROLE` holder or the rollup admin.

The migration is completed by the first `verifyPessimisticTrustedAggregator`, whose `newLocalExitRoot` must match the last verified local exit root.

## Usage
> All commands are done from root repository.

### Call 'initMigration'
- Copy configuration file:
```
cp ./tools/initMigration/initMigration.json.example ./tools/initMigration/initMigration.json
```

- Set your parameters
- Run tool:
```
npx hardhat run ./tools/initMigration/initMigration.ts --network <network>
```

### 'initMigration'  from an EOA

Running the tool, the initMigration transaction will be sent directly

### 'initMigration'  Multisig

- Output: Transaction to update the rollup

### Generate 'initMigration' data to the Timelock SC
- Set your parameters
- Run tool:
```
npx hardhat run ./tools/initMigration/initMigration.ts --network <network>
```
- Output:
  - scheduleData
  - executeData
> send data to the timelock contract address:
> - use your favourite browser extension
> - send tx to timelock address with hex data as `scheduleData`
> - wait `timelockDelay` and then send `executeData` to timelock address
