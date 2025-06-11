# Init migration to PP
Script to call `initMigrationToPP` function in the `PolygonRollupManager.sol` smart contract.

## Install
```
npm i
```

## Setup
### initMigrationToPP
- Config file
  - `type`: Specify the type of rollup creation, only available:
        - `EOA`: If creating the rollup from a wallet, the script will execute the creation of the rollup on the specified network
        - `Multisig`: If creating the rollup from a multisig, the script will output the calldata of the transaction to execute for creating the rollup
        - `Timelock`: If creating the rollup through a timelock, the script will output the execute and schedule data to send to the timelock contract
  - `polygonRollupManagerAddress`: `PolygonRollupManager.sol` SC address
  - `timelockDelay (optional)`: at least it should be the minimum delay of the timelock smart contract
  - `deployerPvtKey`: private key deployer
    - First option will load `deployerPvtKey`. Otherwise, `process.env.MNEMONIC` will be loaded from the `.env` file
  - `maxFeePerGas`: set custom gas
  - `maxPriorityFeePerGas`: set custom gas
  - `multiplierGas`: set custom gas
  - `rollupID`: Identifier of the rollup to upgrade (must be validium or zkevm)
  - `newRollupTypeId`: Identifier for the target Pessimistic Proof rollup type
> All paths are from root repository

## Usage
> All commands are done from root repository.

### Call 'updateRollup'
- Copy configuration file:
```
cp ./tools/initMigrationToPP/initMigrationToPP.json.example ./tools/initMigrationToPP/initMigrationToPP.json
```

- Set your parameters
- Run tool:
```
npx hardhat run ./tools/initMigrationToPP/initMigrationToPP.ts --network <network>
```

### 'initMigrationToPP'  from an EOA

Running the tool, the initMigrationToPP transaction will be sent directly

### 'initMigrationToPP'  Multisig

- Output: Transaction to update the rollup

### Generate 'initMigrationToPP' data to the Timelock SC
- Set your parameters
- Run tool:
```
npx hardhat run ./tools/initMigrationToPP/initMigrationToPP.ts --network <network>
```
- Output:
  - scheduleData
  - executeData
> send data to the timelock contract address:
> - use your favourite browser extension
> - send tx to timelock address with hex data as `scheduleData`
> - wait `timelockDelay` and then send `executeData` to timelock address
