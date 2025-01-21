// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import {ISP1Verifier, ISP1VerifierWithHash} from "./interfaces/ISP1Verifier.sol";
import {ISP1VerifierGateway, VerifierRoute} from "./interfaces/ISP1VerifierGateway.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// Based on https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/SP1VerifierGateway.sol

/// @title SP1 Verifier Gateway
/// @author Succinct Labs
/// @notice This contract verifies proofs by routing to the correct verifier based on the verifier
/// selector contained in the first 4 bytes of the proof. It additionally checks that to see that
/// the verifier route is not frozen.
contract PolygonVerifierGateway is ISP1VerifierGateway, Initializable {
    /// @inheritdoc ISP1VerifierGateway
    mapping(bytes4 => VerifierRoute) public routes;

    // admin
    address public admin;

    // This account will be able to accept the admin role
    address public pendingAdmin;

    // pessimistic program verification key
    bytes32 public pessimisticVKey;

    // authenticator verification key
    bytes32 public authenticatorVKey;

    // Mapping for whitelisted Authenticator addresses
    mapping(address => bool) public whitelistedAuthenticators;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private _gap;

    //////////
    // events
    //////////

    /**
     * @dev Emitted when the admin updates the pessimistic program verification key
     */
    event SetPessimisticVKey(bytes32 newPessimisticVKey);

    /**
     * @dev Emitted when the admin updates the authenticator verification key
     */
    event SetAuthenticatorVKey(bytes32 newAuthenticatorVKey);

    /**
     * @dev Emitted when the admin starts the two-step transfer role setting a new pending admin
     */
    event TransferAdminRole(address newPendingAdmin);

    /**
     * @dev Emitted when the pending admin accepts the admin role
     */
    event AcceptAdminRole(address newAdmin);

    /**
     * @dev Disable initializers on the implementation following the best practices
     */
    constructor() {
        // disable initializers
        _disableInitializers();
    }

    /**
     * @notice  Initializer function to set new rollup manager version
     * @param _admin The address of the admin
     * @param _pessimisticVKey The pessimistic program verification key
     * @param _authenticatorVKey The authenticator verification key. This key is the one used to verify the fep-stack + bridge of fep chains managed by PolygonVerifierGateway
     */
    function initialize(
        address _admin,
        bytes32 _pessimisticVKey,
        bytes32 _authenticatorVKey
    ) external virtual initializer {
        admin = _admin;
        pessimisticVKey = _pessimisticVKey;
        authenticatorVKey = _authenticatorVKey;
    }

    modifier onlyAdmin() {
        if (admin != msg.sender) {
            revert OnlyAdmin();
        }
        _;
    }

    /// @inheritdoc ISP1VerifierGateway
    function verifyPessimisticProof(
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view {
        bytes4 selector = bytes4(proofBytes[:4]);
        VerifierRoute memory route = routes[selector];
        if (route.verifier == address(0)) {
            revert RouteNotFound(selector);
        } else if (route.frozen) {
            revert RouteIsFrozen(selector);
        }

        ISP1Verifier(route.verifier).verifyProof(
            pessimisticVKey,
            publicValues,
            proofBytes
        );
    }

    //////////////////
    // admin functions
    //////////////////

    /// @inheritdoc ISP1VerifierGateway
    function addRoute(address verifier) external onlyAdmin {
        bytes4 selector = bytes4(
            ISP1VerifierWithHash(verifier).VERIFIER_HASH()
        );
        if (selector == bytes4(0)) {
            revert SelectorCannotBeZero();
        }

        VerifierRoute storage route = routes[selector];
        if (route.verifier != address(0)) {
            revert RouteAlreadyExists(route.verifier);
        }

        route.verifier = verifier;

        emit RouteAdded(selector, verifier);
    }

    /// @inheritdoc ISP1VerifierGateway
    function freezeRoute(bytes4 selector) external onlyAdmin {
        VerifierRoute storage route = routes[selector];
        if (route.verifier == address(0)) {
            revert RouteNotFound(selector);
        }
        if (route.frozen) {
            revert RouteIsFrozen(selector);
        }

        route.frozen = true;

        emit RouteFrozen(selector, route.verifier);
    }

    /**
     * @notice Function to update the pessimistic program verification key
     * @param newPessimisticVKey New pessimistic program verification key
     */
    function setPessimisticVKey(bytes32 newPessimisticVKey) external onlyAdmin {
        pessimisticVKey = newPessimisticVKey;

        emit SetPessimisticVKey(newPessimisticVKey);
    }

    /**
     * @notice Function to update the authenticator verification key
     * @param newAuthenticatorVKey New authenticator verification key
     */
    function setAuthenticatorVKey(
        bytes32 newAuthenticatorVKey
    ) external onlyAdmin {
        authenticatorVKey = newAuthenticatorVKey;

        emit SetAuthenticatorVKey(newAuthenticatorVKey);
    }

    /**
     * @notice Starts the admin role transfer
     * This is a two step process, the pending admin must accepted to finalize the process
     * @param newPendingAdmin Address of the new pending admin
     */
    function transferAdminRole(address newPendingAdmin) external onlyAdmin {
        pendingAdmin = newPendingAdmin;
        emit TransferAdminRole(newPendingAdmin);
    }

    /**
     * @notice Allow the current pending admin to accept the admin role
     */
    function acceptAdminRole() external {
        if (pendingAdmin != msg.sender) {
            revert OnlyPendingAdmin();
        }

        admin = pendingAdmin;
        emit AcceptAdminRole(pendingAdmin);
    }

    function getAuthenticatorVKey() external view returns (bytes32) {
        return authenticatorVKey;
    }

    /**
     * @notice Function to set the whitelisted authenticator
     * @param authenticator Address of the authenticator
     * @param whitelisted Boolean value to set the authenticator as whitelisted or not
     */
    function setWhitelistedAuthenticator(
        address authenticator,
        bool whitelisted
    ) external onlyAdmin {
        whitelistedAuthenticators[authenticator] = whitelisted;
    }
}
