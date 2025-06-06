Sovereign chains bridge that will be deployed on all Sovereign chains
Contract responsible to manage the token interactions with other networks
This contract is not meant to replace the current zkEVM bridge contract, but deployed on sovereign networks


## Functions
### constructor
```solidity
  function constructor(
  ) public
```
Disable initializers on the implementation following the best practices



### initialize
```solidity
  function initialize(
    uint32 _networkID,
    address _gasTokenAddress,
    uint32 _gasTokenNetwork,
    contract IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
    address _polygonRollupManager,
    bytes _gasTokenMetadata,
    address _bridgeManager,
    address _sovereignWETHAddress,
    bool _sovereignWETHAddressIsNotMintable
  ) public
```
The value of `_polygonRollupManager` on the L2 deployment of the contract will be address(0), so
emergency state is not possible for the L2 deployment of the bridge, intentionally


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_networkID` | uint32 | networkID
|`_gasTokenAddress` | address | gas token address
|`_gasTokenNetwork` | uint32 | gas token network
|`_globalExitRootManager` | contract IBasePolygonZkEVMGlobalExitRoot | global exit root manager address
|`_polygonRollupManager` | address | Rollup manager address
|`_gasTokenMetadata` | bytes | Abi encoded gas token metadata
|`_bridgeManager` | address | bridge manager address
|`_sovereignWETHAddress` | address | sovereign WETH address
|`_sovereignWETHAddressIsNotMintable` | bool | Flag to indicate if the wrapped ETH is not mintable

### initialize
```solidity
  function initialize(
  ) external
```
Override the function to prevent the contract from being initialized with this initializer



### setMultipleSovereignTokenAddress
```solidity
  function setMultipleSovereignTokenAddress(
    uint32[] originNetworks,
    address[] originTokenAddresses,
    address[] sovereignTokenAddresses,
    bool[] isNotMintable
  ) external
```
Remap multiple wrapped tokens to a new sovereign token address

This function is a "multi/batch call" to `setSovereignTokenAddress`

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`originNetworks` | uint32[] | Array of Origin networks
|`originTokenAddresses` | address[] | Array of Origin token addresses, 0 address is reserved for ether
|`sovereignTokenAddresses` | address[] | Array of Addresses of the sovereign wrapped token
|`isNotMintable` | bool[] | Array of Flags to indicate if the wrapped token is not mintable

### _setSovereignTokenAddress
```solidity
  function _setSovereignTokenAddress(
    uint32 originNetwork,
    address originTokenAddress,
    address sovereignTokenAddress,
    bool isNotMintable
  ) internal
```
Remap a wrapped token to a new sovereign token address
If this function is called multiple times for the same existingTokenAddress,
this will override the previous calls and only keep the last sovereignTokenAddress.
The tokenInfoToWrappedToken mapping  value is replaced by the new sovereign address but it's not the case for the wrappedTokenToTokenInfo map where the value is added, this way user will always be able to withdraw their tokens
The number of decimals between sovereign token and origin token is not checked, it doesn't affect the bridge functionality but the UI.

This function is used to allow any existing token to be mapped with
     origin token.

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`originNetwork` | uint32 | Origin network
|`originTokenAddress` | address | Origin token address, 0 address is reserved for gas token address. If WETH address is zero, means this gas token is ether, else means is a custom erc20 gas token
|`sovereignTokenAddress` | address | Address of the sovereign wrapped token
|`isNotMintable` | bool | Flag to indicate if the wrapped token is not mintable

### removeLegacySovereignTokenAddress
```solidity
  function removeLegacySovereignTokenAddress(
    address legacySovereignTokenAddress
  ) external
```
Remove the address of a remapped token from the mapping. Used to stop supporting legacy sovereign tokens
It also removes the token from the isNotMintable mapping
Although the token is removed from the mapping, the user will still be able to withdraw their tokens using tokenInfoToWrappedToken mapping


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`legacySovereignTokenAddress` | address | Address of the sovereign wrapped token

### setSovereignWETHAddress
```solidity
  function setSovereignWETHAddress(
    address sovereignWETHTokenAddress,
    bool isNotMintable
  ) external
```
Set the custom wrapper for weth
If this function is called multiple times this will override the previous calls and only keep the last WETHToken.
WETH will not maintain legacy versions.Users easily should be able to unwrapp the legacy WETH and unwrapp it with the new one.


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`sovereignWETHTokenAddress` | address | Address of the sovereign weth token
|`isNotMintable` | bool | Flag to indicate if the wrapped token is not mintable

### migrateLegacyToken
```solidity
  function migrateLegacyToken(
    address legacyTokenAddress,
    uint256 amount
  ) external
