# PolygonZkEVMGlobalExitRootV2Mock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/a8bf2955890e7123a84542ced57636d763299651/contracts/v2/mocks/PolygonZkEVMGlobalExitRootV2Mock.sol)

**Inherits:**
[PolygonZkEVMGlobalExitRootV2](/contracts/v2/PolygonZkEVMGlobalExitRootV2.sol/contract.PolygonZkEVMGlobalExitRootV2.md)

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

