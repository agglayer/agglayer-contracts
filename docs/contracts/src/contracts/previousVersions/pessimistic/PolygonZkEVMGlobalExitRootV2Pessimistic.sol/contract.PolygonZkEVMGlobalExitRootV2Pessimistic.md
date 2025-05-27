# PolygonZkEVMGlobalExitRootV2Pessimistic
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/856b421eef55a77f98f6fed45beb5ed8e3023c16/contracts/previousVersions/pessimistic/PolygonZkEVMGlobalExitRootV2Pessimistic.sol)

**Inherits:**
[PolygonZkEVMGlobalExitRootBaseStorage](/contracts/lib/PolygonZkEVMGlobalExitRootBaseStorage.sol/abstract.PolygonZkEVMGlobalExitRootBaseStorage.md), [DepositContractBasePessimistic](/contracts/previousVersions/pessimistic/DepositContractBasePessimistic.sol/contract.DepositContractBasePessimistic.md), Initializable

Contract responsible for managing the exit roots across multiple networks


## State Variables
### bridgeAddress

```solidity
address public immutable bridgeAddress;
```


### rollupManager

```solidity
address public immutable rollupManager;
```


### l1InfoRootMap

```solidity
mapping(uint32 leafCount => bytes32 l1InfoRoot) public l1InfoRootMap;
```


## Functions
### constructor


```solidity
constructor(address _rollupManager, address _bridgeAddress);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_rollupManager`|`address`|Rollup manager contract address|
|`_bridgeAddress`|`address`|PolygonZkEVMBridge contract address|


### initialize

Reset the deposit tree since will be replace by a recursive one


```solidity
function initialize() external virtual initializer;
```

### updateExitRoot

Update the exit root of one of the networks and the global exit root


```solidity
function updateExitRoot(bytes32 newRoot) external;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newRoot`|`bytes32`|new exit tree root|


### getLastGlobalExitRoot

Return last global exit root


```solidity
function getLastGlobalExitRoot() public view returns (bytes32);
```

### getRoot

Computes and returns the merkle root of the L1InfoTree


```solidity
function getRoot()
    public
    view
    override(DepositContractBasePessimistic, IPolygonZkEVMGlobalExitRootV2)
    returns (bytes32);
```

### getLeafValue

Given the leaf data returns the leaf hash


```solidity
function getLeafValue(bytes32 newGlobalExitRoot, uint256 lastBlockHash, uint64 timestamp)
    public
    pure
    returns (bytes32);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`newGlobalExitRoot`|`bytes32`|Last global exit root|
|`lastBlockHash`|`uint256`|Last accessible block hash|
|`timestamp`|`uint64`|Ethereum timestamp in seconds|


## Events
### UpdateL1InfoTree
*Emitted when the global exit root is updated*


```solidity
event UpdateL1InfoTree(bytes32 indexed mainnetExitRoot, bytes32 indexed rollupExitRoot);
```

### UpdateL1InfoTreeV2
*Emitted when the global exit root is updated with the L1InfoTree leaf information*


```solidity
event UpdateL1InfoTreeV2(bytes32 currentL1InfoRoot, uint32 indexed leafCount, uint256 blockhash, uint64 minTimestamp);
```

### InitL1InfoRootMap
*Emitted when the global exit root manager starts adding leafs to the L1InfoRootMap*


```solidity
event InitL1InfoRootMap(uint32 leafCount, bytes32 currentL1InfoRoot);
```

