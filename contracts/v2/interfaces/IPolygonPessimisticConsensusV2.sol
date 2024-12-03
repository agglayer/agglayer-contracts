// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

interface IPolygonPessimisticConsensusV2 {
    function getConsensusHash(
        bytes memory data
    ) external view returns (bytes32);
    function onCustomChainData(bytes memory data) external;
}
