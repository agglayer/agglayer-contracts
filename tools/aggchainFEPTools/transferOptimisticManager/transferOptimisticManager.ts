import path = require('path');
import fs = require('fs');

import * as params from './parameters.json';
import { AggchainFEP } from '../../../typechain-types';
import { transactionTypes, genOperation } from '../../utils';
import { decodeScheduleData } from '../../../upgrade/utils';
import { logger } from '../../../src/logger';
import { checkParams } from '../../../src/utils';

async function main() {
    logger.info('Starting tool to transfer optimistic mode manager role');

    /// //////////////////////////
    ///        CONSTANTS      ///
    /// //////////////////////////
    const outputJson = {} as any;
    const dateStr = new Date().toISOString();
    const destPath = params.outputPath
        ? path.join(__dirname, params.outputPath)
        : path.join(__dirname, `transfer_optimistic_mode_role_output_${params.type}_${dateStr}.json`);

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = ['type', 'rollupAddress'];

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

    const { type, rollupAddress } = params;

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

    logger.info('Load optimisticManager & newOptimisticManager');
    // Load optimisticManager
    let optimisticManager;
    let newOptimisticManager;
    if (params.optimisticModeManagerPvk && params.newOptimisticModeManagerPvk) {
        optimisticManager = new ethers.Wallet(params.optimisticModeManagerPvk, currentProvider);
        newOptimisticManager = new ethers.Wallet(params.newOptimisticModeManagerPvk, currentProvider);
    } else if (process.env.MNEMONIC) {
        optimisticManager = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0",
        ).connect(currentProvider);
        newOptimisticManager = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/1",
        ).connect(currentProvider);
    } else {
        [optimisticManager, newOptimisticManager] = await ethers.getSigners();
    }

    logger.info(
        `optimisticManager: ${optimisticManager.address} newOptimisticManager: ${newOptimisticManager.address}`,
    );

    // --network <input>
    logger.info('Load AggchainFEP contract');
    const AggchainFEPFactory = await ethers.getContractFactory('AggchainFEP', optimisticManager);
    const aggchainFEP = (await AggchainFEPFactory.attach(rollupAddress)) as AggchainFEP;

    logger.info(`AggchainFEP address: ${aggchainFEP.target}`);

    if (type === transactionTypes.TIMELOCK) {
        logger.info('Creating timelock tx to transfer optimistic mode manager Role...');
        const salt = params.timelockSalt || ethers.ZeroHash;
        const predecessor = params.predecessor || ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', optimisticManager);
        const operation = genOperation(
            rollupAddress,
            0, // value
            AggchainFEPFactory.interface.encodeFunctionData('transferOptimisticModeManagerRole', [
                newOptimisticManager.address,
            ]),
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
        logger.info('Function transferOptimisticModeManagerRole:');
        logger.info(`scheduleData: ${JSON.stringify(scheduleData, null, 2)}`);
        logger.info(`executeData: ${JSON.stringify(executeData, null, 2)}`);
        outputJson.transferOptimisticModeManagerRole = {} as any;
        outputJson.transferOptimisticModeManagerRole.scheduleData = scheduleData;
        outputJson.transferOptimisticModeManagerRole.executeData = executeData;
        // Decode the scheduleData for better readability
        outputJson.transferOptimisticModeManagerRole.decodedScheduleData = await decodeScheduleData(
            scheduleData,
            AggchainFEPFactory,
        );

        const operation2 = genOperation(
            rollupAddress,
            0, // value
            AggchainFEPFactory.interface.encodeFunctionData('acceptOptimisticModeManagerRole', []),
            predecessor, // predecessor
            salt, // salt
        );
        // Schedule operation
        const scheduleData2 = timelockContractFactory.interface.encodeFunctionData('schedule', [
            operation2.target,
            operation2.value,
            operation2.data,
            operation2.predecessor,
            operation2.salt,
            params.timelockDelay,
        ]);
        // Execute operation
        const executeData2 = timelockContractFactory.interface.encodeFunctionData('execute', [
            operation2.target,
            operation2.value,
            operation2.data,
            operation2.predecessor,
            operation2.salt,
        ]);
        logger.info('Creating timelock tx to accept optimistic mode manager Role...');
        logger.info('Function acceptOptimisticModeManagerRole:');
        logger.info(`scheduleData: ${JSON.stringify(scheduleData2, null, 2)}`);
        logger.info(`executeData: ${JSON.stringify(executeData2, null, 2)}`);
        outputJson.acceptOptimisticModeManagerRole = {} as any;
        outputJson.acceptOptimisticModeManagerRole.scheduleData = scheduleData2;
        outputJson.acceptOptimisticModeManagerRole.executeData = executeData2;
        // Decode the scheduleData for better readability
        outputJson.acceptOptimisticModeManagerRole.decodedScheduleData = await decodeScheduleData(
            scheduleData2,
            AggchainFEPFactory,
        );
    } else if (type === transactionTypes.MULTISIG) {
        logger.info('Creating calldata to transfer optimistic mode manager role from multisig...');
        const txTransferOptimiticModeManagerRole = AggchainFEPFactory.interface.encodeFunctionData(
            'transferOptimisticModeManagerRole',
            [newOptimisticManager.address],
        );
        logger.info('Creating calldata to accept optimistic mode manager role from multisig...');
        const txAcceptOptimiticModeManagerRole = AggchainFEPFactory.interface.encodeFunctionData(
            'acceptOptimisticModeManagerRole',
            [],
        );
        outputJson.rollupAddress = rollupAddress;
        outputJson.optimisticModeManager = optimisticManager.address;
        outputJson.newOptimisticModeManager = newOptimisticManager.address;
        outputJson.txTransfer = txTransferOptimiticModeManagerRole;
        outputJson.txAccept = txAcceptOptimiticModeManagerRole;
    } else {
        logger.info('Send txs to transfer optimistic mode manager role...');
        logger.info('Check optimisticModeManager');
        if ((await aggchainFEP.optimisticModeManager()) !== optimisticManager.address) {
            logger.error('Invalid optimisticModeManager');
            process.exit(1);
        }
        logger.info(`Sending transferOptimisticModeManagerRole transaction to AggchainFEP ${rollupAddress}...`);
        let txTransfer;
        try {
            txTransfer = await aggchainFEP.transferOptimisticModeManagerRole(newOptimisticManager.address);
            await txTransfer.wait();
        } catch (e) {
            logger.error(`Error sending tx: ${e.message}`);
            process.exit(1);
        }
        logger.info('Transaction successful');
        logger.info(`Sending acceptOptimisticModeManagerRole transaction to AggchainFEP ${rollupAddress}...`);
        let txAccept;
        try {
            txAccept = await aggchainFEP.connect(newOptimisticManager).acceptOptimisticModeManagerRole();
            await txAccept.wait();
        } catch (e) {
            logger.error(`Error sending tx: ${e.message}`);
            process.exit(1);
        }
        logger.info('Transaction successful');
        outputJson.rollupAddress = rollupAddress;
        outputJson.optimisticModeManager = optimisticManager.address;
        outputJson.newOptimisticModeManager = newOptimisticManager.address;
        outputJson.txTransferHash = txTransfer.hash;
        outputJson.txAccept = txAccept.hash;
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
