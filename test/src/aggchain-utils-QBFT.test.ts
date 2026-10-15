/* eslint-disable import/no-dynamic-require, @typescript-eslint/no-var-requires, global-require */
import { expect } from 'chai';
import * as fs from 'fs';
import * as path from 'path';
import * as utilsQBFT from '../../src/utils-aggchain-QBFT';

// Vectors copied from prover-besu-qbft@6815011, see test/test-vectors/aggchainQBFT/README.md
const pathTestvectors = path.join(__dirname, '../test-vectors/aggchainQBFT');
const aggchainParamsFiles = fs
    .readdirSync(path.join(pathTestvectors, 'aggchain_params'))
    .filter((file) => file.endsWith('.json'))
    .sort();
const tallyReplay = require(path.join(pathTestvectors, 'tally/replay.json'));

describe('Test vectors aggchain QBFT utils', () => {
    it('Check there are the 5 aggchain_params vectors', () => {
        expect(aggchainParamsFiles.length).to.be.equal(5);
    });

    aggchainParamsFiles.forEach((file) => {
        const vector = require(path.join(pathTestvectors, 'aggchain_params', file));

        it(`Check test-vectors aggchain_params and aggchain_data ${file}`, () => {
            const chainConfigHash = utilsQBFT.computeChainConfigHash(
                vector.chain_id,
                vector.epoch_length,
                vector.genesis_block_hash,
            );
            expect(chainConfigHash).to.be.equal(vector.chain_config_hash);

            const aggchainParams = utilsQBFT.computeHashAggchainParamsQBFT(
                vector.prev_block_hash,
                vector.prev_consensus_hash,
                vector.new_block_hash,
                vector.new_block_number,
                vector.new_consensus_hash,
                vector.chain_config_hash,
            );
            expect(aggchainParams).to.be.equal(vector.aggchain_params);

            const aggchainData = utilsQBFT.encodeAggchainDataQBFT(
                vector.aggchain_vkey_selector,
                vector.new_block_hash,
                vector.new_block_number,
                vector.new_consensus_hash,
            );
            expect(aggchainData).to.be.equal(vector.aggchain_data);
            expect((aggchainData.length - 2) / 2).to.be.equal(128);
        });
    });

    it('Check consensus state hash after every header of tally/replay.json', () => {
        let withVotes = 0;
        tallyReplay.steps.forEach((step) => {
            if (step.outstanding_after.length > 0) withVotes += 1;
            expect(utilsQBFT.computeConsensusStateHash(step.validators_after, step.outstanding_after)).to.be.equal(
                step.consensus_hash_after,
            );
        });
        // the replay must exercise the non empty Vote[] encoding
        expect(withVotes).to.be.greaterThan(0);
    });
});
