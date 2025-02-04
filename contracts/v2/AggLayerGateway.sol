// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
// TODO: check to upgrade version (bugs in solidity?) Check optimism supports cancun
import {ISP1Verifier, ISP1VerifierWithHash} from "./interfaces/ISP1Verifier.sol";
import {IAggLayerGateway} from "./interfaces/IAggLayerGateway.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts5/access/AccessControl.sol";

// Based on https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/SP1VerifierGateway.sol

/// @title AggLayerGateway
contract AggLayerGateway is Initializable, AccessControl, IAggLayerGateway {
    // Roles
    // Be able to add a new rollup type
    bytes32 internal constant AGGLAYER_ADMIN_ROLE = keccak256("AGGLAYER_ADMIN_ROLE");
    bytes32 internal constant AGGCHAIN_ADMIN_ROLE = keccak256("AGGCHAIN_ADMIN_ROLE");

    mapping(bytes4 defaultAggchainSelector => bytes32 defaultAggchainVKey)
        public defaultAggchainVKeys;
    mapping(bytes4 pessimisticVKeySelector => AggLayerVerifierRoute)
        public pessimisticVKeyRoutes;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private _gap;

    /**
     * @dev Emitted when the admin starts the two-step transfer role setting a new pending admin
     */
    event TransferAggLayerAdminRole(address newPendingAggLayerAdmin);

    /**
     * @dev Emitted when the pending admin accepts the admin role
     */
    event AcceptAggLayerAdminRole(address newAggLayerAdmin);

    /**
     * @dev Disable initializers on the implementation following the best practices
     */
    constructor() {
        // disable initializers for implementation contract
        _disableInitializers();
    }

    /**
     * @notice  Initializer function to set new rollup manager version.
     * @param timelock The address of the default admin. Highly recommended to use a timelock contract for security reasons.
     * @param aggLayerAdmin The address of the admin.
     */
    function initialize(address timelock, address aggLayerAdmin) external virtual initializer {
        _grantRole(DEFAULT_ADMIN_ROLE, timelock);
        _grantRole(AGGLAYER_ADMIN_ROLE, aggLayerAdmin);
    }

    /**
     * @notice Function to verify the pessimistic proof
     * @param publicValues Public values of the proof
     * @param proofBytes Proof for the pessimistic verification
     * @dev First 4 bytes of the pessimistic proof are the pp selector
     * proof[0:4]: 4 bytes selector pp
     * proof[4:8]: 4 bytes selector SP1 verifier
     * proof[8:]: proof
     */
    function verifyPessimisticProof(
        bytes calldata publicValues,
        bytes calldata proofBytes
    ) external view {
        bytes4 ppSelector = bytes4(proofBytes[:4]);
        AggLayerVerifierRoute memory route = pessimisticVKeyRoutes[ppSelector];
        if (route.verifier == address(0)) {
            revert RouteNotFound(ppSelector);
        } else if (route.frozen) {
            revert RouteIsFrozen(ppSelector);
        }

        ISP1Verifier(route.verifier).verifyProof(
            route.pessimisticVKey,
            publicValues,
            proofBytes[4:]
        );
    }

    //////////////////
    // admin functions
    //////////////////
    function addPessimisticVKeyRoute(
        bytes4 pessimisticVKeySelector,
        address verifier,
        bytes32 pessimisticVKey
    ) external onlyRole(AGGLAYER_ADMIN_ROLE) {
        if (pessimisticVKeySelector == bytes4(0)) {
            revert SelectorCannotBeZero();
        }

        AggLayerVerifierRoute storage route = pessimisticVKeyRoutes[
            pessimisticVKeySelector
        ];
        if (route.verifier != address(0)) {
            revert RouteAlreadyExists(route.verifier);
        }

        route.verifier = verifier;
        route.pessimisticVKey = pessimisticVKey;
        emit RouteAdded(pessimisticVKeySelector, verifier, pessimisticVKey);
    }

    function freezePessimisticVKeyRoute(
        bytes4 pessimisticVKeySelector
    ) external onlyRole(AGGLAYER_ADMIN_ROLE) {
        AggLayerVerifierRoute storage route = pessimisticVKeyRoutes[
            pessimisticVKeySelector
        ];
        if (route.verifier == address(0)) {
            revert RouteNotFound(pessimisticVKeySelector);
        }
        if (route.frozen) {
            revert RouteIsFrozen(pessimisticVKeySelector);
        }

        route.frozen = true;

        emit RouteFrozen(pessimisticVKeySelector, route.verifier);
    }

    //////////////////
    // defaultAggChainVkey functions
    //////////////////
    /**
     * @notice Function to add an aggchain verification key
     * @param defaultAggchainSelector The 4 bytes selector to add to the default aggchain verification keys.
     * @dev First 2 bytes of the selector are the aggchain type (ex: FEP, ECDSA), the last 2 bytes are the 'verification key identifier'
     * @param newAggchainVKey New pessimistic program verification key
     */
    function addDefaultAggchainVKey(
        bytes4 defaultAggchainSelector,
        bytes32 newAggchainVKey
    ) external onlyRole(AGGCHAIN_ADMIN_ROLE) {
        // Check already exists
        if (defaultAggchainVKeys[defaultAggchainSelector] != bytes32(0)) {
            revert AggchainVKeyAlreadyExists();
        }
        // Add the new VKey to the mapping
        defaultAggchainVKeys[defaultAggchainSelector] = newAggchainVKey;

        emit AddDefaultAggchainVKey(defaultAggchainSelector, newAggchainVKey);
    }
    function updateDefaultAggchainVKey(
        bytes4 defaultAggchainSelector,
        bytes32 newAggchainVKey
    ) external onlyRole(AGGCHAIN_ADMIN_ROLE) {
        // Check if the key exists
        if (defaultAggchainVKeys[defaultAggchainSelector] == bytes32(0)) {
            revert AggchainVKeyNotFound();
        }
        // Update the VKey
        defaultAggchainVKeys[defaultAggchainSelector] = newAggchainVKey;

        emit UpdateDefaultAggchainVKey(
            defaultAggchainSelector,
            newAggchainVKey
        );
    }

    function getDefaultAggchainVKey(
        bytes4 defaultAggchainSelector
    ) external view returns (bytes32) {
        return defaultAggchainVKeys[defaultAggchainSelector];
    }
}
