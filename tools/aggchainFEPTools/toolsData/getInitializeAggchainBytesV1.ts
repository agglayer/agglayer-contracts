import params from './parameters.json';
import { logger } from '../../../src/logger';
import { checkParams } from '../../../src/utils';

async function main() {
    logger.info('Starting tool to create inititizeAggchainBytesV1');

    /// //////////////////////////
    ///   CHECK TOOL PARAMS   ///
    /// //////////////////////////
    logger.info('Check initial parameters');

    const mandatoryParameters = [
        'initParams',
        'useDefaultGateway',
        'initOwnedAggchainVKey',
        'initAggchainVKeyVersion',
        'vKeyManager',
    ];

    checkParams(params, mandatoryParameters);

    const { initParams, useDefaultGateway, initOwnedAggchainVKey, initAggchainVKeyVersion, vKeyManager } = params;

    // Generate initialization parameters for FEP v1 (migration from pessimistic consensus)
    const initializationParams = {
        initParams,
        signers: [], // No signers initially
        threshold: 0, // No threshold initially
        useDefaultGateway,
        initOwnedAggchainVKey,
        initAggchainVKeyVersion,
        vKeyManager,
    };

    logger.info('FEP v1 Initialization Parameters (for migration from pessimistic consensus):');
    logger.info(JSON.stringify(initializationParams, null, 2));

    logger.info('\nTo initialize the FEP contract from pessimistic consensus, call:');
    logger.info('aggchainContract.initializeFromPessimisticConsensus(');
    logger.info('  initParams,');
    logger.info('  [], // signers');
    logger.info('  0, // threshold');
    logger.info('  useDefaultGateway,');
    logger.info('  initOwnedAggchainVKey,');
    logger.info('  initAggchainVKeyVersion,');
    logger.info('  vKeyManager');
    logger.info(');');
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
