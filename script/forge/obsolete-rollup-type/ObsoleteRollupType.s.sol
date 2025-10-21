// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.28;

import {console, Script, stdJson} from "forge-std/Script.sol";
import {AgglayerManager} from "contracts/AgglayerManager.sol";

/**
 * @title ObsoleteRollupType
 * @notice Script to generate calldata for obsoleting a rollup type in the AgglayerManager
 */
contract ObsoleteRollupType is Script {
    using stdJson for string;

    /// @notice Path to the input JSON configuration file
    string internal constant INPUT_JSON = "script/forge/obsolete-rollup-type/input.json";

    /// @notice Input string for testing purposes
    string internal input;

    /// @notice Flag to indicate if the input is a string (for testing) or read from file
    bool internal isStringInput;

    /// @notice Instance of the AgglayerManager contract
    AgglayerManager internal agglayerManager;

    /// @notice ID of the rollup type to be obsoleted
    uint32 internal rollupTypeID;

    /**
     * @notice Helper function to run the script with a string input which is helpful for testing
     * @param _input JSON string input
     */
    function run(string memory _input) public returns (bytes memory) {
        isStringInput = true;
        input = _input;
        return run();
    }

    /**
     * @notice Main execution function of the script
     */
    function run() public returns (bytes memory) {
        _loadConfig();

        (,,,, bool obsolete,,) = agglayerManager.rollupTypeMap(rollupTypeID);
        require(!obsolete, "Rollup type is already obsolete");

        bytes memory payload = abi.encodeCall(AgglayerManager.obsoleteRollupType, (rollupTypeID));

        console.log("************************** CALLDATA START **************************\n");
        console.log("%s\n", vm.toString(payload));
        console.log("************************** CALLDATA END **************************\n");
        return payload;
    }

    /**
     * @notice Loads configuration from the input JSON file based on the current chain ID
     */
    function _loadConfig() internal {
        string memory inputJson;
        if (isStringInput) {
            inputJson = input;
        } else {
            inputJson = vm.readFile(INPUT_JSON);
        }

        string memory chainIdSlug = string(abi.encodePacked('["', vm.toString(block.chainid), '"]'));

        address agglayerManager_ = inputJson.readAddress(string.concat(chainIdSlug, ".agglayerManager"));
        uint32 rollupTypeID_ = uint32(inputJson.readUint(string.concat(chainIdSlug, ".rollupTypeID")));

        require(agglayerManager_ != address(0), "AgglayerManager address is zero");

        agglayerManager = AgglayerManager(agglayerManager_);
        rollupTypeID = rollupTypeID_;

        console.log("AgglayerManager: %s", address(agglayerManager));
        console.log("RollupTypeID: %s\n", rollupTypeID);
    }
}
