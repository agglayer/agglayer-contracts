import path = require('path');
import fs = require('fs');

import params from './parameters.json';
import { AggchainFEP } from '../../../typechain-types';
import { transactionTypes, genOperation, addInfoOutput } from '../../utils';
import { decodeScheduleData } from '../../../upgrade/utils';
import { logger } from '../../../src/logger';
import { checkParams, getProviderAdjustingMultiplierGas } from '../../../src/utils';

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

    const mandatoryParameters = ['type', 'rollupAddress', 'newOptimisticModeManager'];

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

    checkParams(params, mandatoryParameters);

    const { type, rollupAddress, newOptimisticModeManager } = params;

    // The new optimistic mode manager is always set explicitly, never derived from keys
    if (!ethers.isAddress(newOptimisticModeManager) || newOptimisticModeManager === ethers.ZeroAddress) {
        logger.error(`Invalid newOptimisticModeManager: ${newOptimisticModeManager}`);
        process.exit(1);
    }
    logger.info(`newOptimisticModeManager: ${newOptimisticModeManager}`);

    // --network <input>
    logger.info('Load AggchainFEP contract');
    const AggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
    const aggchainFEP = (await AggchainFEPFactory.attach(rollupAddress)) as AggchainFEP;

    logger.info(`AggchainFEP address: ${aggchainFEP.target}`);

    // The accept is always sent by the new optimistic mode manager
    const txAccept = AggchainFEPFactory.interface.encodeFunctionData('acceptOptimisticModeManagerRole', []);

    if (type === transactionTypes.TIMELOCK) {
        logger.info('Creating timelock tx to transfer optimistic mode manager Role...');
        const salt = params.timelockSalt || ethers.ZeroHash;
        const predecessor = params.predecessor || ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
        const operation = genOperation(
            rollupAddress,
            0, // value
            AggchainFEPFactory.interface.encodeFunctionData('transferOptimisticModeManagerRole', [
                newOptimisticModeManager,
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
        outputJson.newOptimisticModeManager = newOptimisticModeManager;
        outputJson.transferOptimisticModeManagerRole = {} as any;
        outputJson.transferOptimisticModeManagerRole.scheduleData = scheduleData;
        outputJson.transferOptimisticModeManagerRole.executeData = executeData;
        // Decode the scheduleData for better readability
        outputJson.transferOptimisticModeManagerRole.decodedScheduleData = await decodeScheduleData(
            scheduleData,
            AggchainFEPFactory,
        );
        logger.info(
            `acceptOptimisticModeManagerRole must be sent by the newOptimisticModeManager ${newOptimisticModeManager}`,
        );
        outputJson.txAccept = txAccept;
    } else if (type === transactionTypes.MULTISIG) {
        logger.info('Creating calldata to transfer optimistic mode manager role from multisig...');
        const txTransfer = AggchainFEPFactory.interface.encodeFunctionData('transferOptimisticModeManagerRole', [
            newOptimisticModeManager,
        ]);
        logger.info(
            `acceptOptimisticModeManagerRole must be sent by the newOptimisticModeManager ${newOptimisticModeManager}`,
        );
        outputJson.rollupAddress = rollupAddress;
        outputJson.newOptimisticModeManager = newOptimisticModeManager;
        outputJson.txTransfer = txTransfer;
        outputJson.txAccept = txAccept;
    } else {
        // Load provider
        logger.info('Load provider');
        const currentProvider = getProviderAdjustingMultiplierGas(params, ethers);

        logger.info('Load optimisticModeManager & newOptimisticModeManager wallets');
        let optimisticModeManager;
        let newOptimisticModeManagerWallet;
        if (params.optimisticModeManagerPvk && params.newOptimisticModeManagerPvk) {
            optimisticModeManager = new ethers.Wallet(params.optimisticModeManagerPvk, currentProvider);
            newOptimisticModeManagerWallet = new ethers.Wallet(params.newOptimisticModeManagerPvk, currentProvider);
        } else if (process.env.MNEMONIC) {
            optimisticModeManager = ethers.HDNodeWallet.fromMnemonic(
                ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
                "m/44'/60'/0'/0/0",
            ).connect(currentProvider);
            newOptimisticModeManagerWallet = ethers.HDNodeWallet.fromMnemonic(
                ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
                "m/44'/60'/0'/0/1",
            ).connect(currentProvider);
        } else {
            [optimisticModeManager, newOptimisticModeManagerWallet] = await ethers.getSigners();
        }

        // The keys are only used to send the txs, the role goes to the explicit newOptimisticModeManager
        if (newOptimisticModeManagerWallet.address.toLowerCase() !== newOptimisticModeManager.toLowerCase()) {
            logger.error(
                `The key used to accept the role (${newOptimisticModeManagerWallet.address}) is not the newOptimisticModeManager ${newOptimisticModeManager}`,
            );
            process.exit(1);
        }
        logger.info(`optimisticModeManager: ${optimisticModeManager.address}`);

        logger.info('Send txs to transfer optimistic mode manager role...');
        logger.info('Check OptimisticModeManager');
        if ((await aggchainFEP.connect(currentProvider).optimisticModeManager()) !== optimisticModeManager.address) {
            logger.error('Invalid optimisticModeManager');
            process.exit(1);
        }
        logger.info(`Sending transferOptimisticModeManagerRole transaction to AggchainFEP ${rollupAddress}...`);
        let txTransferResponse;
        try {
            txTransferResponse = await aggchainFEP
                .connect(optimisticModeManager)
                .transferOptimisticModeManagerRole(newOptimisticModeManager);
            await txTransferResponse.wait();
        } catch (e) {
            logger.error(`Error sending tx: ${e.message}`);
            process.exit(1);
        }
        logger.info('Transaction successful');
        logger.info(`Sending acceptOptimisticModeManagerRole transaction to AggchainFEP ${rollupAddress}...`);
        let txAcceptResponse;
        try {
            txAcceptResponse = await aggchainFEP
                .connect(newOptimisticModeManagerWallet)
                .acceptOptimisticModeManagerRole();
            await txAcceptResponse.wait();
        } catch (e) {
            logger.error(`Error sending tx: ${e.message}`);
            // eslint-disable-next-line no-console
            console.log(e);
            process.exit(1);
        }
        logger.info('Transaction successful');
        outputJson.rollupAddress = rollupAddress;
        outputJson.optimisticModeManager = optimisticModeManager.address;
        outputJson.newOptimisticModeManager = newOptimisticModeManager;
        outputJson.txTransferHash = txTransferResponse.hash;
        outputJson.txAccept = txAcceptResponse.hash;
    }
    // Save output
    const finalOutput = addInfoOutput(outputJson);
    fs.writeFileSync(destPath, JSON.stringify(finalOutput, null, 1));
    logger.info(`Finished script, output saved at: ${destPath}`);
}
main().then(
    () => {
        process.exit(0);
    },
    (err) => {
        logger.error(err.message);
        logger.error(err.stack);
        process.exit(1);
    },
);
