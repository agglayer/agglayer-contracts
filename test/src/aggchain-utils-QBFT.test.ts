/* eslint-disable import/no-dynamic-require, @typescript-eslint/no-var-requires, global-require */
import { expect } from 'chai';
import { ethers } from 'ethers';
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

describe('AggchainQBFT init params pre-flight validation', () => {
    const genesis = require(path.join(pathTestvectors, 'headers/000000-genesis.json'));
    const qbftParams = {
        startingBlockNumber: 0,
        startingBlockHash: genesis.block_hash,
        startingValidators: genesis.validators_in_force,
        startingOutstandingVotes: [],
        chainId: 2151908,
        epochLength: 20,
    };
    const ler = ethers.id('lastLocalExitRoot');

    // mocked L2 (Besu) JSON-RPC
    const mockL2 = (overrides: any = {}) => {
        const calls: any[] = [];
        const handlers = {
            eth_chainId: () => ethers.toQuantity(2151908),
            eth_getBlockByNumber: () => ({ hash: genesis.block_hash }),
            qbft_getValidatorsByBlockNumber: () => [...genesis.validators_in_force].reverse(), // unsorted on purpose
            eth_call: () => ler,
            ...overrides,
        };
        return {
            calls,
            send: async (method: string, params: any[]) => {
                calls.push({ method, params });
                return handlers[method](params);
            },
        };
    };

    it('happy path (fresh) and migration with the matching LER', async () => {
        const l2 = mockL2();
        await utilsQBFT.verifyQbftInitParamsOnL2(l2, qbftParams);
        expect(l2.calls.map((c) => c.method)).to.not.include('eth_call');

        const l2m = mockL2();
        await utilsQBFT.verifyQbftInitParamsOnL2(l2m, qbftParams, { expectedLastLocalExitRoot: ler });
        const call = l2m.calls.find((c) => c.method === 'eth_call');
        expect(call.params[0].to).to.be.equal(utilsQBFT.DEFAULT_L2_BRIDGE_ADDRESS);
        expect(call.params[0].data).to.be.equal(ethers.id('getRoot()').slice(0, 10));
        expect(call.params[1]).to.be.equal('0x0');
    });

    it('rejects each mismatch', async () => {
        const verify = (l2: any, params: any = qbftParams, opts: any = {}) =>
            utilsQBFT.verifyQbftInitParamsOnL2(l2, params, opts);

        await expect(verify(mockL2({ eth_chainId: () => '0x7' }))).to.be.rejectedWith('chainId mismatch');
        await expect(verify(mockL2({ eth_getBlockByNumber: () => null }))).to.be.rejectedWith('not found');
        // one nibble off in the starting block hash
        const wrongHash = `${genesis.block_hash.slice(0, -1)}0`;
        await expect(verify(mockL2(), { ...qbftParams, startingBlockHash: wrongHash })).to.be.rejectedWith(
            'startingBlockHash mismatch',
        );
        await expect(
            verify(mockL2({ qbft_getValidatorsByBlockNumber: () => genesis.validators_in_force.slice(1) })),
        ).to.be.rejectedWith('startingValidators mismatch');
        // given validators not sorted
        await expect(
            verify(mockL2(), { ...qbftParams, startingValidators: [...genesis.validators_in_force].reverse() }),
        ).to.be.rejectedWith('startingValidators mismatch');
        await expect(
            verify(mockL2(), qbftParams, { expectedLastLocalExitRoot: ethers.id('other') }),
        ).to.be.rejectedWith('not the last settled block');
    });

    it('checks the signers configuration', () => {
        const signer = { addr: ethers.ZeroAddress, url: 'http://s' };
        utilsQBFT.checkQbftSignersConfig(false, [signer], 1);
        utilsQBFT.checkQbftSignersConfig(true, [], 0);
        expect(() => utilsQBFT.checkQbftSignersConfig(false, [], 0)).to.throw('empty committee');
        expect(() => utilsQBFT.checkQbftSignersConfig(false, undefined, 1)).to.throw('empty committee');
        expect(() => utilsQBFT.checkQbftSignersConfig(false, [signer], 0)).to.throw('threshold must be >= 1');
        expect(() => utilsQBFT.checkQbftSignersConfig(false, [signer], 2)).to.throw(
            'greater than the number of signers',
        );
        expect(() => utilsQBFT.checkQbftSignersConfig(true, [signer], 1)).to.throw('must be empty');
    });

    it('checks the epoch rule offline', () => {
        const vote = { subject: ethers.ZeroAddress, voter: ethers.ZeroAddress, add: true };
        expect(() => utilsQBFT.checkQbftParamsOffline({ ...qbftParams, startingOutstandingVotes: [vote] })).to.throw(
            'must be []',
        );
        expect(() =>
            utilsQBFT.checkQbftParamsOffline({
                ...qbftParams,
                startingBlockNumber: 25,
                startingOutstandingVotes: [vote],
            }),
        ).to.not.throw();
        const res = utilsQBFT.checkQbftParamsOffline({ ...qbftParams, startingBlockNumber: 25 }) as any;
        expect(res.warnings.length).to.be.equal(1);
    });

    it('preflight skips the L2 checks with a loud warning when there is no L2 RPC url', async () => {
        const warnings: string[] = [];
        delete process.env.L2_RPC_URL;
        await utilsQBFT.preflightQbftInit(qbftParams, { warn: (m) => warnings.push(m) });
        expect(warnings.some((w) => w.includes('NOT verified'))).to.be.equal(true);
    });
});
