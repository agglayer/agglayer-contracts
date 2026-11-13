import * as ethers from 'ethers';
import { TIMELOCK, STORAGE_ONE_VALUE } from '../constants';

/**
 * Storage slot of `account` in the timelock `_roles[role].members` mapping
 * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/access/AccessControl.sol#L55
 * @param {string} roleHash - Role identifier, e.g. keccak256("PROPOSER_ROLE")
 * @param {string} account - Role member
 * @returns {string} - Storage slot, set to 1 if `account` has the role
 */
export function getTimelockRoleMemberSlot(roleHash: string, account: string): string {
    const storagePosition = ethers.solidityPackedKeccak256(
        ['uint256', 'uint256'],
        [roleHash, TIMELOCK.ROLES_MAPPING_STORAGE_POS],
    );

    return ethers.solidityPackedKeccak256(['uint256', 'uint256'], [account, storagePosition]);
}

export function setupRole(storage: Record<string, string>, address: string, roleHash: string) {
    storage[getTimelockRoleMemberSlot(roleHash, address)] = STORAGE_ONE_VALUE;
}

/**
 * This function aims to compute te storage when the timelock is deployed
 * https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/governance/TimelockController.sol#L77
 * @param {number} minDelay - Minimum delay for the timelock
 * @param {string} adminAddress - Grant admin, proposer, executor and canceller roles to this address
 * @param {string} timelockAddress - Grant admin to this address
 * @returns {Object} - Timelock storage slots
 */
export function initializeTimelockStorage(
    minDelay: ethers.BigNumberish,
    adminAddress: string,
    timelockAddress: string,
): Record<string, string> {
    const storage: Record<string, string> = {};

    // set TIMELOCK_ADMIN_ROLE as an adminRole to all timelock roles
    for (let i = 0; i < TIMELOCK.ROLES_HASH.length; i++) {
        const storagePosition = ethers.solidityPackedKeccak256(
            ['uint256', 'uint256'],
            [TIMELOCK.ROLES_HASH[i], TIMELOCK.ROLES_MAPPING_STORAGE_POS],
        );

        // https://github.com/OpenZeppelin/openzeppelin-contracts/blob/v4.8.2/contracts/access/AccessControl.sol#L52
        const roleAdminSlot = ethers.zeroPadValue(ethers.toQuantity(ethers.toBigInt(storagePosition) + BigInt(1)), 32);

        storage[roleAdminSlot] = TIMELOCK.ROLES.TIMELOCK_ADMIN_ROLE;
    }

    // Self administration
    setupRole(storage, timelockAddress, TIMELOCK.ROLES.TIMELOCK_ADMIN_ROLE);

    // admin tole
    setupRole(storage, adminAddress, TIMELOCK.ROLES.TIMELOCK_ADMIN_ROLE);

    // register proposers and cancellers
    setupRole(storage, adminAddress, TIMELOCK.ROLES.PROPOSER_ROLE);
    setupRole(storage, adminAddress, TIMELOCK.ROLES.CANCELLER_ROLE);

    // register executors
    setupRole(storage, adminAddress, TIMELOCK.ROLES.EXECUTOR_ROLE);

    // set minDelay
    storage[ethers.toBeHex(TIMELOCK.MINDELAY_STORAGE_POS, 32)] = ethers.toBeHex(minDelay, 32);

    return storage;
}

// keccak256(rlp('')): state root of a genesis with no accounts
export const EMPTY_TRIE_ROOT = '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421';

type TrieNode = string | TrieNode[];

// hex-prefix encoding of a trie node path (Ethereum yellow paper, appendix C)
function hexPrefix(nibbles: number[], isLeaf: boolean): string {
    const flag = (isLeaf ? 2 : 0) + (nibbles.length % 2);
    const all = nibbles.length % 2 === 1 ? [flag, ...nibbles] : [flag, 0, ...nibbles];
    return `0x${all.map((nibble) => nibble.toString(16)).join('')}`;
}

// a child node is embedded when its RLP is shorter than 32 bytes, otherwise it is referenced by its hash
function trieRef(node: TrieNode): TrieNode {
    const encoded = ethers.encodeRlp(node);
    return ethers.dataLength(encoded) < 32 ? node : ethers.keccak256(encoded);
}

// all paths have the same length (keys are hashes) and are different
function buildTrieNode(items: { path: number[]; value: string }[], depth: number): TrieNode {
    if (items.length === 1) {
        return [hexPrefix(items[0].path.slice(depth), true), items[0].value];
    }
    // length of the path shared by all the items
    const prefix = items.reduce((shared, item) => {
        let length = 0;
        while (length < shared && item.path[depth + length] === items[0].path[depth + length]) {
            length += 1;
        }
        return length;
    }, items[0].path.length - depth);
    if (prefix > 0) {
        return [
            hexPrefix(items[0].path.slice(depth, depth + prefix), false),
            trieRef(buildTrieNode(items, depth + prefix)),
        ];
    }
    const branch: TrieNode[] = [];
    for (let nibble = 0; nibble < 16; nibble++) {
        const children = items.filter((item) => item.path[depth] === nibble);
        branch.push(children.length === 0 ? '0x' : trieRef(buildTrieNode(children, depth + 1)));
    }
    branch.push('0x');
    return branch;
}

// Merkle Patricia Trie root of { key: 32 bytes hash, value: RLP }
function trieRoot(entries: { key: string; value: string }[]): string {
    if (new Set(entries.map((entry) => entry.key)).size !== entries.length) {
        throw new Error('Duplicated trie keys (an account or slot is repeated in the genesis file)');
    }
    if (entries.length === 0) {
        return EMPTY_TRIE_ROOT;
    }
    const items = entries.map((entry) => ({
        path: [...entry.key.slice(2)].map((char) => parseInt(char, 16)),
        value: entry.value,
    }));
    return ethers.keccak256(ethers.encodeRlp(buildTrieNode(items, 0)));
}

function rlpQuantity(value: bigint): string {
    return value === 0n ? '0x' : ethers.toBeHex(value);
}

function withPrefix(hex: string): string {
    return hex.startsWith('0x') ? hex : `0x${hex}`;
}

/**
 * Ethereum (MPT) state root of genesis accounts, e.g. a geth `alloc`. It is the genesis block stateRoot of a node
 * started with exactly these accounts
 * @param {Object} accounts - { [address]: { balance, nonce, code|bytecode, storage } }
 * @returns {string} - State root
 */
export function computeGenesisStateRoot(
    accounts: Record<
        string,
        { balance?: string; nonce?: string; code?: string; bytecode?: string; storage?: Record<string, string> }
    >,
): string {
    return trieRoot(
        Object.entries(accounts).map(([address, account]) => {
            const storage = Object.entries(account.storage ?? {})
                .map(([slot, value]) => ({ slot: BigInt(withPrefix(slot)), value: BigInt(withPrefix(value)) }))
                .filter(({ value }) => value !== 0n)
                .map(({ slot, value }) => ({
                    key: ethers.keccak256(ethers.toBeHex(slot, 32)),
                    value: ethers.encodeRlp(rlpQuantity(value)),
                }));
            return {
                key: ethers.keccak256(withPrefix(address).toLowerCase()),
                value: ethers.encodeRlp([
                    rlpQuantity(BigInt(account.nonce || '0x0')),
                    rlpQuantity(BigInt(account.balance || '0x0')),
                    trieRoot(storage),
                    ethers.keccak256(account.code || account.bytecode || '0x'),
                ]),
            };
        }),
    );
}
