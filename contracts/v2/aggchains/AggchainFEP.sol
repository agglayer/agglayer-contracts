// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "../lib/AggchainBase.sol";
import "../AggLayerGateway.sol";

/**
 * @title AggchainFEP
 * @notice Generic aggchain based on full execution proof.
 * This proof, along with bridge checks, constitutes the final FEP proof.
 */
contract AggchainFEP is AggchainBase {

    // Aggchain type selector, hardcoded value used to force the first 2 byes of aggchain selector to retrieve  the aggchain verification key
    bytes2 constant AGGCHAIN_TYPE_SELECTOR = 0;

    // fep-stack parameters
    bytes32 public aggregationVkey;
    bytes32 public chainConfigHash;
    bytes32 public rangeVkeyCommitment;

    // Struct to store the chain data every time pessimistic proof is verified
    struct ChainData {
        bytes32 lastStateRoot;
        uint128 timestamp;
        uint128 l2BlockNumber;
    }
    // Array of stored chain data
    ChainData[] public chainData;

    uint8 private transient _initializerVersion;

    //////////
    // Events
    /////////

    /**
     * @dev Emitted when Pessimistic proof is verified
     * @param initStateRoot Initial state root
     * @param initTimestamp Initial timestamp
     * @param initL2BlockNumber Initial L2 block number
     */
    event OnVerifyPessimistic(
        bytes32 initStateRoot,
        uint128 initTimestamp,
        uint128 initL2BlockNumber
    );

    /**
     * @param _rollupManager Rollup manager address.
     * @param _globalExitRootManager Global exit root manager address.
     * @param _pol POL token address.
     * @param _bridgeAddress Bridge address.
     * @param _aggLayerGateway AggLayerGateway address.
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        AggLayerGateway _aggLayerGateway
    )
        AggchainBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager,
            _aggLayerGateway
        )
    {}
    /**
     * @param initializeBytesCustomChain  Encoded params to initialize the chain. Each aggchain has its custom decoded params
     * @dev The reinitializer(2) is set because it can also be initialized differently with 'initializeAfterUpgrade' function but only be initialized once.
     */
    function initialize(
        bytes calldata initializeBytesCustomChain
    )
        external
        override
        onlyRollupManager
        retrieveInitializerVersion
        reinitializer(2)
    {
        // If initializer version is 0, it means that the chain is being initialized for the first time, so the contract has just been deployed, is not an upgrade
        if (_initializerVersion == 0) {
            // custom parsing of the initializeBytesCustomChain
            // todo: question: gasTokenNetwork?? gastoken metadata?
            (
                address _admin,
                address _trustedSequencer,
                address _gasTokenAddress,
                string memory _trustedSequencerURL,
                string memory _networkName,
                bytes32 _aggregationVkey,
                bytes32 _chainConfigHash,
                bytes32 _rangeVkeyCommitment,
                bytes32 initStateRoot,
                uint128 initTimestamp,
                uint128 initL2BlockNumber
            ) = abi.decode(
                    initializeBytesCustomChain,
                    (
                        address,
                        address,
                        address,
                        string,
                        string,
                        bytes32,
                        bytes32,
                        bytes32,
                        bytes32,
                        uint128,
                        uint128
                    )
                );

            // set chain variables
            admin = _admin;
            trustedSequencer = _trustedSequencer;
            gasTokenAddress = _gasTokenAddress;
            trustedSequencerURL = _trustedSequencerURL;
            networkName = _networkName;
            aggregationVkey = _aggregationVkey;
            chainConfigHash = _chainConfigHash;
            rangeVkeyCommitment = _rangeVkeyCommitment;
            // storage first chainData struct
            chainData.push(
                ChainData(initStateRoot, initTimestamp, initL2BlockNumber)
            );
        } else if (_initializerVersion == 1) {
            // Only need to initialize values that are specific for FEP because we are performing an upgrade from a Pessimistic chain
            (
                bytes32 _aggregationVkey,
                bytes32 _chainConfigHash,
                bytes32 _rangeVkeyCommitment,
                bytes32 initStateRoot,
                uint128 initTimestamp,
                uint128 initL2BlockNumber
            ) = abi.decode(
                    initializeBytesCustomChain,
                    (bytes32, bytes32, bytes32, bytes32, uint128, uint128)
                );
            aggregationVkey = _aggregationVkey;
            chainConfigHash = _chainConfigHash;
            rangeVkeyCommitment = _rangeVkeyCommitment;
            // storage first chainData struct
            chainData.push(
                ChainData(initStateRoot, initTimestamp, initL2BlockNumber)
            );
        } else {
            // This case should never happen because reinitializer is 2 so initializer version is 0 or 1, but it's here to avoid any possible future issue if the reinitializer version is increased
            revert InvalidInitializer();
        }
        // By default, the gateway is used to manage the aggchain keys
        useDefaultGateway = true;
    }

    //////////////////
    // Modifiers
    //////////////////

    // @dev Modifier to retrieve initializer version value previous on using the reinitializer modifier, its used in the initialize function.
    modifier retrieveInitializerVersion() {
        // Get initializer version from OZ initializer smart contract
        _initializerVersion = _getInitializedVersion();
        _;
    }

    /**
     * Note Return the necessary aggchain information for the proof hashed
     * AggchainHash:
     * Field:           | AGGCHAIN_TYPE | aggchainVKey   | aggchainConfig |
     * length (bits):   |    32         |       256      | 256           |
     * uint256 aggchainConfig = keccak256(abi.encodePacked(l1Head, l2PreRoot, claimRoot, claimBlockNum, chainConfigHash, rangeVkeyCommitment, aggregationVkey))
     */
    /// @inheritdoc IAggchainBase
    function getAggchainHash(
        bytes memory customChainData
    ) external view returns (bytes32) {
        (
            bytes2 aggchainSelector,
            bytes32 l1Head,
            bytes32 l2PreRoot,
            bytes32 claimRoot,
            uint256 claimBlockNum
        ) = abi.decode(
                customChainData,
                (bytes2, bytes32, bytes32, bytes32, uint256)
            );
        bytes32 aggchainConfig = keccak256(
            abi.encodePacked(
                l1Head,
                l2PreRoot,
                claimRoot,
                claimBlockNum,
                chainConfigHash,
                rangeVkeyCommitment,
                aggregationVkey
            )
        );
        bytes4 finalAggchainSelector = _getAggchainSelectorFromType(
            AGGCHAIN_TYPE_SELECTOR,
            aggchainSelector
        );
        return
            keccak256(
                abi.encodePacked(
                    AGGCHAIN_TYPE,
                    getAggchainVKey(finalAggchainSelector),
                    aggchainConfig
                )
            );
    }

    /**
     * Note Update the custom params set at initialization
     * TODO: add a timelock delay to avoid invalidate proofs
     * @param customInitializeData Encoded custom params to update
     */
    function updateCustomInitializeData(
        bytes calldata customInitializeData
    ) external onlyAdmin {
        // custom parsing of the customInitializeData
        (
            bytes32 _aggregationVkey,
            bytes32 _chainConfigHash,
            bytes32 _rangeVkeyCommitment
        ) = abi.decode(customInitializeData, (bytes32, bytes32, bytes32));
        aggregationVkey = _aggregationVkey;
        chainConfigHash = _chainConfigHash;
        rangeVkeyCommitment = _rangeVkeyCommitment;
    }

    /**
     * @notice Callback function called after verifying a pessimistic proof
     * @param customData Encoded custom data of the chain data to store
     */
    function onVerifyPessimistic(
        bytes memory customData
    ) external onlyRollupManager {
        (
            bytes32 initStateRoot,
            uint128 initTimestamp,
            uint128 initL2BlockNumber
        ) = abi.decode(customData, (bytes32, uint128, uint128));
        // storage chainData struct
        chainData.push(
            ChainData(initStateRoot, initTimestamp, initL2BlockNumber)
        );

        emit OnVerifyPessimistic(
            initStateRoot,
            initTimestamp,
            initL2BlockNumber
        );
    }
}
