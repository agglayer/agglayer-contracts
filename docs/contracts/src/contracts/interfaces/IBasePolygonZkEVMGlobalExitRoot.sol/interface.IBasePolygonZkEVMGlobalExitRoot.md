# IBasePolygonZkEVMGlobalExitRoot
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/856b421eef55a77f98f6fed45beb5ed8e3023c16/contracts/interfaces/IBasePolygonZkEVMGlobalExitRoot.sol)


## Functions
### updateExitRoot


```solidity
function updateExitRoot(bytes32 newRollupExitRoot) external;
```

### globalExitRootMap


```solidity
function globalExitRootMap(bytes32 globalExitRootNum) external returns (uint256);
```

## Errors
### OnlyAllowedContracts
*Thrown when the caller is not the allowed contracts*


```solidity
error OnlyAllowedContracts();
```

### OnlyGlobalExitRootUpdater
*Thrown when the caller is not the coinbase neither the globalExitRootUpdater*


```solidity
error OnlyGlobalExitRootUpdater();
```

### OnlyPendingGlobalExitRootUpdater
*Thrown when trying to call a function that only the pending GlobalExitRootUpdater can call.*


```solidity
error OnlyPendingGlobalExitRootUpdater();
```

### OnlyGlobalExitRootRemover
*Thrown when the caller is not the globalExitRootRemover*


```solidity
error OnlyGlobalExitRootRemover();
```

### OnlyPendingGlobalExitRootRemover
*Thrown when trying to call a function that only the pending GlobalExitRootRemover can call.*


```solidity
error OnlyPendingGlobalExitRootRemover();
```

### GlobalExitRootAlreadySet
*Thrown when trying to insert a global exit root that is already set*


```solidity
error GlobalExitRootAlreadySet();
```

### GlobalExitRootNotFound
*Thrown when trying to remove a ger that doesn't exist*


```solidity
error GlobalExitRootNotFound();
```

### InvalidZeroAddress
*Thrown when trying to call a function with an input zero address*


```solidity
error InvalidZeroAddress();
```

