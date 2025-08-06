// SPDX-License-Identifier: AGPL-3.0

pragma solidity 0.8.28;

import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IBasePolygonZkEVMGlobalExitRoot} from "../../interfaces/IBasePolygonZkEVMGlobalExitRoot.sol";
import {ITokenWrappedBridgeUpgradeable} from "./TokenWrappedBridgeUpgradeable.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable4/proxy/utils/Initializable.sol";

/**
 * @title BridgeLib
 * @notice Contract containing utility functions and initialization logic for Bridge contracts
 * @dev This contract is deployed separately to reduce main contract bytecode size
 * @dev Functions here access storage directly via delegatecall from the main contract
 */
contract BridgeLib is Initializable {
    using SafeERC20 for ITokenWrappedBridgeUpgradeable;

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
     * @dev Thrown when the caller is not the deployer
     */
    error OnlyDeployer();
    /**
     * @dev Thrown when zero address is provided
     */
    error InvalidZeroAddress();
    /**
     * @dev Thrown when network ID is zero
     */
    error InvalidZeroNetworkID();
    /**
     * @dev Thrown when bridge address is not allowed
     */
    error BridgeAddressNotAllowed();
    /**
     * @dev Thrown when gas token network must be zero on ether
     */
    error GasTokenNetworkMustBeZeroOnEther();
    /**
     * @dev Thrown when sovereign WETH address params are invalid
     */
    error InvalidSovereignWETHAddressParams();
    /**
     * @dev Thrown when wrapped token deployment fails
     */
    error DeployWrappedTokenFailed();
    /**
     * @dev Thrown when ReentrancyGuard initialization fails
     */
    error ReentrancyGuardInitFailed();

    // Wrapped Token information struct
    struct TokenInformation {
        uint32 originNetwork;
        address originTokenAddress;
    }

    // Bridge initialization parameters struct
    struct InitializeBridgeParams {
        address deployer;
        uint32 networkID;
        address gasTokenAddress;
        uint32 gasTokenNetwork;
        IBasePolygonZkEVMGlobalExitRoot globalExitRootManager;
        address polygonRollupManager;
        bytes gasTokenMetadata;
        address bridgeManager;
        address sovereignWETHAddress;
        bool sovereignWETHAddressIsNotMintable;
        address emergencyBridgePauser;
        address emergencyBridgeUnpauser;
        address proxiedTokensManager;
    }

    // ==== EXACT STORAGE LAYOUT REPLICATION ====
    // This must match BridgeL2SovereignChain's storage layout exactly

    // ===== ReentrancyGuardUpgradeable & Initializable =====
    uint8 private _initialized; // slot 0, offset 0
    bool private _initializing; // slot 0, offset 1
    uint256 private _status; // slot 1
    uint256[49] private __gap_reentrancy; // slots 2-50

    // ===== DepositContractBase =====
    bytes32[32] private _branch; // slots 51-82
    uint256 public depositCount; // slot 83
    uint256[10] private __gap_deposit; // slots 84-93

    // ===== EmergencyManager =====
    uint256[10] private __gap_emergency; // slots 94-103
    bool public isEmergencyState; // slot 104, offset 0

    // ===== PolygonZkEVMBridgeV2 =====
    // NOTE: These share slot 104 with isEmergencyState due to packing
    uint32 public networkID; // slot 104, offset 1
    IBasePolygonZkEVMGlobalExitRoot public globalExitRootManager; // slot 104, offset 5
    uint32 public lastUpdatedDepositCount; // slot 104, offset 25

    mapping(uint256 => uint256) public claimedBitMap; // slot 105
    mapping(bytes32 => address) public tokenInfoToWrappedToken; // slot 106
    mapping(address => TokenInformation) public wrappedTokenToTokenInfo; // slot 107
    address public polygonRollupManager; // slot 108
    address public gasTokenAddress; // slot 109, offset 0
    uint32 public gasTokenNetwork; // slot 109, offset 20
    bytes public gasTokenMetadata; // slot 110
    ITokenWrappedBridgeUpgradeable public WETHToken; // slot 111
    address public proxiedTokensManager; // slot 112
    address public pendingProxiedTokensManager; // slot 113, offset 0
    uint8 internal _initializerVersion; // slot 113, offset 20
    uint256[48] private __gap_bridge; // slots 114-161

    // ===== BridgeL2SovereignChain =====
    mapping(address => bool) public wrappedAddressIsNotMintable; // slot 162
    address public bridgeManager; // slot 163
    address public emergencyBridgePauser; // slot 164
    bytes32 public claimedGlobalIndexHashChain; // slot 165
    bytes32 public unsetGlobalIndexHashChain; // slot 166
    mapping(bytes32 => uint256) public localBalanceTree; // slot 167
    uint8 private _initializerVersionLegacy; // slot 168, offset 0
    address public pendingEmergencyBridgePauser; // slot 168, offset 1
    address public emergencyBridgeUnpauser; // slot 169
    address public pendingEmergencyBridgeUnpauser; // slot 170
    uint256[48] private __gap_sovereign; // slots 171-218

    // Events (these will be emitted from the calling contract's context)
    event AcceptEmergencyBridgePauserRole(
        address oldEmergencyBridgePauser,
        address newEmergencyBridgePauser
    );

    event AcceptEmergencyBridgeUnpauserRole(
        address oldEmergencyBridgeUnpauser,
        address newEmergencyBridgeUnpauser
    );

    event AcceptProxiedTokensManagerRole(
        address oldProxiedTokensManager,
        address newProxiedTokensManager
    );

    /**
     * Disable initializers on the implementation following the best practices
     */
    constructor() {
        _disableInitializers();
    }

    /**
     * @notice Initialize function for BridgeL2SovereignChain
     * @dev This function is called via delegatecall from BridgeL2SovereignChain
     * @dev It accesses the calling contract's storage directly through the replicated layout
     * @param params Struct containing all initialization parameters, as struct has been used to avoid stack too deep compilation errors
     * param: deployer The deployer address (immutable in the calling contract)
     * param: _networkID networkID
     * param: _gasTokenAddress gas token address
     * param: _gasTokenNetwork gas token network
     * param: _globalExitRootManager global exit root manager address
     * param: _polygonRollupManager Rollup manager address
     * param: _gasTokenMetadata Abi encoded gas token metadata
     * param: _bridgeManager bridge manager address
     * param: _sovereignWETHAddress sovereign WETH address
     * param: _sovereignWETHAddressIsNotMintable Flag to indicate if the wrapped ETH is not mintable
     * param: _emergencyBridgePauser emergency bridge pauser address
     * param: _emergencyBridgeUnpauser emergency bridge unpauser address
     * param: _proxiedTokensManager address of the proxied tokens manager
     */
    function initializeBridge(
        InitializeBridgeParams calldata params
    ) external onlyInitializing {
        // only the deployer can initialize the contract.
        /// @dev the complexity of the initializes makes it very complex to deploy a proxy and
        /// @dev initialize the contract in an atomic transaction, so we need to permission the function to avoid frontrunning attacks
        require(msg.sender == params.deployer, OnlyDeployer());

        require(
            address(params.globalExitRootManager) != address(0),
            InvalidZeroAddress()
        );

        // Network ID must be different from 0 for sovereign chains
        require(params.networkID != 0, InvalidZeroNetworkID());

        // Set storage variables directly (they will map to the calling contract's storage)
        networkID = params.networkID;
        globalExitRootManager = params.globalExitRootManager;
        polygonRollupManager = params.polygonRollupManager;
        bridgeManager = params.bridgeManager;
        emergencyBridgePauser = params.emergencyBridgePauser;
        emit AcceptEmergencyBridgePauserRole(
            address(0),
            params.emergencyBridgePauser
        );
        emergencyBridgeUnpauser = params.emergencyBridgeUnpauser;
        emit AcceptEmergencyBridgeUnpauserRole(
            address(0),
            params.emergencyBridgeUnpauser
        );

        // Set proxied tokens manager
        require(
            params.proxiedTokensManager != address(this),
            BridgeAddressNotAllowed()
        );

        // It's not allowed proxiedTokensManager to be zero address
        require(
            params.proxiedTokensManager != address(0),
            InvalidZeroAddress()
        );

        proxiedTokensManager = params.proxiedTokensManager;
        emit AcceptProxiedTokensManagerRole(
            address(0),
            params.proxiedTokensManager
        );

        // Set gas token
        if (params.gasTokenAddress == address(0)) {
            // Gas token will be ether
            if (params.gasTokenNetwork != 0) {
                revert GasTokenNetworkMustBeZeroOnEther();
            }
            // Health check for sovereign WETH address
            if (
                params.sovereignWETHAddress != address(0) ||
                params.sovereignWETHAddressIsNotMintable
            ) {
                revert InvalidSovereignWETHAddressParams();
            }
            // WETHToken, gasTokenAddress and gasTokenNetwork will be 0
            // gasTokenMetadata will be empty
        } else {
            // Gas token will be an erc20
            gasTokenAddress = params.gasTokenAddress;
            gasTokenNetwork = params.gasTokenNetwork;
            gasTokenMetadata = params.gasTokenMetadata;

            // Set sovereign weth token or create new if not provided
            if (params.sovereignWETHAddress == address(0)) {
                // Health check for sovereign WETH address is mintable
                if (params.sovereignWETHAddressIsNotMintable == true) {
                    revert InvalidSovereignWETHAddressParams();
                }
                // Create a wrapped token for WETH, with salt == 0
                // This will call back to the main contract's _deployWrappedToken via delegatecall
                WETHToken = _deployWrappedToken(
                    0, // salt
                    abi.encode("Wrapped Ether", "WETH", 18)
                );
            } else {
                WETHToken = ITokenWrappedBridgeUpgradeable(
                    params.sovereignWETHAddress
                );
                wrappedAddressIsNotMintable[
                    params.sovereignWETHAddress
                ] = params.sovereignWETHAddressIsNotMintable;
            }
        }
    }

    /**
     * @notice Deploy wrapped token - calls the main contract's secure wrapper function via delegatecall context
     * @param salt Salt for token deployment
     * @param metadata Token metadata
     */
    function _deployWrappedToken(
        uint256 salt,
        bytes memory metadata
    ) internal onlyInitializing returns (ITokenWrappedBridgeUpgradeable) {
        // Call the secure wrapper function in PolygonZkEVMBridgeV2
        bytes memory callData = abi.encodeWithSignature(
            "deployWrappedTokenByBridgeLib(bytes32,bytes)",
            bytes32(salt), // Convert uint256 to bytes32
            metadata
        );

        (bool success, bytes memory result) = address(this).delegatecall(
            callData
        );
        if (!success) revert DeployWrappedTokenFailed();
        return abi.decode(result, (ITokenWrappedBridgeUpgradeable));
    }

    /**
     * @notice Function to convert returned data to string
     * returns 'NOT_VALID_ENCODING' as fallback value.
     * @param data returned data
     */
    function returnDataToString(
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
        return success ? returnDataToString(data) : "NO_SYMBOL";
    }

    /**
     * @notice  Provides a safe ERC20.name version which returns 'NO_NAME' as fallback string.
     * @param token The address of the ERC-20 token contract.
     */
    function safeName(address token) public view returns (string memory) {
        (bool success, bytes memory data) = address(token).staticcall(
            abi.encodeCall(IERC20Metadata.name, ())
        );
        return success ? returnDataToString(data) : "NO_NAME";
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

            // Call permit without checking result to prevent DoS attacks
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

            // Call permit without checking result to prevent DoS attacks
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
