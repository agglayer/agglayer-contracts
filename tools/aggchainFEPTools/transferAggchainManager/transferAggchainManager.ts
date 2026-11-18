import path = require('path');
import fs = require('fs');

import params from './parameters.json';
import { AggchainFEP } from '../../../typechain-types';
import { transactionTypes, genOperation, addInfoOutput } from '../../utils';
import { decodeScheduleData } from '../../../upgrade/utils';
import { logger } from '../../../src/logger';
import { checkParams, getProviderAdjustingMultiplierGas } from '../../../src/utils';

async function main() {
    logger.info('Starting tool to transfer aggchain manager role');

    /// //////////////////////////
    ///        CONSTANTS      ///
    /// //////////////////////////
    const outputJson = {} as any;
    const dateStr = new Date().toISOString();
    const destPath = params.outputPath
        ? path.join(__dirname, params.outputPath)
        : path.join(__dirname, `transfer_aggchain_manager_role_output_${params.type}_${dateStr}.json`);

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = ['type', 'rollupAddress', 'newAggchainManager'];

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

    const { type, rollupAddress, newAggchainManager } = params;

    // The new aggchain manager is always set explicitly, never derived from keys
    if (!ethers.isAddress(newAggchainManager) || newAggchainManager === ethers.ZeroAddress) {
        logger.error(`Invalid newAggchainManager: ${newAggchainManager}`);
        process.exit(1);
    }
    logger.info(`newAggchainManager: ${newAggchainManager}`);

    // --network <input>
    logger.info('Load AggchainFEP contract');
    const AggchainFEPFactory = await ethers.getContractFactory('AggchainFEP');
    const aggchainFEP = (await AggchainFEPFactory.attach(rollupAddress)) as AggchainFEP;

    logger.info(`AggchainFEP address: ${aggchainFEP.target}`);

    // The accept is always sent by the new aggchain manager
    const txAccept = AggchainFEPFactory.interface.encodeFunctionData('acceptAggchainManagerRole', []);

    if (type === transactionTypes.TIMELOCK) {
        logger.info('Creating timelock tx to transfer aggchain manager Role...');
        const salt = params.timelockSalt || ethers.ZeroHash;
        const predecessor = params.predecessor || ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock');
        const operation = genOperation(
            rollupAddress,
            0, // value
            AggchainFEPFactory.interface.encodeFunctionData('transferAggchainManagerRole', [newAggchainManager]),
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
        logger.info('Function transferAggchainManagerRole:');
        logger.info(`scheduleData: ${JSON.stringify(scheduleData, null, 2)}`);
        logger.info(`executeData: ${JSON.stringify(executeData, null, 2)}`);
        outputJson.newAggchainManager = newAggchainManager;
        outputJson.transferAggchainManagerRole = {} as any;
        outputJson.transferAggchainManagerRole.scheduleData = scheduleData;
        outputJson.transferAggchainManagerRole.executeData = executeData;
        // Decode the scheduleData for better readability
        outputJson.transferAggchainManagerRole.decodedScheduleData = await decodeScheduleData(
            scheduleData,
            AggchainFEPFactory,
        );
        logger.info(`acceptAggchainManagerRole must be sent by the newAggchainManager ${newAggchainManager}`);
        outputJson.txAccept = txAccept;
    } else if (type === transactionTypes.MULTISIG) {
        logger.info('Creating calldata to transfer aggchain manager role from multisig...');
        const txTransfer = AggchainFEPFactory.interface.encodeFunctionData('transferAggchainManagerRole', [
            newAggchainManager,
        ]);
        logger.info(`acceptAggchainManagerRole must be sent by the newAggchainManager ${newAggchainManager}`);
        outputJson.rollupAddress = rollupAddress;
        outputJson.newAggchainManager = newAggchainManager;
        outputJson.txTransfer = txTransfer;
        outputJson.txAccept = txAccept;
    } else {
        // Load provider
        logger.info('Load provider');
        const currentProvider = getProviderAdjustingMultiplierGas(params, ethers);

        logger.info('Load aggchainManager & newAggchainManager wallets');
        let aggchainManager;
        let newAggchainManagerWallet;
        if (params.aggchainManagerPvk && params.newAggchainManagerPvk) {
            aggchainManager = new ethers.Wallet(params.aggchainManagerPvk, currentProvider);
            newAggchainManagerWallet = new ethers.Wallet(params.newAggchainManagerPvk, currentProvider);
        } else if (process.env.MNEMONIC) {
            aggchainManager = ethers.HDNodeWallet.fromMnemonic(
                ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
                "m/44'/60'/0'/0/0",
            ).connect(currentProvider);
            newAggchainManagerWallet = ethers.HDNodeWallet.fromMnemonic(
                ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
                "m/44'/60'/0'/0/1",
            ).connect(currentProvider);
        } else {
            [aggchainManager, newAggchainManagerWallet] = await ethers.getSigners();
        }

        // The keys are only used to send the txs, the role goes to the explicit newAggchainManager
        if (newAggchainManagerWallet.address.toLowerCase() !== newAggchainManager.toLowerCase()) {
            logger.error(
                `The key used to accept the role (${newAggchainManagerWallet.address}) is not the newAggchainManager ${newAggchainManager}`,
            );
            process.exit(1);
        }
        logger.info(`aggchainManager: ${aggchainManager.address}`);

        logger.info('Send txs to transfer aggchain manager role...');
        logger.info('Check AggchainManager');
        if ((await aggchainFEP.connect(currentProvider).aggchainManager()) !== aggchainManager.address) {
            logger.error('Invalid aggchainManager');
            process.exit(1);
        }
        logger.info(`Sending transferAggchainManagerRole transaction to AggchainFEP ${rollupAddress}...`);
        let txTransferResponse;
        try {
            txTransferResponse = await aggchainFEP
                .connect(aggchainManager)
                .transferAggchainManagerRole(newAggchainManager);
            await txTransferResponse.wait();
        } catch (e) {
            logger.error(`Error sending tx: ${e.message}`);
            process.exit(1);
        }
        logger.info('Transaction successful');
        logger.info(`Sending acceptAggchainManagerRole transaction to AggchainFEP ${rollupAddress}...`);
        let txAcceptResponse;
        try {
            txAcceptResponse = await aggchainFEP.connect(newAggchainManagerWallet).acceptAggchainManagerRole();
            await txAcceptResponse.wait();
        } catch (e) {
            logger.error(`Error sending tx: ${e.message}`);
            // eslint-disable-next-line no-console
            console.log(e);
            process.exit(1);
        }
        logger.info('Transaction successful');
        outputJson.rollupAddress = rollupAddress;
        outputJson.aggchainManager = aggchainManager.address;
        outputJson.newAggchainManager = newAggchainManager;
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
