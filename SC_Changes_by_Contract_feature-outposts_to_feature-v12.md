# Smart Contracts Changes: feature/outposts → feature/v12

---

## Table of Contents
- [1. AggLayerGateway v1.1.0 → v1.0.0](#1-agglayergateway-v110--v100)
- [2. AggchainECDSA v1.0.0 (NEW)](#2-aggchainecdsa-v100-new)
- [3. AggchainECDSAMultisig v1.0.0 (REMOVED)](#3-aggchainecdsasig-v100-removed)
- [4. AggchainBase (Major Refactor)](#4-aggchainbase-major-refactor)
- [5. PolygonZkEVMBridgeV2 v1.1.0 → al-v0.3.1](#5-polygonzkevmbridgev2-v110--al-v031)
- [6. PolygonRollupManager v1.0.0](#6-polygonrollupmanager-v100)
- [7. PolygonZkEVMGlobalExitRootV2 v1.0.0](#7-polygonzkevmglobalexitrootv2-v100)
- [8. Interface Changes](#8-interface-changes)
- [9. Library Changes](#9-library-changes)
- [10. Removed Previous Versions](#10-removed-previous-versions)

---

## 1. AggLayerGateway `v1.1.0` → `v1.0.0`

### 1.1 Removed Multisig Functionality

**Purpose**: Complete removal of multisig infrastructure from AggLayerGateway  
**Impact**: **BREAKING CHANGE** - All multisig operations no longer supported

**Removed Constants**:
```solidity
// Removed multisig role
bytes32 internal constant AL_MULTISIG_ROLE = keccak256("AL_MULTISIG_ROLE");

// Removed version constant
string public constant AGGLAYER_GATEWAY_VERSION = "v1.1.0";
```

**Removed Storage Variables**:
```solidity
// Multisig signers management
address[] public aggchainSigners;
mapping(address => string) public signerToURLs;
uint256 public threshold;
bytes32 public aggchainSignersHash;

// Transient storage for initialization
uint64 private transient _initializerVersion;
```

**Removed Functions**:
- `updateSignersAndThreshold(RemoveSignerInfo[], SignerInfo[], uint256)`
- `_updateSignersAndThreshold()` (internal)
- `_addSignerInternal()` (internal)
- `_removeSignerInternal()` (internal)
- `_updateAggchainSignersHash()` (internal)
- `isSigner(address)`
- `getAggchainSignersCount()`
- `getAggchainSigners()`
- `getAggchainSignersHash()`
- `getAggchainSignerInfos()`
- `version()` (IVersion interface)

**Modified Initialization**:
```solidity
// Before: Complex initialization with multisig setup
function initialize(
    address defaultAdmin,
    address aggchainDefaultVKeyRole,
    address addRouteRole,
    address freezeRouteRole,
    bytes4 pessimisticVKeySelector,
    address verifier,
    bytes32 pessimisticVKey,
    address multisigRole,            // REMOVED
    SignerInfo[] memory signersToAdd, // REMOVED
    uint256 newThreshold            // REMOVED
) external getInitializedVersion reinitializer(2)

// After: Simplified initialization
function initialize(
    address defaultAdmin,
    address aggchainDefaultVKeyRole,
    address addRouteRole,
    address freezeRouteRole,
    bytes4 pessimisticVKeySelector,
    address verifier,
    bytes32 pessimisticVKey
) external initializer
```

### 1.2 Interface Changes

**Removed Interface**: No longer implements `IVersion`
```solidity
// Before
contract AggLayerGateway is Initializable, AccessControlUpgradeable, IAggLayerGateway, IVersion

// After  
contract AggLayerGateway is Initializable, AccessControlUpgradeable, IAggLayerGateway
```

### 1.3 Storage Layout Updates

**Storage Gap Adjustment**:
```solidity
// Before: Account for multisig variables (4 slots used)
uint256[46] private __gap;

// After: Full gap restoration
uint256[50] private __gap;
```

---

## 2. AggchainECDSA `v1.0.0` (NEW)

### 2.1 New Contract Overview

**Purpose**: Simplified single-signer ECDSA aggchain implementation  
**Replaces**: AggchainECDSAMultisig.sol  
**Lines of Code**: 236 lines

### 2.2 Key Features

**Contract Declaration**:
```solidity
/**
 * @title AggchainECDSA
 * @notice Generic aggchain based on ECDSA signature.
 * An address signs the new_ler and the commit_imported_bridge_exits in order to do state
 * transitions on the pessimistic trees (local_exit_tree, local_balance_tree, nullifier_tree & height).
 * That address is the trustedSequencer and is set during the chain initialization.
 */
contract AggchainECDSA is AggchainBase
```

**Constants**:
```solidity
// Aggchain type selector for verification key retrieval
bytes2 public constant AGGCHAIN_TYPE = 0;
```

### 2.3 Initialization

**Function**: Single initialization for new deployments
```solidity
function initialize(
    address _admin,
    address _trustedSequencer,
    address _gasTokenAddress,
    string memory _trustedSequencerURL,
    string memory _networkName
) external onlyAggchainManager getInitializedVersion reinitializer(2)
```

**Parameters**:
- `_admin`: Admin address for the aggchain
- `_trustedSequencer`: Single signer address (replaces multisig)
- `_gasTokenAddress`: Gas token for the network
- `_trustedSequencerURL`: URL endpoint for the sequencer
- `_networkName`: Human-readable network name

### 2.4 Migration Support

**Function**: Migration from PolygonPessimisticConsensus
```solidity
function migrateFromPessimisticConsensus() 
    external onlyRollupManager getInitializedVersion reinitializer(2)
```

**Migration Logic**:
- Sets `aggchainManager = admin`
- Converts `trustedSequencer` to single signer
- Sets threshold to 1 (single signature required)
- Handles empty `trustedSequencerURL` case

### 2.5 Verification Functions

**Pessimistic Verification**:
```solidity
function onVerifyPessimistic(bytes calldata aggchainData) 
    external onlyRollupManager
```

**Event Emitted**:
```solidity
event OnVerifyPessimisticECDSA(bytes32 newStateRoot);
```

### 2.6 View Functions

**Aggchain Parameters**:
```solidity
function getAggchainParamsAndVKeySelector(bytes memory aggchainData) 
    public pure override returns (bytes32, bytes32)
```

**Returns**: `(bytes32(0), bytes32(0))` - No custom parameters needed for single-signer ECDSA

---

## 3. AggchainECDSAMultisig `v1.0.0` (REMOVED)

### 3.1 Complete Removal

**Impact**: **BREAKING CHANGE** - All multisig aggchain functionality removed  
**Replacement**: Use AggchainECDSA.sol for single-signer operations  
**Lines Removed**: 217 lines

### 3.2 Removed Functionality

**Multisig Operations**:
- Multiple signer management
- Threshold-based consensus
- Signer URL tracking
- Multisig hash computation

**Migration Path**:
- Existing deployments should migrate to AggchainECDSA
- Use `migrateFromPessimisticConsensus()` function
- Convert from multisig to single `trustedSequencer`

---

## 4. AggchainBase (Major Refactor)

### 4.1 Multisig Infrastructure Removal

**Impact**: **BREAKING CHANGE** - Complete architectural simplification

**Removed Storage Variables**:
```solidity
// Legacy variables removed
address public _legacyvKeyManager;
address public _legacypendingVKeyManager;
bool public useDefaultVkeys;
bool public useDefaultSigners;

// Multisig variables removed
address[] public aggchainSigners;
mapping(address => string) public signerToURLs;
uint256 public threshold;
bytes32 public aggchainSignersHash;
```

**New Storage Variables**:
```solidity
// Simplified key management
address public vKeyManager;
address public pendingVKeyManager;
bool public useDefaultGateway;
```

### 4.2 Interface Changes

**Removed Interface**: No longer implements `IVersion`
```solidity
// Before
abstract contract AggchainBase is PolygonConsensusBase, IAggchainBase, IVersion

// After
abstract contract AggchainBase is PolygonConsensusBase, IAggchainBase
```

### 4.3 New Access Control

**Added Modifier**:
```solidity
modifier onlyVKeyManager() {
    if (vKeyManager != msg.sender) {
        revert OnlyVKeyManager();
    }
    _;
}
```

### 4.4 Removed Functions

**Multisig Management**: All multisig-related functions removed
- Signer management functions
- Threshold operations
- Hash computation functions
- URL tracking functions

### 4.5 Storage Layout

**Storage Gap Update**:
```solidity
// Before: Reduced gap due to multisig variables
uint256[46] private __gap;

// After: Full gap restoration
uint256[50] private __gap;
```

---

## 5. PolygonZkEVMBridgeV2 `v1.1.0` → `al-v0.3.1`

### 5.1 BridgeLib Integration

**Purpose**: Remove external library dependency and integrate functionality inline  
**Impact**: **BREAKING CHANGE** - Library dependency removed

**Removed Imports**:
```solidity
// Removed library import
import {BridgeLib} from "./lib/BridgeLib.sol";
```

**Removed Storage**:
```solidity
// Removed library instance
BridgeLib public immutable bridgeLib;
```

### 5.2 Permit Functionality Integration

**New Constants**:
```solidity
// Direct permit signature handling
bytes4 internal constant _PERMIT_SIGNATURE = 0xd505accf;
bytes4 internal constant _PERMIT_SIGNATURE_DAI = 0x8fcbaf0c;
```

**Function Changes**:
```solidity
// Before: Library call
function _permit(address token, bytes calldata permitData) internal {
    bridgeLib.validateAndProcessPermit(token, permitData, msg.sender, address(this));
}

// After: Direct implementation
function _permit(address token, bytes calldata permitData) internal {
    bytes4 sig = bytes4(permitData[:4]);
    if (sig == _PERMIT_SIGNATURE) {
        (address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s) = 
            abi.decode(permitData[4:], (address, address, uint256, uint256, uint8, bytes32, bytes32));
        // Direct permit implementation...
    }
    // Handle DAI permit variant...
}
```

### 5.3 Token Metadata Integration

**Function Changes**:
```solidity
// Before: Library call
metadata = bridgeLib.getTokenMetadata(token);

// After: Direct implementation
metadata = getTokenMetadata(token);
```

**New Internal Function**:
```solidity
function getTokenMetadata(address token) internal view returns (bytes memory) {
    // Direct metadata extraction implementation
}
```

### 5.4 Version Update

**Version String Change**:
```solidity
// Before
string public constant BRIDGE_VERSION = "v1.1.0";

// After
string public constant BRIDGE_VERSION = "al-v0.3.1";
```

### 5.5 Interface Changes

**Removed Interface**: No longer implements `IVersion`
```solidity
// Before
contract PolygonZkEVMBridgeV2 is DepositContractV2, EmergencyManager, IPolygonZkEVMBridgeV2, IVersion

// After
contract PolygonZkEVMBridgeV2 is DepositContractV2, EmergencyManager, IPolygonZkEVMBridgeV2
```

---

## 6. PolygonRollupManager `v1.0.0`

### 6.1 Minor Updates

**Interface Changes**: Removed `IVersion` interface dependency
**Impact**: Low - Maintains core functionality

**Changes**:
- Removed `IVersion` import and implementation
- Updated interface declarations
- Maintained all core rollup management functionality

---

## 7. PolygonZkEVMGlobalExitRootV2 `v1.0.0`  

### 7.1 Minor Updates

**Interface Changes**: Removed `IVersion` interface dependency  
**Impact**: Low - Maintains core functionality

**Changes**:
- Removed `IVersion` import and implementation  
- Updated interface declarations
- Maintained all core global exit root functionality

---

## 8. Interface Changes

### 8.1 Removed Interfaces

#### 8.1.1 IVersion.sol (DELETED)
**Purpose**: Version reporting interface  
**Impact**: All contracts no longer implement version reporting  
**Lines Removed**: Complete interface

**Removed Functions**:
```solidity
interface IVersion {
    function version() external pure returns (string memory);
}
```

#### 8.1.2 IAggOracleCommittee.sol (DELETED)
**Purpose**: Oracle committee management interface  
**Impact**: Oracle committee functionality completely removed  
**Lines Removed**: 181 lines

#### 8.1.3 IAggchainSigners.sol (DELETED)  
**Purpose**: Aggchain signer management interface
**Impact**: Multisig signer management no longer supported
**Lines Removed**: 71 lines

### 8.2 Modified Interfaces

#### 8.2.1 IAggLayerGateway.sol
**Changes**: Removed multisig function signatures
- Removed multisig management functions
- Removed signer-related events
- Simplified interface to core PP verification

#### 8.2.2 IAggchainBase.sol  
**Changes**: Updated to reflect simplified architecture
- Removed multisig-related functions
- Updated storage structure
- Simplified key management

#### 8.2.3 IPolygonZkEVMBridgeV2.sol
**Changes**: Bridge interface updates
- Added new function signatures
- Updated for direct permit handling
- Removed library dependencies

---

## 9. Library Changes

### 9.1 BridgeLib.sol (DELETED)

**Purpose**: Bridge utility functions library  
**Impact**: **BREAKING CHANGE** - Library functionality integrated inline  
**Lines Removed**: 219 lines

**Removed Functions**:
```solidity
library BridgeLib {
    function validateAndProcessPermit(...) external;
    function getTokenMetadata(...) external view returns (bytes memory);
    // Other utility functions...
}
```

**Integration**: All functions moved directly into PolygonZkEVMBridgeV2.sol

---

## 10. Removed Previous Versions

### 10.1 Version 10.1.0 Cleanup

**Removed Files**:
- `contracts/v2/previousVersions/10.1.0/IBridgeL2SovereignChainsV1010.sol` (152 lines removed)
- `contracts/v2/previousVersions/10.1.0/IPolygonZkEVMBridgeV2V1010.sol` (213 lines removed)  
- `contracts/v2/previousVersions/10.1.0/PolygonZkEVMBridgeV2V1010.sol` (1446 lines removed)

### 10.2 Aggchain Previous Versions Cleanup

**Removed Files**:
- `contracts/v2/previousVersions/aggchain/AggchainBasePrevious.sol` (428 lines removed)
- `contracts/v2/previousVersions/aggchain/AggchainFEPPrevious.sol` (727 lines removed)
- `contracts/v2/previousVersions/aggchain/AgglayerGatewayPrevious.sol` (330 lines removed)
- `contracts/v2/previousVersions/aggchain/IAggLayerGatewayPrevious.sol` (156 lines removed)
- `contracts/v2/previousVersions/aggchain/IAggchainBasePrevious.sol` (134 lines removed)

### 10.3 Sovereign Chains Cleanup  

**Removed Files**:
- `contracts/v2/sovereignChains/AggOracleCommittee.sol` (364 lines removed)

**Impact**: Oracle committee functionality completely removed from sovereign chains

---

## Summary

### Breaking Changes Overview
1. **Multisig Removal**: Complete removal of multisig infrastructure
2. **Contract Replacement**: AggchainECDSAMultisig → AggchainECDSA  
3. **Library Integration**: BridgeLib functionality moved inline
4. **Interface Cleanup**: Multiple interfaces removed
5. **Version Updates**: Bridge version changed to al-v0.3.1

### Lines of Code Impact
- **Total Removed**: ~4,000+ lines (cleanup of previous versions)
- **Major Deletions**: AggLayerGateway (-316), AggchainBase (-451), BridgeLib (-219)
- **Major Additions**: AggchainECDSA (+236), Bridge permit integration (+224)

### Deployment Considerations
- **Coordinated Deployment Required**: Due to breaking changes
- **Storage Layout Verified**: Proper gap management maintained  
- **Migration Path**: Available for existing multisig deployments
- **Testing Required**: All removed functionality must be validated

---

*Generated: 2025-01-10*  
*Repository: agglayer-contracts*  
*Comparison: feature/outposts → feature/v12*
