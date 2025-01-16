// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.20;

import "../interfaces/IALConsensus.sol";
import "../lib/ALBaseConsensus.sol";

contract AuthECDSA is ALBaseConsensus, IALConsensus {
    //////////
    // Events
    /////////

    event OnVerifyPessimistic();

    /**
     * @param _rollupManager Rollup manager address
     */
    constructor(address _rollupManager) ALBaseConsensus(_rollupManager) {}

    /**
     * Note Return the necessary consensus information for the proof hashed
     * ConsensusHash:
     * Field:           | CONSENSUS_TYPE | consensusVKey  | consensusConfig  |
     * length (bits):   |       32       |      256       |       256        |
     */
    function getConsensusHash(
        bytes memory // consensusData
    ) external view returns (bytes32) {
        return
            keccak256(
                abi.encodePacked(
                    CONSENSUS_TYPE,
                    consensusVKey,
                    keccak256(abi.encodePacked(trustedSequencer))
                )
            );
    }

    // function to save the customData
    function onVerifyPessimistic(
        bytes memory // consensusData
    ) external {
        // just throw an event
        emit OnVerifyPessimistic();
    }

    function OnChnageSp1VerifierVersion() {
        // just throw an event
        emit OnChnageSp1VerifierVersion();
        // change consensusVKey
    }

    // /**
    //  * @notice Allow the admin to set a new trusted sequencer
    //  * @param newConsensusVKey Address of the new trusted sequencer
    //  */
    // function setConsensusVKey(bytes32 newConsensusVKey) override external onlyAdmin {
    // }
}
