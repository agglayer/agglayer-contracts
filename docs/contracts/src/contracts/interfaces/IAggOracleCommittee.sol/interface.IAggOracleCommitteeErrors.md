# IAggOracleCommitteeErrors
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/06dd0a111ee1f7d764543925e6fec987cb36ee61/contracts/interfaces/IAggOracleCommittee.sol)

**Title:**
IAggOracleCommitteeErrors

Error definitions for AggOracleCommittee implementations


## Errors
### AgglayerGERL2CannotBeZero
Thrown when the AgglayerGERL2 address is zero


```solidity
error AgglayerGERL2CannotBeZero();
```

### OwnerCannotBeZero
Thrown when the owner address is zero


```solidity
error OwnerCannotBeZero();
```

### ProposerCannotBeZero
Thrown when the proposer address is zero


```solidity
error ProposerCannotBeZero();
```

### OnlyAggOracleProposerCanCall
Thrown when the caller is not the oracle proposer


```solidity
error OnlyAggOracleProposerCanCall();
```

### GERCannotBeZero
Thrown when a GER is zero


```solidity
error GERCannotBeZero();
```

### GERAlreadyInjected
Thrown when a GER has already been injected by this contract


```solidity
error GERAlreadyInjected();
```

### ValidatorCannotBeZero
Thrown when the validator address is zero


```solidity
error ValidatorCannotBeZero();
```

### ValidatorCannotBeThisContract
Thrown when the validator address is this contract


```solidity
error ValidatorCannotBeThisContract();
```

### ValidatorAlreadyExists
Thrown when the address is already a validator


```solidity
error ValidatorAlreadyExists();
```

### ValidatorIndexOutOfBounds
Thrown when the validator index is out of bounds


```solidity
error ValidatorIndexOutOfBounds();
```

### ValidatorIndexMismatch
Thrown when the validator index doesn't match the address


```solidity
error ValidatorIndexMismatch();
```

### TooManyValidators
Thrown when the number of validators exceeds MAX_VALIDATORS


```solidity
error TooManyValidators();
```

### ThresholdCannotBeGreaterThanValidators
Thrown when threshold is greater than the number of validators


```solidity
error ThresholdCannotBeGreaterThanValidators();
```

### ThresholdCannotBeZero
Thrown when threshold is zero


```solidity
error ThresholdCannotBeZero();
```

### IndicesNotInDescendingOrder
Thrown when indices are not in descending order


```solidity
error IndicesNotInDescendingOrder();
```

### InvalidSignaturesLength
Thrown when the signatures length is not exactly threshold * 65 bytes


```solidity
error InvalidSignaturesLength();
```

### ValidatorDoesNotExist
Thrown when a validator does not exist


```solidity
error ValidatorDoesNotExist();
```

### ValidatorsNotOrdered
Thrown when validators are not ordered


```solidity
error ValidatorsNotOrdered();
```

### ValidatorNotFound
Thrown when a validator is not found


```solidity
error ValidatorNotFound();
```

### RenounceOwnershipDisabled
Thrown when trying to renounce ownership


```solidity
error RenounceOwnershipDisabled();
```

