// SPDX-License-Identifier: AGPL-3.0

pragma solidity ^0.8.20;

import {IEmergencyManager} from "../interfaces/IEmergencyManager.sol";

/**
 * @dev Contract helper responsible to manage the emergency state
 */
contract EmergencyManager is IEmergencyManager {
    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    /// @custom:oz-renamed-from _gap
    uint256[10] private __gap;

    // Indicates whether the emergency state is active or not
    bool public isEmergencyState;

    /**
     * @notice Only allows a function to be callable if emergency state is unactive
     */
    modifier ifNotEmergencyState() {
        if (isEmergencyState) {
            revert OnlyNotEmergencyState();
        }
        _;
    }

    /**
     * @notice Only allows a function to be callable if emergency state is active
     */
    modifier ifEmergencyState() {
        if (!isEmergencyState) {
            revert OnlyEmergencyState();
        }
        _;
    }

    /**
     * @notice Activate emergency state
     */
    function _activateEmergencyState() internal virtual ifNotEmergencyState {
        isEmergencyState = true;
        emit EmergencyStateActivated();
    }

    /**
     * @notice Deactivate emergency state
     */
    function _deactivateEmergencyState() internal virtual ifEmergencyState {
        isEmergencyState = false;
        emit EmergencyStateDeactivated();
    }
}
