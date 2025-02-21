// SPDX-License-Identifier: MIT
// OpenZeppelin Contracts (last updated v5.1.0) (utils/cryptography/Hashes.sol)

pragma solidity ^0.8.20;

/**
 * @dev Library of standard hash functions.
 * @dev This function has been copied from an oppenzeppelin library since it is no exposed
 * @dev @openzeppelin/contracts52/utils/cryptography/Hashes.sol
 * _Available since v5.1._
 */
library Hashes {
    /**
     * @dev Implementation of keccak256(abi.encode(a, b)) that doesn't allocate or expand memory.
     */
    function _efficientKeccak256(bytes32 a, bytes32 b) internal pure returns (bytes32 value) {
        assembly ("memory-safe") {
            mstore(0x00, a)
            mstore(0x20, b)
            value := keccak256(0x00, 0x40)
        }
    }
}