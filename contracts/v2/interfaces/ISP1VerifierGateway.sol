// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISP1Verifier} from "./ISP1Verifier.sol";

// imported from: https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/ISP1VerifierGateway.sol

/// @dev A struct containing the address of a verifier and whether the verifier is frozen. A
/// frozen verifier cannot be routed to.
struct VerifierRoute {
    address verifier;
    bytes32 pessimisticVKey;
    bool frozen;
}

interface ISP1VerifierGatewayEvents {
    /// @notice Emitted when a verifier route is added.
    /// @param selector The verifier selector that was added.
    /// @param verifier The address of the verifier contract.
    event RouteAdded(bytes4 selector, address verifier, bytes32 pessimisticVKey);

    /// @notice Emitted when a verifier route is frozen.
    /// @param selector The verifier selector that was frozen.
    /// @param verifier The address of the verifier contract.
    event RouteFrozen(bytes4 selector, address verifier);
}

/// @dev Extended error events from https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/ISP1VerifierGateway.sol
interface ISP1VerifierGatewayErrors {
    /// @notice Thrown when the verifier route is not found.
    /// @param selector The verifier selector that was specified.
    error RouteNotFound(bytes4 selector);

    /// @notice Thrown when the verifier route is found, but is frozen.
    /// @param selector The verifier selector that was specified.
    error RouteIsFrozen(bytes4 selector);

    /// @notice Thrown when adding a verifier route and the selector already contains a route.
    /// @param verifier The address of the verifier contract in the existing route.
    error RouteAlreadyExists(address verifier);

    /// @notice Thrown when adding a verifier route and the selector returned by the verifier is
    /// zero.
    error SelectorCannotBeZero();

    /// @notice Thrown when the caller is not the admin
    error OnlyAdmin();

    //// @notice Thrown when the caller is not the pending admin
    error OnlyPendingAdmin();

    /// @notice Thrown when trying to add an authenticator verification key that already exists
    error AuthenticatorVKeyAlreadyExists();

    /// @notice Thrown when trying to update an authenticator verification key that doesn't exists
    error AuthenticatorVKeyNotFound();
}

/// @title SP1 Verifier Gateway Interface
/// @author Succinct Labs
/// @notice This contract is the interface for the SP1 Verifier Gateway.
/// @notice Extended version of https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/ISP1VerifierGateway.sol
interface ISP1VerifierGateway is
    ISP1VerifierGatewayEvents,
    ISP1VerifierGatewayErrors
{
    enum AuthenticatorVKeyTypes { 
        ECDSA,
        FEP
    }
    /**
     * @notice returns the current authenticator verification key, used to verify chain's FEP
     */
    function getAuthenticatorVKey(AuthenticatorVKeyTypes authenticatorVKeyType, bytes4 selector) external view returns (bytes32);

    /// @notice Verifies a pessimistic proof with given public values and proof.
    /// @dev It is expected that the first 4 bytes of proofBytes must match the first 4 bytes of
    /// target verifier's VERIFIER_HASH.
    /// @param publicValues The public values encoded as bytes.
    /// @param proofBytes The proof of the program execution the SP1 zkVM encoded as bytes.
    function verifyPessimisticProof(
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view;

    /// @notice Mapping of 4-byte verifier selectors to verifier routes.
    /// @dev Only one verifier route can be added for each selector.
    /// @param selector The verifier selector, which is both the first 4 bytes of the VERIFIER_HASH
    /// and the first 4 bytes of the proofs designed for that verifier.
    /// @return verifier The address of the verifier contract.
    /// @return pessimisticVKey The pessimistic verification key to use for the chosen selector/route.
    /// @return frozen Whether the verifier is frozen.
    function routes(
        bytes4 selector
    ) external view returns (address verifier, bytes32 pessimisticVKey, bool frozen);

    /// @notice Adds a verifier route. This enable proofs to be routed to this verifier.
    /// @dev Only callable by the owner. The owner is responsible for ensuring that the specified
    /// verifier is correct with a valid VERIFIER_HASH. Once a route to a verifier is added, it
    /// cannot be removed.
    /// @param verifier The address of the verifier contract. This verifier MUST implement the
    /// ISP1VerifierWithHash interface.
    /// @param pessimisticVKey The verification key to be used for verifying pessimistic proofs.
    function addRoute(address verifier, bytes32 pessimisticVKey) external;

    /// @notice Freezes a verifier route. This prevents proofs from being routed to this verifier.
    /// @dev Only callable by the owner. Once a route to a verifier is frozen, it cannot be
    /// unfrozen.
    /// @param selector The verifier selector to freeze.
    function freezeRoute(bytes4 selector) external;
}
