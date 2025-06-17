// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

import "../lib/PolygonConsensusBase.sol";
import "../interfaces/IAggchainBase.sol";

/**
 * @title AggchainECDSAV2
 * @notice Aggchain based on legacy pessimistic consensus with ECDSA signatures but using
 * ALGateway for pp key management.
 * @dev No owned vkeys are supported, forced to use default gateway.
 */
contract AggchainECDSAV2 is PolygonConsensusBase, IAggchainBase {
    ////////////////////////////////////////////////////////////
    //                  Constants & Immutables                //
    ////////////////////////////////////////////////////////////
    uint32 public constant CONSENSUS_TYPE = 0;
    // Unused constant for this aggchain but forced by the interface
    bytes2 public constant AGGCHAIN_TYPE = 0x0000;

    ////////////////////////////////////////////////////////////
    //                          Storage                       //
    ////////////////////////////////////////////////////////////
    // Legacy storage values from PolygonValidiumEtrog. There is no collision because `AggchainECDSAV2` has no storage but is a good practice
    // to keep them here for caution in case of future upgrades or changes.
    /// @custom:oz-renamed-from dataAvailabilityProtocol
    address private _legacyDataAvailabilityProtocol;
    /// @custom:oz-renamed-from isSequenceWithDataAvailabilityAllowed
    bool private _legacyIsSequenceWithDataAvailabilityAllowed;

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
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager
    )
        PolygonConsensusBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        )
    {}

    /**
     * Note Return the necessary consensus information for the proof hashed
     * Copied from PolygonPessimisticConsensus getConsensusHash function.
     */
    function getAggchainHash(bytes calldata) public view returns (bytes32) {
        return keccak256(abi.encodePacked(CONSENSUS_TYPE, trustedSequencer));
    }

    /// @inheritdoc IAggchainBase
    /// @dev unused function, but required by the interface.
    function initAggchainManager(address) external onlyRollupManager {}

    /// @inheritdoc IAggchainBase
    function onVerifyPessimistic(bytes calldata) external onlyRollupManager {
        emit OnVerifyPessimisticECDSAV2();
    }
}
