# IAggOracleCommitteeEvents
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/06dd0a111ee1f7d764543925e6fec987cb36ee61/contracts/interfaces/IAggOracleCommittee.sol)

**Title:**
IAggOracleCommitteeEvents

Events emitted by AggOracleCommittee implementations


## Events
### GERInjected
Emitted when a GER is injected


```solidity
event GERInjected(bytes32 indexed globalExitRoot);
```

### GERMarkedAsInjected
Emitted when a GER already set in the AgglayerGERL2 by another updater is marked as injected,
without being inserted again


```solidity
event GERMarkedAsInjected(bytes32 indexed globalExitRoot);
```

### UpdateAggOracleProposer
Emitted when the aggOracleProposer is updated


```solidity
event UpdateAggOracleProposer(address indexed newProposer);
```

### ValidatorsAndThresholdUpdated
Emitted when validators and threshold are updated


```solidity
event ValidatorsAndThresholdUpdated(address[] validators, uint256 threshold);
```

