// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "../../lib/PolygonConsensusBase.sol";
import "../../interfaces/IPolygonPessimisticConsensus.sol";

contract PessimiticBLS is
    PolygonConsensusBase,
    IPolygonPessimisticConsensus
{
    uint32 public constant CONSENSUS_TYPE = 2;

    // Legacy storage values from PolygonValidiumEtrog. There is no collision because `PolygonPessimisticConsensus` has no storage but is a good practice
    // to keep them here for caution in case of future upgrades or changes.
    /// @custom:oz-renamed-from dataAvailabilityProtocol
    address private _legacyDataAvailabilityProtocol;
    /// @custom:oz-renamed-from isSequenceWithDataAvailabilityAllowed
    bool private _legacyIsSequenceWithDataAvailabilityAllowed;

    // BLS public key storage (48 bytes)
    bytes1[48] public blsPublicKey;
    
    // Hashed BLS public key for consensus
    bytes32 public blsPublicKeyHash;

    /**
     * @dev Emitted when the BLS public key is updated
     */
    event BLSPublicKeyUpdated(bytes1[48] newBlsPublicKey, bytes32 newBlsPublicKeyHash);

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
     * @notice Sets the BLS public key, only callable by the admin
     * @param _blsPublicKey The new BLS public key (48 bytes)
     */
    function setBLSPublicKey(bytes1[48] calldata _blsPublicKey) external onlyAdmin {
        blsPublicKey = _blsPublicKey;
        
        // Pack the key, hash it, and store the hash
        blsPublicKeyHash = keccak256(abi.encodePacked(_blsPublicKey));
        
        emit BLSPublicKeyUpdated(_blsPublicKey, blsPublicKeyHash);
    }

    /**
     * Note Return the necessary consensus information for the proof hashed
     */
    function getConsensusHash() public view returns (bytes32) {
        return keccak256(abi.encodePacked(CONSENSUS_TYPE, blsPublicKeyHash));
    }
}
