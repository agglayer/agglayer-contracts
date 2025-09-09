// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;
import "./IBaseAgglayerGER.sol";

interface IPolygonZkEVMGlobalExitRoot is IBaseAgglayerGER {
    function getLastGlobalExitRoot() external view returns (bytes32);
}
