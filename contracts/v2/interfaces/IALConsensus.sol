// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IALConsensus {
    /// @notice Gets consensus chain hash.
    /// @dev Each chain should properly manage its own consensus hash.
    /// @param data Custom chain data to build the consensus hash.
    function getConsensusHash(
        bytes memory data
    ) external view returns (bytes32);

    /// @notice Callback from the PolygonRollupManager to update the chain's state.
    /// @dev Each chain should properly manage its own state.
    /// @param data Custom chain data to update chain's state
    function onVerifyPessimistic(bytes memory data) external;
}