```
Moves old native or remapped token (legacy) to the new mapped token. If the token is mintable, it will be burnt and minted, otherwise it will be transferred


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`legacyTokenAddress` | address | Address of legacy token to migrate
|`amount` | uint256 | Legacy token balance to migrate

### unsetMultipleClaimedBitmap
```solidity
  function unsetMultipleClaimedBitmap(
    uint32[] leafIndexes,
    uint32[] sourceBridgeNetworks
  ) external
```
unset multiple claims from the claimedBitmap

This function is a "multi/batch call" to `unsetClaimedBitmap`

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`leafIndexes` | uint32[] | Array of Index
|`sourceBridgeNetworks` | uint32[] | Array of Origin networks

### setBridgeManager
```solidity
  function setBridgeManager(
    address _bridgeManager
  ) external
```
Updated bridge manager address, recommended to set a timelock at this address after bootstrapping phase


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`_bridgeManager` | address | Bridge manager address

### _bridgeWrappedAsset
```solidity
  function _bridgeWrappedAsset(
    contract TokenWrapped tokenWrapped,
    uint256 amount
  ) internal
```
Burn tokens from wrapped token to execute the bridge, if the token is not mintable it will be transferred
note This function has been extracted to be able to override it by other contracts like Bridge2SovereignChain


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`tokenWrapped` | contract TokenWrapped | Wrapped token to burnt
|`amount` | uint256 | Amount of tokens

### _claimWrappedAsset
```solidity
  function _claimWrappedAsset(
    contract TokenWrapped tokenWrapped,
    address destinationAddress,
    uint256 amount
  ) internal
```
Mints tokens from wrapped token to proceed with the claim, if the token is not mintable it will be transferred
note This function has been extracted to be able to override it by other contracts like BridgeL2SovereignChain


#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`tokenWrapped` | contract TokenWrapped | Wrapped token to mint
|`destinationAddress` | address | Minted token receiver
|`amount` | uint256 | Amount of tokens

### isClaimed
```solidity
  function isClaimed(
    uint32 leafIndex,
    uint32 sourceBridgeNetwork
  ) external returns (bool)
```
Function to check if an index is claimed or not

function overridden to improve a bit the performance and bytecode not checking unnecessary conditions for sovereign chains context

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`leafIndex` | uint32 | Index
|`sourceBridgeNetwork` | uint32 | Origin network

### _setAndCheckClaimed
```solidity
  function _setAndCheckClaimed(
    uint32 leafIndex,
    uint32 sourceBridgeNetwork
  ) internal
```
Function to check that an index is not claimed and set it as claimed

function overridden to improve a bit the performance and bytecode not checking unnecessary conditions for sovereign chains context

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`leafIndex` | uint32 | Index
|`sourceBridgeNetwork` | uint32 | Origin network

### _permit
```solidity
  function _permit(
    address amount,
    uint256 permitData
  ) internal
```
Function to call token permit method of extended ERC20

function overridden from PolygonZkEVMBridgeV2 to improve a bit the performance and bytecode not checking unnecessary conditions for sovereign chains context
     + @param token ERC20 token address

#### Parameters:
| Name | Type | Description                                                          |
| :--- | :--- | :------------------------------------------------------------------- |
|`amount` | address | Quantity that is expected to be allowed
|`permitData` | uint256 | Raw data of the call `permit` of the token

### activateEmergencyState
```solidity
  function activateEmergencyState(
  ) external
```




### deactivateEmergencyState
```solidity
  function deactivateEmergencyState(
  ) external
```




## Events
### SetBridgeManager
```solidity
  event SetBridgeManager(
  )
```

Emitted when a bridge manager is updated

### UnsetClaim
```solidity
  event UnsetClaim(
  )
```

Emitted when a claim is unset

### SetSovereignTokenAddress
```solidity
  event SetSovereignTokenAddress(
  )
```

Emitted when a token address is remapped by a sovereign token address

### MigrateLegacyToken
```solidity
  event MigrateLegacyToken(
  )
```

Emitted when a legacy token is migrated to a new token

### RemoveLegacySovereignTokenAddress
```solidity
  event RemoveLegacySovereignTokenAddress(
  )
```

Emitted when a remapped token is removed from mapping

### SetSovereignWETHAddress
```solidity
  event SetSovereignWETHAddress(
  )
```

Emitted when a WETH address is remapped by a sovereign WETH address

