// SPDX-License-Identifier: AGPL-3.0
pragma solidity ^0.8.28;

import {Test, console} from "forge-std/Test.sol";

// Main contracts
import {AggchainECDSAMultisig} from "contracts/aggchains/AggchainECDSAMultisig.sol";
import {AggchainFEP} from "contracts/aggchains/AggchainFEP.sol";
import {AgglayerBridge} from "contracts/AgglayerBridge.sol";
import {AgglayerGateway} from "contracts/AgglayerGateway.sol";
import {AgglayerGER} from "contracts/AgglayerGER.sol";
import {AgglayerManager} from "contracts/AgglayerManager.sol";

// Interfaces
import {IAgglayerBridge} from "contracts/interfaces/IAgglayerBridge.sol";
import {IAgglayerGateway} from "contracts/interfaces/IAgglayerGateway.sol";
import {IAgglayerGER} from "contracts/interfaces/IAgglayerGER.sol";
import {IPolygonZkEVMBridge} from "contracts/interfaces/IPolygonZkEVMBridge.sol";

// OpenZeppelin contracts
import {IERC20Upgradeable} from "@openzeppelin/contracts-upgradeable4/token/ERC20/IERC20Upgradeable.sol";
import {ProxyAdmin} from "@openzeppelin/contracts5/proxy/transparent/ProxyAdmin.sol";
import {TransparentUpgradeableProxy} from "@openzeppelin/contracts5/proxy/transparent/TransparentUpgradeableProxy.sol";

// Libraries
import {Constants} from "test/forge/utils/Constants.sol";

/**
 * @title BaseTest
 * @dev Base contract for foundry tests. Contains setUp function and deployment utilities.
 */
