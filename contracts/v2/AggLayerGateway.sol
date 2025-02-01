// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;
// TODO: check to upgrade version (bugs in solidity?) Check optimism supports cancun
import {ISP1Verifier, ISP1VerifierWithHash} from "./interfaces/ISP1Verifier.sol";
import {IAggLayerGateway} from "./interfaces/IAggLayerGateway.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

// Based on https://github.com/succinctlabs/sp1-contracts/blob/main/contracts/src/SP1VerifierGateway.sol

/// @title AggLayerGateway
contract AggLayerGateway is IAggLayerGateway, Initializable {
    // TODO: Implement roles
    mapping(bytes4 defaultAggchainSelector => bytes32 defaultAggchainVKey)
        public defaultAggchainVKeys;
    mapping(bytes4 pessimisticVKeySelector => AggLayerVerifierRoute)
        public pessimisticVKeyRoutes;

    // admin
    // todo: Comment admin features/timelock
    address public aggLayerAdmin;

    // This account will be able to accept the admin role
    address public pendingAggLayerAdmin;

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
        // disable initializers
        _disableInitializers();
    }

    /**
     * @notice  Initializer function to set new rollup manager version
     * @param _aggLayerAdmin The address of the admin
     */
    function initialize(address _aggLayerAdmin) external virtual initializer {
        aggLayerAdmin = _aggLayerAdmin;
    }

    modifier onlyAggLayerAdmin() {
        if (aggLayerAdmin != msg.sender) {
            revert OnlyAggLayerAdmin();
        }
        _;
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
    ) external onlyAggLayerAdmin {
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
    ) external onlyAggLayerAdmin {
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
    ) external onlyAggLayerAdmin {
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
    ) external onlyAggLayerAdmin {
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

    /**
     * @notice Starts the admin role transfer
     * This is a two step process, the pending admin must accepted to finalize the process
     * @param newPendingAggLayerAdmin Address of the new pending admin
     */
    function transferAggLayerAdminRole(
        address newPendingAggLayerAdmin
    ) external onlyAggLayerAdmin {
        pendingAggLayerAdmin = newPendingAggLayerAdmin;
        emit TransferAggLayerAdminRole(newPendingAggLayerAdmin);
    }

    /**
     * @notice Allow the current pending AggLayerAdmin to accept the admin role
     */
    function acceptAggLayerAdminRole() external {
        if (pendingAggLayerAdmin != msg.sender) {
            revert OnlyPendingAggLayerAdmin();
        }

        aggLayerAdmin = pendingAggLayerAdmin;
        emit AcceptAggLayerAdminRole(pendingAggLayerAdmin);
    }
}
