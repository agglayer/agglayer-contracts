// SPDX-License-Identifier: AGPL-3.0
pragma solidity 0.8.28;

/**
 * @title IAggchainSigners
 * @notice Interface for signer-related functionality shared by AggchainBase and AggLayerGateway
 */
interface IAggchainSigners {
    ////////////////////////////////////////////////////////////
    //                       Structs                          //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Struct to hold signer information
     * @param addr The address of the signer
     * @param url The URL associated with the signer
     */
    struct SignerInfo {
        address addr;
        string url;
    }

    /**
     * @notice Struct to hold information for removing a signer
     * @param addr The address of the signer to remove
     * @param index The index of the signer in the aggchainSigners array
     */
    struct RemoveSignerInfo {
        address addr;
        uint256 index;
    }

    ////////////////////////////////////////////////////////////
    //                    View Functions                      //
    ////////////////////////////////////////////////////////////

    /**
     * @notice Check if an address is a signer
     * @param _signer Address to check
     * @return True if the address is a signer
     */
    function isSigner(address _signer) external view returns (bool);

    /**
     * @notice Get the number of aggchainSigners
     * @return Number of aggchainSigners in the multisig
     */
    function getAggchainSignersCount() external view returns (uint256);

    /**
     * @notice Get all aggchainSigners
     * @return Array of signer addresses
     */
    function getAggchainSigners() external view returns (address[] memory);

    /**
     * @notice Returns the aggchain signers hash for verification
     * @dev Used by aggchain contracts to include in their hash computation
     * @return The current aggchainSignersHash
     */
    function getAggchainSignersHash() external view returns (bytes32);

    /**
     * @notice Get all aggchainSigners with their URLs
     * @return Array of SignerInfo structs containing signer addresses and URLs
     */
    function getAggchainSignerInfos()
        external
        view
        returns (SignerInfo[] memory);
}