abstract contract BaseTest is Test {
    string internal constant POLYGON_ZKEVM_DEPLOYER_ARTIFACT_PATH =
        "artifacts/contracts/deployment/PolygonZkEVMDeployer.sol/PolygonZkEVMDeployer.json";
    string internal constant AGGLAYER_TIMELOCK_ARTIFACT_PATH =
        "artifacts/contracts/AgglayerTimelock.sol/AgglayerTimelock.json";

    address internal deployer;
    address internal timelock;
    ProxyAdmin internal proxyAdmin;

    // ===== Main protocol contracts (as proxies) =====
    AgglayerBridge internal agglayerBridge;
    AgglayerGateway internal agglayerGateway;
    AgglayerGER internal agglayerGER;
    AgglayerManager internal agglayerManager;

    // ===== Implementation contracts =====
    AggchainECDSAMultisig internal aggchainECDSAImpl;
    AggchainFEP internal aggchainFEPImpl;
    AgglayerBridge internal agglayerBridgeImpl;
    AgglayerGateway internal agglayerGatewayImpl;
    AgglayerGER internal agglayerGERImpl;
    AgglayerManager internal agglayerManagerImpl;

    // ===== Test accounts =====
    address internal owner = makeAddr("owner");
    address internal polygonZkEVM = makeAddr("polygonZkEVM");
    address internal timelockProposer = makeAddr("timelockProposer");
    address internal timelockExecutor = makeAddr("timelockExecutor");

    /**
     * @dev setUp function called before each test
     * Deploys core infrastructure contracts that are used by the deployment system
     *
     * IMPORTANT: This mirrors the actual production deployment pattern where:
     * 1. PolygonZkEVMDeployer is deployed first (via keyless deployment)
     * 2. AgglayerTimelock is deployed directly (not via deployer)
     * 3. Some contracts (ProxyAdmin, AgglayerBridge) are deployed via deployer's create2
     * 4. Main protocol contracts (AgglayerManager, AgglayerGER, AgglayerGateway) are deployed
     *    via OpenZeppelin upgradeable proxies with timelock as admin
     * 5. Timelock gets ownership of ProxyAdmin for governance
     */
    function setUp() public virtual {
        // 1. Etch PolygonZkEVMDeployer bytecode from Hardhat artifacts
        deployer = _etchPolygonZkEVMDeployer(owner);

        // 2. Etch AgglayerTimelock bytecode from Hardhat artifacts
        address[] memory proposers = new address[](1);
        address[] memory executors = new address[](1);
        proposers[0] = timelockProposer;
        executors[0] = timelockExecutor;

        // Use etching function to deploy timelock with immutable modification
        // Setting agglayerManager to address(0) to skip emergency state check in getMinDelay()
        timelock = _etchAgglayerTimelock(Constants.TIMELOCK_MIN_DELAY, proposers, executors, address(0));

        // @todo Interdependencies setup (e.g. set rollup manager address in AgglayerGER)
        // @todo Setup mocks for more complex deployments
        deployAgglayerBridge();
        deployAgglayerGER();
        deployAgglayerGateway();
        deployAgglayerManager();
        deployAggchainFEP();
        deployAggchainECDSA();
    }

    /**
     * @dev Deploy contracts using create2 (via PolygonZkEVMDeployer) - mirrors production deployment
     * These contracts are deployed deterministically using the deployer contract with CREATE2
     *
     * In production, these are:
     * 1. ProxyAdmin - deployed via create2Deployment()
     * 2. AgglayerBridge Implementation - deployed via create2Deployment()
     * 3. AgglayerBridge Proxy (TransparentUpgradeableProxy) - deployed via create2Deployment()
     */
    function deployAgglayerBridge() public {
        // === PROXYADMIN DEPLOYMENT (CREATE2) ===
        bytes memory proxyAdminBytecode = abi.encodePacked(type(ProxyAdmin).creationCode, abi.encode(owner));

        vm.prank(owner);
        (bool ok,) = deployer.call(
            abi.encodeWithSignature(
                "deployDeterministic(uint256,bytes32,bytes)", 0, Constants.DEFAULT_SALT, proxyAdminBytecode
            )
        );
        require(ok, "ProxyAdmin deployment failed");

        bytes memory result;
        vm.prank(owner);
        (ok, result) = deployer.call(
            abi.encodeWithSignature(
                "predictDeterministicAddress(bytes32,bytes32)", Constants.DEFAULT_SALT, keccak256(proxyAdminBytecode)
            )
        );
        require(ok, "ProxyAdmin address prediction failed");
        proxyAdmin = ProxyAdmin(abi.decode(result, (address)));
        vm.prank(owner);
        proxyAdmin.transferOwnership(timelock);

        // === AGGLAYERBRIDGE IMPLEMENTATION DEPLOYMENT (CREATE2) ===
        bytes memory agglayerBridgeImplBytecode = abi.encodePacked(type(AgglayerBridge).creationCode);

        vm.prank(owner);
        (ok,) = deployer.call(
            abi.encodeWithSignature(
                "deployDeterministic(uint256,bytes32,bytes)", 0, Constants.DEFAULT_SALT, agglayerBridgeImplBytecode
            )
        );
        require(ok, "Bridge impl deployment failed");

        vm.prank(owner);
        (ok, result) = deployer.call(
            abi.encodeWithSignature(
                "predictDeterministicAddress(bytes32,bytes32)",
                Constants.DEFAULT_SALT,
                keccak256(agglayerBridgeImplBytecode)
            )
        );
        require(ok, "Bridge impl address prediction failed");
        agglayerBridgeImpl = AgglayerBridge(abi.decode(result, (address)));

        // === AGGLAYERBRIDGE PROXY DEPLOYMENT (CREATE2) ===
        bytes memory agglayerBridgeProxyBytecode = abi.encodePacked(
            type(TransparentUpgradeableProxy).creationCode,
            abi.encode(address(agglayerBridgeImpl), address(proxyAdmin), "")
        );

        vm.prank(owner);
        (ok,) = deployer.call(
            abi.encodeWithSignature(
                "deployDeterministic(uint256,bytes32,bytes)", 0, Constants.DEFAULT_SALT, agglayerBridgeProxyBytecode
            )
        );
        require(ok, "Bridge proxy deployment failed");

        vm.prank(owner);
        (ok, result) = deployer.call(
            abi.encodeWithSignature(
                "predictDeterministicAddress(bytes32,bytes32)",
                Constants.DEFAULT_SALT,
                keccak256(agglayerBridgeProxyBytecode)
            )
        );
        require(ok, "Bridge proxy address prediction failed");
        agglayerBridge = AgglayerBridge(abi.decode(result, (address)));
    }

    /**
     * @dev Deploy AgglayerGER contract via OpenZeppelin upgradeable proxy
     * This mirrors the actual production deployment pattern with proper proxy
     */
    function deployAgglayerGER() public returns (AgglayerGER) {
        // === AGGLAYERGER IMPLEMENTATION DEPLOYMENT ===
        agglayerGERImpl = new AgglayerGER(Constants.ROLLUP_MANAGER_ADDRESS, Constants.BRIDGE_ADDRESS);

        // === AGGLAYERGER PROXY DEPLOYMENT ===
        bytes memory initData = abi.encodeCall(AgglayerGER.initialize, ());
        agglayerGER = AgglayerGER(_proxify(address(agglayerGERImpl), address(proxyAdmin), initData));

        return agglayerGER;
    }

    /**
     * @dev Deploy AgglayerGateway contract via OpenZeppelin upgradeable proxy
     * This mirrors the actual production deployment pattern with proper proxy and admin roles
     */
    function deployAgglayerGateway() public returns (AgglayerGateway) {
        // === AGGLAYERGATEWAY IMPLEMENTATION DEPLOYMENT ===
        agglayerGatewayImpl = new AgglayerGateway();

        // === AGGLAYERGATEWAY PROXY DEPLOYMENT ===
        // @todo Add proper initialization data
        bytes memory initData = "";
        agglayerGateway = AgglayerGateway(_proxify(address(agglayerGatewayImpl), address(proxyAdmin), initData));

        return agglayerGateway;
    }

    /**
     * @dev Deploy AgglayerManager contract via OpenZeppelin upgradeable proxy
     * This mirrors the actual production deployment pattern with proper proxy and admin roles
     */
    function deployAgglayerManager() public returns (AgglayerManager) {
        // === AGGLAYERMANAGER IMPLEMENTATION DEPLOYMENT ===
        agglayerManagerImpl = new AgglayerManager(
            IAgglayerGER(Constants.GER_MANAGER_ADDRESS),
            IERC20Upgradeable(Constants.POL_TOKEN_ADDRESS),
            IPolygonZkEVMBridge(Constants.BRIDGE_ADDRESS),
            IAgglayerGateway(Constants.AGGLAYER_GATEWAY_ADDRESS)
        );

        // === AGGLAYERMANAGER PROXY DEPLOYMENT ===
        bytes memory initData = abi.encodeCall(AgglayerManager.initialize, ());
        agglayerManager = AgglayerManager(_proxify(address(agglayerManagerImpl), address(proxyAdmin), initData));

        return agglayerManager;
    }

    /**
     * @dev Deploy AggchainFEP implementation contract
     * @return The deployed AggchainFEP contract
     */
    function deployAggchainFEP() public returns (AggchainFEP) {
        // === AGGCHAINFEP IMPLEMENTATION DEPLOYMENT ===
        vm.prank(owner);
        aggchainFEPImpl = new AggchainFEP(
            IAgglayerGER(Constants.GER_MANAGER_ADDRESS),
            IERC20Upgradeable(Constants.POL_TOKEN_ADDRESS),
            IAgglayerBridge(Constants.BRIDGE_ADDRESS),
            AgglayerManager(Constants.ROLLUP_MANAGER_ADDRESS),
            IAgglayerGateway(Constants.AGGLAYER_GATEWAY_ADDRESS)
        );
        return aggchainFEPImpl;
    }

    /**
     * @dev Deploy AggchainECDSAMultisig implementation contract
     * @return The deployed AggchainECDSAMultisig contract
     */
    function deployAggchainECDSA() public returns (AggchainECDSAMultisig) {
        // === AGGCHAINECDSAMULTISIG IMPLEMENTATION DEPLOYMENT ===
        vm.prank(owner);
        aggchainECDSAImpl = new AggchainECDSAMultisig(
            IAgglayerGER(Constants.GER_MANAGER_ADDRESS),
            IERC20Upgradeable(Constants.POL_TOKEN_ADDRESS),
            IAgglayerBridge(Constants.BRIDGE_ADDRESS),
            AgglayerManager(Constants.ROLLUP_MANAGER_ADDRESS),
            IAgglayerGateway(Constants.AGGLAYER_GATEWAY_ADDRESS)
        );
        return aggchainECDSAImpl;
    }

    /**
     * @dev Etch PolygonZkEVMDeployer bytecode from Hardhat artifacts
     * @param _owner The owner address for the deployer
     * @return deployerAddress The address where the deployer was etched
     */
    function _etchPolygonZkEVMDeployer(address _owner) internal returns (address) {
        // Read the deployedBytecode from Hardhat artifacts
        string memory artifact = vm.readFile(POLYGON_ZKEVM_DEPLOYER_ARTIFACT_PATH);
        bytes memory deployedBytecode = vm.parseJsonBytes(artifact, ".deployedBytecode");

        // Generate a deterministic address for the deployer
        address deployerAddress = makeAddr("PolygonZkEVMDeployer");

        // Etch the bytecode at the address
        vm.etch(deployerAddress, deployedBytecode);

        // Set the owner storage slot (slot 0 in Ownable)
        vm.store(deployerAddress, bytes32(uint256(0)), bytes32(uint256(uint160(_owner))));

        return deployerAddress;
    }

    /**
     * @dev Etch AgglayerTimelock bytecode from Hardhat artifacts with immutable replacement
     * @param _minDelay Minimum delay for timelock operations
     * @param _proposers Array of proposer addresses
     * @param _executors Array of executor addresses
     * @param _agglayerManagerAddr The agglayer manager contract (used for emergency state)
     * @return timelockAddress The address where the timelock was etched
     */
    function _etchAgglayerTimelock(
        uint256 _minDelay,
        address[] memory _proposers,
        address[] memory _executors,
        address _agglayerManagerAddr
    ) internal returns (address) {
        // Read the deployedBytecode from Hardhat artifacts
        string memory artifact = vm.readFile(AGGLAYER_TIMELOCK_ARTIFACT_PATH);
        bytes memory deployedBytecode = vm.parseJsonBytes(artifact, ".deployedBytecode");

        // Replace the immutable agglayerManager placeholder with the actual address
        // The immutable is stored as PUSH32 with 12 bytes padding + 20 bytes address
        // Pattern: 7f + 000000000000000000000000 (12 bytes) + 00000000000000000000000000000000000000000000 (20 bytes)
        bytes memory modifiedBytecode = _replaceImmutableInPush32(deployedBytecode, _agglayerManagerAddr);

        // Generate a deterministic address for the timelock
        address timelockAddress = makeAddr("AgglayerTimelock");

        // Etch the modified bytecode at the address
        vm.etch(timelockAddress, modifiedBytecode);

        // Set up storage for timelock state
        _setupTimelockStorage(timelockAddress, _minDelay, _proposers, _executors);

        // Test whether the addresses are set properly or not
        bytes memory result;
        (, result) = timelockAddress.call(abi.encodeWithSignature("agglayerManager()"));
        address agglayerManagerAddr = abi.decode(result, (address));
        require(agglayerManagerAddr == _agglayerManagerAddr, "AgglayerTimelock: Agglayer Manager replacement failed");

        (, result) = timelockAddress.call(abi.encodeWithSignature("getMinDelay()"));
        uint256 actualMinDelay = abi.decode(result, (uint256));
        require(actualMinDelay == _minDelay, "AgglayerTimelock: MinDelay not set correctly");

        bytes32 proposerRole = keccak256("PROPOSER_ROLE");
        for (uint256 i = 0; i < _proposers.length; i++) {
            (, result) =
                timelockAddress.call(abi.encodeWithSignature("hasRole(bytes32,address)", proposerRole, _proposers[i]));
            bool hasProposerRole = abi.decode(result, (bool));
            require(hasProposerRole, "AgglayerTimelock: Proposer role not set correctly");
        }

        bytes32 executorRole = keccak256("EXECUTOR_ROLE");
        for (uint256 i = 0; i < _executors.length; i++) {
            (, result) =
                timelockAddress.call(abi.encodeWithSignature("hasRole(bytes32,address)", executorRole, _executors[i]));
            bool hasExecutorRole = abi.decode(result, (bool));
            require(hasExecutorRole, "AgglayerTimelock: Executor role not set correctly");
        }

        return timelockAddress;
    }

    /**
     * @dev Setup storage for AgglayerTimelock after etching bytecode
     * This replicates what the TimelockController constructor does
     * @param _timelockAddress The address where timelock was etched
     * @param _minDelay Minimum delay for timelock operations
     * @param _proposers Array of proposer addresses
     * @param _executors Array of executor addresses
     */
    function _setupTimelockStorage(
        address _timelockAddress,
        uint256 _minDelay,
        address[] memory _proposers,
        address[] memory _executors
    ) internal {
        // Role constants from OpenZeppelin TimelockController
        bytes32 timelockAdminRole = keccak256("TIMELOCK_ADMIN_ROLE");
        bytes32 proposerRole = keccak256("PROPOSER_ROLE");
        bytes32 executorRole = keccak256("EXECUTOR_ROLE");
        bytes32 cancellerRole = keccak256("CANCELLER_ROLE");

        // 1. Give timelock self-administration (constructor calls _setupRole(TIMELOCK_ADMIN_ROLE, address(this)))
        _grantRoleStorage(_timelockAddress, timelockAdminRole, _timelockAddress);

        // 2. Grant proposer and canceller roles to proposers
        for (uint256 i = 0; i < _proposers.length; i++) {
            _grantRoleStorage(_timelockAddress, proposerRole, _proposers[i]);
            _grantRoleStorage(_timelockAddress, cancellerRole, _proposers[i]);
        }

        // 3. Grant executor role to executor
        for (uint256 i = 0; i < _executors.length; i++) {
            _grantRoleStorage(_timelockAddress, executorRole, _executors[i]);
        }

        // 4. Set minDelay in storage slot 2
        vm.store(_timelockAddress, bytes32(uint256(2)), bytes32(_minDelay));
    }

    /**
     * @dev Grant a role to an account by setting storage directly
     * @param _contract The contract address
     * @param _role The role hash
     * @param _account The account to grant the role to
     */
    function _grantRoleStorage(address _contract, bytes32 _role, address _account) internal {
        // Calculate storage position: keccak256(abi.encode(role, slot)) for the RoleData struct
        bytes32 roleDataSlot = keccak256(abi.encode(_role, uint256(0)));

        // Calculate storage position for account: keccak256(abi.encode(account, roleDataSlot))
        bytes32 accountSlot = keccak256(abi.encode(_account, roleDataSlot));

        // Set the account as having the role (true = 0x01)
        vm.store(_contract, accountSlot, bytes32(uint256(1)));
    }

    /**
     * @dev Replace an immutable address in a PUSH32 instruction
     * Solidity immutables for addresses are stored as PUSH32 with 12 bytes padding
     * @param _bytecode The original bytecode
     * @param _actual The actual address to set
     * @return The modified bytecode
     */
    function _replaceImmutableInPush32(bytes memory _bytecode, address _actual) internal pure returns (bytes memory) {
        // Pattern to search for: PUSH32 (0x7f) + 12 zero bytes + 20 zero bytes (address)
        bytes memory searchPattern = abi.encodePacked(
            bytes1(0x7f), // PUSH32 opcode
            bytes12(0), // 12 bytes padding
            bytes20(0) // 20 bytes zero address (placeholder)
        );

        // Replacement: PUSH32 (0x7f) + 12 zero bytes + actual address
        bytes memory replacement = abi.encodePacked(
            bytes1(0x7f), // PUSH32 opcode
            bytes12(0), // 12 bytes padding
            bytes20(uint160(_actual)) // 20 bytes actual address
        );

        // Search for the pattern (33 bytes: 1 + 12 + 20)
        for (uint256 i = 0; i <= _bytecode.length - 33; i++) {
            bool isMatch = true;
            for (uint256 j = 0; j < 33; j++) {
                if (_bytecode[i + j] != searchPattern[j]) {
                    isMatch = false;
                    break;
                }
            }

            if (isMatch) {
                // Replace the pattern with the actual address
                for (uint256 j = 0; j < 33; j++) {
                    _bytecode[i + j] = replacement[j];
                }
                // Continue searching for more occurrences (immutable might appear multiple times)
            }
        }

        return _bytecode;
    }

    /// @notice Create and deploy a proxy contract
    /// @param _implementation The implementation contract address
    /// @param _admin The proxy admin address
    /// @param _data The initialization data
    /// @return The deployed proxy address
    function _proxify(address _implementation, address _admin, bytes memory _data) internal returns (address) {
        TransparentUpgradeableProxy proxy = new TransparentUpgradeableProxy(_implementation, _admin, _data);
        return address(proxy);
    }
}
