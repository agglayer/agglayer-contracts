import params from './parameters.json';
import { logger } from '../../../src/logger';
import { checkParams } from '../../../src/utils';
import * as utilsFEP from '../../../src/utils-aggchain-FEP';

async function main() {
    logger.info('Starting tool to create inititizeAggchainBytesV0');

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
        'admin',
        'trustedSequencer',
        'gasTokenAddress',
        'trustedSequencerURL',
        'networkName',
    ];

    try {
        checkParams(params, mandatoryParameters);
    } catch (e) {
        logger.error(`Error checking parameters. ${e.message}`);
        process.exit(1);
    }

    const {
        initParams,
        useDefaultGateway,
        initOwnedAggchainVKey,
        initAggchainVKeyVersion,
        vKeyManager,
        admin,
        trustedSequencer,
        gasTokenAddress,
        trustedSequencerURL,
        networkName,
    } = params;

    const result = utilsFEP.encodeInitializeBytesAggchainFEPv0(
        initParams,
        useDefaultGateway,
        initOwnedAggchainVKey,
        initAggchainVKeyVersion,
        vKeyManager,
        admin,
        trustedSequencer,
        gasTokenAddress,
        trustedSequencerURL,
        networkName,
    );
    logger.info('InitializeBytesAggchainFEPv0:');
    logger.info(result);
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
