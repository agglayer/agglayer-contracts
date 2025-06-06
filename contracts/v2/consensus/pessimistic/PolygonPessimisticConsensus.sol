// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../../lib/PolygonConsensusBase.sol";
import "../../interfaces/IPolygonPessimisticConsensus.sol";

contract PolygonPessimisticConsensus is
    PolygonConsensusBase,
    IPolygonPessimisticConsensus
{
    uint32 public constant CONSENSUS_TYPE = 0;

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
     */
    function getConsensusHash() public view returns (bytes32) {
        return keccak256(abi.encodePacked(CONSENSUS_TYPE, trustedSequencer));
    }
}
