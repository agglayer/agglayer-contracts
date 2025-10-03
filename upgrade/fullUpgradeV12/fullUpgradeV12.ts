/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');
import fs = require('fs');
import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { logger } from '../../src/logger';
import { AgglayerManager, AgglayerBridge } from '../../typechain-types';
import { genTimelockOperation, decodeScheduleData, decodeScheduleBatchData, genTimelockBatchOperation } from '../utils';
import { checkParams, getProviderAdjustingMultiplierGas, getDeployerFromParameters } from '../../src/utils';
import { addInfoOutput } from '../../tools/utils';
import * as upgradeParameters from './upgrade_parameters.json';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pathOutputJson = path.join(__dirname, './upgrade_output.json');

async function main() {
    let outputJson = {};

    /*
     * Check upgrade parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryUpgradeParameters = ['rollupManagerAddress', 'initializeAgglayerGateway'];
    checkParams(upgradeParameters, mandatoryUpgradeParameters);

    const { rollupManagerAddress, initializeAgglayerGateway } = upgradeParameters;
    const salt = (upgradeParameters as any).timelockSalt || ethers.ZeroHash;

    // Load provider
    const currentProvider = getProviderAdjustingMultiplierGas(upgradeParameters, ethers);

    // Load deployer
    const deployer = await getDeployerFromParameters(currentProvider, upgradeParameters, ethers);
    logger.info(`deploying implementation with: ${deployer.address}`);

    // Load onchain parameters from rollupManager contract
    const rollupManagerFactory = await ethers.getContractFactory('AgglayerManager');
    const rollupManagerContract = rollupManagerFactory.attach(rollupManagerAddress) as AgglayerManager;

    const globalExitRootV2Address = await rollupManagerContract.globalExitRootManager();
    const polAddress = await rollupManagerContract.pol();
    const bridgeV2Address = await rollupManagerContract.bridgeAddress();
    const aggLayerGatewayAddress = await rollupManagerContract.aggLayerGateway();

    logger.info(`Addresses obtained from rollupManager:`);
    logger.info(`- Bridge V2: ${bridgeV2Address}`);
    logger.info(`- Global Exit Root V2: ${globalExitRootV2Address}`);
    logger.info(`- AggLayer Gateway: ${aggLayerGatewayAddress}`);

    const aggLayerGatewayUpgradeFactory = await ethers.getContractFactory('AgglayerGateway', deployer);
    const globalExitRootManagerFactory = await ethers.getContractFactory('AgglayerGER', deployer);
    const bridgeFactory = await ethers.getContractFactory('AgglayerBridge', deployer);
    const newRollupManagerFactory = await ethers.getContractFactory('AgglayerManager', deployer);
    const aggLayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway', deployer);

    // Force import existing proxies if requested
    const forceImport = (upgradeParameters as any).forceImport || false;
    if (forceImport) {
        logger.info('Force importing existing proxies...');

        const aggLayerGatewayPreviousFactory = await ethers.getContractFactory('AggLayerGatewayPrevious', deployer);
        const bridgePreviousFactory = await ethers.getContractFactory('PolygonZkEVMBridge', deployer);
        const globalExitRootPreviousFactory = await ethers.getContractFactory('PolygonZkEVMGlobalExitRoot', deployer);

        // AggLayerGateway has no constructor args
        await upgrades.forceImport(aggLayerGatewayAddress as string, aggLayerGatewayPreviousFactory, {
            kind: 'transparent',
        });

        // Bridge has no constructor args
        await upgrades.forceImport(bridgeV2Address as string, bridgePreviousFactory, {
            kind: 'transparent',
        });

        // // GlobalExitRoot has constructor args
        await upgrades.forceImport(globalExitRootV2Address as string, globalExitRootPreviousFactory, {
            kind: 'transparent',
            constructorArgs: [rollupManagerAddress, bridgeV2Address],
        });

        logger.info('✓ Force import completed');
    }

    // Get proxy admin
    const proxyAdmin = await upgrades.admin.getInstance();
    // Assert correct admin for all contracts
    expect(await upgrades.erc1967.getAdminAddress(rollupManagerAddress as string)).to.be.equal(proxyAdmin.target);
    expect(await upgrades.erc1967.getAdminAddress(aggLayerGatewayAddress as string)).to.be.equal(proxyAdmin.target);
    expect(await upgrades.erc1967.getAdminAddress(bridgeV2Address as string)).to.be.equal(proxyAdmin.target);
    expect(await upgrades.erc1967.getAdminAddress(globalExitRootV2Address as string)).to.be.equal(proxyAdmin.target);

    // Validate AgglayerGateway initialization parameters
    const signersToAdd = _validateAgglayerGatewayInitialization(initializeAgglayerGateway);
    const timelockAddress = await proxyAdmin.owner();

    // load timelock
    const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
    const timelockContract = await timelockContractFactory.attach(timelockAddress);

    // Determine timelock delay: use parameter if provided, otherwise use contract's min delay
    const contractMinDelay = await timelockContract.getMinDelay();
    const paramsMinDelay = upgradeParameters.timelockDelay;

    let timelockDelay;

    // Safety check: validate against expected minimum delay if provided
    if (paramsMinDelay !== undefined && paramsMinDelay !== null) {
        if (paramsMinDelay < contractMinDelay) {
            logger.error(
                `❌ Safety check failed: Timelock delay (${paramsMinDelay}s) is less than expected minimum (${contractMinDelay}s). Aborting.`,
            );
            process.exit(1);
        }

        if (paramsMinDelay > contractMinDelay) {
            logger.warn(
                `⚠️  Timelock delay (${paramsMinDelay}s) exceeds expected minimum (${contractMinDelay}s). Proceeding with higher delay.`,
            );
        }
        timelockDelay = paramsMinDelay;
    } else {
        // warn saying its the default delay
        logger.warn(`⚠️  Timelock delay (${timelockDelay}s) is the default delay.`);
        timelockDelay = contractMinDelay;
    }

    logger.info(`✓ Timelock delay set to: ${timelockDelay}s (contract min: ${contractMinDelay}s)`);
    // 1. Upgrade Rollup Manager
    logger.info('Preparing Rollup Manager upgrade...');

    const implRollupManager = await upgrades.prepareUpgrade(rollupManagerAddress, newRollupManagerFactory, {
        constructorArgs: [globalExitRootV2Address, polAddress, bridgeV2Address, aggLayerGatewayAddress],
        unsafeAllow: ['constructor'],
    });

    logger.info('#######################\n');
    logger.info(`Polygon rollup manager implementation deployed at: ${implRollupManager}`);

    // 2. Upgrade AggLayer Gateway
    logger.info('Preparing AggLayer Gateway upgrade...');

    const implAgglayerGateway = await upgrades.prepareUpgrade(aggLayerGatewayAddress, aggLayerGatewayUpgradeFactory, {
        unsafeAllow: ['missing-initializer', 'missing-initializer-call', 'constructor'],
    });

    logger.info('#######################\n');
    logger.info(`AggLayer Gateway implementation deployed at: ${implAgglayerGateway}`);

    // 3. Upgrade Bridge V2
    logger.info('Preparing Bridge V2 upgrade...');

    const implBridge = (await upgrades.prepareUpgrade(bridgeV2Address, bridgeFactory, {
        unsafeAllow: ['missing-initializer', 'missing-initializer-call', 'constructor'],
    })) as string;

    logger.info('#######################\n');
    logger.info(`Polygon bridge implementation deployed at: ${implBridge}`);

    // Verify bridge-related contracts
    const bridgeContract = bridgeFactory.attach(implBridge) as AgglayerBridge;
    const bytecodeStorerAddress = await bridgeContract.wrappedTokenBytecodeStorer();
    logger.info('#######################\n');
    logger.info(`wrappedTokenBytecodeStorer deployed at: ${bytecodeStorerAddress}`);

    const wrappedTokenBridgeImplementationAddress = await bridgeContract.getWrappedTokenBridgeImplementation();
    logger.info('#######################\n');
    logger.info(`wrappedTokenBridge Implementation deployed at: ${wrappedTokenBridgeImplementationAddress}`);

    const bridgeLibAddress = await bridgeContract.bridgeLib();

    logger.info('#######################\n');
    logger.info(`BridgeLib deployed at: ${bridgeLibAddress}`);

    // 4. Upgrade Global Exit Root V2
    logger.info('Preparing Global Exit Root V2 upgrade...');

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

    // Create timelock operations
    logger.info('Creating timelock operations...');
    const timelockOperations = [];
    const operationRollupManager = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgrade', [rollupManagerAddress, implRollupManager]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );
    timelockOperations.push(operationRollupManager);

    // Prepare AgglayerGateway initialize call data
    const initializeCallData = aggLayerGatewayFactory.interface.encodeFunctionData(
        'initialize(address,(address,string)[],uint256)',
        [
            initializeAgglayerGateway.multisigRole,
            signersToAdd, // signersToAdd is already in SignerInfo format
            initializeAgglayerGateway.newThreshold,
        ],
    );

    const operationAgglayerGateway = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgradeAndCall', [
            aggLayerGatewayAddress,
            implAgglayerGateway,
            initializeCallData,
        ]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );
    timelockOperations.push(operationAgglayerGateway);

    const operationBridge = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgrade', [bridgeV2Address, implBridge]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );
    timelockOperations.push(operationBridge);

    const operationGlobalExitRoot = genTimelockOperation(
        proxyAdmin.target,
        0, // value
        proxyAdmin.interface.encodeFunctionData('upgrade', [globalExitRootV2Address, globalExitRootManagerImp]), // data
        ethers.ZeroHash, // predecessor
        salt, // salt
    );
    timelockOperations.push(operationGlobalExitRoot);

    // Add new rollup types
    const rollupCount = await rollupManagerContract.rollupCount();

    const PPRollups = [];
    const ALgatewayRollups = [];

    const VerifierType = {
        StateTransition: 0n,
        Pessimistic: 1n,
        ALGateway: 2n,
    };

    for (let i = 1; i <= rollupCount; i++) {
        const rollupData = await rollupManagerContract.rollupIDToRollupData(i);

        const rollupObject = {
            rollupContract: rollupData.rollupContract,
            rollupID: i,
        };

        if (rollupData.rollupVerifierType === VerifierType.Pessimistic) {
            PPRollups.push(rollupObject);
        } else if (rollupData.rollupVerifierType === VerifierType.ALGateway) {
            ALgatewayRollups.push(rollupObject);
        }
    }

    // check that all ALgateway rollups are FEP

    const aggchianFEPFactory = (await ethers.getContractFactory('AggchainFEP', deployer)) as any;

    for (const rollup of ALgatewayRollups) {
        const aggchainFEPContract = await aggchianFEPFactory.attach(rollup.rollupContract as string);
        if ((await aggchainFEPContract.AGGCHAIN_TYPE()) != 1n) {
            throw new Error(`Rollup ${rollup.rollupID} is not an FEP rollup`);
        }
    }

    logger.info(
        `Total rollups: ${rollupCount}, ppRollups: ${PPRollups.length}, ALgatewayRollups: ${ALgatewayRollups.length}`,
    );

    const rollupTypeCount = await rollupManagerContract.rollupTypeCount();

    // generate transaction to add a new rollup type for new FEP implementation

    // deploy FEP implementation
    const fepImplementation = await aggchianFEPFactory.deploy(
        globalExitRootV2Address,
        polAddress,
        bridgeV2Address,
        rollupManagerAddress,
        aggLayerGatewayAddress,
    );
    await fepImplementation.waitForDeployment();
    logger.info('#######################\n');
    logger.info(`AggchainFEP implementation deployed at: ${fepImplementation.target}`);

    const addRollupTypeFEPOperation = genTimelockOperation(
        rollupManagerAddress,
        0, // value
        rollupManagerContract.interface.encodeFunctionData('addNewRollupType', [
            fepImplementation.target,
            ethers.ZeroAddress,
            0,
            VerifierType.ALGateway,
            ethers.ZeroHash,
            'Type: AggchainFEP',
            ethers.ZeroHash,
        ]),
        ethers.ZeroHash, // predecessor
        salt, // salt
    );
    timelockOperations.push(addRollupTypeFEPOperation);

    const computedNewRollupTypeFEP = rollupTypeCount + 1n;

    // generate transaction to upgrade all PP rollups to the new ECDSAMultisig implementation
    const aggchainECDSAFactory = (await ethers.getContractFactory('AggchainECDSAMultisig', deployer)) as any;
    // deploy ECDSA implementation
    const aggchainECDSAImplementation = await aggchainECDSAFactory.deploy(
        globalExitRootV2Address,
        polAddress,
        bridgeV2Address,
        rollupManagerAddress,
        aggLayerGatewayAddress,
    );
    await aggchainECDSAImplementation.waitForDeployment();
    logger.info('#######################\n');
    logger.info(`AggchainECDSA implementation deployed at: ${aggchainECDSAImplementation.target}`);

    const addRollupTypeECDSAOperation = genTimelockOperation(
        rollupManagerAddress,
        0, // value
        rollupManagerContract.interface.encodeFunctionData('addNewRollupType', [
            aggchainECDSAImplementation.target,
            ethers.ZeroAddress,
            0,
            VerifierType.ALGateway,
            ethers.ZeroHash,
            'Type: AggchainECDSAMultisig',
            ethers.ZeroHash,
        ]),
        ethers.ZeroHash, // predecessor
        salt, // salt
    );
    timelockOperations.push(addRollupTypeECDSAOperation);

    const computedNewRollupTypeECDSA = rollupTypeCount + 2n;

    // generate transaction to upgrade all FEP rollups to the new FEP implementation
    for (const rollup of ALgatewayRollups) {
        const isInitialized = await _isInitialized(rollup.rollupContract, ethers);
        const encodedData = isInitialized
            ? aggchianFEPFactory.interface.encodeFunctionData('upgradeFromPreviousFEP')
            : '0x';

        if (!isInitialized) {
            logger.info(`⚠️  Rollup ${rollup.rollupID} at ${rollup.rollupContract} is NOT initialized`);
        }

        const upgradeRollupTypeOperation = genTimelockOperation(
            rollupManagerAddress,
            0, // value
            rollupManagerContract.interface.encodeFunctionData('updateRollup', [
                rollup.rollupContract,
                computedNewRollupTypeFEP,
                encodedData,
            ]), // data
            ethers.ZeroHash, // predecessor
            salt, // salt
        );
        timelockOperations.push(upgradeRollupTypeOperation);
    }

    // generate transaction to upgrade all PP rollups to the new ECDSAMultisig implementation
    for (const rollup of PPRollups) {
        const isInitialized = await _isInitialized(rollup.rollupContract, ethers);
        const encodedData = isInitialized
            ? aggchainECDSAFactory.interface.encodeFunctionData('migrateFromLegacyConsensus')
            : '0x';

        if (!isInitialized) {
            logger.info(`⚠️  Rollup ${rollup.rollupID} at ${rollup.rollupContract} is NOT initialized`);
        }

        const upgradeRollupTypeOperation = genTimelockOperation(
            rollupManagerAddress,
            0, // value
            rollupManagerContract.interface.encodeFunctionData('updateRollup', [
                rollup.rollupContract,
                computedNewRollupTypeECDSA,
                encodedData,
            ]), // data
            ethers.ZeroHash, // predecessor
            salt, // salt
        );
        timelockOperations.push(upgradeRollupTypeOperation);
    }

    // Schedule all timelock operations, looping through timelockOperations array suign schedule batch
    const targets = [];
    const values = [];
    const datas = [];
    for (const operation of timelockOperations) {
        targets.push(operation.target);
        values.push(operation.value);
        datas.push(operation.data);
    }

    const scheduleData = timelockContractFactory.interface.encodeFunctionData('scheduleBatch', [
        targets,
        values,
        datas,
        ethers.ZeroHash, // predecessor
        salt, // salt
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData('executeBatch', [
        targets,
        values,
        datas,
        ethers.ZeroHash, // predecessor
        salt, // salt
    ]);

    const operationBatch = genTimelockBatchOperation(targets, values, datas, ethers.ZeroHash, salt);

    logger.info({ scheduleData });
    logger.info({ executeData });

    // Get current block number, used in the shadow fork tests
    const blockNumber = await ethers.provider.getBlockNumber();
    outputJson = {
        scheduleData,
        executeData,
        timelockBatchID: operationBatch.id,
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
    try {
        // Pass multiple contract factories to decode different operation types
        const contractFactories = [
            proxyAdmin, // For upgrade/upgradeAndCall operations
            rollupManagerContract, // For addNewRollupType, updateRollup operations
        ];
        const objectDecoded = await decodeScheduleBatchData(scheduleData, contractFactories);
        (outputJson as any).decodedScheduleData = objectDecoded;
    } catch (error) {
        logger.warn('⚠️  Could not decode schedule data:', error.message);
        (outputJson as any).decodedScheduleData = { error: 'Failed to decode', message: error.message };
    }

    (outputJson as any).deployedContracts = {
        rollupManagerImplementation: implRollupManager,
        aggLayerGatewayImplementation: implAgglayerGateway,
        bridgeImplementation: implBridge,
        globalExitRootManagerImplementation: globalExitRootManagerImp,
        wrappedTokenBytecodeStorer: bytecodeStorerAddress,
        wrappedTokenBridgeImplementation: wrappedTokenBridgeImplementationAddress,
        bridgeLib: bridgeLibAddress,
        aggchainFEPImplementation: fepImplementation.target,
        aggchainECDSAImplementation: aggchainECDSAImplementation.target,
    };

    fs.writeFileSync(pathOutputJson, JSON.stringify(outputJson, null, 2));
    logger.info(`Output saved to: ${pathOutputJson}`);
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});

function _validateAgglayerGatewayInitialization(initializeAgglayerGateway: any): Array<{ addr: string; url: string }> {
    logger.info('Validating AgglayerGateway initialization parameters...');

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
    return signersToAdd;
}

async function _isInitialized(contractAddress: string, ethers: any): Promise<boolean> {
    // Read storage slot 0 which contains uint8 private _initialized (OpenZeppelin Initializable pattern)
    const storageValue = await ethers.provider.getStorage(contractAddress, 0);

    // The _initialized flag is a uint8 (1 byte) stored at the rightmost position in slot 0
    // Mask with 0xFF to extract only the last byte
    const initializedByte = BigInt(storageValue) & 0xffn;

    // If the byte is non-zero, the contract is initialized
    const isInitialized = initializedByte !== 0n;

    return isInitialized;
}
