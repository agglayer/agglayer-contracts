// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";
import "../lib/DepositContractBase.sol";

/**
 * This contract will be used in the PolygonZkEVMBridge contract, it inherits the DepositContractBase and adds the logic
 * to calculate the leaf of the tree
 */
contract DepositContractRollback is ReentrancyGuardUpgradeable, DepositContractBase {
     /**
     * @dev Thrown when the caller is not the emergencyRollbackTreeAddress
     */
    error OnlyEmergencyRollbackTreeAddress();

    address public emergencyRollbackTreeAddress;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[10] private _gap;

    function initialize(address _emergencyRollbackTreeAddress) public initializer {
        emergencyRollbackTreeAddress = _emergencyRollbackTreeAddress;
    }

    /**
     * @dev Emitted when a new frontier and new depositcount are set
     */
    event RollbackTree(uint256 newDepositCount, bytes32 newRoot);

    function addLeaf(bytes32 _leaf) external {
        _addLeaf(_leaf);
    }

    function rollbackTree(uint256 newDepositCount, bytes32[_DEPOSIT_CONTRACT_TREE_DEPTH] calldata newFrontier) external {
        // check message sender is the emergencyRollbackTreeAddress with a custom error
        if (msg.sender != emergencyRollbackTreeAddress) {
            revert OnlyEmergencyRollbackTreeAddress();
        }

        _rollbackTree(newDepositCount, newFrontier);

        // emit event
        emit RollbackTree(newDepositCount, getRoot());
    }
}
