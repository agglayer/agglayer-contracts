// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;
import "../../interfaces/IBasePolygonZkEVMGlobalExitRoot.sol";
import "./IPolygonZkEVMBridgeV2.sol";

interface IBridgeL2SovereignChains is IPolygonZkEVMBridgeV2 {
    /**
     * @dev Thrown when try to set a zero address to a non valid zero address field
     */
    error InvalidZeroAddress();

    /**
     * @dev Thrown when the origin network is invalid
     */
    error OriginNetworkInvalid();

    /**
     * @dev Thrown when sender is not the bridge manager
     * @notice Bridge manager can set custom mapping for any token
     */
    error OnlyBridgeManager();

    /**
     * @dev Thrown when trying to remove a token mapping that has not been updated by a new one
     */
    error TokenNotMapped();

    /**
     * @dev Thrown when trying to migrate a legacy token that is already the current token
     */
    error TokenAlreadyUpdated();

    /**
     * @dev Thrown when initializing sovereign bridge with invalid sovereign WETH token params
     */
    error InvalidSovereignWETHAddressParams();

    /**
     * @dev Thrown when initializing sovereign bridge with invalid sovereign WETH token params
     */
    error InvalidInitializeFunction();

    /**
     * @dev Thrown when initializing calling a function with invalid arrays length
     */
    error InputArraysLengthMismatch();

    /**
     * @dev Thrown when trying to map a token that is already mapped
     */
    error TokenAlreadyMapped();

    /**
     * @dev Thrown when trying to remove a legacy mapped token that has nor previously been remapped
     */
    error TokenNotRemapped();

    /**
     * @dev Thrown when trying to set a custom wrapper for weth on a gas token network
     */
    error WETHRemappingNotSupportedOnGasTokenNetworks();
    /**
     * @dev Thrown when trying to unset a not setted claim
     */
    error ClaimNotSet();

    /**
     * @dev Thrown when trying to activate emergency state in a not allowed bridge context (e.g. sovereign chains)
     */
    error EmergencyStateNotAllowed();

    function initialize(
        uint32 _networkID,
        address _gasTokenAddress,
        uint32 _gasTokenNetwork,
        IBasePolygonZkEVMGlobalExitRoot _globalExitRootManager,
        address _polygonRollupManager,
        bytes memory _gasTokenMetadata,
        address _bridgeManager,
        address sovereignWETHAddress,
        bool _sovereignWETHAddressIsNotMintable
    ) external;
}
