Contract responsible for managing rollups and the verification of their batches.
This contract will create and update rollups and store all the hashed sequenced data from them.
The logic for sequence batches is moved to the `consensus` contracts, while the verification of all of
them will be done in this one. In this way, the proof aggregation of the rollups will be easier on a close future.


## Functions
### constructor
```solidity
  function constructor(
    contract IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
    contract IERC20Upgradeable _pol,
    contract IPolygonZkEVMBridge _bridgeAddress
  ) public
```


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_globalExitRootManager` | contract IPolygonZkEVMGlobalExitRootV2 | Global exit root manager address
|`_pol` | contract IERC20Upgradeable | POL token address
|`_bridgeAddress` | contract IPolygonZkEVMBridge | Bridge address

### initialize
```solidity
  function initialize(
  ) external
```
Initializer function to set new rollup manager version



### addNewRollupType
```solidity
  function addNewRollupType(
    address consensusImplementation,
    address verifier,
    uint64 forkID,
    enum IPolygonRollupManager.VerifierType rollupVerifierType,
    bytes32 genesis,
    string description,
    bytes32 programVKey
  ) external
```
Add a new rollup type


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`consensusImplementation` | address | Consensus implementation
|`verifier` | address | Verifier address
|`forkID` | uint64 | ForkID of the verifier
|`rollupVerifierType` | enum IPolygonRollupManager.VerifierType | rollup verifier type
|`genesis` | bytes32 | Genesis block of the rollup
|`description` | string | Description of the rollup type
|`programVKey` | bytes32 | Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1

### obsoleteRollupType
```solidity
  function obsoleteRollupType(
    uint32 rollupTypeID
  ) external
```
Obsolete Rollup type


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupTypeID` | uint32 | Rollup type to obsolete

### createNewRollup
```solidity
  function createNewRollup(
    uint32 rollupTypeID,
    uint64 chainID,
    address admin,
    address sequencer,
    address gasTokenAddress,
    string sequencerURL,
    string networkName
  ) external
```
Create a new rollup


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupTypeID` | uint32 | Rollup type to deploy
|`chainID` | uint64 | ChainID of the rollup, must be a new one, can not have more than 32 bits
|`admin` | address | Admin of the new created rollup
|`sequencer` | address | Sequencer of the new created rollup
|`gasTokenAddress` | address | Indicates the token address that will be used to pay gas fees in the new rollup
Note if a wrapped token of the bridge is used, the original network and address of this wrapped will be used instead
|`sequencerURL` | string | Sequencer URL of the new created rollup
|`networkName` | string | Network name of the new created rollup

### addExistingRollup
```solidity
  function addExistingRollup(
    contract IPolygonRollupBase rollupAddress,
    address verifier,
    uint64 forkID,
    uint64 chainID,
    bytes32 initRoot,
    enum IPolygonRollupManager.VerifierType rollupVerifierType,
    bytes32 programVKey
  ) external
```
Add an already deployed rollup
note that this rollup does not follow any rollupType


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupAddress` | contract IPolygonRollupBase | Rollup address
|`verifier` | address | Verifier address, must be added before
|`forkID` | uint64 | Fork id of the added rollup
|`chainID` | uint64 | Chain id of the added rollup
|`initRoot` | bytes32 | Genesis block for StateTransitionChains & localExitRoot for pessimistic chain
|`rollupVerifierType` | enum IPolygonRollupManager.VerifierType | Compatibility ID for the added rollup
|`programVKey` | bytes32 | Hashed program that will be executed in case of using a "general purpose ZK verifier" e.g SP1

### updateRollupByRollupAdmin
```solidity
  function updateRollupByRollupAdmin(
    contract ITransparentUpgradeableProxy rollupContract,
    uint32 newRollupTypeID
  ) external
```
Upgrade an existing rollup from the rollup admin address
This address is able to udpate the rollup with more restrictions that the _UPDATE_ROLLUP_ROLE


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupContract` | contract ITransparentUpgradeableProxy | Rollup consensus proxy address
|`newRollupTypeID` | uint32 | New rolluptypeID to upgrade to

### updateRollup
```solidity
  function updateRollup(
    contract ITransparentUpgradeableProxy rollupContract,
    uint32 newRollupTypeID,
    bytes upgradeData
  ) external
```
Upgrade an existing rollup


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupContract` | contract ITransparentUpgradeableProxy | Rollup consensus proxy address
|`newRollupTypeID` | uint32 | New rolluptypeID to upgrade to
|`upgradeData` | bytes | Upgrade data

### _updateRollup
```solidity
  function _updateRollup(
    contract ITransparentUpgradeableProxy rollupContract,
    uint32 newRollupTypeID,
    bytes upgradeData
  ) internal
```
Upgrade an existing rollup


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupContract` | contract ITransparentUpgradeableProxy | Rollup consensus proxy address
|`newRollupTypeID` | uint32 | New rolluptypeID to upgrade to
|`upgradeData` | bytes | Upgrade data

### rollbackBatches
```solidity
  function rollbackBatches(
    contract IPolygonRollupBase rollupContract,
    uint64 targetBatch
  ) external
