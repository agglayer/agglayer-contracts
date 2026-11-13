import { expect } from 'chai';
import fs from 'fs';
import path from 'path';

import { computeGenesisStateRoot, EMPTY_TRIE_ROOT, initializeTimelockStorage } from '../../src/genesis/genesis-helpers';
import { GENESIS_CONTRACT_NAMES } from '../../src/constants';
import { formatGenesis } from '../../tools/createSovereignGenesis/helpers';
import { addSAFEBytecode } from '../../tools/createSovereignGenesis/helpers-safe';

// Expected roots are the genesis block stateRoot reported by geth v1.13.15 started from the same alloc
describe('Genesis state root util', () => {
    function sovereignAlloc(): any {
        let genesis = JSON.parse(
            fs.readFileSync(
                path.join(__dirname, '../../tools/createSovereignGenesis/genesis-base.json.example'),
                'utf8',
            ),
        );
        const timelock = genesis.genesis.find(
            (obj: any) => obj.contractName === GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK,
        );
        timelock.storage = initializeTimelockStorage(
            864000,
            '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
            timelock.address,
        );
        genesis = addSAFEBytecode(genesis);
        return { alloc: formatGenesis(genesis, 'geth'), timelockAddress: timelock.address };
    }

    it('empty genesis', () => {
        expect(computeGenesisStateRoot({})).to.equal(EMPTY_TRIE_ROOT);
    });

    it('accounts with hex and decimal values, unpadded slots and zero-valued storage', () => {
        expect(computeGenesisStateRoot({ '0x70997970C51812dc3A010C7d01b50e0d17dc79C8': { balance: '0x1' } })).to.equal(
            '0x80d5e7e5092cb835e430d757a5fcd0222b42748e517b5e806bda36f55451d934',
        );
        expect(
            computeGenesisStateRoot({
                f39Fd6e51aad88F6F4ce6aB8827279cffFb92266: { balance: '1000000000000000000000', nonce: '0x3' },
                '0x0000000000000000000000000000000000000abc': {
                    balance: '0x0',
                    code: '0x6000',
                    storage: { '0x1': '0x0', '0x02': '0x05' },
                },
            }),
        ).to.equal('0x733a474e77569bb97a3bef8de429d99640ed72eacf25787f5d1489d772da4f51');
    });

    it('sovereign genesis, and the same genesis with one extra timelock slot', () => {
        const { alloc, timelockAddress } = sovereignAlloc();
        expect(computeGenesisStateRoot(alloc)).to.equal(
            '0xf598b601f5d641e84d145da5eb662c603d543db44b5a25eae1cd0be6b255bb0f',
        );

        const timelock = Object.keys(alloc).find((address) => address.toLowerCase() === timelockAddress.toLowerCase());
        alloc[timelock as string].storage['0x1234'] = '0x01';
        expect(computeGenesisStateRoot(alloc)).to.equal(
            '0x3f31e41283992c7eba1ef87da5d8f2e33cd17b0e8b7138cb52ae17adb50c8c00',
        );
    });

    it('duplicated accounts are rejected', () => {
        expect(() =>
            computeGenesisStateRoot({
                '0x70997970C51812dc3A010C7d01b50e0d17dc79C8': { balance: '0x1' },
                '0x70997970c51812dc3a010c7d01b50e0d17dc79c8': { balance: '0x2' },
            }),
        ).to.throw('Duplicated trie keys');
    });
});
