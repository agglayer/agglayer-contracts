# PolygonZkEVMGlobalExitRootBaseStorage
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/856b421eef55a77f98f6fed45beb5ed8e3023c16/contracts/lib/PolygonZkEVMGlobalExitRootBaseStorage.sol)

**Inherits:**
[IPolygonZkEVMGlobalExitRootV2](/contracts/interfaces/IPolygonZkEVMGlobalExitRootV2.sol/interface.IPolygonZkEVMGlobalExitRootV2.md)

Since the current contract of PolygonZkEVMGlobalExitRoot will be upgraded to a PolygonZkEVMGlobalExitRootV2, and it will implement
the DepositContractBase, this base is needed to preserve the previous storage slots


## State Variables
### lastRollupExitRoot

```solidity
bytes32 public lastRollupExitRoot;
```


### lastMainnetExitRoot

```solidity
bytes32 public lastMainnetExitRoot;
```


### globalExitRootMap

```solidity
mapping(bytes32 => uint256) public globalExitRootMap;
```