```
Rollback batches of the target rollup
Only applies to state transition rollups


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupContract` | contract IPolygonRollupBase | Rollup consensus proxy address
|`targetBatch` | uint64 | Batch to rollback up to but not including this batch

### onSequenceBatches
```solidity
  function onSequenceBatches(
    uint64 newSequencedBatches,
    bytes32 newAccInputHash
  ) external returns (uint64)
```
Sequence batches, callback called by one of the consensus managed by this contract


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newSequencedBatches` | uint64 | Number of batches sequenced
|`newAccInputHash` | bytes32 | New accumulate input hash

### verifyBatchesTrustedAggregator
```solidity
  function verifyBatchesTrustedAggregator(
    uint32 rollupID,
    uint64 pendingStateNum,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    address beneficiary,
    bytes32[24] proof
  ) external
```
Allows a trusted aggregator to verify multiple batches


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`pendingStateNum` | uint64 | Init pending state, 0 if consolidated state is used (deprecated)
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 | New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`beneficiary` | address | Address that will receive the verification reward
|`proof` | bytes32[24] | Fflonk proof

### _verifyAndRewardBatches
```solidity
  function _verifyAndRewardBatches(
    struct PolygonRollupManager.RollupData rollup,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 newStateRoot,
    address beneficiary,
    bytes32[24] proof
  ) internal
```
Verify and reward batches internal function


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollup` | struct PolygonRollupManager.RollupData | Rollup Data storage pointer that will be used to the verification
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 | New local exit root once the batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed
|`beneficiary` | address | Address that will receive the verification reward
|`proof` | bytes32[24] | Fflonk proof

### verifyPessimisticTrustedAggregator
```solidity
  function verifyPessimisticTrustedAggregator(
    uint32 rollupID,
    uint32 l1InfoTreeLeafCount,
    bytes32 newLocalExitRoot,
    bytes32 newPessimisticRoot,
    bytes proof
  ) external
```
Allows a trusted aggregator to verify pessimistic proof


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`l1InfoTreeLeafCount` | uint32 | Count of the L1InfoTree leaf that will be used to verify imported bridge exits
|`newLocalExitRoot` | bytes32 | New local exit root
|`newPessimisticRoot` | bytes32 | New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)
|`proof` | bytes | SP1 proof (Plonk)

### activateEmergencyState
```solidity
  function activateEmergencyState(
  ) external
```
Function to activate emergency state, which also enables the emergency mode on both PolygonRollupManager and PolygonZkEVMBridge contracts
If not called by the owner must not have been aggregated in a _HALT_AGGREGATION_TIMEOUT period and an emergency state was not happened in the same period



### deactivateEmergencyState
```solidity
  function deactivateEmergencyState(
  ) external
```
Function to deactivate emergency state on both PolygonRollupManager and PolygonZkEVMBridge contracts



### _activateEmergencyState
```solidity
  function _activateEmergencyState(
  ) internal
```
Internal function to activate emergency state on both PolygonRollupManager and PolygonZkEVMBridge contracts



### setBatchFee
```solidity
  function setBatchFee(
    uint256 newBatchFee
  ) external
```
Set the current batch fee


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newBatchFee` | uint256 | new batch fee

### getRollupExitRoot
```solidity
  function getRollupExitRoot(
  ) public returns (bytes32)
```
Get the current rollup exit root
Compute using all the local exit roots of all rollups the rollup exit root
Since it's expected to have no more than 10 rollups in this first version, even if this approach
has a gas consumption that scales linearly with the rollups added, it's ok
In a future versions this computation will be done inside the circuit



### getLastVerifiedBatch
```solidity
  function getLastVerifiedBatch(
  ) public returns (uint64)
```
Get the last verified batch



### _getLastVerifiedBatch
```solidity
  function _getLastVerifiedBatch(
  ) internal returns (uint64)
```
Get the last verified batch



### calculateRewardPerBatch
```solidity
  function calculateRewardPerBatch(
  ) public returns (uint256)
```
Function to calculate the reward to verify a single batch



### getBatchFee
```solidity
  function getBatchFee(
  ) public returns (uint256)
```
Get batch fee
This function is used instad of the automatic public view one,
because in a future might change the behaviour and we will be able to mantain the interface



### getForcedBatchFee
```solidity
  function getForcedBatchFee(
  ) public returns (uint256)
```
Get forced batch fee



### getInputPessimisticBytes
```solidity
  function getInputPessimisticBytes(
    uint32 rollupID,
    bytes32 l1InfoTreeRoot,
    bytes32 newLocalExitRoot,
    bytes32 newPessimisticRoot
  ) external returns (bytes)
