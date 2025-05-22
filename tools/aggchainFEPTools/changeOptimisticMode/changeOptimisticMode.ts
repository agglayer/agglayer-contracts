import path = require('path');
import fs = require('fs');

import params from './parameters.json';
import { AggchainFEP } from '../../../typechain-types';
import { transactionTypes, genOperation } from '../../utils';
import { decodeScheduleData } from '../../../upgrade/utils';
import { logger } from '../../../src/logger';
import { checkParams } from '../../../src/utils';

async function main() {
    logger.info('Starting tool enable/disable optimistic mode');

    /// //////////////////////////
    ///        CONSTANTS      ///
    /// //////////////////////////
    const outputJson = {} as any;
    const dateStr = new Date().toISOString();
    const destPath = params.outputPath
        ? path.join(__dirname, params.outputPath)
        : path.join(__dirname, `optimistic_mode_output_${params.type}_${dateStr}.json`);

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = ['type', 'rollupAddress', 'optimisticMode'];

    switch (params.type) {
        case transactionTypes.EOA:
        case transactionTypes.MULTISIG:
            break;
        case transactionTypes.TIMELOCK:
            mandatoryParameters.push('timelockDelay');
            break;
        default:
            logger.error(`Invalid type ${params.type}`);
            process.exit(1);
    }

    try {
        checkParams(params, mandatoryParameters);
    } catch (e) {
        logger.error(`Error checking parameters. ${e.message}`);
        process.exit(1);
    }

    const { type, rollupAddress, optimisticMode } = params;

    // Load provider
    logger.info('Load provider');
    let currentProvider = ethers.provider;
    if (params.multiplierGas || params.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            ) as any;
            if (params.maxPriorityFeePerGas && params.maxFeePerGas) {
                logger.info(
                    `Hardcoded gas used: MaxPriority${params.maxPriorityFeePerGas} gwei, MaxFee${params.maxFeePerGas} gwei`,
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(params.maxFeePerGas, 'gwei'),
                    ethers.parseUnits(params.maxPriorityFeePerGas, 'gwei'),
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                logger.info(`Multiplier gas used: ${params.multiplierGas}`);
                // eslint-disable-next-line no-inner-declarations
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas as bigint) * BigInt(params.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas as bigint) * BigInt(params.multiplierGas)) / 1000n,
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    logger.info('Load optimisticManager');
    // Load optimisticManager
    let optimisticManager;
    if (params.optimisticModeManagerPvk) {
        optimisticManager = new ethers.Wallet(params.optimisticModeManagerPvk, currentProvider);
    } else if (process.env.MNEMONIC) {
        optimisticManager = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0",
        ).connect(currentProvider);
    } else {
        [optimisticManager] = await ethers.getSigners();
    }

    logger.info(`Using with: ${optimisticManager.address}`);

    // --network <input>
    logger.info('Load AggchainFEP contract');
    const AggchainFEPFactory = await ethers.getContractFactory('AggchainFEP', optimisticManager);
    const aggchainFEP = (await AggchainFEPFactory.attach(rollupAddress)) as AggchainFEP;

    logger.info(`AggchainFEP address: ${aggchainFEP.target}`);
    let func = '';
    if (optimisticMode) {
        func = 'enableOptimisticMode';
    } else {
        func = 'disableOptimisticMode';
    }

    if (type === transactionTypes.TIMELOCK) {
        logger.info('Creating timelock tx to change optimistic mode....');
        const salt = params.timelockSalt || ethers.ZeroHash;
        const predecessor = params.predecessor || ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', optimisticManager);
        const operation = genOperation(
            rollupAddress,
            0, // value
            AggchainFEPFactory.interface.encodeFunctionData(func, []),
            predecessor, // predecessor
            salt, // salt
        );
        // Schedule operation
        const scheduleData = timelockContractFactory.interface.encodeFunctionData('schedule', [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
            params.timelockDelay,
        ]);
        // Execute operation
        const executeData = timelockContractFactory.interface.encodeFunctionData('execute', [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
        ]);
        logger.info(`scheduleData: ${JSON.stringify(scheduleData, null, 2)}`);
        logger.info(`executeData: ${JSON.stringify(executeData, null, 2)}`);
        outputJson.scheduleData = scheduleData;
        outputJson.executeData = executeData;
        // Decode the scheduleData for better readability
        outputJson.decodedScheduleData = await decodeScheduleData(scheduleData, AggchainFEPFactory);
    } else if (type === transactionTypes.MULTISIG) {
        logger.info('Creating calldata to add default vkey from multisig...');
        const txUpdateOptimisticMode = AggchainFEPFactory.interface.encodeFunctionData(func, []);
        outputJson.rollupAddress = rollupAddress;
        outputJson.optimisticMode = optimisticMode;
        outputJson.txUpdateOptimisticMode = txUpdateOptimisticMode;
    } else {
        logger.info('Send tx to change optimistic mode...');
        logger.info('Check optimisticModeManager');
        if ((await aggchainFEP.optimisticModeManager()) !== optimisticManager.address) {
            logger.error('Invalid optimisticModeManager');
            process.exit(1);
        }
        logger.info(`Sending ${func} transaction to AggchainFEP ${rollupAddress}...`);
        try {
            let tx;
            if (optimisticMode) {
                tx = await aggchainFEP.enableOptimisticMode();
            } else {
                tx = await aggchainFEP.disableOptimisticMode();
            }
            await tx.wait();
            outputJson.rollupAddress = rollupAddress;
            outputJson.optimisticMode = optimisticMode;
            outputJson.txHash = tx.hash;
        } catch (e) {
            logger.error(`Error sending tx: ${e.message}`);
            process.exit(1);
        }
        logger.info('Transaction successful');
    }
    // Save output
    fs.writeFileSync(destPath, JSON.stringify(outputJson, null, 1));
    logger.info(`Finished script, output saved at: ${destPath}`);
}
main().then(
    () => {
        process.exit(0);
    },
    (err) => {
        logger.info(err.message);
        logger.info(err.stack);
        process.exit(1);
    },
);
