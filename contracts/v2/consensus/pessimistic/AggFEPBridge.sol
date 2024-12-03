// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../../lib/PolygonConsensusBase.sol";
import "../../interfaces/IPolygonPessimisticConsensusV2.sol";

contract AggFEPBridge is PolygonConsensusBase, IPolygonPessimisticConsensusV2 {
    uint32 public constant CONSENSUS_TYPE = 1;
    bytes32 public fepVKey;
    bytes32 public chainConfigHash;
    bytes32 public rangeVkeyCommitment;

    struct ChainData {
        bytes32 lastStateRoot;
        uint128 timestamp;
        uint128 l2BlockNumber;
    }

    ChainData[] public chainData;

    /**
     * @param _globalExitRootManager Global exit root manager address
     * @param _pol POL token address
     * @param _bridgeAddress Bridge address
     * @param _rollupManager Global exit root manager address
     * @param _fepVKey verification key of the FepBridge program
     */
    constructor(
        IPolygonZkEVMGlobalExitRootV2 _globalExitRootManager,
        IERC20Upgradeable _pol,
        IPolygonZkEVMBridgeV2 _bridgeAddress,
        PolygonRollupManager _rollupManager,
        bytes32 _fepVKey,
        bytes32 _chainConfigHash,
        bytes32 _rangeVkeyCommitment
    )
        PolygonConsensusBase(
            _globalExitRootManager,
            _pol,
            _bridgeAddress,
            _rollupManager
        )
    {
        fepVKey = _fepVKey;
        chainConfigHash = _chainConfigHash;
        rangeVkeyCommitment = _rangeVkeyCommitment;
    }

    /**
     * Note Return the necessary consensus information for the proof hashed
     * ConsensusHash:
     * Field:           | CONSENSUS_TYPE | fepVKey   | chainConfigHash | rangeVkeyCommitment | consensusData  |
     * Source:          | Consensus      | Consensus | Consensus       | Consensus           | rollup manager |
     * length (bits):   |    32          | 256       | 256             | 256                 | variable       |
     */
    function getConsensusHash(
        bytes memory consensusData
    ) external view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    CONSENSUS_TYPE,
                    fepVKey,
                    chainConfigHash,
                    rangeVkeyCommitment,
                    consensusData // add prevuious state root, timestamp, l2BlockNumber
                )
            );
    }

    // function to save the customData
    function onCustomChainData(bytes memory consensusData) external {
        // only calllable by the rollup manager
        if (msg.sender != address(rollupManager)) {
            revert("Invalid caller");
        }

        // custom parsing of the consensusData
        (bytes32 lastStateRoot, uint128 timestamp, uint128 l2BlockNumber) = abi
            .decode(consensusData, (bytes32, uint128, uint128));

        // store the chain data
        chainData.push(ChainData(lastStateRoot, timestamp, l2BlockNumber));
    }

    /**
     * Note set the verification key of a zkVM program used to verify the execution-proof
     * TODO: add a timelock delay to avoid invalidate proofs
     * TODO: Same for trusted sequencer
     */
    function setFepVKey(bytes32 _fepVKey) external onlyAdmin {
        fepVKey = _fepVKey;
    }
}

// another approach is to get the data from the rollupManager contract
// if the netowrkID is known, then:
// rollup.lastStateRoot --> call
// newStateRoot --> calldata first context (cannot be read unless it is forwarded)
// newL2BlockNumber --> calldata first context (cannot be read unless it is forwarded)
