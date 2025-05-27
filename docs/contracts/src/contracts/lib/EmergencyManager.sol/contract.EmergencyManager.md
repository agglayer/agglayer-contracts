# EmergencyManager
[Git Source](https://github.com/agglayer/agglayer-contracts/blob/856b421eef55a77f98f6fed45beb5ed8e3023c16/contracts/lib/EmergencyManager.sol)

*Contract helper responsible to manage the emergency state*


## State Variables
### __gap
*This empty reserved space is put in place to allow future versions to add new
variables without shifting down storage in the inheritance chain.*

**Note:**
oz-renamed-from: _gap


```solidity
uint256[10] private __gap;
```


### isEmergencyState

```solidity
bool public isEmergencyState;
```


## Functions
### ifNotEmergencyState

Only allows a function to be callable if emergency state is unactive


```solidity
modifier ifNotEmergencyState();
```

### ifEmergencyState

Only allows a function to be callable if emergency state is active


```solidity
modifier ifEmergencyState();
```

### _activateEmergencyState

Activate emergency state


```solidity
function _activateEmergencyState() internal virtual ifNotEmergencyState;
```

### _deactivateEmergencyState

Deactivate emergency state


```solidity
function _deactivateEmergencyState() internal virtual ifEmergencyState;
```

## Events
### EmergencyStateActivated
*Emitted when emergency state is activated*


```solidity
event EmergencyStateActivated();
```

### EmergencyStateDeactivated
*Emitted when emergency state is deactivated*


```solidity
event EmergencyStateDeactivated();
```

## Errors
### OnlyNotEmergencyState
*Thrown when emergency state is active, and the function requires otherwise*


```solidity
error OnlyNotEmergencyState();
```

### OnlyEmergencyState
*Thrown when emergency state is not active, and the function requires otherwise*


```solidity
error OnlyEmergencyState();
```

