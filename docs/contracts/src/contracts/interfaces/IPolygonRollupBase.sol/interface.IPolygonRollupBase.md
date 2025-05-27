# IPolygonRollupBase
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/856b421eef55a77f98f6fed45beb5ed8e3023c16/contracts/interfaces/IPolygonRollupBase.sol)

**Inherits:**
[IPolygonConsensusBase](/contracts/interfaces/IPolygonConsensusBase.sol/interface.IPolygonConsensusBase.md)


## Functions
### onVerifyBatches


```solidity
function onVerifyBatches(uint64 lastVerifiedBatch, bytes32 newStateRoot, address aggregator) external;
```

### rollbackBatches


```solidity
function rollbackBatches(uint64 targetBatch, bytes32 accInputHashToRollback) external;
```

