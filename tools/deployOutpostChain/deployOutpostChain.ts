/* eslint-disable @typescript-eslint/no-use-before-define */
// SPDX-License-Identifier: AGPL-3.0
/**
 * Deploy Outpost Chain - Standard Deployment Script
 *
 * This script deploys all necessary contracts for an outpost chain using standard deployments.
 * No CREATE3 is used, making the deployment process much simpler and straightforward.
 */

import { ethers } from 'hardhat';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';
import { getDeployerFromParameters, getProviderAdjustingMultiplierGas, checkParams } from '../../src/utils';
import { logger } from '../../src/logger';

import deployParameters from './deploy_parameters.json';

// Load .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/**
 * Main deployment function
 */
async function main() {
    logger.info('🚀 Starting Outpost Chain deployment...');

    // Step 0: Validate parameters
    validateDeploymentParameters();

    // Setup provider and deployer
    const currentProvider = getProviderAdjustingMultiplierGas(deployParameters, ethers);
    const deployer = await getDeployerFromParameters(currentProvider, deployParameters, ethers);

    // Initialize output
    const outputJson: any = {};

    logger.info(`Deploying with address: ${deployer.address}`);
    logger.info(`Network: ${deployParameters.network.networkName} (Chain ID: ${deployParameters.network.chainID})`);
    logger.info(`Rollup ID: ${deployParameters.network.rollupID}`);

    // Log automatically calculated parameters
    const calculatedGasTokenAddress = deriveGasTokenAddress(deployParameters.network.rollupID);
    logger.info(`🤖 Auto-calculated gas token address: ${calculatedGasTokenAddress}`);
    logger.info(`🤖 Auto-calculated gas token network: ${deployParameters.network.chainID} (using chainID)`);
    logger.info(`🤖 Auto-calculated proxied tokens manager: timelock address (set during deployment)`);

    // Step 1: Deploy Timelock
    logger.info('\n=== Step 1: Deploying TimelockController (OpenZeppelin) ===');
    const timelock = await deployTimelock(deployer);
    outputJson.timelockAddress = timelock.target;

    // Step 2: Deploy ProxyAdmin with Timelock as owner
    logger.info('\n=== Step 2: Deploying ProxyAdmin with Timelock as owner ===');
    const proxyAdmin = await deployProxyAdmin(timelock.target as string, deployer);
    outputJson.proxyAdminAddress = proxyAdmin.target;

    // Step 3: Pre-calculate Bridge proxy address for GER Manager deployment
    logger.info('\n=== Step 3: Pre-calculating Bridge proxy address ===');
    const currentNonce = await deployer.getNonce();

    // Calculate the address where Bridge proxy will be deployed
    // Manual deployment order: GER impl (nonce+0), GER proxy (nonce+1), Bridge impl (nonce+2), Bridge proxy (nonce+3)
    const precalculatedBridgeAddress = ethers.getCreateAddress({
        from: deployer.address,
        nonce: currentNonce + 3, // Bridge proxy will be deployed at nonce+3
    });

    logger.info(`📍 Pre-calculated Bridge proxy address: ${precalculatedBridgeAddress}`);
    logger.info(`👤 Deployer address: ${deployer.address}`);
    logger.info(`🔢 Current nonce: ${currentNonce}`);

    // Step 4: Deploy GlobalExitRootManagerL2SovereignChain with pre-calculated Bridge address
    logger.info('\n=== Step 4: Deploying GlobalExitRootManagerL2SovereignChain ===');
    const gerManager = await deployGlobalExitRootManagerL2SovereignChain(
        precalculatedBridgeAddress, // Use pre-calculated Bridge address
        proxyAdmin, // Pass the centralized ProxyAdmin
        deployer,
    );
    outputJson.globalExitRootManagerL2SovereignChainAddress = gerManager.proxy;
    outputJson.globalExitRootManagerL2SovereignChainImplementation = gerManager.implementation;

    // Step 5: Deploy BridgeL2SovereignChain with GER Manager address
    logger.info('\n=== Step 5: Deploying BridgeL2SovereignChain ===');
    const sovereignBridge = await deployBridgeL2SovereignChain(
        gerManager.proxy, // Use actual GER Manager address
        proxyAdmin, // Use centralized ProxyAdmin
        deployer,
    );
    outputJson.bridgeL2SovereignChainAddress = sovereignBridge.proxy;
    outputJson.bridgeL2SovereignChainImplementation = sovereignBridge.implementation;
    outputJson.wrappedTokenBytecodeStorer = sovereignBridge.wrappedTokenBytecodeStorer;
    outputJson.wrappedTokenBridgeImplementation = sovereignBridge.wrappedTokenBridgeImplementation;
    outputJson.bridgeLib = sovereignBridge.bridgeLib;
    outputJson.WETH = sovereignBridge.WETH;

    // Step 5.1: Verify that actual Bridge address matches pre-calculated address
    logger.info('\n=== Step 5.1: Verifying address prediction ===');
    if (sovereignBridge.proxy !== precalculatedBridgeAddress) {
        const error = `❌ Address mismatch! Pre-calculated: ${precalculatedBridgeAddress}, Actual: ${sovereignBridge.proxy}`;
        logger.error(error);
        throw new Error(error);
    }
    logger.info(`✅ Address prediction successful! Bridge deployed at expected address: ${sovereignBridge.proxy}`);

    // Step 6: Run basic verification
    logger.info('\n=== Step 6: Running verification ===');
    await runBasicVerification(deployParameters, outputJson);

    // Step 7: Generate final output
    logger.info('\n=== Step 7: Generating deployment output ===');
    const finalOutput = generateFinalOutput(outputJson, deployParameters);

    const now = new Date();
    const currentDate = now.toISOString().split('T')[0]; // YYYY-MM-DD
    const currentTime = now.toTimeString().split(' ')[0].replace(/:/g, '-'); // HH-MM-SS
    const outputPath = path.join(__dirname, `deploy_output_${currentDate}_${currentTime}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(finalOutput, null, 2));
    logger.info(`✅ Deployment output saved to: ${outputPath}`);
}

/**
 * Validate deployment parameters using enhanced checkParams utility
 */
function validateDeploymentParameters() {
    const mandatoryParams = [
        'network.chainID',
        'network.rollupID',
        'network.networkName',
        'network.tokenName',
        'network.tokenSymbol',
        'network.tokenDecimals',
        'timelock.timelockDelay',
        'timelock.timelockAdminAddress',
        'bridge.bridgeManager',
        'bridge.emergencyBridgePauser',
        'bridge.emergencyBridgeUnpauser',
        'globalExitRoot.globalExitRootUpdater',
    ];

    // Use enhanced checkParams from utils with address validation
    checkParams(deployParameters, mandatoryParams, true);

    logger.info('✅ All mandatory parameters validated');
}

/**
 * Derive gas token address from rollup ID by repeating it 5 times to get 160 bits
 */
function deriveGasTokenAddress(rollupID: number): string {
    // Convert rollupID to 32-bit hex (8 characters)
    const rollupHex = rollupID.toString(16).padStart(8, '0').toLowerCase();

    // Repeat 5 times to get 160 bits (40 hex characters = 20 bytes)
    const addressHex = rollupHex.repeat(5);
    const address = `0x${addressHex}`;

    return address;
}

/**
 * Deploy ProxyAdmin contract with timelock as initial owner
 */
async function deployProxyAdmin(timelockAddress: string, deployer: any): Promise<any> {
    const ProxyAdminFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
        deployer,
    );
    const proxyAdmin = await ProxyAdminFactory.deploy(timelockAddress);
    await proxyAdmin.waitForDeployment();

    logger.info(`✅ ProxyAdmin deployed with Timelock as owner: ${proxyAdmin.target}`);
    return proxyAdmin;
}

/**
 * Deploy TimelockController contract from OpenZeppelin
 */
async function deployTimelock(deployer: any): Promise<any> {
    const TimelockFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts/governance/TimelockController.sol:TimelockController',
        deployer,
    );

    const timelock = await TimelockFactory.deploy(
        deployParameters.timelock.timelockDelay,
        [deployParameters.timelock.timelockAdminAddress],
        [deployParameters.timelock.timelockAdminAddress],
        deployParameters.timelock.timelockAdminAddress,
    );
    await timelock.waitForDeployment();

    logger.info(`✅ TimelockController (OpenZeppelin) deployed: ${timelock.target}`);
    return timelock;
}

/**
 * Deploy BridgeL2SovereignChain with proxy pattern using centralized ProxyAdmin
 */
async function deployBridgeL2SovereignChain(
    gerManagerAddress: string,
    proxyAdmin: any,
    deployer: any,
): Promise<{
    proxy: string;
    implementation: string;
    wrappedTokenBytecodeStorer: string;
    wrappedTokenBridgeImplementation: string;
    bridgeLib: string;
    WETH: string;
}> {
    const BridgeFactory = await ethers.getContractFactory('BridgeL2SovereignChain', deployer);

    // Calculate automatic parameters for outpost chain
    const gasTokenAddress = deriveGasTokenAddress(deployParameters.network.rollupID);
    const gasTokenNetwork = deployParameters.network.rollupID; // Use rollupID as gasTokenNetwork

    // Prepare initialization call data
    const gasTokenMetadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'uint8'],
        [
            deployParameters.network.tokenName,
            deployParameters.network.tokenSymbol,
            deployParameters.network.tokenDecimals,
        ],
    );

    // Step 1: Deploy implementation
    logger.info('📍 Step 1: Deploying Bridge implementation...');
    const bridgeImplementation = await BridgeFactory.deploy();
    await bridgeImplementation.waitForDeployment();
    logger.info(`✅ BridgeL2SovereignChain implementation deployed: ${bridgeImplementation.target}`);

    // Step 2: Deploy TransparentUpgradeableProxy with centralized ProxyAdmin
    logger.info('📍 Step 2: Deploying Bridge proxy with centralized ProxyAdmin...');
    const transparentProxyFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
        deployer,
    );
    /*
     * TECHNICAL EXPLANATION: Why separated deployment works vs initialization in constructor
     *
     * PROBLEM: When initializing proxy during constructor with initData parameter:
     * - TransparentUpgradeableProxy constructor calls Address.functionDelegateCall(_logic, _data)
     * - This delegatecall happens DURING proxy construction (proxy doesn't fully exist yet)
     * - BridgeL2SovereignChain.initialize() calls _deployWrappedToken()
     * - _deployWrappedToken() accesses wrappedTokenBytecodeStorer (immutable variable)
     * - During construction context, immutable variables from implementation bytecode
     *   may not be accessible correctly through delegatecall
     * - This causes CREATE2 in _deployWrappedToken() to fail with FailedProxyDeployment()
     *
     * SOLUTION: Separated deployment approach:
     * 1. Deploy proxy with empty initData ('0x') - proxy construction completes successfully
     * 2. Call initialize() separately after proxy is fully deployed
     * 3. Now delegatecall happens in clean context where immutable variables are accessible
     * 4. _deployWrappedToken() can access wrappedTokenBytecodeStorer correctly
     * 5. CREATE2 works and custom gas token initialization succeeds
     *
     * ROOT CAUSE: Context mismatch during delegatecall in proxy construction phase
     * - Storage context: proxy (under construction)
     * - Immutable variables: implementation bytecode
     * - This hybrid context causes immutable variable access issues
     *
     * WARNING: There is risk of frontrunning, that is why all initialization parameters are checked at the end of the script.
     */
    const bridgeProxy = await transparentProxyFactory.deploy(
        bridgeImplementation.target, // Implementation address
        proxyAdmin.target, // Use centralized ProxyAdmin
        '0x', // Call data for initialization (empty for separated initialization)
    );
    await bridgeProxy.waitForDeployment();
    logger.info(`✅ Bridge proxy deployed: ${bridgeProxy.target}`);

    // Step 3: Initialize separately with high gas limit
    logger.info('📍 Step 3: Initializing Bridge proxy separately...');
    const bridge = BridgeFactory.attach(bridgeProxy.target as string) as any;

    // Get timelock address from the proxyAdmin owner
    const proxyAdminContract = await ethers.getContractAt(
        '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
        proxyAdmin.target,
    );
    const timelockAddress = await proxyAdminContract.owner();

    await bridge.initialize(
        deployParameters.network.rollupID, // Rollup ID (networkID)
        gasTokenAddress, // Derived from rollupID
        gasTokenNetwork, // Uses rollupID as gasTokenNetwork
        gerManagerAddress, // GER Manager address
        ethers.ZeroAddress, // polygonRollupManager (not needed for sovereign chains)
        gasTokenMetadata,
        deployParameters.bridge.bridgeManager,
        ethers.ZeroAddress, // sovereignWETHAddress,
        false, // sovereignWETHAddressIsNotMintable,
        deployParameters.bridge.emergencyBridgePauser,
        deployParameters.bridge.emergencyBridgeUnpauser,
        timelockAddress, // proxiedTokensManager set to timelock address (governance)
        { gasLimit: 15000000 }, // High gas limit for _deployWrappedToken()
    );
    const wrappedTokenBytecodeStorer = await bridge.wrappedTokenBytecodeStorer();
    const wrappedTokenBridgeImplementation = await bridge.getWrappedTokenBridgeImplementation();
    const bridgeLib = await bridge.bridgeLib();
    const WETH = await bridge.WETHToken();

    logger.info(`✅ BridgeL2SovereignChain implementation: ${bridgeImplementation.target}`);
    logger.info(`✅ BridgeL2SovereignChain proxy (initialized): ${bridgeProxy.target}`);

    return {
        proxy: bridgeProxy.target as string,
        implementation: bridgeImplementation.target as string,
        wrappedTokenBytecodeStorer,
        wrappedTokenBridgeImplementation,
        bridgeLib,
        WETH,
    };
}

/**
 * Deploy GlobalExitRootManagerL2SovereignChain with proxy pattern using prepareUpgrade and centralized ProxyAdmin
 */
async function deployGlobalExitRootManagerL2SovereignChain(
    bridgeProxyAddress: string,
    proxyAdmin: any,
    deployer: any,
): Promise<{ proxy: string; implementation: string }> {
    const GERManagerFactory = await ethers.getContractFactory('GlobalExitRootManagerL2SovereignChain', deployer);

    // Step 1: Deploy implementation using prepareUpgrade approach
    logger.info('📍 Step 1: Deploying GER Manager implementation...');
    const gerImplementation = await GERManagerFactory.deploy(bridgeProxyAddress); // Constructor argument
    await gerImplementation.waitForDeployment();
    logger.info(`✅ GlobalExitRootManagerL2SovereignChain implementation deployed: ${gerImplementation.target}`);

    // Step 2: Prepare initialization data for atomic initialization
    logger.info('📍 Step 2: Preparing initialization data...');
    const initializeData = GERManagerFactory.interface.encodeFunctionData('initialize', [
        deployParameters.globalExitRoot.globalExitRootUpdater,
        deployParameters.globalExitRoot.globalExitRootRemover,
    ]);

    // Step 3: Deploy TransparentUpgradeableProxy with centralized ProxyAdmin and atomic initialization
    logger.info('📍 Step 3: Deploying GER Manager proxy with atomic initialization...');
    const TransparentProxyFactory = await ethers.getContractFactory(
        '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol:TransparentUpgradeableProxy',
        deployer,
    );

    const gerProxy = await TransparentProxyFactory.deploy(
        gerImplementation.target, // Implementation address
        proxyAdmin.target, // Use centralized ProxyAdmin
        initializeData, // Initialization data for atomic initialization
    );
    await gerProxy.waitForDeployment();
    logger.info(`✅ GER Manager proxy deployed with atomic initialization: ${gerProxy.target}`);

    logger.info(`✅ GlobalExitRootManagerL2SovereignChain implementation: ${gerImplementation.target}`);
    logger.info(`✅ GlobalExitRootManagerL2SovereignChain proxy (initialized): ${gerProxy.target}`);

    return {
        proxy: gerProxy.target as string,
        implementation: gerImplementation.target as string,
    };
}

/**
 * Generate final output JSON with deployment information
 */
function generateFinalOutput(outputJson: any, deployParams: any): any {
    const currentDateTime = new Date().toISOString().replace('T', ' ').split('.')[0]; // YYYY-MM-DD HH:MM:SS

    return {
        deploymentDate: currentDateTime,
        network: {
            chainID: deployParams.network.chainID,
            rollupID: deployParams.network.rollupID,
            networkName: deployParams.network.networkName,
            gasTokenAddress: deriveGasTokenAddress(deployParams.network.rollupID),
            gasTokenNetwork: deployParams.network.chainID,
        },
        contracts: outputJson,
        configuration: {
            timelockDelay: deployParams.timelock.timelockDelay,
            timelockAdmin: deployParams.timelock.timelockAdminAddress,
            bridgeManager: deployParams.bridge.bridgeManager,
            emergencyBridgePauser: deployParams.bridge.emergencyBridgePauser,
            emergencyBridgeUnpauser: deployParams.bridge.emergencyBridgeUnpauser,
            globalExitRootUpdater: deployParams.globalExitRoot.globalExitRootUpdater,
            globalExitRootRemover: deployParams.globalExitRoot.globalExitRootRemover,
        },
    };
}

/**
 * Run comprehensive verification tests on deployed contracts
 * Organized by contract for better maintainability and specificity
 */
async function runBasicVerification(deployConfig: any, outputJson: any) {
    logger.info('🧪 Running comprehensive deployment verification...');

    // Step 1: Verify ProxyAdmin Contract
    await verifyProxyAdminContract(deployConfig, outputJson);

    // Step 2: Verify Timelock Contract
    await verifyTimelockContract(deployConfig, outputJson);

    // Step 3: Verify Bridge Contract
    await verifyBridgeContract(deployConfig, outputJson);

    // Step 4: Verify GER Manager Contract
    await verifyGERManagerContract(deployConfig, outputJson);

    logger.info('✅ Comprehensive verification passed successfully!');
}

/**
 * Verify ProxyAdmin contract - address format, bytecode, ownership
 */
async function verifyProxyAdminContract(deployConfig: any, outputJson: any) {
    logger.info('🔍 Verifying ProxyAdmin contract...');

    // Verify address format and bytecode existence
    if (!ethers.isAddress(outputJson.proxyAdminAddress)) {
        throw new Error(`ProxyAdmin invalid address: ${outputJson.proxyAdminAddress}`);
    }

    const code = await ethers.provider.getCode(outputJson.proxyAdminAddress);
    if (code === '0x') {
        throw new Error(`ProxyAdmin at ${outputJson.proxyAdminAddress} has no bytecode - contract may not be deployed`);
    }
    logger.info(`✅ ProxyAdmin deployed: ${outputJson.proxyAdminAddress}`);

    // Verify ProxyAdmin configuration and ownership
    const proxyAdmin = await ethers.getContractAt(
        '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol:ProxyAdmin',
        outputJson.proxyAdminAddress,
    );

    // Verify ProxyAdmin owner is the Timelock
    const proxyAdminOwner = await proxyAdmin.owner();
    if (proxyAdminOwner.toLowerCase() !== outputJson.timelockAddress.toLowerCase()) {
        throw new Error(`ProxyAdmin owner mismatch. Expected: ${outputJson.timelockAddress}, Got: ${proxyAdminOwner}`);
    }
    logger.info(`✅ ProxyAdmin owner correctly set to Timelock: ${proxyAdminOwner}`);
}

/**
 * Verify Timelock contract - address, bytecode, configuration, roles
 */
async function verifyTimelockContract(deployConfig: any, outputJson: any) {
    logger.info('🔍 Verifying Timelock contract...');

    // Verify address format and bytecode existence
    if (!ethers.isAddress(outputJson.timelockAddress)) {
        throw new Error(`Timelock invalid address: ${outputJson.timelockAddress}`);
    }

    const code = await ethers.provider.getCode(outputJson.timelockAddress);
    if (code === '0x') {
        throw new Error(`Timelock at ${outputJson.timelockAddress} has no bytecode - contract may not be deployed`);
    }
    logger.info(`✅ Timelock deployed: ${outputJson.timelockAddress}`);

    // Verify Timelock configuration
    const timelock = await ethers.getContractAt(
        '@openzeppelin/contracts/governance/TimelockController.sol:TimelockController',
        outputJson.timelockAddress,
    );

    // Verify minimum delay
    const minDelay = await timelock.getMinDelay();
    if (minDelay !== BigInt(deployConfig.timelock.timelockDelay)) {
        throw new Error(`Timelock delay mismatch. Expected: ${deployConfig.timelock.timelockDelay}, Got: ${minDelay}`);
    }
    logger.info(`✅ Timelock minimum delay: ${minDelay}s`);

    // Verify that timelockAdminAddress has the required roles

    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const PROPOSER_ROLE = ethers.id('PROPOSER_ROLE');
    const EXECUTOR_ROLE = ethers.id('EXECUTOR_ROLE');
    const CANCELLER_ROLE = ethers.id('CANCELLER_ROLE');

    const hasAdminRole = await timelock.hasRole(DEFAULT_ADMIN_ROLE, deployConfig.timelock.timelockAdminAddress);
    const hasProposerRole = await timelock.hasRole(PROPOSER_ROLE, deployConfig.timelock.timelockAdminAddress);
    const hasExecutorRole = await timelock.hasRole(EXECUTOR_ROLE, deployConfig.timelock.timelockAdminAddress);
    const hasCancelerRole = await timelock.hasRole(CANCELLER_ROLE, deployConfig.timelock.timelockAdminAddress);

    if (!hasAdminRole) {
        throw new Error(
            `TimelockAdminAddress ${deployConfig.timelock.timelockAdminAddress} does not have DEFAULT_ADMIN_ROLE`,
        );
    }
    if (!hasProposerRole) {
        throw new Error(
            `TimelockAdminAddress ${deployConfig.timelock.timelockAdminAddress} does not have PROPOSER_ROLE`,
        );
    }
    if (!hasExecutorRole) {
        throw new Error(
            `TimelockAdminAddress ${deployConfig.timelock.timelockAdminAddress} does not have EXECUTOR_ROLE`,
        );
    }
    if (!hasCancelerRole) {
        throw new Error(
            `TimelockAdminAddress ${deployConfig.timelock.timelockAdminAddress} does not have CANCELLER_ROLE`,
        );
    }

    logger.info(`✅ TimelockAdminAddress ${deployConfig.timelock.timelockAdminAddress} has all required roles`);
}

/**
 * Verify Bridge contract - address, bytecode, initialization, configuration, immutables
 */
async function verifyBridgeContract(deployConfig: any, outputJson: any) {
    logger.info('🔍 Verifying Bridge contract...');

    // Verify proxy address format and bytecode existence
    if (!ethers.isAddress(outputJson.bridgeL2SovereignChainAddress)) {
        throw new Error(`Bridge proxy invalid address: ${outputJson.bridgeL2SovereignChainAddress}`);
    }

    const proxyCode = await ethers.provider.getCode(outputJson.bridgeL2SovereignChainAddress);
    if (proxyCode === '0x') {
        throw new Error(`Bridge proxy at ${outputJson.bridgeL2SovereignChainAddress} has no bytecode`);
    }
    logger.info(`✅ Bridge proxy deployed: ${outputJson.bridgeL2SovereignChainAddress}`);

    // Verify implementation address format and bytecode existence
    if (!ethers.isAddress(outputJson.bridgeL2SovereignChainImplementation)) {
        throw new Error(`Bridge implementation invalid address: ${outputJson.bridgeL2SovereignChainImplementation}`);
    }

    const implCode = await ethers.provider.getCode(outputJson.bridgeL2SovereignChainImplementation);
    if (implCode === '0x') {
        throw new Error(`Bridge implementation at ${outputJson.bridgeL2SovereignChainImplementation} has no bytecode`);
    }
    logger.info(`✅ Bridge implementation deployed: ${outputJson.bridgeL2SovereignChainImplementation}`);

    // Verify Bridge initialization (slot 0 for OpenZeppelin initializer)
    const initializerSlot = await ethers.provider.getStorage(outputJson.bridgeL2SovereignChainAddress, 0);
    const initializerVersion = ethers.toBigInt(initializerSlot);
    if (initializerVersion === 0n) {
        throw new Error('Bridge appears to not be initialized (initializer version is 0)');
    }
    logger.info(`✅ Bridge is initialized (version: ${initializerVersion})`);

    // Verify Bridge configuration
    const bridge = (await ethers.getContractAt(
        'BridgeL2SovereignChain',
        outputJson.bridgeL2SovereignChainAddress,
    )) as any;

    // Verify network ID
    const networkID = await bridge.networkID();
    if (Number(networkID) !== deployConfig.network.rollupID) {
        throw new Error(`Bridge networkID mismatch. Expected: ${deployConfig.network.rollupID}, Got: ${networkID}`);
    }
    logger.info(`✅ Bridge networkID: ${networkID}`);

    // Verify gas token address (derived from rollupID)
    const gasTokenAddress = await bridge.gasTokenAddress();
    const expectedGasTokenAddress = deriveGasTokenAddress(deployConfig.network.rollupID);
    if (gasTokenAddress.toLowerCase() !== expectedGasTokenAddress.toLowerCase()) {
        throw new Error(
            `Bridge gasTokenAddress mismatch. Expected: ${expectedGasTokenAddress}, Got: ${gasTokenAddress}`,
        );
    }
    logger.info(`✅ Bridge gasTokenAddress: ${gasTokenAddress} (derived from rollupID)`);

    // Verify gas token network
    const gasTokenNetwork = await bridge.gasTokenNetwork();
    if (Number(gasTokenNetwork) !== deployConfig.network.rollupID) {
        throw new Error(
            `Bridge gasTokenNetwork mismatch. Expected: ${deployConfig.network.rollupID}, Got: ${gasTokenNetwork}`,
        );
    }
    logger.info(`✅ Bridge gasTokenNetwork: ${gasTokenNetwork}`);

    // Verify gas token metadata
    const gasTokenMetadata = await bridge.gasTokenMetadata();
    const expectedMetadata = ethers.AbiCoder.defaultAbiCoder().encode(
        ['string', 'string', 'uint8'],
        [deployConfig.network.tokenName, deployConfig.network.tokenSymbol, deployConfig.network.tokenDecimals],
    );
    if (gasTokenMetadata !== expectedMetadata) {
        throw new Error(`Bridge gasTokenMetadata mismatch. Expected: ${expectedMetadata}, Got: ${gasTokenMetadata}`);
    }
    logger.info(`✅ Bridge gasTokenMetadata correctly encoded`);

    // Verify bridge manager
    const bridgeManager = await bridge.bridgeManager();
    if (bridgeManager.toLowerCase() !== deployConfig.bridge.bridgeManager.toLowerCase()) {
        throw new Error(
            `Bridge manager mismatch. Expected: ${deployConfig.bridge.bridgeManager}, Got: ${bridgeManager}`,
        );
    }
    logger.info(`✅ Bridge manager: ${bridgeManager}`);

    // Verify emergency bridge pauser
    const emergencyBridgePauser = await bridge.emergencyBridgePauser();
    if (emergencyBridgePauser.toLowerCase() !== deployConfig.bridge.emergencyBridgePauser.toLowerCase()) {
        throw new Error(
            `Emergency bridge pauser mismatch. Expected: ${deployConfig.bridge.emergencyBridgePauser}, Got: ${emergencyBridgePauser}`,
        );
    }
    logger.info(`✅ Emergency bridge pauser: ${emergencyBridgePauser}`);

    // Verify emergency bridge unpauser
    const emergencyBridgeUnpauser = await bridge.emergencyBridgeUnpauser();
    if (emergencyBridgeUnpauser.toLowerCase() !== deployConfig.bridge.emergencyBridgeUnpauser.toLowerCase()) {
        throw new Error(
            `Emergency bridge unpauser mismatch. Expected: ${deployConfig.bridge.emergencyBridgeUnpauser}, Got: ${emergencyBridgeUnpauser}`,
        );
    }
    logger.info(`✅ Emergency bridge unpauser: ${emergencyBridgeUnpauser}`);

    // Verify proxied tokens manager (should be timelock)
    const proxiedTokensManager = await bridge.proxiedTokensManager();
    if (proxiedTokensManager.toLowerCase() !== outputJson.timelockAddress.toLowerCase()) {
        throw new Error(
            `Proxied tokens manager mismatch. Expected: ${outputJson.timelockAddress}, Got: ${proxiedTokensManager}`,
        );
    }
    logger.info(`✅ Proxied tokens manager: ${proxiedTokensManager} (set to timelock)`);

    // Verify rollup manager is zero address (not used in sovereign chains)
    const rollupManager = await bridge.polygonRollupManager();
    if (rollupManager !== ethers.ZeroAddress) {
        throw new Error(`Bridge rollup manager should be zero address for sovereign chains. Got: ${rollupManager}`);
    }
    logger.info(`✅ Bridge rollup manager: ${rollupManager} (zero address for sovereign chains)`);

    // Verify Bridge points to GER Manager
    const bridgeGERManager = await bridge.globalExitRootManager();
    if (bridgeGERManager.toLowerCase() !== outputJson.globalExitRootManagerL2SovereignChainAddress.toLowerCase()) {
        throw new Error(
            `Bridge -> GER Manager dependency broken. Expected: ${outputJson.globalExitRootManagerL2SovereignChainAddress}, Got: ${bridgeGERManager}`,
        );
    }
    logger.info(`✅ Bridge -> GER Manager: ${bridgeGERManager}`);

    // Verify immutable variables and their bytecode
    const wrappedTokenBytecodeStorer = await bridge.wrappedTokenBytecodeStorer();
    if (wrappedTokenBytecodeStorer.toLowerCase() !== outputJson.wrappedTokenBytecodeStorer.toLowerCase()) {
        throw new Error(
            `Wrapped token bytecode storer mismatch. Expected: ${outputJson.wrappedTokenBytecodeStorer}, Got: ${wrappedTokenBytecodeStorer}`,
        );
    }
    // Verify bytecode exists
    const storerCode = await ethers.provider.getCode(wrappedTokenBytecodeStorer);
    if (storerCode === '0x') {
        throw new Error(`WrappedTokenBytecodeStorer at ${wrappedTokenBytecodeStorer} has no bytecode`);
    }
    logger.info(`✅ Bridge wrappedTokenBytecodeStorer: ${wrappedTokenBytecodeStorer} (bytecode confirmed)`);

    const wrappedTokenImplementation = await bridge.getWrappedTokenBridgeImplementation();
    if (wrappedTokenImplementation.toLowerCase() !== outputJson.wrappedTokenBridgeImplementation.toLowerCase()) {
        throw new Error(
            `Wrapped token implementation mismatch. Expected: ${outputJson.wrappedTokenBridgeImplementation}, Got: ${wrappedTokenImplementation}`,
        );
    }
    // Verify bytecode exists
    const implCode2 = await ethers.provider.getCode(wrappedTokenImplementation);
    if (implCode2 === '0x') {
        throw new Error(`WrappedTokenBridgeImplementation at ${wrappedTokenImplementation} has no bytecode`);
    }
    logger.info(`✅ Bridge wrappedTokenBridgeImplementation: ${wrappedTokenImplementation} (bytecode confirmed)`);

    // Verify bridgeLib
    const bridgeLib = await bridge.bridgeLib();
    if (bridgeLib.toLowerCase() !== outputJson.bridgeLib.toLowerCase()) {
        throw new Error(`Bridge library mismatch. Expected: ${outputJson.bridgeLib}, Got: ${bridgeLib}`);
    }

    // Verify WETH token was deployed
    const wethToken = await bridge.WETHToken();
    if (wethToken.toLowerCase() !== outputJson.WETH.toLowerCase()) {
        throw new Error(`WETH token mismatch. Expected: ${outputJson.WETH}, Got: ${wethToken}`);
    }
    // Verify WETH bytecode exists
    const wethCode = await ethers.provider.getCode(wethToken);
    if (wethCode === '0x') {
        throw new Error(`WETH token at ${wethToken} has no bytecode`);
    }
    logger.info(`✅ WETH token deployed: ${wethToken} (bytecode confirmed)`);

    // Verify WETH token implementation matches wrappedTokenBridgeImplementation
    const wethImplementationSlot = await ethers.provider.getStorage(
        wethToken,
        '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc', // EIP-1967 implementation slot
    );
    const wethImplementationAddress = ethers.getAddress(`0x${wethImplementationSlot.slice(-40)}`);

    if (wethImplementationAddress.toLowerCase() !== wrappedTokenImplementation.toLowerCase()) {
        throw new Error(
            `WETH implementation mismatch. Expected: ${wrappedTokenImplementation}, Got: ${wethImplementationAddress}`,
        );
    }
    logger.info(
        `✅ WETH token implementation correctly matches wrappedTokenBridgeImplementation: ${wethImplementationAddress}`,
    );

    // Verify ProxyAdmin is the admin
    const bridgeProxyAdmin = await ethers.provider.getStorage(
        outputJson.bridgeL2SovereignChainAddress,
        '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103', // EIP-1967 admin slot
    );
    const expectedAdmin = ethers.zeroPadValue(outputJson.proxyAdminAddress.toLowerCase(), 32);
    if (bridgeProxyAdmin.toLowerCase() !== expectedAdmin.toLowerCase()) {
        throw new Error(`Bridge proxy admin mismatch. Expected: ${expectedAdmin}, Got: ${bridgeProxyAdmin}`);
    }
}

/**
 * Verify GER Manager contract - address, bytecode, initialization (slot 52), configuration, immutables
 */
async function verifyGERManagerContract(deployConfig: any, outputJson: any) {
    logger.info('🔍 Verifying GER Manager contract...');

    // Verify proxy address format and bytecode existence
    if (!ethers.isAddress(outputJson.globalExitRootManagerL2SovereignChainAddress)) {
        throw new Error(
            `GER Manager proxy invalid address: ${outputJson.globalExitRootManagerL2SovereignChainAddress}`,
        );
    }

    const proxyCode = await ethers.provider.getCode(outputJson.globalExitRootManagerL2SovereignChainAddress);
    if (proxyCode === '0x') {
        throw new Error(
            `GER Manager proxy at ${outputJson.globalExitRootManagerL2SovereignChainAddress} has no bytecode`,
        );
    }
    logger.info(`✅ GER Manager proxy deployed: ${outputJson.globalExitRootManagerL2SovereignChainAddress}`);

    // Verify implementation address format and bytecode existence
    if (!ethers.isAddress(outputJson.globalExitRootManagerL2SovereignChainImplementation)) {
        throw new Error(
            `GER Manager implementation invalid address: ${outputJson.globalExitRootManagerL2SovereignChainImplementation}`,
        );
    }

    const implCode = await ethers.provider.getCode(outputJson.globalExitRootManagerL2SovereignChainImplementation);
    if (implCode === '0x') {
        throw new Error(
            `GER Manager implementation at ${outputJson.globalExitRootManagerL2SovereignChainImplementation} has no bytecode`,
        );
    }
    logger.info(
        `✅ GER Manager implementation deployed: ${outputJson.globalExitRootManagerL2SovereignChainImplementation}`,
    );

    // Verify GER Manager initialization (slot 52 for this specific contract)
    const initializerSlot = await ethers.provider.getStorage(
        outputJson.globalExitRootManagerL2SovereignChainAddress,
        52,
    );
    if (initializerSlot.endsWith('0000')) {
        throw new Error('GER Manager appears to not be initialized (initializer version in slot 52 is 0)');
    }
    logger.info(`✅ GER Manager is initialized (slot 52 version: ${initializerSlot.slice(-4)})`);

    // Verify GER Manager configuration
    const gerManager = (await ethers.getContractAt(
        'GlobalExitRootManagerL2SovereignChain',
        outputJson.globalExitRootManagerL2SovereignChainAddress,
    )) as any;

    // Verify global exit root updater
    const globalExitRootUpdater = await gerManager.globalExitRootUpdater();
    if (globalExitRootUpdater.toLowerCase() !== deployConfig.globalExitRoot.globalExitRootUpdater.toLowerCase()) {
        throw new Error(
            `GER updater mismatch. Expected: ${deployConfig.globalExitRoot.globalExitRootUpdater}, Got: ${globalExitRootUpdater}`,
        );
    }
    logger.info(`✅ GER Manager updater: ${globalExitRootUpdater}`);

    // Verify global exit root remover
    const globalExitRootRemover = await gerManager.globalExitRootRemover();
    if (globalExitRootRemover.toLowerCase() !== deployConfig.globalExitRoot.globalExitRootRemover.toLowerCase()) {
        throw new Error(
            `GER remover mismatch. Expected: ${deployConfig.globalExitRoot.globalExitRootRemover}, Got: ${globalExitRootRemover}`,
        );
    }
    logger.info(`✅ GER Manager remover: ${globalExitRootRemover}`);

    // Verify bridge address (immutable) and dependency
    const bridgeAddress = await gerManager.bridgeAddress();
    if (bridgeAddress.toLowerCase() !== outputJson.bridgeL2SovereignChainAddress.toLowerCase()) {
        throw new Error(
            `GER Manager bridge address mismatch. Expected: ${outputJson.bridgeL2SovereignChainAddress}, Got: ${bridgeAddress}`,
        );
    }
    logger.info(`✅ GER Manager -> Bridge: ${bridgeAddress}`);

    const gerProxyAdmin = await ethers.provider.getStorage(
        outputJson.globalExitRootManagerL2SovereignChainAddress,
        '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103', // EIP-1967 admin slot
    );

    const expectedAdmin = ethers.zeroPadValue(outputJson.proxyAdminAddress.toLowerCase(), 32);

    if (gerProxyAdmin.toLowerCase() !== expectedAdmin.toLowerCase()) {
        throw new Error(`GER Manager proxy admin mismatch. Expected: ${expectedAdmin}, Got: ${gerProxyAdmin}`);
    }
    logger.info(`✅ ProxyAdmin correctly manages GER Manager proxy`);
}

// Execute deployment
if (require.main === module) {
    main()
        .then(() => process.exit(0))
        .catch((error) => {
            // eslint-disable-next-line no-console
            console.log(error);
            logger.error('❌ Deployment failed:', error);
            process.exit(1);
        });
}

export { main };
