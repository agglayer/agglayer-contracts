// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ISP1Verifier} from "./ISP1Verifier.sol";

// based on: https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/ISP1VerifierGateway.sol

/// @dev A struct containing the address of a verifier and whether the verifier is frozen. A
/// frozen verifier cannot be routed to.

interface IAggLayerGatewayEvents {
    /// @notice Emitted when a verifier route is added.
    /// @param selector The verifier selector that was added.
    /// @param verifier The address of the verifier contract.
    event RouteAdded(
        bytes4 selector,
        address verifier,
        bytes32 pessimisticVKey
    );

    /// @notice Emitted when a verifier route is frozen.
    /// @param selector The verifier selector that was frozen.
    /// @param verifier The address of the verifier contract.
    event RouteFrozen(bytes4 selector, address verifier);

    /**
     * @notice Emitted when the aggLayerAdmin updates the pessimistic program verification key
     */
    event UpdatePessimisticVKey(
        bytes4 selector,
        address verifier,
        bytes32 newPessimisticVKey
    );

    event AddDefaultAggchainVKey(bytes4 selector, bytes32 newVKey);

    event UpdateDefaultAggchainVKey(bytes4 selector, bytes32 newVKey);
}

/// @dev Extended error events from https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/ISP1VerifierGateway.sol
interface IAggLayerGatewayErrors {
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

    /// @notice Thrown when the caller is not the AggLayerAdmin
    error OnlyAggLayerAdmin();

    //// @notice Thrown when the caller is not the pending AggLayerAdmin
    error OnlyPendingAggLayerAdmin();

    /// @notice Thrown when trying to add an aggchain verification key that already exists
    error AggchainVKeyAlreadyExists();

    /// @notice Thrown when trying to retrieve an aggchain verification key from the mapping that doesn't exists
    error AggchainVKeyNotFound();
}

/// @title SP1 Verifier Gateway Interface
/// @author Succinct Labs
/// @notice This contract is the interface for the SP1 Verifier Gateway.
/// @notice Based on https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/ISP1VerifierGateway.sol
interface IAggLayerGateway is IAggLayerGatewayEvents, IAggLayerGatewayErrors {
    struct AggLayerVerifierRoute {
        address verifier; // SP1 Verifier. It contains sanity check SP1 version with the 4 first bytes of the proof. proof[4:]
        bytes32 pessimisticVKey;
        bool frozen;
    }

    /**
     * @notice returns the current aggchain verification key, used to verify chain's FEP
     * @dev This function is necessary to query the map from an external function. In solidity maps are not
     * directly accessible from external functions like other state variables
     */
    function getDefaultAggchainVKey(
        bytes4 defaultAggchainSelector
    ) external view returns (bytes32);

    /// @notice Verifies a pessimistic proof with given public values and proof.
    /// @dev It is expected that the first 4 bytes of proofBytes must match the first 4 bytes of
    /// target verifier's VERIFIER_HASH.
    /// @param publicValues The public values encoded as bytes.
    /// @param proofBytes The proof of the program execution the SP1 zkVM encoded as bytes.
    function verifyPessimisticProof(
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view;

    /// @notice Adds a verifier route. This enable proofs to be routed to this verifier.
    /// @dev Only callable by the owner. The owner is responsible for ensuring that the specified
    /// verifier is correct with a valid VERIFIER_HASH. Once a route to a verifier is added, it
    /// cannot be removed.
    /// @param verifier The address of the verifier contract. This verifier MUST implement the
    /// ISP1VerifierWithHash interface.
    /// @param pessimisticVKey The verification key to be used for verifying pessimistic proofs.
    function addPessimisticVKeyRoute(
        bytes4 pessimisticVKeySelector,
        address verifier,
        bytes32 pessimisticVKey
    ) external;

    /// @notice Freezes a verifier route. This prevents proofs from being routed to this verifier.
    /// @dev Only callable by the owner. Once a route to a verifier is frozen, it cannot be
    /// unfrozen.
    /// @param pessimisticVKeySelector The verifier selector to freeze.
    function freezePessimisticVKeyRoute(
        bytes4 pessimisticVKeySelector
    ) external;
}
