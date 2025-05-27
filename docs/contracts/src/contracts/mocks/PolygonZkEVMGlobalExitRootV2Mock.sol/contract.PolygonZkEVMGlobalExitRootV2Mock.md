# PolygonZkEVMGlobalExitRootV2Mock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/856b421eef55a77f98f6fed45beb5ed8e3023c16/contracts/mocks/PolygonZkEVMGlobalExitRootV2Mock.sol)

**Inherits:**
[PolygonZkEVMGlobalExitRootV2](/contracts/PolygonZkEVMGlobalExitRootV2.sol/contract.PolygonZkEVMGlobalExitRootV2.md)

PolygonRollupManager mock


## Functions
### constructor


```solidity
constructor(address _rollupManager, address _bridgeAddress)
    PolygonZkEVMGlobalExitRootV2(_rollupManager, _bridgeAddress);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`_rollupManager`|`address`|Rollup manager contract address|
|`_bridgeAddress`|`address`|PolygonZkEVMBridge contract address|


### injectGER


```solidity
function injectGER(bytes32 _root, uint32 depositCount) external;
```

