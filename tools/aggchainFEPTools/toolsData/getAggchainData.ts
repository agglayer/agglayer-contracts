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

    const mandatoryParameters = ['aggchainVKeyVersion', 'outputRoot', 'l2BlockNumber'];

    try {
        checkParams(params, mandatoryParameters);
    } catch (e) {
        logger.error(`Error checking parameters. ${e.message}`);
        process.exit(1);
    }

    const { aggchainVKeyVersion, outputRoot, l2BlockNumber } = params;

    const result = utilsFEP.encodeAggchainDataFEP(aggchainVKeyVersion, outputRoot, l2BlockNumber);
    logger.info('aggchainData:');
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
