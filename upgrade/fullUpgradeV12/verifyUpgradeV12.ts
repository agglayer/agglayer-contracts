/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import fs = require('fs');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { logger } from '../../src/logger';
import { trackVerification } from '../utils';
import { GENESIS_CONTRACT_NAMES } from '../../src/utils-common-aggchain';
import { AgglayerManager } from '../../typechain-types';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
    const pathOutputJson = path.resolve(__dirname, './upgrade_output.json');
    if (!fs.existsSync(pathOutputJson)) {
        throw new Error(`upgrade_output.json not found at ${pathOutputJson}. Run fullUpgradeV12 first.`);
    }

    const content = fs.readFileSync(pathOutputJson, 'utf8');
    const outputData = JSON.parse(content) as any;

    const { inputs, deployedContracts } = outputData;

    if (!inputs || !deployedContracts) {
        throw new Error('Missing inputs or deployedContracts in upgrade_output.json');
    }

    const { rollupManagerAddress, bridgeV2Address, globalExitRootV2Address, aggLayerGatewayAddress } = inputs;

    logger.info('Starting verification for all deployed contracts...');
    const verificationResults: Record<string, any> = {};

    // Get contract instances to read constructor args
    const rollupManagerFactory = await ethers.getContractFactory('AgglayerManager');
    const rollupManagerContract = rollupManagerFactory.attach(rollupManagerAddress) as AgglayerManager;

    const polAddress = await rollupManagerContract.pol();

    // 1. Verify Rollup Manager Implementation
    logger.info('Verifying Rollup Manager Implementation...');
    verificationResults[GENESIS_CONTRACT_NAMES.ROLLUP_MANAGER_IMPLEMENTATION] = await trackVerification(
        GENESIS_CONTRACT_NAMES.ROLLUP_MANAGER_IMPLEMENTATION,
        deployedContracts.rollupManagerImplementation,
        [globalExitRootV2Address, polAddress, bridgeV2Address, aggLayerGatewayAddress],
    );

    // 2. Verify AggLayer Gateway Implementation
    logger.info('Verifying AggLayer Gateway Implementation...');
    verificationResults[GENESIS_CONTRACT_NAMES.AGGLAYER_GATEWAY_IMPLEMENTATION] = await trackVerification(
        GENESIS_CONTRACT_NAMES.AGGLAYER_GATEWAY_IMPLEMENTATION,
        deployedContracts.aggLayerGatewayImplementation,
        [],
    );

    // 3. Verify Bridge Implementation
    logger.info('Verifying Bridge Implementation...');
    verificationResults[GENESIS_CONTRACT_NAMES.BRIDGE_V2] = await trackVerification(
        GENESIS_CONTRACT_NAMES.BRIDGE_V2,
        deployedContracts.bridgeImplementation,
        [],
    );

    // 4. Verify BytecodeStorer
    logger.info('Verifying BytecodeStorer...');
    verificationResults[GENESIS_CONTRACT_NAMES.BYTECODE_STORER] = await trackVerification(
        GENESIS_CONTRACT_NAMES.BYTECODE_STORER,
        deployedContracts.wrappedTokenBytecodeStorer,
        [],
    );

    // 5. Verify TokenWrapped Implementation
    logger.info('Verifying TokenWrapped Implementation...');
    verificationResults[GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION] = await trackVerification(
        GENESIS_CONTRACT_NAMES.TOKEN_WRAPPED_IMPLEMENTATION,
        deployedContracts.wrappedTokenBridgeImplementation,
        [],
    );

    // 6. Verify BridgeLib
    logger.info('Verifying BridgeLib...');
    verificationResults[GENESIS_CONTRACT_NAMES.BRIDGE_LIB] = await trackVerification(
        GENESIS_CONTRACT_NAMES.BRIDGE_LIB,
        deployedContracts.bridgeLib,
        [],
    );

    // 7. Verify Global Exit Root Manager Implementation
    logger.info('Verifying Global Exit Root Manager Implementation...');
    verificationResults[GENESIS_CONTRACT_NAMES.GER_IMPLEMENTATION] = await trackVerification(
        GENESIS_CONTRACT_NAMES.GER_IMPLEMENTATION,
        deployedContracts.globalExitRootManagerImplementation,
        [rollupManagerAddress, bridgeV2Address],
    );

    // 8. Verify AggchainFEP Implementation (if exists)
    if (deployedContracts.aggchainFEPImplementation) {
        logger.info('Verifying AggchainFEP Implementation...');
        verificationResults.AggchainFEP = await trackVerification(
            'AggchainFEP',
            deployedContracts.aggchainFEPImplementation,
            [globalExitRootV2Address, polAddress, bridgeV2Address, rollupManagerAddress, aggLayerGatewayAddress],
        );
    }

    // 9. Verify AggchainECDSA Implementation (if exists)
    if (deployedContracts.aggchainECDSAImplementation) {
        logger.info('Verifying AggchainECDSA Implementation...');
        verificationResults.AggchainECDSA = await trackVerification(
            'AggchainECDSA',
            deployedContracts.aggchainECDSAImplementation,
            [globalExitRootV2Address, polAddress, bridgeV2Address, rollupManagerAddress, aggLayerGatewayAddress],
        );
    }

    // Write back results into the same file for traceability
    outputData.verification = verificationResults;
    fs.writeFileSync(pathOutputJson, JSON.stringify(outputData, null, 2));
    logger.info(`Verification results saved to: ${pathOutputJson}`);
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});
