# Add Rollup Type
Script to call `addNewRollupType` function

## Install
```
npm i
```

## Setup

- Set env variables

```
cp .env.example .env
```

Fill `.env` with your `ETHERSCAN_API_KEY` and `DEPLOYER_PRIVATE_KEY`


- Config file `add_rollup_type.json`:
  - `type`: Specify the type of rollup creation, only available:
      - `EOA`: If creating the rollup from a wallet, the script will execute the creation of the rollup on the specified network
      - `Timelock`: If creating the rollup through a timelock, the script will output the execute and schedule data to send to the timelock contract
  - `consensusContract`: select between aggchain contracts. Supported: `["AggchainECDSAMultisig", "AggchainFEP"]`. Since AgglayerManager v2.0.0 only ALGateway rollup types can be added: StateTransition (`PolygonZkEVMEtrog`, `PolygonValidiumEtrog`) and `PolygonPessimisticConsensus` rollup types are rejected
  - `consensusContractAddress`: gets this address instead of deploying a new consensus implementation
  - `polygonRollupManagerAddress`: `AgglayerManager.sol` smart contract address
  - `description`: string to describe rollup type added. Example: "Type: AggchainFEP, Version: v3.0.0"
  - The rollup type is always added with `verifier = address(0)`, `forkID = 0`, `genesis = bytes32(0)` and `programVKey = bytes32(0)`, as required for ALGateway rollup types
  - `timelockDelay`: timelock delay
  - `timelockSalt(optional)`: timelock salt
  - `predecessor(optional)`: timelock predecessor
  - `maxFeePerGas(optional)`: string, Set `maxFeePerGas`, must define as well `maxPriorityFeePerGas` to use it
  - `maxPriorityFeePerGas(optional)`: string, Set `maxPriorityFeePerGas`, must define as well `maxFeePerGas` to use it
  - `multiplierGas(optional)`: number, Gas multiplier with 3 decimals. If `maxFeePerGas` and `maxPriorityFeePerGas` are set, this will not take effect
  - `customALGatewayAddress`: "0x..." -> In case the user wants to set a custom ALGateway address for the aggchain instead of picking it from rollup manager

- A network should be selected when running the script
  - examples: `--sepolia` or `--mainnet`
  - This uses variables set in `hardhat.config.ts`
  - Which uses some environment variables that should be set in `.env`

> All paths are from root repository

## Usage
> All commands are done from root repository.

### Call 'addNewRollupType' from an EOA

- Copy configuration files:
```
cp ./tools/addRollupType/add_rollup_type.json.example ./tools/addRollupType/add_rollup_type.json
```

- Set your parameters
- Run tool:
```
npx hardhat run ./tools/addRollupType/addRollupType.ts --network <network>
```

### Generate 'addNewRollupType' to the Timelock SC

- Copy configuration file:
```
cp ./tools/addRollupType/add_rollup_type.json.example ./tools/addRollupType/add_rollup_type.json
```

- Set your parameters
  - `type`: "Timelock"
  - ...
- Run tool:
```
npx hardhat run ./tools/addRollupType/addRollupType.ts --network <network>
```
- Output:
  - scheduleData
  - executeData
> send data to the timelock contract address:
> - use your favorite browser extension
> - send tx to timelock address with hex data as `scheduleData`
> - wait timelockDelay and then send `executeData` to timelock address