# Docker deployment

By default the following mnemonic will be used to deploy the smart contracts `MNEMONIC="test test test test test test test test test test test junk"`.
Also the first 20 accounts of this mnemonic will be funded with ether.
The first account of the mnemonic will be the deployer of the smart contracts and therefore the holder of all the MATIC test tokens, which are necessary to pay the `sendBatch` transactions.
You can change the deployment `mnemonic` creating a `.env` file in the project root with the following variable:
`MNEMONIC=<YOUR_MENMONIC>`

## Requirements

- node version: 14.x
- npm version: 7.x
- docker
- docker-compose

## Config files

- Complete config `/docker/scripts/v2/create_rollup_parameters_docker.json`

## deploy_parameters.json

- `test`: Flag to point if is a testing environment, in such case, an account with balance will be created at the rollup and no timelock addresses will be used
- `timelockAdminAddress`: address, Timelock owner address, able to send start an upgradeability process via timelock
- `minDelayTimelock`: number, Minimum timelock delay,
- `salt`: bytes32, Salt used in `PolygonZkEVMDeployer` to deploy deterministic contracts, such as the PolygonZkEVMBridge
- `initialZkEVMDeployerOwner`: address, Initial owner of the `PolygonZkEVMDeployer`
- `admin`: address, Admin address, can adjust RollupManager parameters or stop the emergency state
- `trustedAggregator`: address, Trusted aggregator address
- `defaultAdminAggLayerGateway`: address, Default admin AggLayerGateway contract
- `aggchainDefaultVKeyRole`: address, address that can manage the aggchain verification keys 
- `addRouteAggLayerGatewayRole`: address, address that can add a route to a pessimistic verification key
- `freezeRouteAgglayerGatewayRole`: adddress, address that can freeze a route to a pessimistic verification key.
- `trustedAggregatorTimeout`: uint64, If a sequence is not verified in this timeout everyone can verify it
- `pendingStateTimeout`: uint64, Once a pending state exceeds this timeout it can be consolidated by everyone
- `emergencyCouncilAddress`: address, Emergency council address
- `polTokenAddress`: address, POL token address, only if deploy on testnet can be left blank and will fulfilled by the scripts.
- `zkEVMDeployerAddress`: address, Address of the `PolygonZkEVMDeployer`. Can be left blank, will be fulfilled automatically with the `deploy:deployer:ZkEVM:goerli` script
- `deployerPvtKey`: string, pvtKey of the deployer, overrides the address in `MNEMONIC` of `.env` if exist
- `maxFeePerGas`: string, Set `maxFeePerGas`, must define as well `maxPriorityFeePerGas` to use it
- `maxPriorityFeePerGas`: string, Set `maxPriorityFeePerGas`, must define as well `maxFeePerGas` to use it
- `multiplierGas`: number, Gas multiplier with 3 decimals. If `maxFeePerGas` and `maxPriorityFeePerGas` are set, this will not take effect

## create_rollup_parameters.json

-   `realVerifier`: bool, Indicates whether deploy a real verifier or not for the new created
-   `trustedSequencerURL`: string, trustedSequencer URL
-   `networkName`: string, networkName
-   `description`: string, Description of the new rollup type
-   `trustedSequencer`: address, trusted sequencer address
-   `chainID`: uint64, chainID of the new rollup
-   `adminZkEVM`: address, Admin address, can adjust Rollup parameters
-   `forkID`: uint64, Fork ID of the new rollup, indicates the prover (zkROM/executor) version
-   `consensusContract`: select between consensus contract. Supported: `["PolygonZkEVMEtrog", "PolygonValidiumEtrog", "PolygonPessimisticConsensus", "AggchainECDSA"]`. This is the name of the consensus of the rollupType of the rollup to be created
-   `gasTokenAddress`:  Address of the native gas token of the rollup, zero if ether
-   `deployerPvtKey`: Not mandatory, used to deploy from specific wallet
-   `maxFeePerGas(optional)`: string, Set `maxFeePerGas`, must define as well `maxPriorityFeePerGas` to use it
-   `maxPriorityFeePerGas(optional)`: string, Set `maxPriorityFeePerGas`, must define as well `maxFeePerGas` to use it
-   `multiplierGas(optional)`: number, Gas multiplier with 3 decimals. If `maxFeePerGas` and `maxPriorityFeePerGas` are set, this will not take effect
-   `programVKey`: program key for pessimistic consensus
-   `isVanillaClient`: Flag for vanilla/sovereign clients handling
-   `sovereignParams`: Only mandatory if isVanillaClient = true
    -   `bridgeManager`: bridge manager address
    -   `sovereignWETHAddress`: sovereign WETH address
    -   `sovereignWETHAddressIsNotMintable`: Flag to indicate if the wrapped ETH is not mintable
    -   `globalExitRootUpdater`: Address of globalExitRootUpdater for sovereign chains
    -   `globalExitRootRemover`: Address of globalExitRootRemover for sovereign chains
- `aggchainParams`: Only mandatory if consensusContract is AggchainXXXX
    - `useDefaultGateway`: bool, flag to setup initial values for the owned gateway
    - `ownedAggchainVKeys`: bytes32, Initial owned aggchain verification key
    - `aggchainVKeySelectors`: bytes4, Initial aggchain selector
    - `vKeyManager`: address, Initial vKeyManager

## Run script

In project root execute:
```
npm i
npm run docker:contracts
```

A new docker `geth-zkevm-contracts:latest` will be created
This docker will contain a geth node with the deployed contracts
The deployment output can be found in:
- `docker/deploymentOutput/create_rollup_output.json`
- `docker/deploymentOutput/deploy_output.json`
- `docker/deploymentOutput/genesis.json`
To run the docker you can use: `docker run -p 8545:8545 geth-zkevm-contracts:latest`
