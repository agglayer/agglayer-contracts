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
    //                       Variables                        //
    ////////////////////////////////////////////////////////////
    // Added legacy storage values to avoid storage collision with PolygonValidiumEtrog contract in case this consensus contract is upgraded to aggchain
    address private _legacyDataAvailabilityProtocol;
    bool private _legacyIsSequenceWithDataAvailabilityAllowed;

    // Added legacy storage values from previous aggchainBase
    /// @custom:oz-renamed-from vKeyManager
    address public _legacyvKeyManager;
    /// @custom:oz-renamed-from pendingVKeyManager
    address public _legacypendingVKeyManager;

    // Flag to enable/disable the use of the default verification keys from the gateway
    /// @custom:oz-renamed-from useDefaultGateway
    bool public useDefaultVkeys;

    // Flag to enable/disable the use of the default signers from the gateway
    // review should be upgrade safe since it's completing an storage slot and does not shift other ones
    bool public useDefaultSigners;

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

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    /// @custom:oz-renamed-from _gap
    uint256[46] private __gap;

    ////////////////////////////////////////////////////////////
    //                        Modifiers                       //
    ////////////////////////////////////////////////////////////

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

    /**
     * @notice Sets the aggchain manager
     * @dev Can only be called by the rollup manager during initialization
     * @param newAggchainManager The address of the new aggchain manager
     */
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
     * @param _useDefaultVkeys Flag to use default verification keys from gateway
     * @param _useDefaultSigners Flag to use default signers from gateway
     * @param _initOwnedAggchainVKey Initial owned aggchain verification key
     * @param _initAggchainVKeySelector Initial aggchain selector
     */
    function _initializeAggchainBaseAndConsensusBase(
        address _admin,
        address sequencer,
        address _gasTokenAddress,
        string memory sequencerURL,
        string memory _networkName,
        bool _useDefaultVkeys,
        bool _useDefaultSigners,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector
    ) internal onlyInitializing {
        if (address(_admin) == address(0) || address(sequencer) == address(0)) {
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
            _useDefaultVkeys,
            _useDefaultSigners,
            _initOwnedAggchainVKey,
            _initAggchainVKeySelector
        );
    }

    /**
     * @notice Initializer AggchainBase storage
     * @param _useDefaultVkeys Flag to use default verification keys from gateway
     * @param _useDefaultSigners Flag to use default signers from gateway
     * @param _initOwnedAggchainVKey Initial owned aggchain verification key
     * @param _initAggchainVKeySelector Initial aggchain selector
     */
    function _initializeAggchainBase(
        bool _useDefaultVkeys,
        bool _useDefaultSigners,
        bytes32 _initOwnedAggchainVKey,
        bytes4 _initAggchainVKeySelector
    ) internal onlyInitializing {
        useDefaultVkeys = _useDefaultVkeys;
        useDefaultSigners = _useDefaultSigners;
        // set the initial aggchain keys
        ownedAggchainVKeys[_initAggchainVKeySelector] = _initOwnedAggchainVKey;
    }

    /**
     * @notice Override the function to prevent the contract from being initialized with the initializer implemented at PolygonConsensusBase.
     * @dev removing this function can cause critical security issues.
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

    /**
     * @notice Callback while pessimistic proof is being verified from the rollup manager
     * @dev Returns the aggchain hash for a given aggchain data
     * @param aggchainData Custom bytes provided by the chain containing the aggchain data
     * @return aggchainHash resulting aggchain hash
     */
    function getAggchainHash(
        bytes memory aggchainData
    ) external view returns (bytes32) {
        // Get signers hash from gateway if using default signers, otherwise use local storage
        bytes32 cachedSignersHash = getAggchainSignersHash();

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
                    cachedSignersHash
                )
            );
    }

    ///////////////////////////////////////////////
    //        aggchainManager functions          //
    ///////////////////////////////////////////////

    /**
     * @notice Updates signers and threshold for multisig operations
     * @dev External wrapper for _updateSignersAndThreshold, restricted to aggchainManager
     * @param _signersToRemove Array of signers to remove with their indices
     * @param _signersToAdd Array of new signers to add with their URLs
     * @param _newThreshold New threshold value for multisig operations
     */
    function updateSignersAndThreshold(
        RemoveSignerInfo[] memory _signersToRemove,
        SignerInfo[] memory _signersToAdd,
        uint256 _newThreshold
    ) external onlyAggchainManager {
        _updateSignersAndThreshold(
            _signersToRemove,
            _signersToAdd,
            _newThreshold
        );
    }

    /**
     * @notice Batch update signers and threshold in a single transaction
     * @dev Removes signers first (in descending index order), then adds new signers, then updates threshold
     * @param _signersToRemove Array of signers to remove with their indices (MUST be in descending index order)
     * @param _signersToAdd Array of new signers to add with their URLs
     * @param _newThreshold New threshold value (set to 0 to keep current threshold)
     */
    function _updateSignersAndThreshold(
        RemoveSignerInfo[] memory _signersToRemove,
        SignerInfo[] memory _signersToAdd,
        uint256 _newThreshold
    ) internal {
        // Validate descending order of indices for removal to avoid index shifting issues
        // When removing multiple signers, we must process them from highest index to lowest
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

        if (aggchainSigners.length > 255) {
            revert AggchainSignersTooHigh();
        }

        // Update threshold if provided
        if (_newThreshold > aggchainSigners.length) {
            revert InvalidThreshold();
        }

        threshold = _newThreshold;

        // Update the signers hash once after all operations
        _updateAggchainSignersHash();
    }

    /**
     * @notice Starts the aggchainManager role transfer
     * @dev This is a two step process, the pending aggchainManager must accept to finalize the process
     * @param newAggchainManager Address of the new aggchainManager
     */
    function transferAggchainManagerRole(
        address newAggchainManager
    ) external onlyAggchainManager {
        if (newAggchainManager == address(0)) {
            revert InvalidZeroAddress();
        }

        pendingAggchainManager = newAggchainManager;

        emit TransferAggchainManagerRole(aggchainManager, newAggchainManager);
    }

    /**
     * @notice Allow the current pending aggchainManager to accept the aggchainManager role
     * @dev Can only be called by the pending aggchainManager
     */
    function acceptAggchainManagerRole() external {
        if (pendingAggchainManager != msg.sender) {
            revert OnlyPendingAggchainManager();
        }

        address oldAggchainManager = aggchainManager;
        aggchainManager = pendingAggchainManager;
        delete pendingAggchainManager;

        emit AcceptAggchainManagerRole(oldAggchainManager, aggchainManager);
    }

    /**
     * @notice Enable the use of default verification keys from gateway
     */
    function enableUseDefaultVkeysFlag() external onlyAggchainManager {
        if (useDefaultVkeys) {
            revert UseDefaultVkeysAlreadyEnabled();
        }

        useDefaultVkeys = true;

        // Emit event
        emit EnableUseDefaultVkeysFlag();
    }

    /**
     * @notice Disable the use of default verification keys from gateway
     */
    function disableUseDefaultVkeysFlag() external onlyAggchainManager {
        if (!useDefaultVkeys) {
            revert UseDefaultVkeysAlreadyDisabled();
        }

        useDefaultVkeys = false;

        // Emit event
        emit DisableUseDefaultVkeysFlag();
    }

    /**
     * @notice Enable the use of default signers from gateway
     */
    function enableUseDefaultSignersFlag() external onlyAggchainManager {
        if (useDefaultSigners) {
            revert UseDefaultSignersAlreadyEnabled();
        }

        useDefaultSigners = true;

        // Emit event
        emit EnableUseDefaultSignersFlag();
    }

    /**
     * @notice Disable the use of default signers from gateway
     */
    function disableUseDefaultSignersFlag() external onlyAggchainManager {
        if (!useDefaultSigners) {
            revert UseDefaultSignersAlreadyDisabled();
        }

        useDefaultSigners = false;

        // Emit event
        emit DisableUseDefaultSignersFlag();
    }

    /**
     * @notice Add a new aggchain verification key to the aggchain contract.
     * @param aggchainVKeySelector The selector for the verification key query. This selector identifies the aggchain key
     * @param newAggchainVKey The new aggchain verification key to be added.
     */
    function addOwnedAggchainVKey(
        bytes4 aggchainVKeySelector,
        bytes32 newAggchainVKey
    ) external onlyAggchainManager {
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
    ) external onlyAggchainManager {
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
     * @notice returns the current aggchain verification key. If the flag `useDefaultVkeys` is set to true, the gateway verification key is returned, else, the custom chain verification key is returned.
     * @param aggchainVKeySelector The selector for the verification key query. This selector identifies the aggchain type + sp1 verifier version
     */
    function getAggchainVKey(
        bytes4 aggchainVKeySelector
    ) public view returns (bytes32 aggchainVKey) {
        if (useDefaultVkeys == false) {
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
        if (useDefaultSigners) {
            return aggLayerGateway.isSigner(_signer);
        }
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
        if (useDefaultSigners) {
            return aggLayerGateway.getAggchainSignersCount();
        }
        return aggchainSigners.length;
    }

    /**
     * @notice Get all aggchainSigners
     * @return Array of signer addresses
     */
    function getAggchainSigners() external view returns (address[] memory) {
        if (useDefaultSigners) {
            return aggLayerGateway.getAggchainSigners();
        }
        return aggchainSigners;
    }

    /**
     * @notice Get the aggchain signers hash
     * @return The aggchain signers hash
     */
    function getAggchainSignersHash() public view returns (bytes32) {
        if (useDefaultSigners) {
            return aggLayerGateway.getAggchainSignersHash();
        }

        // Check if the aggchain signers hash been set
        // Empty signers is supported, but must be done explicitly
        if (aggchainSignersHash == bytes32(0)) {
            revert AggchainSignersHashNotInitialized();
        }

        return aggchainSignersHash;
    }
    /**
     * @notice Get all aggchainSigners with their URLs
     * @return Array of SignerInfo structs containing signer addresses and URLs
     */
    function getAggchainSignerInfos()
        external
        view
        returns (SignerInfo[] memory)
    {
        if (useDefaultSigners) {
            // Get signers with URLs directly from gateway
            return aggLayerGateway.getAggchainSignerInfos();
        } else {
            // Use local aggchainSigners
            SignerInfo[] memory signerInfos = new SignerInfo[](
                aggchainSigners.length
            );
            for (uint256 i = 0; i < aggchainSigners.length; i++) {
                signerInfos[i] = SignerInfo({
                    addr: aggchainSigners[i],
                    url: signerToURLs[aggchainSigners[i]]
                });
            }
            return signerInfos;
        }
    }

    ////////////////////////////////////////////////////////////
    //                   Internal Functions                   //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Internal function to add a signer with validation
     * @param _signer Address of the signer to add
     * @param url URL associated with the signer
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
        // Cache array length
        uint256 signersLength = aggchainSigners.length;

        // Validate input parameters
        if (_signerIndex >= signersLength) {
            revert SignerDoesNotExist();
        }

        if (aggchainSigners[_signerIndex] != _signer) {
            revert SignerDoesNotExist();
        }

        // Remove from mapping
        delete signerToURLs[_signer];

        // Move the last element to the deleted spot and remove the last element
        aggchainSigners[_signerIndex] = aggchainSigners[signersLength - 1];

        aggchainSigners.pop();
    }

    /**
     * @notice Update the hash of the aggchainSigners array
     * @dev Combines threshold and signers array into a single hash for efficient verification
     */
    function _updateAggchainSignersHash() internal {
        aggchainSignersHash = keccak256(
            abi.encodePacked(threshold, aggchainSigners)
        );

        emit SignersAndThresholdUpdated(
            aggchainSigners,
            threshold,
            aggchainSignersHash
        );
    }
}
