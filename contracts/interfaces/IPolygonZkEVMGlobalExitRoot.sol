// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "./IBaseAgglayerManagerGER.sol";

interface IPolygonZkEVMGlobalExitRoot is IBaseAgglayerManagerGER {
    function getLastGlobalExitRoot() external view returns (bytes32);
}
