// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "../lib/AggchainBase.sol";

/**
 * @title AggchainECDSAV2
 * @notice Aggchain based on legacy pessimistic consensus with ECDSA signatures but using
 * ALGateway for pp key management.
 * @dev No owned vkeys are supported, forced to use default gateway.
 */
contract AggchainECDSAV2 is AggchainBase {
    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////
    uint32 public constant CONSENSUS_TYPE_PESSIMISTIC = 0;
    // Unused constant for this aggchain but forced by the interface
    bytes2 public constant AGGCHAIN_TYPE = 0x0000;
    // address used to invalidate certain params from aggchainBase, not usable in AggchainECDSAV2
    address public constant INVALID_ADDRESS = address(1);
    ////////////////////////////////////////////////////////////
    //                       Events                           //
    ////////////////////////////////////////////////////////////
    /**
     * @notice Emitted when Pessimistic proof is verified.
     */
    event OnVerifyPessimisticECDSAV2();

    ////////////////////////////////////////////////////////////
    //                       Constructor                      //
    ////////////////////////////////////////////////////////////
    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol POL token address
     * @param _bridgeAddress Bridge address
     * @param _rollupManager Rollup manager address
     * @dev AgglayerGateway is set to INVALID_ADDRESS because this aggchain does not support AggLayerGateway features.
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager
    )
        AggchainBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager,
            IAggLayerGateway(INVALID_ADDRESS)
        )
    {}

    ////////////////////////////////////////////////////////////
    //              Functions: initialization                 //
    ////////////////////////////////////////////////////////////

    /// @notice Initialize function for the contract.
    /// @custom:security First initialization takes into account this contracts and all the inheritance contracts
    ///                  Second initialization does not initialize PolygonConsensusBase parameters
    ///                  Second initialization can happen if a chain is upgraded from a PolygonPessimisticConsensus
    /// @param initializeBytesAggchain Encoded bytes to initialize the aggchain
    function initialize(
        bytes memory initializeBytesAggchain
    ) external onlyAggchainManager initializer {
        // initialize all parameters
        // Decode the struct
        (
            address _admin,
            address _trustedSequencer,
            address _gasTokenAddress,
            string memory _trustedSequencerURL,
            string memory _networkName
        ) = abi.decode(
                initializeBytesAggchain,
                (address, address, address, string, string)
            );

        // Set aggchainBase variables
        /// @dev Only PolygonConsensusBase parameters are set with values because AggchainBase features are disabled for ECDSAV2 aggchains
        _initializeAggchainBaseAndConsensusBase(
            _admin,
            _trustedSequencer,
            _gasTokenAddress,
            _trustedSequencerURL,
            _networkName,
            false, // useDefaultGateway
            bytes32(0), // initOwnedAggchainVKey
            bytes4(0), // initAggchainVKeySelector
            INVALID_ADDRESS // vKeyManager
        );
    }

    /**
     * Note Return the necessary consensus information for the proof hashed
     * Copied from PolygonPessimisticConsensus getConsensusHash function.
     */
    function getAggchainHash(bytes calldata) public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(CONSENSUS_TYPE_PESSIMISTIC, trustedSequencer)
            );
    }

    /// @inheritdoc IAggchainBase
    function onVerifyPessimistic(bytes calldata) external onlyRollupManager {
        emit OnVerifyPessimisticECDSAV2();
    }
}
