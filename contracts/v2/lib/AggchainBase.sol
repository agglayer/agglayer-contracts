// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable4/proxy/utils/Initializable.sol";
import "./PolygonConsensusBase.sol";
import "../interfaces/IAggLayerGateway.sol";
import "../interfaces/IAggchainBase.sol";
import "../interfaces/IVersion.sol";

/**
 * @title AggchainBase
 * @notice Base contract for aggchain implementations. This contract is imported by other aggchain implementations to reuse the common logic.
 */
abstract contract AggchainBase is
    PolygonConsensusBase,
    IAggchainBase,
    IVersion
{
    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////
    // Consensus type that supports generic aggchain hash
    // Naming has been kept as CONSENSUS_TYPE for consistency with the previous consensus type (PolygonPessimisticConsensus.sol)
    uint32 public constant CONSENSUS_TYPE = 1;

    // AggLayerGateway address, used in case the flag `useDefaultGateway` is set to true, the aggchains keys are managed by the gateway
    IAggLayerGateway public immutable aggLayerGateway;

    ////////////////////////////////////////////////////////////
    //                       Structs                          //
    ////////////////////////////////////////////////////////////

    struct Config {
        address addr;
        string url;
    }

    /**
     * @notice Struct to hold signer information
     * @param addr The address of the signer
     * @param url The URL associated with the signer
     */
    struct SignerInfo {
        address addr;
        string url;
    }

    /**
     * @notice Struct to hold information for removing a signer
     * @param addr The address of the signer to remove
     * @param index The index of the signer in the aggchainSigners array
     */
    struct RemoveSignerInfo {
        address addr;
        uint256 index;
    }

    ////////////////////////////////////////////////////////////
    //                       Variables                        //
    ////////////////////////////////////////////////////////////
    // Added legacy storage values to avoid storage collision with PolygonValidiumEtrog contract in case this consensus contract is upgraded to aggchain
    address private _legacyDataAvailabilityProtocol;
    bool private _legacyIsSequenceWithDataAvailabilityAllowed;

    // Address that will be able to manage the aggchain verification keys and swap the useDefaultGateway flag.
    address public vKeyManager;

    // This account will be able to accept the vKeyManager role
    address public pendingVKeyManager;

    // Flag to enable/disable the use of the custom chain gateway to handle the aggchain keys. In case  of true, the keys are managed by the aggregation layer gateway
    bool public useDefaultGateway;

    /// @notice Address that manages all the functionalities related to the aggchain
    address public aggchainManager;

    /// @notice This account will be able to accept the aggchainManager role
    address public pendingAggchainManager;

    ////////////////////////////////////////////////////////////
    //                       Mappings                         //
    ////////////////////////////////////////////////////////////
    // AggchainVKeys mapping
    mapping(bytes4 aggchainVKeySelector => bytes32 ownedAggchainVKey)
        public ownedAggchainVKeys;

    ////////////////////////////////////////////////////////////
    //                      Multisig                          //
    ////////////////////////////////////////////////////////////

    /// @notice Array of multisig aggchainSigners
    address[] public aggchainSigners;

    /// @notice Mapping that stores the URL of each signer
    /// It's used as well to check if an address is a signer
    mapping(address => string) public signerToURLs;

    /// @notice Threshold required for multisig operations
    uint256 public threshold;

    /// @notice Hash of the current aggchainSigners array
    bytes32 public aggchainSignersHash;

    ////////////////////////////////////////////////////////////
    //                      Configs                           //
    ////////////////////////////////////////////////////////////

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    /// @custom:oz-renamed-from _gap
    uint256[45] private __gap;

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////

    // Modifier to check if the caller is the vKeyManager
    modifier onlyVKeyManager() {
        if (vKeyManager != msg.sender) {
            revert OnlyVKeyManager();
        }
        _;
    }

    /// @dev Only allows a function to be callable if the message sender is the aggchain manager
    modifier onlyAggchainManager() {
        if (aggchainManager != msg.sender) {
            revert OnlyAggchainManager();
        }
        _;
    }

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////
    /**
     * @param _globalExitRootManager Global exit root manager address.
     * @param _pol POL token address.
     * @param _bridgeAddress Bridge address.
     * @param _rollupManager Rollup manager address.
     * @param _aggLayerGateway AggLayerGateway address.
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        IAggLayerGateway _aggLayerGateway
    )
        PolygonConsensusBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        )
    {
        // Check if the gateway address is valid
        if (
            address(_aggLayerGateway) == address(0) ||
            address(_globalExitRootManager) == address(0) ||
            address(_pol) == address(0) ||
            address(_bridgeAddress) == address(0) ||
            address(_rollupManager) == address(0)
        ) {
            revert InvalidZeroAddress();
        }
        aggLayerGateway = _aggLayerGateway;
    }

    ////////////////////////////////////////////////////////////
    //                  Initialization                        //
    ////////////////////////////////////////////////////////////

    /// @notice Sets the aggchain manager.
    /// @param newAggchainManager The address of the new aggchain manager.
    function initAggchainManager(
        address newAggchainManager
    ) external onlyRollupManager {
        if (newAggchainManager == address(0)) {
            revert AggchainManagerCannotBeZero();
        }

        aggchainManager = newAggchainManager;

        emit AcceptAggchainManagerRole(address(0), aggchainManager);
    }

    /**
     * @notice Initializer AggchainBase storage
     * @param _admin Admin address
     * @param sequencer Trusted sequencer address
     * @param _gasTokenAddress Indicates the token address in mainnet that will be used as a gas token
     * Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead
     * @param sequencerURL Trusted sequencer URL
     * @param _networkName L2 network name
     * @param _useDefaultGateway Flag to setup initial values for the default gateway
     * @param _initOwnedAggchainVKey Initial owned aggchain verification key
     * @param _initAggchainVKeySelector Initial aggchain selector
     * @param _vKeyManager Initial vKeyManager
     */
    function _initializeAggchainBaseAndConsensusBase(
        address _admin,
        address sequencer,
        address _gasTokenAddress,
        string memory sequencerURL,
        string memory _networkName,
        bool _useDefaultGateway,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector,
        address _vKeyManager
    ) internal onlyInitializing {
        if (
            address(_admin) == address(0) ||
            address(sequencer) == address(0) ||
            address(_vKeyManager) == address(0)
        ) {
            revert InvalidZeroAddress();
        }

        // Initialize PolygonConsensusBase
        _initializePolygonConsensusBase(
            _admin,
            sequencer,
            _gasTokenAddress,
            sequencerURL,
            _networkName
        );

        _initializeAggchainBase(
            _useDefaultGateway,
            _initOwnedAggchainVKey,
            _initAggchainVKeySelector,
            _vKeyManager
        );
    }

    /**
     * @notice Initializer AggchainBase storage
     * @param _useDefaultGateway Flag to setup initial values for the default gateway
     * @param _initOwnedAggchainVKey Initial owned aggchain verification key
     * @param _initAggchainVKeySelector Initial aggchain selector
     * @param _vKeyManager Initial vKeyManager
     */
    function _initializeAggchainBase(
        bool _useDefaultGateway,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector,
        address _vKeyManager
    ) internal onlyInitializing {
        useDefaultGateway = _useDefaultGateway;
        // set the initial aggchain keys
        ownedAggchainVKeys[_initAggchainVKeySelector] = _initOwnedAggchainVKey;
        // set initial vKeyManager
        vKeyManager = _vKeyManager;
    }

    /**
     * @notice Override the function to prevent the contract from being initialized with the initializer implemented at PolygonConsensusBase.
     * @dev removing this fuFnction can cause critical security issues.
     */
    function initialize(
        address, // _admin
        address, // sequencer
        uint32, //networkID,
        address, // _gasTokenAddress,
        string memory, // sequencerURL,
        string memory // _networkName
    ) external pure override(PolygonConsensusBase) {
        // Set initialize variables
        revert InvalidInitializeFunction();
    }

    ///////////////////////////////////////////////
    //              Virtual functions            //
    ///////////////////////////////////////////////

    /**
     * @notice Abstract function to extract aggchain parameters and verification key from aggchain data
     * @dev This function must be implemented by the inheriting contract
     * @param aggchainData Custom bytes provided by the chain containing the aggchain data
     * @return aggchainVKey The extracted aggchain verification key
     * @return aggchainParams The extracted aggchain parameters
     */
    function getAggchainParamsAndVKeySelector(
        bytes memory aggchainData
    ) public view virtual returns (bytes32, bytes32);

    ///////////////////////////////////////////////
    //     Rollup manager callback functions     //
    ///////////////////////////////////////////////

    /// @notice Callback while pessimistic proof is being verified from the rollup manager
    /// @notice Returns the aggchain hash for a given aggchain data
    /// @return aggchainHash resulting aggchain hash
    function getAggchainHash(
        bytes memory aggchainData
    ) external view returns (bytes32) {
        // Check if the aggchain signers hash been set
        // Empty signers is supported, but must be done explicitly
        if (aggchainSignersHash == bytes32(0)) {
            revert AggchainSignersHashNotInitialized();
        }

        (
            bytes32 aggchainVKey,
            bytes32 aggchainParams
        ) = getAggchainParamsAndVKeySelector(aggchainData);

        return
            keccak256(
                abi.encodePacked(
                    CONSENSUS_TYPE,
                    aggchainVKey,
                    aggchainParams,
                    aggchainSignersHash
                )
            );
    }

    ///////////////////////////////////////////////
    //        aggchainManager functions          //
    ///////////////////////////////////////////////

    /**
     * @notice Batch update signers and threshold in a single transaction
     * @dev Removes signers first (in descending index order), then adds new signers, then updates threshold
     * @param _signersToRemove Array of signers to remove with their indices (MUST be in descending index order)
     * @param _signersToAdd Array of new signers to add with their URLs
     * @param _newThreshold New threshold value (set to 0 to keep current threshold)
     */
    function updateSignersAndThreshold(
        RemoveSignerInfo[] calldata _signersToRemove,
        SignerInfo[] calldata _signersToAdd,
        uint256 _newThreshold
    ) external onlyAggchainManager {
        // Validate descending order of indices for removal
        if (_signersToRemove.length > 1) {
            for (uint256 i = 0; i < _signersToRemove.length - 1; i++) {
                if (
                    _signersToRemove[i].index <= _signersToRemove[i + 1].index
                ) {
                    revert IndicesNotInDescendingOrder();
                }
            }
        }

        // Remove signers (in descending index order to avoid index shifting issues)
        for (uint256 i = 0; i < _signersToRemove.length; i++) {
            _removeSignerInternal(
                _signersToRemove[i].addr,
                _signersToRemove[i].index
            );
        }

        // Add new signers
        for (uint256 i = 0; i < _signersToAdd.length; i++) {
            _addSignerInternal(_signersToAdd[i].addr, _signersToAdd[i].url);
        }

        // Update threshold if provided
        if (_newThreshold > aggchainSigners.length) {
            revert InvalidThreshold();
        }

        if (_newThreshold > 255) {
            revert ThresholdTooHigh();
        }

        threshold = _newThreshold;

        // Update the signers hash once after all operations
        _updateAggchainSignersHash();

        emit SignersAndThresholdUpdated(
            aggchainSigners,
            _newThreshold,
            aggchainSignersHash
        );
    }

    /// @notice Starts the aggchainManager role transfer
    ///         This is a two step process, the pending aggchainManager must accept to finalize the process
    /// @param newAggchainManager Address of the new aggchainManager
    function transferAggchainManagerRole(
        address newAggchainManager
    ) external onlyAggchainManager {
        if (newAggchainManager == address(0)) {
            revert InvalidZeroAddress();
        }

        pendingAggchainManager = newAggchainManager;

        emit TransferAggchainManagerRole(aggchainManager, newAggchainManager);
    }

    /// @notice Allow the current pending aggchainManager to accept the aggchainManager role
    function acceptAggchainManagerRole() external {
        if (pendingAggchainManager != msg.sender) {
            revert OnlyPendingAggchainManager();
        }

        address oldAggchainManager = aggchainManager;
        aggchainManager = pendingAggchainManager;
        delete pendingAggchainManager;

        emit AcceptAggchainManagerRole(oldAggchainManager, aggchainManager);
    }

    ///////////////////////////////
    //   VKeyManager functions   //
    //////////////////////////////

    /**
     * @notice Starts the vKeyManager role transfer
     * This is a two step process, the pending vKeyManager must accepted to finalize the process
     * @param newVKeyManager Address of the new pending admin
     */
    function transferVKeyManagerRole(
        address newVKeyManager
    ) external onlyVKeyManager {
        pendingVKeyManager = newVKeyManager;

        emit TransferVKeyManagerRole(vKeyManager, newVKeyManager);
    }

    /**
     * @notice Allow the current pending vKeyManager to accept the vKeyManager role
     */
    function acceptVKeyManagerRole() external {
        if (pendingVKeyManager != msg.sender) {
            revert OnlyPendingVKeyManager();
        }

        address oldVKeyManager = vKeyManager;
        vKeyManager = pendingVKeyManager;
        delete pendingVKeyManager;

        emit AcceptVKeyManagerRole(oldVKeyManager, vKeyManager);
    }

    /**
     * @notice Enable the use of the default gateway to manage the aggchain keys.
     */
    function enableUseDefaultGatewayFlag() external onlyVKeyManager {
        if (useDefaultGateway) {
            revert UseDefaultGatewayAlreadyEnabled();
        }

        useDefaultGateway = true;

        // Emit event
        emit EnableUseDefaultGatewayFlag();
    }

    /**
     * @notice Disable the use of the default gateway to manage the aggchain keys. After disable, the keys are handled by the aggchain contract.
     */
    function disableUseDefaultGatewayFlag() external onlyVKeyManager {
        if (!useDefaultGateway) {
            revert UseDefaultGatewayAlreadyDisabled();
        }

        useDefaultGateway = false;

        // Emit event
        emit DisableUseDefaultGatewayFlag();
    }

    /**
     * @notice Add a new aggchain verification key to the aggchain contract.
     * @param aggchainVKeySelector The selector for the verification key query. This selector identifies the aggchain key
     * @param newAggchainVKey The new aggchain verification key to be added.
     */
    function addOwnedAggchainVKey(
        bytes4 aggchainVKeySelector,
        bytes32 newAggchainVKey
    ) external onlyVKeyManager {
        if (newAggchainVKey == bytes32(0)) {
            revert ZeroValueAggchainVKey();
        }
        // Check if proposed selector has already a verification key assigned
        if (ownedAggchainVKeys[aggchainVKeySelector] != bytes32(0)) {
            revert OwnedAggchainVKeyAlreadyAdded();
        }

        ownedAggchainVKeys[aggchainVKeySelector] = newAggchainVKey;

        emit AddAggchainVKey(aggchainVKeySelector, newAggchainVKey);
    }

    /**
     * @notice Update the aggchain verification key in the aggchain contract.
     * @param aggchainVKeySelector The selector for the verification key query. This selector identifies the aggchain key
     * @param updatedAggchainVKey The updated aggchain verification key value.
     */
    function updateOwnedAggchainVKey(
        bytes4 aggchainVKeySelector,
        bytes32 updatedAggchainVKey
    ) external onlyVKeyManager {
        // Check already added
        if (ownedAggchainVKeys[aggchainVKeySelector] == bytes32(0)) {
            revert OwnedAggchainVKeyNotFound();
        }

        bytes32 previousAggchainVKey = ownedAggchainVKeys[aggchainVKeySelector];
        ownedAggchainVKeys[aggchainVKeySelector] = updatedAggchainVKey;

        emit UpdateAggchainVKey(
            aggchainVKeySelector,
            previousAggchainVKey,
            updatedAggchainVKey
        );
    }

    //////////////////////////
    //    view functions    //
    //////////////////////////

    /**
     * @notice returns the current aggchain verification key. If the flag `useDefaultGateway` is set to true, the gateway verification key is returned, else, the custom chain verification key is returned.
     * @param aggchainVKeySelector The selector for the verification key query. This selector identifies the aggchain type + sp1 verifier version
     */
    function getAggchainVKey(
        bytes4 aggchainVKeySelector
    ) public view returns (bytes32 aggchainVKey) {
        if (useDefaultGateway == false) {
            aggchainVKey = ownedAggchainVKeys[aggchainVKeySelector];

            if (aggchainVKey == bytes32(0)) {
                revert AggchainVKeyNotFound();
            }
        } else {
            // Retrieve aggchain key from AggLayerGateway
            aggchainVKey = aggLayerGateway.getDefaultAggchainVKey(
                aggchainVKeySelector
            );
        }
    }

    /**
     * @notice Check if an address is a signer
     * @param _signer Address to check
     * @return True if the address is a signer
     */
    function isSigner(address _signer) public view returns (bool) {
        return bytes(signerToURLs[_signer]).length > 0;
    }

    /**
     * @notice Computes the selector for the aggchain verification key from the aggchain type and the aggchainVKeyVersion.
     * @dev It joins two bytes2 values into a bytes4 value.
     * @param aggchainVKeyVersion The aggchain verification key version, used to identify the aggchain verification key.
     * @param aggchainType The aggchain type, hardcoded in the aggchain contract.
     * [            aggchainVKeySelector         ]
     * [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ]
     * [        2 bytes         |    2 bytes     ]
     */
    function getAggchainVKeySelector(
        bytes2 aggchainVKeyVersion,
        bytes2 aggchainType
    ) public pure returns (bytes4) {
        return bytes4(aggchainVKeyVersion) | (bytes4(aggchainType) >> 16);
    }

    /**
     * @notice Computes the aggchainType from the aggchainVKeySelector.
     * @param aggchainVKeySelector The aggchain verification key selector.
     * [            aggchainVKeySelector         ]
     * [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ]
     * [        2 bytes         |    2 bytes     ]
     */
    function getAggchainTypeFromSelector(
        bytes4 aggchainVKeySelector
    ) public pure returns (bytes2) {
        return bytes2(aggchainVKeySelector << 16);
    }

    /**
     * @notice Computes the aggchainVKeyVersion from the aggchainVKeySelector.
     * @param aggchainVKeySelector The aggchain verification key selector.
     * [            aggchainVKeySelector         ]
     * [  aggchainVKeyVersion   |  AGGCHAIN_TYPE ]
     * [        2 bytes         |    2 bytes     ]
     */
    function getAggchainVKeyVersionFromSelector(
        bytes4 aggchainVKeySelector
    ) public pure returns (bytes2) {
        return bytes2(aggchainVKeySelector);
    }

    /**
     * @notice Get the number of aggchainSigners
     * @return Number of aggchainSigners in the multisig
     */
    function getAggchainSignersCount() external view returns (uint256) {
        return aggchainSigners.length;
    }

    /**
     * @notice Get all aggchainSigners
     * @return Array of signer addresses
     */
    function getAggchainSigners() external view returns (address[] memory) {
        return aggchainSigners;
    }

    ////////////////////////////////////////////////////////////
    //                   Internal Functions                   //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Internal function to add a signer with validation
     * @param _signer Address of the signer to add
     */
    function _addSignerInternal(address _signer, string memory url) internal {
        if (_signer == address(0)) {
            revert SignerCannotBeZero();
        }

        if (bytes(url).length == 0) {
            revert SignerURLCannotBeEmpty();
        }

        if (isSigner(_signer)) {
            revert SignerAlreadyExists();
        }

        aggchainSigners.push(_signer);
        signerToURLs[_signer] = url;
    }

    /**
     * @notice Internal function to remove a signer with validation
     * @param _signer Address of the signer to remove
     * @param _signerIndex Index of the signer in the aggchainSigners array
     */
    function _removeSignerInternal(
        address _signer,
        uint256 _signerIndex
    ) internal {
        // Validate input parameters
        if (_signerIndex >= aggchainSigners.length) {
            revert SignerDoesNotExist();
        }

        if (aggchainSigners[_signerIndex] != _signer) {
            revert SignerDoesNotExist();
        }

        // Remove from mapping
        delete signerToURLs[_signer];

        // Move the last element to the deleted spot and remove the last element
        aggchainSigners[_signerIndex] = aggchainSigners[
            aggchainSigners.length - 1
        ];
        aggchainSigners.pop();
    }

    /**
     * @notice Update the hash of the aggchainSigners array
     */
    function _updateAggchainSignersHash() internal {
        aggchainSignersHash = keccak256(
            abi.encodePacked(threshold, aggchainSigners)
        );
        emit AggchainSignersHashUpdated(aggchainSignersHash);
    }
}
