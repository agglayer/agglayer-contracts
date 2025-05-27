# DepositContractMock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/856b421eef55a77f98f6fed45beb5ed8e3023c16/contracts/v1/mocks/DepositContractMock.sol)

**Inherits:**
[DepositContract](/contracts/v1/lib/DepositContract.sol/contract.DepositContract.md)

This contract will be used as a herlper for all the sparse merkle tree related functions
Based on the implementation of the deposit eth2.0 contract https://github.com/ethereum/consensus-specs/blob/dev/solidity_deposit_contract/deposit_contract.sol


## Functions
### constructor


```solidity
constructor();
```

### initialize


```solidity
function initialize() public initializer;
```

### deposit

Given the leaf data returns the leaf value


```solidity
function deposit(
    uint8 leafType,
    uint32 originNetwork,
    address originTokenAddress,
    uint32 destinationNetwork,
    address destinationAddress,
    uint256 amount,
    bytes32 metadataHash
) public;
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`leafType`|`uint8`|Leaf type|
|`originNetwork`|`uint32`|Origin Network|
|`originTokenAddress`|`address`|Origin token address, 0 address is reserved for gas token address. If WETH address is zero, means this gas token is ether, else means is a custom erc20 gas token|
|`destinationNetwork`|`uint32`|Destination network|
|`destinationAddress`|`address`|Destination address|
|`amount`|`uint256`|Amount of tokens|
|`metadataHash`|`bytes32`|Hash of the metadata|


