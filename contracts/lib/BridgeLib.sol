// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

/**
 * @title BridgeLib
 * @notice Contract containing pure utility functions for Bridge contracts
 * @dev This contract is deployed separately to reduce main contract bytecode size
 */
contract BridgeLib {
    // Permit signatures for ERC20 tokens
    bytes4 internal constant _PERMIT_SIGNATURE = 0xd505accf;
    bytes4 internal constant _PERMIT_SIGNATURE_DAI = 0x8fcbaf0c;

    // Custom errors
    /**
     * @dev Thrown when the owner of permit does not match the sender
     */
    error NotValidOwner();
    /**
     * @dev Thrown when the spender of the permit does not match this contract address
     */
    error NotValidSpender();
    /**
     * @dev Thrown when the permit data contains an invalid signature
     */
    error NotValidSignature();

    /**
     * @notice Function to convert returned data to string
     * returns 'NOT_VALID_ENCODING' as fallback value.
     * @param data returned data
     */
    function _returnDataToString(
        bytes memory data
    ) internal pure returns (string memory) {
        if (data.length >= 64) {
            return abi.decode(data, (string));
        } else if (data.length == 32) {
            // Since the strings on bytes32 are encoded left-right, check the first zero in the data
            uint256 nonZeroBytes;
            while (nonZeroBytes < 32 && data[nonZeroBytes] != 0) {
                nonZeroBytes++;
            }

            // If the first one is 0, we do not handle the encoding
            if (nonZeroBytes == 0) {
                return "NOT_VALID_ENCODING";
            }
            // Create a byte array with nonZeroBytes length
            bytes memory bytesArray = new bytes(nonZeroBytes);
            for (uint256 i = 0; i < nonZeroBytes; i++) {
                bytesArray[i] = data[i];
            }
            return string(bytesArray);
        } else {
            return "NOT_VALID_ENCODING";
        }
    }

    /**
     * @notice Provides a safe ERC20.symbol version which returns 'NO_SYMBOL' as fallback string
     * @param token The address of the ERC-20 token contract
     */
    function safeSymbol(address token) public view returns (string memory) {
        (bool success, bytes memory data) = address(token).staticcall(
            abi.encodeCall(IERC20Metadata.symbol, ())
        );
        return success ? _returnDataToString(data) : "NO_SYMBOL";
    }

    /**
     * @notice  Provides a safe ERC20.name version which returns 'NO_NAME' as fallback string.
     * @param token The address of the ERC-20 token contract.
     */
    function safeName(address token) public view returns (string memory) {
        (bool success, bytes memory data) = address(token).staticcall(
            abi.encodeCall(IERC20Metadata.name, ())
        );
        return success ? _returnDataToString(data) : "NO_NAME";
    }

    /**
     * @notice Provides a safe ERC20.decimals version which returns '18' as fallback value.
     * Note Tokens with (decimals > 255) are not supported
     * @param token The address of the ERC-20 token contract
     */
    function safeDecimals(address token) public view returns (uint8) {
        (bool success, bytes memory data) = address(token).staticcall(
            abi.encodeCall(IERC20Metadata.decimals, ())
        );
        return success && data.length == 32 ? abi.decode(data, (uint8)) : 18;
    }

    /**
     * @notice Returns the encoded token metadata
     * @param token Address of the token
     */
    function getTokenMetadata(
        address token
    ) external view returns (bytes memory) {
        return
            abi.encode(safeName(token), safeSymbol(token), safeDecimals(token));
    }

    /**
     * @notice Validates and processes permit data for ERC20 tokens
     * @param token ERC20 token address
     * @param permitData Raw data of the call `permit` of the token
     * @param expectedOwner Expected owner address (msg.sender)
     * @param expectedSpender Expected spender address (address(this))
     * @return success Whether the permit processing was successful
     */
    function validateAndProcessPermit(
        address token,
        bytes calldata permitData,
        address expectedOwner,
        address expectedSpender
    ) external returns (bool success) {
        bytes4 sig = bytes4(permitData[:4]);

        if (sig == _PERMIT_SIGNATURE) {
            (
                address owner,
                address spender,
                uint256 value,
                uint256 deadline,
                uint8 v,
                bytes32 r,
                bytes32 s
            ) = abi.decode(
                    permitData[4:],
                    (
                        address,
                        address,
                        uint256,
                        uint256,
                        uint8,
                        bytes32,
                        bytes32
                    )
                );

            if (owner != expectedOwner) {
                revert NotValidOwner();
            }
            if (spender != expectedSpender) {
                revert NotValidSpender();
            }

            /// @dev To be more aligned with the latest OpenZeppelin ERC20 implementation where ERC20 tokens allow approvals of uint.max and it is widely adopted by DeFi,
            ///  this check has been removed. Important to warn that removing it is not the most secure approach but has been applied because it is widely used and reduce friction and gas cost
            // if (value != amount) {
            //     revert NotValidAmount();
            // }

            // we call without checking the result, in case it fails and the sender doesn't have enough balance
            // the following transferFrom should fail. This prevents DoS attacks from using a signature
            // before the smart contract call
            /* solhint-disable avoid-low-level-calls */
            (bool callSuccess, ) = address(token).call(
                abi.encodeWithSelector(
                    _PERMIT_SIGNATURE,
                    owner,
                    spender,
                    value,
                    deadline,
                    v,
                    r,
                    s
                )
            );
            return callSuccess;
        } else if (sig == _PERMIT_SIGNATURE_DAI) {
            (
                address holder,
                address spender,
                uint256 nonce,
                uint256 expiry,
                bool allowed,
                uint8 v,
                bytes32 r,
                bytes32 s
            ) = abi.decode(
                    permitData[4:],
                    (
                        address,
                        address,
                        uint256,
                        uint256,
                        bool,
                        uint8,
                        bytes32,
                        bytes32
                    )
                );

            if (holder != expectedOwner) {
                revert NotValidOwner();
            }
            if (spender != expectedSpender) {
                revert NotValidSpender();
            }

            // we call without checking the result, in case it fails and sender doesn't have enough balance
            // the following transferFrom should fail. This prevents DoS attacks from using a signature
            // before the smart contract call
            /* solhint-disable avoid-low-level-calls */
            (bool callSuccess, ) = address(token).call(
                abi.encodeWithSelector(
                    _PERMIT_SIGNATURE_DAI,
                    holder,
                    spender,
                    nonce,
                    expiry,
                    allowed,
                    v,
                    r,
                    s
                )
            );
            return callSuccess;
        } else {
            revert NotValidSignature();
        }
    }
}
