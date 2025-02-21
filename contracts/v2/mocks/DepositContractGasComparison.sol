// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import "../lib/DepositContractBaseV2.sol";
/**
 * Contract responsible for managing the exit roots across multiple networks
 */
contract DepositContractGasComparison {

    // depositContract
    DepositContractBaseV2 public depositContract;
    bytes32 public savedRoot;

    // depositContractV2
    DepositContractBaseV2 public depositContractV2;
    bytes32 public savedRootV2;

    /**
     * @param _depositContract deposit contract
     * @param _depositContractV2 deposit contract V2
     */
    constructor(address _depositContract, address _depositContractV2) {
        depositContract = DepositContractBaseV2(_depositContract);
        depositContractV2 = DepositContractBaseV2(_depositContractV2);
    }

    /**
     * @notice Reset the deposit tree since will be replace by a recursive one
     */
    function saveRoot() public {
        // Get the current historic root
        savedRoot = depositContract.getRoot();
    }

    /**
     * @notice Reset the deposit tree since will be replace by a recursive one
     */
    function saveRootV2() public {
        // Get the current historic root
        savedRootV2 = depositContractV2.getRoot();
    }
}
