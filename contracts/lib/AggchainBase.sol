// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "./PolygonConsensusBase.sol";
import "../interfaces/IAggLayerGateway.sol";
import "../interfaces/IAggchainBase.sol";

/**
 * @title AggchainBase
 * @notice Base contract for aggchain implementations. This contract is imported by other aggchain implementations to reuse the common logic.
 */
abstract contract AggchainBase is PolygonConsensusBase, IAggchainBase {
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
    // Address that will be able to manage the aggchain verification keys and swap the useDefaultGateway flag.
    address public vKeyManager;

    // This account will be able to accept the vKeyManager role
    address public pendingVKeyManager;

    // Flag to enable/disable the use of the custom chain gateway to handle the aggchain keys. In case  of true, the keys are managed by the aggregation layer gateway
    bool public useDefaultGateway;

    ////////////////////////////////////////////////////////////
    //                       Mappings                         //
    ////////////////////////////////////////////////////////////
    // AggchainVKeys mapping
    mapping(bytes4 aggchainVKeySelector => bytes32 ownedAggchainVKey)
        public ownedAggchainVKeys;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private _gap;

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
        aggLayerGateway = _aggLayerGateway;
    }

    ////////////////////////////////////////////////////////////
    //                  Initialization                        //
    ////////////////////////////////////////////////////////////
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

    /**
     * @notice Initializer AggchainBase storage
     * @param _admin Admin address
     * @param sequencer Trusted sequencer address
     * @param _gasTokenAddress Indicates the token address in mainnet that will be used as a gas token
     * Note if a wrapped token of the bridge is used, the original network and address of this wrapped are used instead
     * @param sequencerURL Trusted sequencer URL
     * @param _networkName L2 network name
     * @param _useOwnedGateway Flag to setup initial values for the owned gateway
     * @param _initOwnedAggchainVKey Initial owned aggchain verification key
     * @param _initAggchainVKeyVersion Initial aggchain selector
     * @param _vKeyManager Initial vKeyManager
     */
    function _initializeAggchainBaseAndConsensusBase(
        address _admin,
        address sequencer,
        address _gasTokenAddress,
        string memory sequencerURL,
        string memory _networkName,
        bool _useOwnedGateway,
        bytes32 _initOwnedAggchainVKey,
        bytes2 _initAggchainVKeyVersion,
        address _vKeyManager,
        bytes2 aggchain_type
    ) internal onlyInitializing {
        // Initialize PolygonConsensusBase
        _initializePolygonConsensusBase(
            _admin,
            sequencer,
            _gasTokenAddress,
            sequencerURL,
            _networkName
        );

        useDefaultGateway = _useOwnedGateway;
        // set the initial aggchain keys
        ownedAggchainVKeys[
            getAggchainVKeySelector(_initAggchainVKeyVersion, aggchain_type)
        ] = _initOwnedAggchainVKey;
        // set initial vKeyManager
        vKeyManager = _vKeyManager;
    }

    /**
     * @notice Initializer AggchainBase storage
     * @param _useOwnedGateway Flag to setup initial values for the owned gateway
     * @param _initOwnedAggchainVKey Initial owned aggchain verification key
     * @param _initAggchainVKeyVersion Initial aggchain selector
     * @param _vKeyManager Initial vKeyManager
     */
    function _initializeAggchainBase(
        bool _useOwnedGateway,
        bytes32 _initOwnedAggchainVKey,
        bytes2 _initAggchainVKeyVersion,
        address _vKeyManager,
        bytes2 aggchain_type
    ) internal onlyInitializing {
        useDefaultGateway = _useOwnedGateway;
        // set the initial aggchain keys
        ownedAggchainVKeys[
            getAggchainVKeySelector(_initAggchainVKeyVersion, aggchain_type)
        ] = _initOwnedAggchainVKey;
        // set initial vKeyManager
        vKeyManager = _vKeyManager;
    }

    //////////////////////////
    //      modifiers       //
    /////////////////////////
    // Modifier to check if the caller is the vKeyManager
    modifier onlyVKeyManager() {
        if (vKeyManager != msg.sender) {
            revert OnlyVKeyManager();
        }
        _;
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

        emit TransferVKeyManagerRole(newVKeyManager);
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
}
