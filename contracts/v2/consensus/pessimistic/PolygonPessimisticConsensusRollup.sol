// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../../lib/PolygonConsensusBase.sol";
import "../../interfaces/IPolygonPessimisticConsensus.sol";

contract PolygonPessimisticConsensusRollup is
    PolygonConsensusBase,
    IPolygonPessimisticConsensus
{
    uint32 public constant CONSENSUS_TYPE = 1;
    bytes32 public fepVKey;

    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol POL token address
     * @param _bridgeAddress Bridge address
     * @param _rollupManager Global exit root manager address
     * @param _fepVKey verification key of a zkVM program used to verify the execution-proof
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        bytes32 _fepVKey
    )
        PolygonConsensusBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        )
    {
        fepVKey = _fepVKey;
    }

    /**
     * Note Return the necessary consensus information for the proof hashed
     */
    function getConsensusHash() public view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    CONSENSUS_TYPE,
                    fepVKey,
                    hashPublicValues(getPublicValues())
                )
            );
    }

    /**
     * Note set the verification key of a zkVM program used to verify the execution-proof
     */
    function setFepVKey(bytes32 _fepVKey) external onlyAdmin {
        fepVKey = _fepVKey;
    }

    /**
     * Note get the public inputs
     */
    function getPublicValues() public pure returns (bytes memory) {
        // TODO: Add necessary public input data depending on the execution environment
        return abi.encodePacked();
    }

    /**
     * Note hash the public inputs
     */
    function hashPublicValues(
        bytes memory publicValues
    ) public pure returns (bytes32) {
        return sha256(publicValues) & bytes32(uint256((1 << 253) - 1));
    }
}
