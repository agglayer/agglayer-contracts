// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "../interfaces/IALAuthenticatorBase.sol";
import "../PolygonRollupManager.sol";
import "./PolygonConsensusBase.sol";

/**
 * Contract responsible for managing the states and the updates of L2 network.
 * There will be a trusted sequencer, which is able to send transactions.
 * Any user can force some transaction and the sequencer will have a timeout to add them in the queue.
 * The sequenced state is deterministic and can be precalculated before it's actually verified by a zkProof.
 * The aggregators will be able to verify the sequenced state with zkProofs and therefore make available the withdrawals from L2 network.
 * To enter and exit of the L2 network will be used a PolygonZkEVMBridge smart contract that will be deployed in both networks.
 */
abstract contract ALAuthenticatorBase is
    PolygonConsensusBase,
    IALAuthenticatorBase
{
    struct AuthRoute {
        bytes plonkVKey;
        bytes32 authVKey;
        bool frozen;
    }

    // Consensus type that support generic consensus
    uint32 public constant AUTH_TYPE = 1;

    // Network/Rollup identifier
    uint32 public networkID;

    // Chain identifier
    uint64 public chainID;

    // Flag to enable/disable the use of the custom chain gateway to handle the authenticator keys. In case  of false (default), the keys are managed by the aggregation layer gateway
    bool public useCustomChainGateway;

    // authenticatorVKeys mapping
    mapping(bytes4 => AuthRoute) public authRoutes;

    /**
     * @dev This empty reserved space is put in place to allow future versions to add new
     * variables without shifting down storage in the inheritance chain.
     */
    uint256[50] private _gap;

    constructor(
        address _rollupManager
    )
        PolygonConsensusBase(
            IPolygonZkEVMGlobalExitRootV2(address(0)),
            IERC20Upgradeable(address(0)),
            IPolygonZkEVMBridgeV2(address(0)),
            PolygonRollupManager(_rollupManager)
        )
    {}

    /**
     * @param initializeBytesCustomChain TODO
     */
    function initialize(
        bytes calldata initializeBytesCustomChain
    ) external virtual override onlyRollupManager initializer {
        (
            address _admin,
            address _trustedSequencer,
            address _gasTokenAddress,
            uint32 _networkID,
            uint64 _chainID,
            string memory _sequencerURL,
            string memory _networkName
        ) = abi.decode(
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

    //////////////////
    // admin functions
    //////////////////

    function switchCustomChainGatewayFlag() external onlyAdmin {
        useCustomChainGateway = !useCustomChainGateway;
        // Emit event
        emit UpdateUseCustomChainGatewayFlag(useCustomChainGateway);
    }

    function addAuthenticatorRoute(
        bytes4 selector,
        bytes32 authVKey,
        bytes calldata plonkVKey
    ) external onlyAdmin {
        if (authVKey == bytes32(0)) {
            revert InvalidAuthVKey();
        }
        AuthRoute storage authRoute = authRoutes[selector];
        // Check already added
        if (authRoute.authVKey != bytes32(0)) {
            revert AuthRouteAlreadyAdded();
        }
        authRoute.authVKey = authVKey;
        authRoute.plonkVKey = plonkVKey;
        emit AddAuthenticatorVKey(selector, authVKey);
    }

    function updateAuthenticatorRoute(
        bytes4 selector,
        bytes32 updatedAuthVKey,
        bytes calldata updatedPlonkVKey
    ) external onlyAdmin {
        AuthRoute storage authRoute = authRoutes[selector];
        // Check already added
        if (authRoute.authVKey != bytes32(0)) {
            revert AuthRouteNotFound();
        }
        authRoute.authVKey = updatedAuthVKey;
        authRoute.plonkVKey = updatedPlonkVKey;
        emit UpdateAuthenticatorVKey(selector, updatedAuthVKey);
    }

    function _getAuthenticatorVKey(
        bytes4 selector
    ) internal view returns (bytes32) {
        if (useCustomChainGateway) {
            return authRoutes[selector].authVKey;
        }
        // Retrieve authenticator key from VerifierGateway
        AggLayerGateway aggLayerGatewayAddress = PolygonRollupManager(
            rollupManager
        ).aggLayerGateway();
        return aggLayerGatewayAddress.getAuthenticatorVKey(selector);
    }
}
