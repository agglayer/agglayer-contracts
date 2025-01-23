// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/IALAuthenticatorBase.sol";
import "../PolygonRollupManager.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
abstract contract ALAuthenticatorBase is IALAuthenticatorBase, Initializable {
    // Rollup manager
    PolygonRollupManager public immutable rollupManager;

    // Consensus type that support generic consensus
    uint32 public constant AUTH_TYPE = 1;

    // Address that will be able to adjust contract parameters
    address public admin;
    // This account will be able to accept the admin role
    address public pendingAdmin;
    // Trusted sequencer address
    address public trustedSequencer;

    // Trusted sequencer URL
    string public trustedSequencerURL;

    // L2 network name
    string public networkName;

    // Token address that will be used to pay gas fees in this chain. This variable it's just for read purposes
    address public gasTokenAddress;

    // Network/Rollup identifier
    uint32 public networkID;

    // Chain identifier
    uint64 public chainID;

    // Native network of the token address of the gas token address. This variable it's just for read purposes
    uint32 public gasTokenNetwork;

    // authenticatorVKey
    bytes32 internal _authenticatorVKey;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private _gap;

    // General parameters that will have in common all networks that deploys rollup manager
    /**
     * @dev Disable initializers on the implementation following the best practices
     * @param _rollupManager Global exit root manager address
     */
    constructor(PolygonRollupManager _rollupManager) {
        rollupManager = _rollupManager;
        // Disable initializers on the implementation following the best practices
        _disableInitializers();
    }

    /**
     * @param initializeBytesCustomChain TODO
     */
    function initialize(
        bytes calldata initializeBytesCustomChain
    ) external virtual onlyRollupManager initializer {
        (
            address _admin,
            address _trustedSequencer,
            address _gasTokenAddress,
            uint32 _networkID,
            uint64 _chainID,
            string memory _sequencerURL,
            string memory _networkName
        ) =
            abi.decode(
                initializeBytesCustomChain,
                (address, address, address, uint32, uint64, string, string)
            );
        admin = _admin;
        trustedSequencer = _trustedSequencer;
        gasTokenAddress = _gasTokenAddress;
        networkID = _networkID;
        chainID = _chainID;
        trustedSequencerURL = _sequencerURL;
        networkName = _networkName;
    }

    modifier onlyAdmin() {
        if (admin != msg.sender) {
            revert OnlyAdmin();
        }
        _;
    }

    modifier onlyRollupManager() {
        if (address(rollupManager) != msg.sender) {
            revert OnlyRollupManager();
        }
        _;
    }

    //////////////////
    // admin functions
    //////////////////

    /**
     * @notice Allow the admin to set a new trusted sequencer
     * @param newTrustedSequencer Address of the new trusted sequencer
     */
    function setTrustedSequencer(
        address newTrustedSequencer
    ) external onlyAdmin {
        trustedSequencer = newTrustedSequencer;

        emit SetTrustedSequencer(newTrustedSequencer);
    }

    /**
     * @notice Allow the admin to set the trusted sequencer URL
     * @param newTrustedSequencerURL URL of trusted sequencer
     */
    function setTrustedSequencerURL(
        string memory newTrustedSequencerURL
    ) external onlyAdmin {
        trustedSequencerURL = newTrustedSequencerURL;

        emit SetTrustedSequencerURL(newTrustedSequencerURL);
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

    function setAuthenticatorVKey(
        bytes32 newAuthenticatorVKey
    ) external onlyAdmin {
        _authenticatorVKey = newAuthenticatorVKey;
        emit SetAuthenticatorVKey(newAuthenticatorVKey);
    }

    function _getAuthenticatorVKey(
        AggLayerGateway.AuthenticatorVKeyTypes authenticatorVKeyType,
        bytes4 selector
    ) internal view returns (bytes32) {
        if (_authenticatorVKey != 0) {
            return _authenticatorVKey;
        }
        // Retrieve authenticator key from VerifierGateway
        AggLayerGateway aggLayerGatewayAddress = PolygonRollupManager(
                rollupManager
            ).aggLayerGateway();
        return
            aggLayerGatewayAddress.getAuthenticatorVKey(
                authenticatorVKeyType,
                selector
            );
    }
}
