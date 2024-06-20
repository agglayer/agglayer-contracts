// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

interface IPolygonPessimisticConsensusV2 {
    function initialize(bytes memory initializeBytesCustomChain) external;
    function getConsensusHash(
        bytes memory data
    ) external view returns (bytes32);
    function onCustomChainData(bytes memory data) external;
}
