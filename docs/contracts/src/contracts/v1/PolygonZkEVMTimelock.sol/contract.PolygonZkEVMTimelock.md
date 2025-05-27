# PolygonZkEVMTimelock
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/856b421eef55a77f98f6fed45beb5ed8e3023c16/contracts/v1/PolygonZkEVMTimelock.sol)

**Inherits:**
TimelockController

*Contract module which acts as a timelocked controller.
This gives time for users of the controlled contract to exit before a potentially dangerous maintenance operation is applied.
If emergency mode of the zkevm contract system is active, this timelock have no delay.*


## State Variables
### polygonZkEVM

```solidity
PolygonZkEVM public immutable polygonZkEVM;
```


## Functions
### constructor

Constructor of timelock


```solidity
constructor(
    uint256 minDelay,
    address[] memory proposers,
    address[] memory executors,
    address admin,
    PolygonZkEVM _polygonZkEVM
) TimelockController(minDelay, proposers, executors, admin);
```
**Parameters**

|Name|Type|Description|
|----|----|-----------|
|`minDelay`|`uint256`|initial minimum delay for operations|
|`proposers`|`address[]`|accounts to be granted proposer and canceller roles|
|`executors`|`address[]`|accounts to be granted executor role|
|`admin`|`address`|optional account to be granted admin role; disable with zero address|
|`_polygonZkEVM`|`PolygonZkEVM`|polygonZkEVM address|


### getMinDelay

*Returns the minimum delay for an operation to become valid.
This value can be changed by executing an operation that calls `updateDelay`.
If Polygon ZK-EVM is on emergency state the minDelay will be 0 instead.*


```solidity
function getMinDelay() public view override returns (uint256 duration);
```

