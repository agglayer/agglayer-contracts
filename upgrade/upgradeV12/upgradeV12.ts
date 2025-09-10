/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');
import fs = require('fs');
import { utils } from 'ffjavascript';
import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { logger } from '../../src/logger';
import { PolygonRollupManager, PolygonZkEVMBridgeV2 } from '../../typechain-types';
import { genTimelockOperation, decodeScheduleData, trackVerification } from '../utils';
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters } from '../../src/utils';
import { addInfoOutput } from '../../tools/utils';
import { GENESIS_CONTRACT_NAMES } from '../../src/utils-common-aggchain';
import * as upgradeParameters from './upgrade_parameters.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pathOutputJson = path.join(__dirname, './upgrade_output.json');

async function main() {
    // Check for unsafe mode from parameters
    const isUnsafeMode = (upgradeParameters as any).unsafeMode || false;
    if (isUnsafeMode) {
        logger.warn('⚠️  UNSAFE MODE ENABLED: criticalTooling checks disabled');
    }

    let outputJson = {};
    // Add git info using addInfoOutput with criticalTooling flag
    outputJson = addInfoOutput(outputJson, !isUnsafeMode);

    // Initialize verification tracking
    const verification: Record<string, any> = {};

    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryUpgradeParameters = [
        'rollupManagerAddress',
        'timelockDelay',
        'tagSCPreviousVersion',
        'initializeAgglayerGateway',
    ];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);

    const { rollupManagerAddress, timelockDelay, tagSCPreviousVersion, initializeAgglayerGateway } = upgradeParameters;
    const salt = (upgradeParameters as any).timelockSalt || ethers.ZeroHash;

    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(upgradeParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, upgradeParameters, ethers);
    logger.info(`deploying implementation with: ${deployer.address}`);

    // Get proxy admin
    const proxyAdmin = await upgrades.admin.getInstance();

    // Load onchain parameters from rollupManager contract
    const rollupManagerFactory = await ethers.getContractFactory('PolygonRollupManager');
    const rollupManagerContract = rollupManagerFactory.attach(rollupManagerAddress) as PolygonRollupManager;

    const globalExitRootV2Address = await rollupManagerContract.globalExitRootManager();
    const polAddress = await rollupManagerContract.pol();
    const bridgeV2Address = await rollupManagerContract.bridgeAddress();
    const aggLayerGatewayAddress = await rollupManagerContract.aggLayerGateway();

    logger.info(`Addresses obtained from rollupManager:`);
    logger.info(`- Bridge V2: ${bridgeV2Address}`);
    logger.info(`- Global Exit Root V2: ${globalExitRootV2Address}`);
    logger.info(`- AggLayer Gateway: ${aggLayerGatewayAddress}`);

    // Assert correct admin for all contracts
    expect(await upgrades.erc1967.getAdminAddress(rollupManagerAddress as string)).to.be.equal(proxyAdmin.target);
    expect(await upgrades.erc1967.getAdminAddress(aggLayerGatewayAddress as string)).to.be.equal(proxyAdmin.target);
    expect(await upgrades.erc1967.getAdminAddress(bridgeV2Address as string)).to.be.equal(proxyAdmin.target);
    expect(await upgrades.erc1967.getAdminAddress(globalExitRootV2Address as string)).to.be.equal(proxyAdmin.target);

    // Validate AggLayerGateway initialization parameters
    logger.info('Validating AggLayerGateway initialization parameters...');

    // Check multisigRole is not zero address
    if (initializeAgglayerGateway.multisigRole === ethers.ZeroAddress) {
        throw new Error('MultisigRole cannot be zero address');
    }

    // Check signersToAdd array
    const { signersToAdd } = initializeAgglayerGateway;
    if (!Array.isArray(signersToAdd)) {
        throw new Error('signersToAdd must be an array');
    }

    // Validate each signer object
    for (let i = 0; i < signersToAdd.length; i++) {
        const signer = signersToAdd[i];

        // Check that signer is an object with required properties
        if (!signer || typeof signer !== 'object') {
            throw new Error(`Signer at index ${i} must be an object with addr and url properties`);
        }

        if (!signer.addr || !signer.url) {
            throw new Error(`Signer at index ${i} must have both addr and url properties`);
        }

        // Validate address
        if (signer.addr === ethers.ZeroAddress) {
            throw new Error(`Signer at index ${i} cannot have zero address`);
        }
        if (!ethers.isAddress(signer.addr)) {
            throw new Error(`Invalid address format for signer at index ${i}: ${signer.addr}`);
        }

        // Validate URL
        if (typeof signer.url !== 'string' || signer.url.trim().length === 0) {
            throw new Error(`Signer at index ${i} must have a non-empty URL string`);
        }

        // Check for duplicate signers
        for (let j = i + 1; j < signersToAdd.length; j++) {
            if (signersToAdd[j].addr && signer.addr.toLowerCase() === signersToAdd[j].addr.toLowerCase()) {
                throw new Error(`Duplicate signer address found: ${signer.addr}`);
            }
        }
    }

    // Check threshold constraints
    const { newThreshold } = initializeAgglayerGateway;
    if (newThreshold > signersToAdd.length) {
        throw new Error(
            `Threshold (${newThreshold}) cannot be greater than number of signers (${signersToAdd.length})`,
        );
    }
    if (signersToAdd.length > 0 && newThreshold === 0) {
        throw new Error('Threshold cannot be zero when signers are present');
    }
    if (signersToAdd.length > 255) {
        // MAX_AGGCHAIN_SIGNERS = 255
        throw new Error(`Number of signers (${signersToAdd.length}) exceeds maximum allowed (255)`);
    }

    logger.info(`✓ Validation passed: ${signersToAdd.length} signers, threshold: ${newThreshold}`);

    const timelockAddress = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);

    // prepare upgrades

    // 1. Upgrade Rollup Manager
    logger.info('Preparing Rollup Manager upgrade...');
    const newRollupManagerFactory = await ethers.getContractFactory('PolygonRollupManager', deployer);

    const implRollupManager = await upgrades.prepareUpgrade(rollupManagerAddress, newRollupManagerFactory, {
        constructorArgs: [globalExitRootV2Address, polAddress, bridgeV2Address, aggLayerGatewayAddress],
        unsafeAllow: ['constructor'],
    });

    logger.info('#######################\n');
    logger.info(`Polygon rollup manager implementation deployed at: ${implRollupManager}`);

    verification[GENESIS_CONTRACT_NAMES.ROLLUP_MANAGER_IMPLEMENTATION] = await trackVerification(
        GENESIS_CONTRACT_NAMES.ROLLUP_MANAGER_IMPLEMENTATION,
        implRollupManager as string,
        [globalExitRootV2Address, polAddress, bridgeV2Address, aggLayerGatewayAddress],
    );

    // 2. Upgrade AggLayer Gateway
    logger.info('Preparing AggLayer Gateway upgrade...');
    const aggLayerGatewayUpgradeFactory = await ethers.getContractFactory('AggLayerGateway', deployer);

    const implAggLayerGateway = await upgrades.prepareUpgrade(aggLayerGatewayAddress, aggLayerGatewayUpgradeFactory, {
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
    });

    logger.info('#######################\n');
    logger.info(`AggLayer Gateway implementation deployed at: ${implAggLayerGateway}`);

    verification[GENESIS_CONTRACT_NAMES.AGGLAYER_GATEWAY_IMPLEMENTATION] = await trackVerification(
        GENESIS_CONTRACT_NAMES.AGGLAYER_GATEWAY_IMPLEMENTATION,
        implAggLayerGateway as string,
        [],
    );

    // 3. Upgrade Bridge V2
    logger.info('Preparing Bridge V2 upgrade...');
    const bridgeFactory = await ethers.getContractFactory('PolygonZkEVMBridgeV2', deployer);

    const implBridge = (await upgrades.prepareUpgrade(bridgeV2Address, bridgeFactory, {
        unsafeAllow: ['constructor', 'missing-initializer', 'missing-initializer-call'],
    })) as string;

    logger.info('#######################\n');
    logger.info(`Polygon bridge implementation deployed at: ${implBridge}`);

    verification[GENESIS_CONTRACT_NAMES.BRIDGE_V2] = await trackVerification(
        GENESIS_CONTRACT_NAMES.BRIDGE_V2,
        implBridge,
        [],
    );

    // Verify bridge-related contracts
    const bridgeContract = bridgeFactory.attach(implBridge) as PolygonZkEVMBridgeV2;
    const bytecodeStorerAddress = await bridgeContract.wrappedTokenBytecodeStorer();
    verification[GENESIS_CONTRACT_NAMES.BYTECODE_STORER] = await trackVerification(
        GENESIS_CONTRACT_NAMES.BYTECODE_STORER,
        bytecodeStorerAddress,
        [],
    );
    logger.info('#######################\n');
    logger.info(`wrappedTokenBytecodeStorer deployed at: ${bytecodeStorerAddress}`);

    const wrappedTokenBridgeImplementationAddress = await bridgeContract.getWrappedTokenBridgeImplementation();
    verification[GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION] = await trackVerification(
        GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION,
        wrappedTokenBridgeImplementationAddress,
        [],
    );
    logger.info('#######################\n');
    logger.info(`wrappedTokenBridge Implementation deployed at: ${wrappedTokenBridgeImplementationAddress}`);

    const bridgeLibAddress = await bridgeContract.bridgeLib();
    verification[GENESIS_CONTRACT_NAMES.BRIDGE_LIB] = await trackVerification(
        GENESIS_CONTRACT_NAMES.BRIDGE_LIB,
        bridgeLibAddress,
        [],
    );
    logger.info('#######################\n');
    logger.info(`BridgeLib deployed at: ${bridgeLibAddress}`);

    // 4. Upgrade Global Exit Root V2
    logger.info('Preparing Global Exit Root V2 upgrade...');
    const globalExitRootManagerFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRootV2', deployer);

    const globalExitRootManagerImp = await upgrades.prepareUpgrade(
        globalExitRootV2Address,
        globalExitRootManagerFactory,
        {
            constructorArgs: [rollupManagerAddress, bridgeV2Address],
            unsafeAllow: ['constructor', 'missing-initializer'],
        },
    );

    logger.info('#######################\n');
    logger.info(`Polygon global exit root manager implementation deployed at: ${globalExitRootManagerImp}`);

    verification[GENESIS_CONTRACT_NAMES.GER_IMPLEMENTATION] = await trackVerification(
        GENESIS_CONTRACT_NAMES.GER_IMPLEMENTATION,
        globalExitRootManagerImp as string,
        [rollupManagerAddress, bridgeV2Address],
    );

    // Create timelock operations
    logger.info('Creating timelock operations...');

    const operationRollupManager = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgrade', [rollupManagerAddress, implRollupManager]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );

    // Prepare AggLayerGateway initialize call data
    const aggLayerGatewayFactory = await ethers.getContractFactory('AggLayerGateway', deployer);
    const initializeCallData = aggLayerGatewayFactory.interface.encodeFunctionData(
        'initialize(address,(address,string)[],uint256)',
        [
            initializeAgglayerGateway.multisigRole,
            signersToAdd, // signersToAdd is already in SignerInfo format
            initializeAgglayerGateway.newThreshold,
        ],
    );

    const operationAggLayerGateway = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
            aggLayerGatewayAddress,
            implAggLayerGateway,
            initializeCallData,
        ]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );

    const operationBridge = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgrade', [bridgeV2Address, implBridge]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );

    const operationGlobalExitRoot = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgrade', [globalExitRootV2Address, globalExitRootManagerImp]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData('scheduleBatch', [
        [
            operationRollupManager.target,
            operationAggLayerGateway.target,
            operationBridge.target,
            operationGlobalExitRoot.target,
        ],
        [
            operationRollupManager.value,
            operationAggLayerGateway.value,
            operationBridge.value,
            operationGlobalExitRoot.value,
        ],
        [
            operationRollupManager.data,
            operationAggLayerGateway.data,
            operationBridge.data,
            operationGlobalExitRoot.data,
        ],
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData('executeBatch', [
        [
            operationRollupManager.target,
            operationAggLayerGateway.target,
            operationBridge.target,
            operationGlobalExitRoot.target,
        ],
        [
            operationRollupManager.value,
            operationAggLayerGateway.value,
            operationBridge.value,
            operationGlobalExitRoot.value,
        ],
        [
            operationRollupManager.data,
            operationAggLayerGateway.data,
            operationBridge.data,
            operationGlobalExitRoot.data,
        ],
        ethers.ZeroHash, // predecessor
        salt, // salt
    ]);

    logger.info({ scheduleData });
    logger.info({ executeData });

    // Get current block number, used in the shadow fork tests
    const blockNumber = await ethers.provider.getBlockNumber();
    outputJson = {
        tagSCPreviousVersion,
        scheduleData,
        executeData,
        timelockContractAddress: timelockAddress,
        implementationDeployBlockNumber: blockNumber,
        inputs: {
            rollupManagerAddress,
            aggLayerGatewayAddress,
            bridgeV2Address,
            globalExitRootV2Address,
            timelockDelay,
            salt,
        },
    };

    // Decode the scheduleData for better readability
    const objectDecoded = await decodeScheduleData(scheduleData, proxyAdmin);
    (outputJson as any).decodedScheduleData = objectDecoded;

    (outputJson as any).deployedContracts = {
        rollupManagerImplementation: implRollupManager,
        aggLayerGatewayImplementation: implAggLayerGateway,
        bridgeImplementation: implBridge,
        globalExitRootManagerImplementation: globalExitRootManagerImp,
        wrappedTokenBytecodeStorer: bytecodeStorerAddress,
        wrappedTokenBridgeImplementation: wrappedTokenBridgeImplementationAddress,
        bridgeLib: bridgeLibAddress,
    };

    // Add verification results
    (outputJson as any).verification = verification;

    fs.writeFileSync(pathOutputJson, JSON.stringify(utils.stringifyBigInts(outputJson), null, 2));
    logger.info(`Output saved to: ${pathOutputJson}`);
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});
