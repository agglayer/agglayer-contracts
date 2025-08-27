# Create sovereign genesis
Script to generate the genesis file for a rollup with `SovereignContracts`. This genesis is aimed to be used for chains that are run with vanilla clients.
This script should be run after the rollup is created, so its `rollupID` and the bridge initialization parameters are known.
The script does the following:
- read base genesis file
- deploy sovereign contracts
- initialize them

## Setup
- install packages
```
npm i
```

- Set env variables
````
cp .env.example .env
````

Fill `.env` with your `INFURA_PROJECT_ID` and `ETHERSCAN_API_KEY`

- Copy configuration files:
```
cp ./tools/createSovereignGenesisHardhat/create-genesis-sovereign-params.json.example ./tools/createSovereignGenesisHardhat/create-genesis-sovereign-params.json
```

- Copy genesis base file:
```
cp ./tools/createSovereignGenesisHardhat/genesis-base.json.example ./tools/createSovereignGenesisHardhat/genesis-base.json
```

-  Set your parameters
  - `rollupManagerAddress`: `polygonRollupManager` smart contract address
  - `rollupID`: Rollup identifier. Assigned to a rollup when it is created in the contracts
  - `chainID`: ChainID of the rollup
  - `gasTokenAddress`: Address of the native gas token of the rollup, zero if ether
  - `bridgeManager`: bridge manager address
  - `sovereignWETHAddress`: sovereign WETH address
  - `sovereignWETHAddressIsNotMintable`: Flag to indicate if the wrapped ETH is not mintable
  - `globalExitRootUpdater`: Address of globalExitRootUpdater for sovereign chains (if `useAggOracleCommittee == false`)
  - `globalExitRootRemover`: Address of globalExitRootRemover for sovereign chains
  - `emergencyBridgePauser`: emergency bridge pauser address, can stop the bridge, recommended to be a multisig
  - `emergencyBridgeUnpauser`: emergency bridge unpauser address, can unpause the bridge, recommended to be a multisig
  - `setPreMintAccount`: indicates if a preMint accounts going to be added
    - `preMintAccount.address`: ethereum address to receive an initial balance
    - `preMintAccount.balance`: balance credited to the preminted address
  - `setTimelockParameters`: indicates if the timelock parameters are going to be changed
    - `timelockParameters.adminAddress`: address that will have all timelocks roles (ADMIN, PROPOSER, CANCELLER, EXECUTOR)
    - `timelockParameters.minDelay`: minimum delay set in the timelock smart contract
  - `useAggOracleCommittee`: `true/false`. Indicates if use aggOracleCommittee
  - if `useAggOracleCommittee == true`:
    - `ownerAddress`: Address that will own the AggOracleCommittee contract (typically a timelock contract)
    - `aggOracleMembers`: Array of addresses that will act as initial oracle members
    - `quorum`: Number of oracle members that must agree on a GER for it to be consolidated (must be <= aggOracleMembers.length and > 0)

- Optional parameters
  - `format`: choose genesis output format. Supported ones: `geth`
  - `debug`: to print more info

-  Run tool:
```
npx hardhat run ./tools/createSovereignGenesisHardhat/create-sovereign-genesis-hardhat.ts --network sepolia
```

### More Info
- All commands are done from root repository
- The output files are:
  - `genesis-rollupID-${rollupID}__${timestamp}`: genesis file
  - `output-rollupID-${rollupID}__${timestamp}`: input parameters, gastokenAddress information and network used
- outputs are saved in the tool folder: `./tools/createSovereignGenesisHardhat`

## Changes vs updateVanilla
- proxy's bytecode (`0x1348947e282138d8f377b467F7D9c2EB0F335d1f`) & (`0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa`):
  - https://github.com/agglayer/agglayer-contracts/blob/v4.0.0-fork.7/deployment/v2/3_deployContracts.ts#L283
    - `"@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy"`
  - https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/proxy/transparent/TransparentUpgradeableProxy.sol#L4
    - `pragma solidity ^0.8.0;`
  - https://github.com/agglayer/agglayer-contracts/blob/v4.0.0-fork.7/hardhat.config.ts#L31
    - compiler version: `0.8.17`
  - Now compiler version: `0.8.28`
    - https://github.com/agglayer/agglayer-contracts/blob/feature/v12/hardhat.config.ts#L119

- some addresses:
  - BytecodeStorer
  - TokenWrapped implementation
  - WETH proxy
  - AggOracleCommittee implementation
  - AggOracleCommittee proxy

- BridgeL2SovereignChain implementation (`0x5B6A4b18066377d398576097928eDaBEfDECC83F`) bytecode: constructor addressess
  - BytecodeStorer
  - TokenWrapped implementation

- BridgeL2SovereignChain proxy (`0x1348947e282138d8f377b467F7D9c2EB0F335d1f`) storage:
  - `0x6c`: Previously, this slot didn’t show up because its value was 0. Now it shows up because, even though it’s 0, we perform an SSTORE in a transaction.
  - `0x6f`: Weth proxy

- GlobalExitRootManagerL2SovereignChain proxy (`0xa40d5f56745a118d0906a34e69aec8c0db1cb8fa`):
  - storage:
    - `0x34`: AggOracleCommittee proxy
  
- Weth proxy storage:
  - `0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc`: TokenWrapped implementation address
  - `0xa16a46d94261c7517cc8ff89f61c0ce93598e3c849801011dee649a6a557d100` & `0xa16a46d94261c7517cc8ff89f61c0ce93598e3c849801011dee649a6a557d101`: Previously, this slot didn’t show up because its value was 0. Now it shows up because, even though it’s 0, we perform an SSTORE in a transaction.

- AggOracleCommittee proxy storage:
  - New impl address
  - New admin address