```
Function to calculate the pessimistic input bytes


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup id used to calculate the input snark bytes
|`l1InfoTreeRoot` | bytes32 | L1 Info tree root to proof imported bridges
|`newLocalExitRoot` | bytes32 | New local exit root
|`newPessimisticRoot` | bytes32 | New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)

### _getInputPessimisticBytes
```solidity
  function _getInputPessimisticBytes(
    uint32 rollupID,
    struct PolygonRollupManager.RollupData rollup,
    bytes32 l1InfoTreeRoot,
    bytes32 newLocalExitRoot,
    bytes32 newPessimisticRoot
  ) internal returns (bytes)
```
Function to calculate the input snark bytes


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`rollup` | struct PolygonRollupManager.RollupData | Rollup data storage pointer
|`l1InfoTreeRoot` | bytes32 | L1 Info tree root to proof imported bridges
|`newLocalExitRoot` | bytes32 | New local exit root
|`newPessimisticRoot` | bytes32 | New pessimistic information, Hash(localBalanceTreeRoot, nullifierTreeRoot)

### getInputSnarkBytes
```solidity
  function getInputSnarkBytes(
    uint32 rollupID,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 oldStateRoot,
    bytes32 newStateRoot
  ) public returns (bytes)
```
Function to calculate the input snark bytes


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup id used to calculate the input snark bytes
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 | New local exit root once the batch is processed
|`oldStateRoot` | bytes32 | State root before batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed

### _getInputSnarkBytes
```solidity
  function _getInputSnarkBytes(
    struct PolygonRollupManager.RollupData rollup,
    uint64 initNumBatch,
    uint64 finalNewBatch,
    bytes32 newLocalExitRoot,
    bytes32 oldStateRoot,
    bytes32 newStateRoot
  ) internal returns (bytes)
```
Function to calculate the input snark bytes


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollup` | struct PolygonRollupManager.RollupData | Rollup data storage pointer
|`initNumBatch` | uint64 | Batch which the aggregator starts the verification
|`finalNewBatch` | uint64 | Last batch aggregator intends to verify
|`newLocalExitRoot` | bytes32 | New local exit root once the batch is processed
|`oldStateRoot` | bytes32 | State root before batch is processed
|`newStateRoot` | bytes32 | New State root once the batch is processed

### _checkStateRootInsidePrime
```solidity
  function _checkStateRootInsidePrime(
    uint256 newStateRoot
  ) internal returns (bool)
```
Function to check if the state root is inside of the prime field


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`newStateRoot` | uint256 | New State root once the batch is processed

### getRollupBatchNumToStateRoot
```solidity
  function getRollupBatchNumToStateRoot(
    uint32 rollupID,
    uint64 batchNum
  ) public returns (bytes32)
```
Get rollup state root given a batch number


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`batchNum` | uint64 | Batch number

### getRollupSequencedBatches
```solidity
  function getRollupSequencedBatches(
    uint32 rollupID,
    uint64 batchNum
  ) public returns (struct LegacyZKEVMStateVariables.SequencedBatchData)
```
Get rollup sequence batches struct given a batch number


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier
|`batchNum` | uint64 | Batch number

### rollupIDToRollupData
```solidity
  function rollupIDToRollupData(
    uint32 rollupID
  ) public returns (struct PolygonRollupManager.RollupDataReturn rollupData)
```
Get rollup data: VerifierType StateTransition


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier

### rollupIDToRollupDataV2
```solidity
  function rollupIDToRollupDataV2(
    uint32 rollupID
  ) public returns (struct PolygonRollupManager.RollupDataReturnV2 rollupData)
```
Get rollup data: VerifierType Pessimistic


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`rollupID` | uint32 | Rollup identifier

## Events
### AddNewRollupType
```solidity
  event AddNewRollupType(
  )
```

Emitted when a new rollup type is added

### ObsoleteRollupType
```solidity
  event ObsoleteRollupType(
  )
```

Emitted when a a rolup type is obsoleted

### CreateNewRollup
```solidity
  event CreateNewRollup(
  )
```

Emitted when a new rollup is created based on a rollupType

### AddExistingRollup
```solidity
  event AddExistingRollup(
  )
```

Emitted when an existing rollup is added

### UpdateRollup
```solidity
  event UpdateRollup(
  )
```

Emitted when a rollup is udpated

### OnSequenceBatches
```solidity
  event OnSequenceBatches(
  )
```

Emitted when a new verifier is added

### VerifyBatchesTrustedAggregator
```solidity
  event VerifyBatchesTrustedAggregator(
  )
```

Emitted when the trusted aggregator verifies batches

### RollbackBatches
```solidity
  event RollbackBatches(
  )
```

Emitted when rollback batches

### SetTrustedAggregator
```solidity
  event SetTrustedAggregator(
  )
```

Emitted when is updated the trusted aggregator address

### SetBatchFee
```solidity
  event SetBatchFee(
  )
```

Emitted when is updated the batch fee

### UpdateRollupManagerVersion
```solidity
  event UpdateRollupManagerVersion(
  )
```

Emitted when rollup manager is upgraded

