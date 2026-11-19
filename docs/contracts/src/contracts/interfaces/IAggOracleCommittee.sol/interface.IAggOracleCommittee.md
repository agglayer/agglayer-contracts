# IAggOracleCommittee
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/06dd0a111ee1f7d764543925e6fec987cb36ee61/contracts/interfaces/IAggOracleCommittee.sol)

**Inherits:**
[IAggOracleCommitteeErrors](/contracts/interfaces/IAggOracleCommittee.sol/interface.IAggOracleCommitteeErrors.md), [IAggOracleCommitteeEvents](/contracts/interfaces/IAggOracleCommittee.sol/interface.IAggOracleCommitteeEvents.md), [IVersion](/contracts/interfaces/IVersion.sol/interface.IVersion.md)

**Title:**
IAggOracleCommittee

Core interface for the AggOracleCommittee contract responsible for managing the insertion of GERs.

This contract uses signature verification similar to Safe multisig for permissioned injection of GERs.


## Functions
### initialize

Initializes the contract


```solidity
function initialize(
    address _owner,
    address _newProposer,
    ValidatorInfo[] memory _newValidators,
    uint256 _newThreshold
) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_owner`|`address`|Owner of the contract, presumably a multisig|
|`_newProposer`|`address`|Address that can propose GER injections|
|`_newValidators`|`ValidatorInfo[]`|Initial array of validator information|
|`_newThreshold`|`uint256`|Number of signatures required for GER injection|


### injectGER

Inject a GER with signature verification


```solidity
function injectGER(bytes32 _globalExitRoot, bytes calldata _signatures) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_globalExitRoot`|`bytes32`|The GER to inject|
|`_signatures`|`bytes`|The signatures to verify|


### updateAggOracleProposer

Update the aggOracleProposer address


```solidity
function updateAggOracleProposer(address _newProposer) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newProposer`|`address`|New proposer address|


### transferGlobalExitRootUpdater

Transfer the globalExitRootUpdater role

This is a two-step process; the pending globalExitRootUpdater must accept to finalize the process


```solidity
function transferGlobalExitRootUpdater(address _newGlobalExitRootUpdater) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_newGlobalExitRootUpdater`|`address`|Address of the new globalExitRootUpdater|


### acceptGlobalExitRootUpdater

Accept the globalExitRootUpdater role

This is the second step from a two-step process


```solidity
function acceptGlobalExitRootUpdater() external;
```

### updateValidatorsAndThreshold

Update the validators and threshold


```solidity
function updateValidatorsAndThreshold(
    RemoveValidatorInfo[] memory _validatorsToRemove,
    ValidatorInfo[] memory _validatorsToAdd,
    uint256 _newThreshold
) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_validatorsToRemove`|`RemoveValidatorInfo[]`|Array of validators to remove with their indices (MUST be in descending index order)|
|`_validatorsToAdd`|`ValidatorInfo[]`|Array of new validators to add with their URLs|
|`_newThreshold`|`uint256`|New threshold value|


### verifyGER

Verify a GER with signatures


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

Returns the index of a validator


```solidity
function getValidatorIndex(address _validator) external view returns (uint256);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_validator`|`address`|Validator address|

**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The index of the validator|


### getValidatorsInfo

Returns all the validators with their information


```solidity
function getValidatorsInfo() external view returns (ValidatorInfo[] memory);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`ValidatorInfo[]`|Array of validator information|


### getValidatorsCount

Returns the number of validators


```solidity
function getValidatorsCount() external view returns (uint256);
```
**Returns**

|Name|Type|Description|
|----|----|-----------|
|`<none>`|`uint256`|The count of validators|


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


### agglayerGERL2

Global exit root manager L2


```solidity
function agglayerGERL2() external view returns (IAgglayerGERL2);
```

### validators

Array of validators


```solidity
function validators(uint256 index) external view returns (address);
```

### threshold

Threshold required for signature verification


```solidity
function threshold() external view returns (uint256);
```

### validatorInfo

Mapping to track validator information


```solidity
function validatorInfo(address validator) external view returns (bool exists, string memory url);
```

### proposer

Address that can propose GER injections


```solidity
function proposer() external view returns (address);
```

### injectedGERs

Returns if a GER has already been injected by this contract


```solidity
function injectedGERs(bytes32 globalExitRoot) external view returns (bool);
```

## Structs
### ValidatorInfo
Struct containing validator information


```solidity
struct ValidatorInfo {
    address addr;
    string url;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`addr`|`address`|The address of the validator|
|`url`|`string`|The URL associated with the validator|

### ValidatorInternalInfo
Struct containing internal validator information


```solidity
struct ValidatorInternalInfo {
    bool isValidator;
    string url;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`isValidator`|`bool`|Whether the address is a validator|
|`url`|`string`|The URL associated with the validator|

### RemoveValidatorInfo
Struct to hold information for removing a validator


```solidity
struct RemoveValidatorInfo {
    address addr;
    uint256 index;
}
```

**Properties**

|Name|Type|Description|
|----|----|-----------|
|`addr`|`address`|The address of the validator to remove|
|`index`|`uint256`|The index of the validator in the validators array|

