# AggOracleCommittee
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/06dd0a111ee1f7d764543925e6fec987cb36ee61/contracts/sovereignChains/AggOracleCommittee.sol)

**Inherits:**
Ownable2StepUpgradeable, [IVersion](/contracts/interfaces/IVersion.sol/interface.IVersion.md), [IAggOracleCommittee](/contracts/interfaces/IAggOracleCommittee.sol/interface.IAggOracleCommittee.md)

**Title:**
AggOracleCommittee

Contract responsible for managing the insertion of GERs (Global Exit Roots)

Proposer-validator management is the same as the one implemented in the AggchainSigners contract, with one minor modification:
the `url` of a validator is allowed to be empty. This contract is deployed on L2, therefore gas costs are not an issue.

This contract uses signature verification similar to Safe multisig for permissioned injection of GERs.
It implements a threshold-based multi-signature scheme where a minimum number of oracle validators must sign
each GER injection before it can be executed.
Ownership is transferred in two steps: the new owner must accept it.


## State Variables
### VERSION_AGG_ORACLE_COMMITTEE
Version constant


```solidity
string public constant VERSION_AGG_ORACLE_COMMITTEE = "v2.0.0"
```


### MAX_VALIDATORS
Maximum number of oracle validators


```solidity
uint256 public constant MAX_VALIDATORS = 255
```


### agglayerGERL2
Global exit root manager L2 - manages the GER tree

**Note:**
oz-upgrades-unsafe-allow: state-variable-immutable


```solidity
IAgglayerGERL2 public immutable agglayerGERL2
```


### validators
Array of oracle validator addresses


```solidity
address[] public validators
```


### threshold
Number of signatures required to inject a GER


```solidity
uint256 public threshold
```


### validatorInfo
Mapping to track if an address is an authorized oracle validator


```solidity
mapping(address => ValidatorInternalInfo) public validatorInfo
```


### proposer
Address authorized to propose GER injections


```solidity
address public proposer
```


### injectedGERs
GERs already processed by this contract (inserted, or marked because they were already set in the
AgglayerGERL2). A processed GER can never be injected again, even if it is later removed from the
AgglayerGERL2, so its validator signatures can not be replayed.

A GER inserted by another updater and removed before this contract processed it is not tracked here:
validators must not sign a GER that has been removed from the AgglayerGERL2


```solidity
mapping(bytes32 => bool) public injectedGERs
```


### __gap
This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.


```solidity
uint256[45] private __gap
```


## Functions
### onlyAggOracleProposer

Modifier to restrict access to the oracle proposer

Reverts if the caller is not the designated oracle proposer


```solidity
modifier onlyAggOracleProposer() ;
```

### constructor

Contract constructor

Disables initializers on the implementation contract following proxy pattern best practices


```solidity
constructor(IAgglayerGERL2 _agglayerGERL2) ;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_agglayerGERL2`|`IAgglayerGERL2`|Address of the Agglayer Global Exit Root manager L2|


### initialize

Initializes the contract with initial configuration

Can only be called once due to initializer modifier. Sets up the owner, validators, threshold, and proposer


```solidity
function initialize(
    address _owner,
    address _newProposer,
    ValidatorInfo[] memory _newValidators,
    uint256 _newThreshold
) external initializer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_owner`|`address`|Owner of the contract, presumably a multisig for governance|
|`_newProposer`|`address`|Address authorized to propose GER injections|
|`_newValidators`|`ValidatorInfo[]`|Initial array of oracle validator addresses|
|`_newThreshold`|`uint256`|Number of signatures required for GER injection|


### injectGER

Inject a Global Exit Root (GER) with signature verification

The GER must be signed by exactly `threshold` oracle validators
Signatures must be ordered by signer address in ascending order to prevent duplicates
A GER can only be processed once: once processed, it can never be injected again, even if it is later
removed from the AgglayerGERL2 (see `injectedGERs` for the GERs this guarantee does not cover)
If the GER is already set in the AgglayerGERL2 (e.g. by a previous updater), it is only marked as injected


```solidity
function injectGER(bytes32 _globalExitRoot, bytes calldata _signatures) external onlyAggOracleProposer;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRoot`|`bytes32`|The global exit root to inject into the GER manager|
|`_signatures`|`bytes`|Concatenated signatures for the global exit root (65 bytes per signature: r+s+v)|


### updateAggOracleProposer

Update the oracle proposer address

Only callable by the contract owner. Proposer address cannot be zero


```solidity
function updateAggOracleProposer(address _newProposer) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newProposer`|`address`|New proposer address|


### transferGlobalExitRootUpdater

Transfer the globalExitRootUpdater role to a new address

Only callable by the contract owner. This is step 1 of a two-step transfer process


```solidity
function transferGlobalExitRootUpdater(address _newGlobalExitRootUpdater) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newGlobalExitRootUpdater`|`address`|Address of the new globalExitRootUpdater|


### acceptGlobalExitRootUpdater

Accept the globalExitRootUpdater role

Only callable by the contract owner. This is step 2 of a two-step transfer process


```solidity
function acceptGlobalExitRootUpdater() external onlyOwner;
```

### updateValidatorsAndThreshold

Update the validators and threshold

Only callable by the contract owner. Validators and threshold are updated in a single transaction


```solidity
function updateValidatorsAndThreshold(
    RemoveValidatorInfo[] memory _validatorsToRemove,
    ValidatorInfo[] memory _validatorsToAdd,
    uint256 _newThreshold
) external onlyOwner;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_validatorsToRemove`|`RemoveValidatorInfo[]`|Array of validators to remove with their indices (MUST be in descending index order)|
|`_validatorsToAdd`|`ValidatorInfo[]`|Array of new validators to add with their URLs|
|`_newThreshold`|`uint256`|New threshold value|


### renounceOwnership

Renouncing ownership is disabled

Without an owner, validators, threshold and proposer could never be updated again


```solidity
function renounceOwnership() public pure override;
```

### _updateAggOracleProposer

Internal function to update the oracle proposer

Validates that the proposer is not the zero address


```solidity
function _updateAggOracleProposer(address _newProposer) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newProposer`|`address`|New proposer address|


### _addValidator

Internal function to add an oracle validator

Validates that the address is not zero, not this contract and not already a validator


```solidity
function _addValidator(address _newValidator, string memory _url) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newValidator`|`address`|Address of the new validator|
|`_url`|`string`|URL of the validator|


### _removeValidator

Internal function to remove an existing oracle validator

Uses swap-and-pop pattern for gas-efficient removal


```solidity
function _removeValidator(address _oracleValidatorAddress, uint256 _oracleValidatorIndex) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_oracleValidatorAddress`|`address`|Address of the oracle validator to remove|
|`_oracleValidatorIndex`|`uint256`|Index of the validator in the validators array|


### _updateThreshold

Internal function to update the threshold

Same rule as a Safe wallet: 1 <= threshold <= number of validators.
This also forces at least one validator to exist


```solidity
function _updateThreshold(uint256 _newThreshold) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newThreshold`|`uint256`|New threshold value|


### _updateValidatorsAndThreshold

Internal function to update validators (added and/or removed) and the threshold

Removes validators first (in descending index order), then adds new validators, then updates the threshold


```solidity
function _updateValidatorsAndThreshold(
    RemoveValidatorInfo[] memory _validatorsToRemove,
    ValidatorInfo[] memory _validatorsToAdd,
    uint256 _newThreshold
) internal;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_validatorsToRemove`|`RemoveValidatorInfo[]`|Array of validators to remove with their indices (MUST be in descending index order)|
|`_validatorsToAdd`|`ValidatorInfo[]`|Array of new validators to add with their URLs|
|`_newThreshold`|`uint256`|New threshold value|


### _buildGERMessage

Build message hash for GER verification

Virtual function to allow for different hashing schemes in derived contracts


```solidity
function _buildGERMessage(bytes32 _globalExitRoot) internal pure virtual returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRoot`|`bytes32`|The GER to build message for|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bytes32`|The message hash to be signed by oracle validators|


### _validateGER

Validate a GER

Validates the GER is not zero, has not been injected before and builds the message hash to verify


```solidity
function _validateGER(bytes32 _globalExitRoot, bytes calldata _signatures) internal view;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRoot`|`bytes32`|The GER to validate|
|`_signatures`|`bytes`|The signatures to verify|


### _verifySignatures

Verify signatures meet the threshold requirement

Heavily based on the Safe multisig implementation: https://github.com/safe-fndn/safe-smart-account/blob/v1.5.0/contracts/Safe.sol#L287

Implements signature verification similar to Safe multisig
- Expects tightly packed signatures (r, s, v) where v is 27 or 28
- Requires exactly `threshold` number of signatures
- Signers must be in ascending address order to prevent duplicate signatures
- ECDSA.recover reverts on invalid signatures and malleable (high-s) signatures


```solidity
function _verifySignatures(bytes32 _messageHash, bytes calldata _signatures) internal view;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_messageHash`|`bytes32`|The message hash that was signed|
|`_signatures`|`bytes`|Concatenated signatures (65 bytes each: 32 bytes r + 32 bytes s + 1 byte v)|


### verifyGER

Verify a GER with signatures without injecting it

Reverts if the GER or the signatures are not valid


```solidity
function verifyGER(bytes32 _globalExitRoot, bytes calldata _signatures) external view returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRoot`|`bytes32`|The GER to verify|
|`_signatures`|`bytes`|The signatures to verify|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|True if the GER is valid|


### getValidatorIndex

Returns the index of an oracle validator in the validators array

Reverts if the validator is not found. Used for off-chain index lookups


```solidity
function getValidatorIndex(address _validator) external view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_validator`|`address`|Oracle validator address to search for|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The index of the oracle validator|


### getValidatorsInfo

Returns all oracle validators with their information

Returns a memory copy of the validators array along with their URLs


```solidity
function getValidatorsInfo() external view returns (ValidatorInfo[] memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`ValidatorInfo[]`|Array of all oracle validators information|


### getValidatorsCount

Returns the total number of oracle validators

More gas-efficient than calling getValidatorsInfo() for just the count


```solidity
function getValidatorsCount() external view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The count of oracle validators|


### version

Returns the version of the contract


```solidity
function version() external pure returns (string memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`string`|The version of the contract|


### isValidator

Returns if an address is a validator


```solidity
function isValidator(address _validator) external view returns (bool);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_validator`|`address`|The address to check|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`bool`|True if the address is a validator|


