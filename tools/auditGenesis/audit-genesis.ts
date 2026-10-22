/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax */

import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import chalk from 'chalk';
import yargs from 'yargs/yargs';
import { getSafeCreation, getSafeInfo, SafeInfo } from './safe-inspector';
import { GENESIS_CONTRACT_NAMES, POLYGON_MULTISIG, TIMELOCK } from '../../src/constants';
import { getTimelockRoleMemberSlot, initializeTimelockStorage } from '../../src/genesis/genesis-helpers';
import safeContracts from '../createSovereignGenesis/safe-contracts.json';

// ======= CONFIGURATION ======= //
const argv = yargs(process.argv.slice(2))
    .usage(
        'Usage: npx ts-node tools/auditGenesis/audit-genesis.ts --l2-rpc <L2_RPC_URL> --genesis <GENESIS_FILE> --genesis-output <GENESIS_OUTPUT_FILE> --l1-rpc <L1_RPC_URL>',
    )
    .options({
        'l2-rpc': { type: 'string', demandOption: true, describe: 'RPC of the L2 node started from the genesis' },
        genesis: { type: 'string', demandOption: true, describe: 'Genesis file (geth `alloc` or repo-style)' },
        'genesis-output': {
            type: 'string',
            demandOption: true,
            describe: 'createSovereignGenesis output file (output-rollupID-*.json)',
        },
        'l1-rpc': { type: 'string', demandOption: true, describe: 'L1 RPC used to inspect the timelock adminAddress' },
    })
    .strict()
    .parse() as any;

const BLOCK_TAG = 'earliest'; // Genesis block
const RPC_TIMEOUT_MS = 15000;
const EIP7702_DELEGATION_PREFIX = '0xef0100';
// bytes32(uint256(keccak256('eip1967.proxy.admin')) - 1)
const EIP1967_ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
// max block range per eth_getLogs request when the RPC rejects the full range
const LOGS_BLOCK_RANGE = 10000;
// official Safe proxy runtime code (the same for every proxy of a version, the singleton is in storage slot 0):
// codeHash => name. Taken from Ethereum mainnet Safes created by the canonical factories
const TRUSTED_SAFE_PROXIES: Record<string, string> = {
    '0xb89c1b3bdf2cf8827818646bce9a8f6e372885f8c55e5c07acbd307cb133b000': 'GnosisSafeProxy v1.3.0',
    '0xd7d408ebcd99b2b70be43e20253d6d92a8ea8fab29bd3be7f55b10032331fb4c': 'SafeProxy v1.4.1',
};
// only setup delegatecall supported: SafeToL2Setup.setupToL2(l2Singleton) switches the singleton on L2 chains
const SAFE_TO_L2_SETUP = safeContracts['v1.4.1-3'].find((contract) => contract.contractName.endsWith('SafeToL2Setup'))!;
const safeToL2SetupInterface = new ethers.Interface(['function setupToL2(address l2Singleton)']);
// Safe singletons (implementations) trusted as the code a Safe proxy delegates to: codeHash => name
const TRUSTED_SAFE_SINGLETONS: Record<string, string> = Object.fromEntries(
    [...safeContracts['v1.3.0'], ...safeContracts['v1.4.1-3']]
        .filter((contract) =>
            ['GnosisSafe', 'GnosisSafeL2', 'Safe', 'SafeL2'].includes(contract.contractName.split(' ').pop()!),
        )
        .map((contract) => [contract.codeHash, contract.contractName]),
);
const dateStr = new Date().toISOString();
const pathReport = path.join(__dirname, `audit-genesis-${dateStr}.md`);
// ============================= //

const timelockInterface = new ethers.Interface([
    'function hasRole(bytes32 role, address account) view returns (bool)',
    'function getMinDelay() view returns (uint256)',
]);
const ownableInterface = new ethers.Interface(['function owner() view returns (address)']);
const roleEventsInterface = new ethers.Interface([
    'event RoleGranted(bytes32 indexed role, address indexed account, address indexed sender)',
    'event RoleRevoked(bytes32 indexed role, address indexed account, address indexed sender)',
]);

interface GenesisAccount {
    balance?: string;
    nonce?: string;
    code?: string; // expected bytecode (alias: bytecode)
    bytecode?: string; // allow reading files that use 'bytecode'
    storage?: Record<string, string>;
}

interface CompareResult {
    address: string;
    nonce_match: boolean;
    balance_match: boolean;
    code_match: boolean;
    storage_mismatches: { slot: string; expected: string; actual: string }[];
}

type Status = 'PASS' | 'WARN' | 'FAIL' | 'INFO';

interface Check {
    section: string;
    status: Status;
    message: string;
}

const checks: Check[] = [];
const report: string[] = [];

// hide RPC API keys & credentials: keep only the scheme and the host
function maskRpcUrl(url: string) {
    try {
        const { protocol, host, pathname, search } = new URL(url);
        return pathname.length > 1 || search !== '' ? `${protocol}//${host}/***` : `${protocol}//${host}`;
    } catch (e) {
        return '***';
    }
}

// redact any RPC url (the given ones and any url inside RPC error messages) before logging or storing text
function redact(text: string) {
    let redacted = text;
    [argv['l1-rpc'], argv['l2-rpc']].forEach((url: string) => {
        redacted = redacted.split(url).join(maskRpcUrl(url));
    });
    return redacted.replace(/https?:\/\/[^\s"'<>)]+/g, (url) => maskRpcUrl(url));
}

// safe error message: ethers short message (no request details) plus the node error, redacted
function errorMessage(e: any): string {
    const message = String(e?.shortMessage ?? e?.message ?? e);
    const nodeMessage = e?.error?.message;
    return redact(typeof nodeMessage === 'string' ? `${message}: ${nodeMessage}` : message);
}

function md(line = '') {
    report.push(redact(line));
}

// escape a markdown table cell: backslashes first, then the column separator
function escapeMdCell(cell: string | number | bigint) {
    return String(cell).replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function mdTable(headers: string[], rows: (string | number | bigint)[][]) {
    md(`| ${headers.join(' | ')} |`);
    md(`| ${headers.map(() => '---').join(' | ')} |`);
    rows.forEach((row) => md(`| ${row.map(escapeMdCell).join(' | ')} |`));
    md();
}

const STATUS_ICON: Record<Status, string> = { PASS: '✅', WARN: '⚠️', FAIL: '❌', INFO: 'ℹ️' };
const STATUS_COLOR: Record<Status, chalk.Chalk> = {
    PASS: chalk.green,
    WARN: chalk.yellow,
    FAIL: chalk.red,
    INFO: chalk.blue,
};

function check(section: string, status: Status, rawMessage: string) {
    const message = redact(rawMessage);
    checks.push({ section, status, message });
    console.log(STATUS_COLOR[status](`[${status}] ${message}`));
    md(`- ${STATUS_ICON[status]} **${status}**: ${message}`);
}

function startSection(title: string) {
    console.log(chalk.magenta.bold(`\n######## ${title} ########`));
    md();
    md(`## ${title}`);
    md();
}

function logComparison(field: string, match: boolean, expected?: string, actual?: string): void {
    if (match) {
        console.log(chalk.green(`✓ ${field} OK`));
    } else {
        console.log(chalk.red(`✗ ${field} mismatch`));
        if (expected && actual) {
            console.log(`    Expected: ${chalk.yellow(expected)}`);
            console.log(`    Got:      ${chalk.cyan(actual)}`);
        }
    }
}

// genesis storage keys may come without the 0x prefix
function normalizeSlot(slot: string) {
    return slot.startsWith('0x') ? slot : `0x${slot}`;
}

// genesis storage as { [32 bytes slot]: value }
function toStorageMap(storage: Record<string, string>) {
    const map: Record<string, bigint> = {};
    Object.entries(storage).forEach(([slot, value]) => {
        map[ethers.toBeHex(BigInt(normalizeSlot(slot)), 32)] = BigInt(normalizeSlot(value));
    });
    return map;
}

function storageValueToAddress(value: bigint | string) {
    return ethers.getAddress(ethers.dataSlice(ethers.toBeHex(BigInt(value), 32), 12));
}

/**
 * eth_getLogs over the whole chain, split in block ranges if the RPC rejects the full range
 * @param provider provider
 * @param filter address & topics
 * @returns all the logs
 * @throws if any range can not be read: the result would be incomplete
 */
async function getAllLogs(provider: ethers.JsonRpcProvider, filter: { address: string; topics: any[] }) {
    const latest = await provider.getBlockNumber();
    try {
        return await provider.getLogs({ ...filter, fromBlock: 0, toBlock: latest });
    } catch (e) {
        const logs: ethers.Log[] = [];
        for (let fromBlock = 0; fromBlock <= latest; fromBlock += LOGS_BLOCK_RANGE) {
            const toBlock = Math.min(fromBlock + LOGS_BLOCK_RANGE - 1, latest);
            logs.push(...(await provider.getLogs({ ...filter, fromBlock, toBlock })));
        }
        return logs;
    }
}

/**
 * Check the code a Safe proxy delegates to (its singleton) is a trusted Safe implementation
 * @param provider provider of the chain where the Safe is deployed
 * @param singleton singleton address read from the Safe proxy storage slot 0
 * @returns trusted singleton name, or undefined if not trusted
 */
async function getTrustedSingletonName(provider: ethers.JsonRpcProvider, singleton: string) {
    const code = await provider.getCode(singleton);
    return code === '0x' ? undefined : TRUSTED_SAFE_SINGLETONS[ethers.keccak256(code)];
}

/**
 * Create a provider and check it is reachable
 * @param url RPC url
 * @param label name used in the error messages
 * @returns provider and its chainId
 */
async function connect(url: string, label: string): Promise<{ provider: ethers.JsonRpcProvider; chainId: bigint }> {
    const provider = new ethers.JsonRpcProvider(url);
    let timeout: NodeJS.Timeout | undefined;
    try {
        const network = await Promise.race([
            provider.getNetwork(),
            new Promise<never>((_, reject) => {
                timeout = setTimeout(() => reject(new Error(`timeout after ${RPC_TIMEOUT_MS} ms`)), RPC_TIMEOUT_MS);
            }),
        ]);
        return { provider, chainId: network.chainId };
    } catch (e: any) {
        provider.destroy();
        throw new Error(`Cannot connect to ${label} (${maskRpcUrl(url)}): ${errorMessage(e)}`);
    } finally {
        clearTimeout(timeout);
    }
}

async function compareAddressState(
    provider: ethers.JsonRpcProvider,
    address: string,
    expected: GenesisAccount,
): Promise<CompareResult> {
    const result: CompareResult = {
        address,
        nonce_match: true,
        balance_match: true,
        code_match: true,
        storage_mismatches: [],
    };

    const [nonce, balance, code] = await Promise.all([
        provider.getTransactionCount(address, BLOCK_TAG),
        provider.getBalance(address, BLOCK_TAG),
        provider.getCode(address, BLOCK_TAG),
    ]);

    const expectedNonce = BigInt(expected.nonce || '0x0');
    const expectedBalance = BigInt(expected.balance || '0x0');
    const expectedCode = (expected.code || expected.bytecode || '0x').toLowerCase();

    // Compare nonce
    result.nonce_match = BigInt(nonce) === expectedNonce;
    logComparison('Nonce', result.nonce_match, expectedNonce.toString(), nonce.toString());

    // Compare balance
    result.balance_match = balance.toString() === expectedBalance.toString();
    logComparison('Balance', result.balance_match, expectedBalance.toString(), balance.toString());

    // Compare code
    result.code_match = code.toLowerCase() === expectedCode;
    logComparison(
        'Code',
        result.code_match,
        result.code_match ? undefined : `${expectedCode.slice(0, 60)}...`,
        result.code_match ? undefined : `${code.slice(0, 60)}...`,
    );

    // Compare storage
    const storage = expected.storage || {};
    for (const [slot, expectedValue] of Object.entries(storage)) {
        const actual = await provider.getStorage(address, normalizeSlot(slot), BLOCK_TAG);

        if (BigInt(actual) !== BigInt(normalizeSlot(expectedValue))) {
            result.storage_mismatches.push({ slot, expected: expectedValue, actual });
            console.log(chalk.red(`✗ Storage mismatch at slot ${slot}`));
            console.log(`    Expected: ${chalk.yellow(expectedValue)}`);
            console.log(`    Got:      ${chalk.cyan(actual)}`);
        } else {
            console.log(chalk.green(`✓ Storage slot ${slot} OK`));
        }
    }

    return result;
}

function readJson(filePath: string, label: string) {
    try {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e: any) {
        throw new Error(`Failed to parse ${label}: ${filePath}\n${e.message}`);
    }
}

/**
 * Normalize a genesis file to { [address]: GenesisAccount }
 * @param raw genesis file content
 * @returns accounts map
 */
function getAccountsMap(raw: any): Record<string, GenesisAccount> {
    let accountsMap: Record<string, GenesisAccount> = {};

    if (raw?.alloc && typeof raw.alloc === 'object') {
        // Geth-style: { alloc: { [address]: { balance, nonce, code, storage } } }
        accountsMap = raw.alloc;
    } else if (Array.isArray(raw?.genesis)) {
        // Repo-style: { root: ..., genesis: [ { address, balance, nonce, bytecode|code, storage } ] }
        for (const entry of raw.genesis) {
            if (entry?.address) {
                accountsMap[entry.address] = {
                    balance: entry.balance ?? '0x0',
                    nonce: entry.nonce ?? '0x0',
                    code: entry.code ?? entry.bytecode ?? '0x',
                    storage: entry.storage ?? {},
                };
            }
        }
    } else if (raw && typeof raw === 'object') {
        // Assume already a mapping: { [address]: { balance, nonce, code, storage } }
        accountsMap = raw;
    }

    return accountsMap;
}

async function contractCall(
    provider: ethers.JsonRpcProvider,
    contractInterface: ethers.Interface,
    to: string,
    fn: string,
    args: any[] = [],
    blockTag: ethers.BlockTag = 'latest',
) {
    const data = contractInterface.encodeFunctionData(fn, args);
    return contractInterface.decodeFunctionResult(fn, await provider.call({ to, data, blockTag }));
}

function sameAddress(a?: string, b?: string) {
    return a !== undefined && b !== undefined && a.toLowerCase() === b.toLowerCase();
}

function sameOwners(a: string[], b: string[]) {
    const normalize = (owners: string[]) => owners.map((owner) => owner.toLowerCase()).sort();
    return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function safeInfoRows(info: SafeInfo): string[][] {
    return [
        ['Version', info.version],
        ['Singleton', info.singleton],
        ['Threshold', `${info.threshold} of ${info.owners.length}`],
        ['Owners', info.owners.join('<br>')],
        ['Nonce', info.nonce.toString()],
        ['Modules', info.modules.length === 0 ? 'none' : info.modules.join('<br>')],
        ['Guard', info.guard],
        ['Fallback handler', info.fallbackHandler],
    ];
}

function logSafeInfo(title: string, info: SafeInfo) {
    console.log(chalk.bold(`  ${title}`));
    safeInfoRows(info).forEach(([key, value]) => console.log(`    ${key.padEnd(17)}: ${value.replace(/<br>/g, ', ')}`));
}

/**
 * Audit the timelock admin when it is a Safe: original setup on L1 and its status on L2
 * @param l1Provider L1 provider
 * @param l2Provider L2 provider
 * @param adminAddress timelock admin address
 * @param l1Code admin code on L1
 * @param l1Info admin Safe configuration on L1
 */
async function auditSafeAdmin(
    l1Provider: ethers.JsonRpcProvider,
    l2Provider: ethers.JsonRpcProvider,
    adminAddress: string,
    l1Code: string,
    l1Info: SafeInfo,
) {
    const SECTION = 'Timelock admin Safe';
    startSection(SECTION);

    // current L1 configuration
    logSafeInfo('Current configuration on L1', l1Info);
    md('### Current configuration on L1');
    md();
    mdTable(['Field', 'Value'], safeInfoRows(l1Info));
    if (l1Info.modules.length > 0) {
        check(
            SECTION,
            'WARN',
            `Safe has ${l1Info.modules.length} module(s) enabled on L1, modules can execute transactions without owners signatures`,
        );
    }
    if (l1Info.guard !== ethers.ZeroAddress) {
        check(SECTION, 'WARN', `Safe has a guard set on L1 (${l1Info.guard})`);
    }
    const l1SingletonName = await getTrustedSingletonName(l1Provider, l1Info.singleton);
    if (l1SingletonName !== undefined) {
        check(
            SECTION,
            'PASS',
            `L1 singleton ${l1Info.singleton} is a trusted Safe implementation (${l1SingletonName})`,
        );
    } else {
        check(
            SECTION,
            'WARN',
            `L1 singleton ${l1Info.singleton} is NOT a known Safe v1.3.0/v1.4.1 implementation: the reported configuration may not be enforced`,
        );
    }

    // original setup on L1
    // an RPC error (could not look) is a failure, distinct from a lookup that finds no SafeSetup event
    let creation;
    let creationLookupFailed = false;
    try {
        creation = await getSafeCreation(l1Provider, adminAddress);
    } catch (e: any) {
        creationLookupFailed = true;
        check(
            SECTION,
            'FAIL',
            `Could not recover the Safe original setup from L1 (RPC error, an archive L1 RPC may be needed): ${errorMessage(e)}`,
        );
    }

    if (creation === undefined) {
        if (!creationLookupFailed) {
            check(SECTION, 'WARN', 'SafeSetup event not found on L1: original setup unknown');
        }
    } else {
        console.log(chalk.bold('  Original setup on L1 (SafeSetup event)'));
        console.log(`    Threshold        : ${creation.threshold} of ${creation.owners.length}`);
        console.log(`    Owners           : ${creation.owners.join(', ')}`);

        md('### Original setup on L1');
        md();
        md(
            'A Safe deployed on the L2 at the same address gets this **original** configuration (not the current L1 one).',
        );
        md();
        mdTable(
            ['Field', 'Value'],
            [
                ['Threshold', `${creation.threshold} of ${creation.owners.length}`],
                ['Owners', creation.owners.join('<br>')],
                ['Setup `to`', creation.setupTo],
                ['Fallback handler', creation.fallbackHandler],
                ['Creation tx', creation.txHash],
                ['Creation block', creation.blockNumber],
                ['Factory', creation.factory ?? 'unknown'],
                ['Singleton', creation.singleton ?? 'unknown'],
                ['Creation method', creation.creationMethod ?? 'unknown (factory not called directly)'],
                ['Salt nonce', creation.saltNonce !== undefined ? creation.saltNonce.toString() : 'unknown'],
            ],
        );

        if (sameOwners(creation.owners, l1Info.owners) && creation.threshold === l1Info.threshold) {
            check(SECTION, 'PASS', 'Current L1 owners & threshold are the same as the original setup');
        } else {
            check(
                SECTION,
                'WARN',
                'Current L1 owners/threshold differ from the original setup: a Safe deployed on L2 at the same address starts with the ORIGINAL owners/threshold',
            );
        }

        if (creation.chainSpecific) {
            check(
                SECTION,
                'FAIL',
                'Safe was created with `createChainSpecificProxyWithNonce`: its address depends on the L1 chainId, it can NOT be deployed at the same address on L2',
            );
        }

        if (creation.predictedAddress !== undefined) {
            if (sameAddress(creation.predictedAddress, adminAddress)) {
                check(SECTION, 'PASS', 'Creation parameters recovered: they reproduce the Safe address');
            } else {
                check(
                    SECTION,
                    'WARN',
                    `Recovered creation parameters do not reproduce the Safe address (got ${creation.predictedAddress})`,
                );
            }
        } else {
            check(
                SECTION,
                'WARN',
                'Creation parameters (initializer & saltNonce) not recoverable: the factory was not called directly',
            );
        }

        if (creation.setupParams !== undefined && creation.setupParams.payment > 0n) {
            check(
                SECTION,
                'WARN',
                `Safe setup includes a payment of ${creation.setupParams.payment} (token ${creation.setupParams.paymentToken}), it must be funded to deploy it on L2`,
            );
        }
    }

    // L2 status
    startSection('Timelock admin Safe on L2');
    const l2Code = await l2Provider.getCode(adminAddress);

    if (l2Code !== '0x') {
        check(
            'Timelock admin Safe on L2',
            l2Code === l1Code ? 'PASS' : 'WARN',
            `Bytecode deployed on L2 at ${adminAddress}${l2Code === l1Code ? ' (same as L1)' : ' (DIFFERENT from L1)'}`,
        );

        const l2ProxyName = TRUSTED_SAFE_PROXIES[ethers.keccak256(l2Code)];
        if (l2ProxyName === undefined) {
            check(
                'Timelock admin Safe on L2',
                'FAIL',
                `Code deployed on L2 at ${adminAddress} is NOT an official Safe proxy (codeHash ${ethers.keccak256(l2Code)}): its configuration can not be trusted`,
            );
            return;
        }
        check('Timelock admin Safe on L2', 'PASS', `L2 code at ${adminAddress} is an official ${l2ProxyName}`);

        let l2Info: SafeInfo | undefined;
        try {
            l2Info = await getSafeInfo(l2Provider, adminAddress);
        } catch (e: any) {
            check(
                'Timelock admin Safe on L2',
                'FAIL',
                `Could not inspect the Safe on L2 (RPC error): ${errorMessage(e)}`,
            );
            return;
        }
        if (l2Info === undefined) {
            check('Timelock admin Safe on L2', 'FAIL', 'Code deployed on L2 at the admin address is not a Safe');
            return;
        }

        // the proxy delegates to the singleton in its storage slot 0: only trust its getters if it is a real Safe
        const l2SingletonName = await getTrustedSingletonName(l2Provider, l2Info.singleton);
        if (l2SingletonName === undefined) {
            check(
                'Timelock admin Safe on L2',
                'FAIL',
                `L2 singleton ${l2Info.singleton} is NOT a trusted Safe implementation: the reported owners/threshold can not be trusted`,
            );
        } else {
            check(
                'Timelock admin Safe on L2',
                'PASS',
                `L2 singleton ${l2Info.singleton} is a trusted Safe implementation (${l2SingletonName})`,
            );
        }

        logSafeInfo('Configuration on L2', l2Info);
        md('### Configuration on L2');
        md();
        mdTable(['Field', 'Value'], safeInfoRows(l2Info));

        if (sameOwners(l2Info.owners, l1Info.owners) && l2Info.threshold === l1Info.threshold) {
            check(
                'Timelock admin Safe on L2',
                'PASS',
                'L2 owners & threshold are the same as the current L1 configuration',
            );
        } else {
            check(
                'Timelock admin Safe on L2',
                'WARN',
                'L2 owners/threshold differ from the current L1 configuration, double check them',
            );
        }
        if (l2Info.modules.length > 0) {
            check('Timelock admin Safe on L2', 'WARN', `Safe has ${l2Info.modules.length} module(s) enabled on L2`);
        }
        return;
    }

    check(
        'Timelock admin Safe on L2',
        'WARN',
        `Safe NOT deployed on L2 at ${adminAddress}: the L2 timelock can not be operated until it is deployed`,
    );

    if (creation === undefined || creation.factory === undefined || creation.singleton === undefined) {
        check(
            'Timelock admin Safe on L2',
            'FAIL',
            'Can NOT verify the Safe can be deployed on L2 at the same address: its creation (factory, singleton) is unknown',
        );
        return;
    }

    // check all contracts needed to deploy the Safe at the same address are on L2
    const dependencies: [string, string][] = [
        ['Factory', creation.factory],
        ['Singleton', creation.singleton],
    ];
    if (creation.callback !== undefined && creation.callback !== ethers.ZeroAddress) {
        dependencies.push(['Creation callback', creation.callback]);
    }
    if (creation.setupParams !== undefined) {
        if (creation.setupParams.to !== ethers.ZeroAddress) {
            dependencies.push(['Setup `to` (delegatecall)', creation.setupParams.to]);
        }
        if (creation.setupParams.fallbackHandler !== ethers.ZeroAddress) {
            dependencies.push(['Fallback handler', creation.setupParams.fallbackHandler]);
        }
    }

    md('### Contracts needed on L2 to deploy the Safe at the same address');
    md();
    const rows = [];
    let allDependenciesOk = true;
    for (const [name, address] of dependencies) {
        const [codeL1, codeL2] = await Promise.all([l1Provider.getCode(address), l2Provider.getCode(address)]);
        const ok = codeL2 !== '0x' && codeL2 === codeL1;
        allDependenciesOk = allDependenciesOk && ok;
        let l2Status = 'same bytecode as L1';
        if (codeL2 === '0x') {
            l2Status = 'NOT deployed';
        } else if (!ok) {
            l2Status = 'DIFFERENT bytecode';
        }
        rows.push([name, address, l2Status]);
        console.log(`    ${name.padEnd(26)}: ${address} -> ${ok ? chalk.green(l2Status) : chalk.red(l2Status)}`);
    }
    mdTable(['Contract', 'Address', 'L2 status'], rows);

    if (creation.chainSpecific) {
        return;
    }

    if (creation.creationCalldata === undefined) {
        check(
            'Timelock admin Safe on L2',
            'FAIL',
            'Can NOT verify the Safe can be deployed on L2 at the same address: its creation parameters are unknown',
        );
        return;
    }

    if (!allDependenciesOk) {
        check(
            'Timelock admin Safe on L2',
            'FAIL',
            'Contracts used by the Safe creation are missing or different on L2 (see table)',
        );
    }

    const l2SingletonName = await getTrustedSingletonName(l2Provider, creation.singleton);
    if (l2SingletonName === undefined) {
        check(
            'Timelock admin Safe on L2',
            'FAIL',
            `Singleton ${creation.singleton} on L2 is NOT a trusted Safe implementation`,
        );
    }

    // the setup delegatecall can change the Safe (e.g. its singleton): only known setups are verifiable
    if (creation.setupParams === undefined) {
        check(
            'Timelock admin Safe on L2',
            'FAIL',
            'The Safe initializer is not a Safe `setup` call: the resulting Safe can not be verified',
        );
        return;
    }
    if (creation.setupParams.to !== ethers.ZeroAddress) {
        if (!sameAddress(creation.setupParams.to, SAFE_TO_L2_SETUP.address)) {
            check(
                'Timelock admin Safe on L2',
                'FAIL',
                `The Safe setup delegatecalls an unknown contract (${creation.setupParams.to}): the resulting Safe can not be verified`,
            );
            return;
        }

        const setupCode = await l2Provider.getCode(SAFE_TO_L2_SETUP.address);
        let l2Singleton: string | undefined;
        try {
            [l2Singleton] = safeToL2SetupInterface.decodeFunctionData('setupToL2', creation.setupParams.data);
        } catch (e) {
            l2Singleton = undefined;
        }
        const effectiveSingletonName =
            l2Singleton === undefined ? undefined : await getTrustedSingletonName(l2Provider, l2Singleton);

        if (setupCode === '0x' || ethers.keccak256(setupCode) !== SAFE_TO_L2_SETUP.codeHash) {
            check(
                'Timelock admin Safe on L2',
                'FAIL',
                `SafeToL2Setup (${SAFE_TO_L2_SETUP.address}) is missing or NOT the official one on L2`,
            );
            return;
        }
        if (effectiveSingletonName === undefined) {
            check(
                'Timelock admin Safe on L2',
                'FAIL',
                `The Safe setup (SafeToL2Setup) switches the singleton to ${l2Singleton ?? 'an undecodable address'}, NOT a trusted Safe implementation on L2`,
            );
            return;
        }
        check(
            'Timelock admin Safe on L2',
            'PASS',
            `The Safe setup (SafeToL2Setup) switches the singleton to ${l2Singleton}, a trusted Safe implementation on L2 (${effectiveSingletonName})`,
        );
    }

    // simulate the exact original factory call on L2: it covers the callback, the setup delegatecall
    // (e.g. SafeToL2Setup) and the fallback handler
    let simulatedAddress: string | undefined;
    try {
        const result = await l2Provider.call({ to: creation.factory, data: creation.creationCalldata });
        if (result === '0x') {
            throw new Error('the call returns no data, is the factory deployed on L2?');
        }
        [simulatedAddress] = ethers.AbiCoder.defaultAbiCoder().decode(['address'], result);
    } catch (e: any) {
        check(
            'Timelock admin Safe on L2',
            'FAIL',
            `The Safe can NOT be deployed on L2 at the same address: the original factory call fails on L2 (${errorMessage(e)})`,
        );
        return;
    }

    if (!sameAddress(simulatedAddress, adminAddress)) {
        check(
            'Timelock admin Safe on L2',
            'FAIL',
            `The original factory call on L2 deploys the Safe at ${simulatedAddress}, NOT at ${adminAddress}`,
        );
        return;
    }

    if (allDependenciesOk && l2SingletonName !== undefined) {
        check(
            'Timelock admin Safe on L2',
            'PASS',
            'Simulated on L2: replaying the original factory call deploys the Safe at the same address',
        );
        md();
        md('Deploy it on L2 sending the original creation calldata to the factory:');
        md();
        md('```');
        md(`factory:     ${creation.factory}`);
        md(`method:      ${creation.creationMethod}`);
        md(`singleton:   ${creation.singleton}`);
        md(`saltNonce:   ${creation.saltNonce}`);
        if (creation.callback !== undefined) {
            md(`callback:    ${creation.callback}`);
        }
        md(`initializer: ${creation.initializer}`);
        md(`calldata:    ${creation.creationCalldata}`);
        md('```');
    }
}

(async () => {
    const pathGenesis = argv.genesis as string;
    const pathGenesisOutput = argv['genesis-output'] as string;

    md('# Audit genesis report');
    md();
    mdTable(
        ['Input', 'Value'],
        [
            ['Date', dateStr],
            ['Genesis', pathGenesis],
            ['Genesis output', pathGenesisOutput],
            ['L2 RPC', maskRpcUrl(argv['l2-rpc'])],
            ['L1 RPC', maskRpcUrl(argv['l1-rpc'])],
        ],
    );

    // 1) Read inputs
    const accountsMap = getAccountsMap(readJson(pathGenesis, 'genesis file'));
    const genesisOutput = readJson(pathGenesisOutput, 'genesis output file');

    const addresses = Object.keys(accountsMap);
    if (addresses.length === 0) {
        console.error(chalk.bgRed.white(`No accounts found in provided genesis file: ${pathGenesis}`));
        process.exit(1);
    }

    const { provider: l2Provider, chainId: l2ChainId } = await connect(argv['l2-rpc'], 'L2 RPC');
    const { provider: l1Provider, chainId: l1ChainId } = await connect(argv['l1-rpc'], 'L1 RPC');
    md(`L2 chainId: \`${l2ChainId}\` · L1 chainId: \`${l1ChainId}\``);

    const namesByAddress: Record<string, string> = {};
    Object.entries(genesisOutput.genesisSCNames ?? {}).forEach(([name, address]) => {
        namesByAddress[(address as string).toLowerCase()] = name;
    });
    const genesisAccount = (address: string) =>
        Object.entries(accountsMap).find(([genesisAddress]) => sameAddress(genesisAddress, address))?.[1];

    // 2) Compare genesis vs L2 genesis block
    startSection('Genesis vs L2 genesis block');
    const results: CompareResult[] = [];
    for (const address of addresses) {
        console.log(chalk.blue.bold(`\n=== Checking ${address} ===`));
        try {
            const res = await compareAddressState(l2Provider, address, accountsMap[address]);
            results.push(res);
        } catch (e: any) {
            check('Genesis vs L2 genesis block', 'FAIL', `Error checking ${address}: ${errorMessage(e)}`);
        }
    }

    const okOrMismatch = (match: boolean) => (match ? 'OK' : '**Mismatch**');
    mdTable(
        ['Address', 'Name', 'Nonce', 'Balance', 'Code', 'Storage'],
        results.map((r) => [
            r.address,
            namesByAddress[r.address.toLowerCase()] ?? '',
            okOrMismatch(r.nonce_match),
            okOrMismatch(r.balance_match),
            okOrMismatch(r.code_match),
            r.storage_mismatches.length === 0 ? 'OK' : `**${r.storage_mismatches.length} mismatches**`,
        ]),
    );

    const mismatches = results.filter(
        (r) => !r.nonce_match || !r.balance_match || !r.code_match || r.storage_mismatches.length > 0,
    );
    if (mismatches.length === 0) {
        check(
            'Genesis vs L2 genesis block',
            'PASS',
            `All ${results.length} genesis accounts match the L2 genesis block`,
        );
    } else {
        check(
            'Genesis vs L2 genesis block',
            'FAIL',
            `${mismatches.length} genesis accounts do not match the L2 genesis block`,
        );
    }

    // 3) Timelock
    const TIMELOCK_SECTION = 'L2 Timelock';
    startSection(TIMELOCK_SECTION);
    const adminAddress = genesisOutput.timelockParameters?.adminAddress;
    const minDelay = genesisOutput.timelockParameters?.minDelay;
    const timelockAddress = genesisOutput.genesisSCNames?.[GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK];
    const proxyAdminAddress = genesisOutput.genesisSCNames?.[GENESIS_CONTRACT_NAMES.PROXY_ADMIN];

    if (!ethers.isAddress(adminAddress) || minDelay === undefined || !ethers.isAddress(timelockAddress)) {
        check(
            TIMELOCK_SECTION,
            'FAIL',
            'Genesis output has no timelockParameters (adminAddress, minDelay) or no timelock address',
        );
    } else {
        mdTable(
            ['Field', 'Value'],
            [
                ['Timelock', timelockAddress],
                ['adminAddress', adminAddress],
                ['minDelay', minDelay],
            ],
        );

        if (sameAddress(adminAddress, POLYGON_MULTISIG)) {
            check(TIMELOCK_SECTION, 'FAIL', `adminAddress is the Polygon multisig (${POLYGON_MULTISIG})`);
        }
        // nobody could ever propose an L2 upgrade: upgrades locked forever
        if (sameAddress(adminAddress, ethers.ZeroAddress)) {
            check(TIMELOCK_SECTION, 'FAIL', 'adminAddress is the zero address: nobody can propose L2 upgrades');
        }
        if (sameAddress(adminAddress, timelockAddress)) {
            check(TIMELOCK_SECTION, 'FAIL', 'adminAddress is the timelock itself: nobody can propose L2 upgrades');
        }

        // genesis file storage: must be exactly the storage written by createSovereignGenesis
        const timelockGenesis = genesisAccount(timelockAddress);
        if (timelockGenesis === undefined) {
            check(TIMELOCK_SECTION, 'FAIL', `Timelock ${timelockAddress} not found in the genesis file`);
        }
        const genesisStorage = toStorageMap(timelockGenesis?.storage ?? {});
        const expectedStorage = toStorageMap(initializeTimelockStorage(minDelay, adminAddress, timelockAddress));
        const storageValue = (slot: string) => genesisStorage[ethers.toBeHex(BigInt(slot), 32)] ?? 0n;

        const genesisRolesOk = Object.values(TIMELOCK.ROLES).every(
            (roleHash) => storageValue(getTimelockRoleMemberSlot(roleHash, adminAddress)) === 1n,
        );
        check(
            TIMELOCK_SECTION,
            genesisRolesOk ? 'PASS' : 'FAIL',
            `Genesis timelock storage grants ${genesisRolesOk ? '' : 'NOT '}all roles (${Object.keys(TIMELOCK.ROLES).join(', ')}) to adminAddress`,
        );
        const genesisMinDelayOk = storageValue(ethers.toBeHex(TIMELOCK.MINDELAY_STORAGE_POS, 32)) === BigInt(minDelay);
        check(
            TIMELOCK_SECTION,
            genesisMinDelayOk ? 'PASS' : 'FAIL',
            `Genesis timelock minDelay ${genesisMinDelayOk ? 'is' : 'is NOT'} ${minDelay}`,
        );

        // no other role member or unexpected storage: identify role members among known addresses
        const roleMemberLabels: Record<string, string> = {};
        [...Object.keys(accountsMap), POLYGON_MULTISIG].forEach((account) => {
            Object.entries(TIMELOCK.ROLES).forEach(([roleName, roleHash]) => {
                const label = `${roleName} member: ${ethers.getAddress(account)}`;
                roleMemberLabels[ethers.toBeHex(BigInt(getTimelockRoleMemberSlot(roleHash, account)), 32)] = label;
            });
        });
        const storageDiffs: string[][] = [];
        new Set([...Object.keys(expectedStorage), ...Object.keys(genesisStorage)]).forEach((slot) => {
            const expectedValue = expectedStorage[slot] ?? 0n;
            const genesisValue = genesisStorage[slot] ?? 0n;
            if (expectedValue !== genesisValue) {
                storageDiffs.push([
                    slot,
                    roleMemberLabels[slot] ?? 'unknown',
                    ethers.toBeHex(expectedValue, 32),
                    ethers.toBeHex(genesisValue, 32),
                ]);
            }
        });
        if (storageDiffs.length === 0) {
            check(
                TIMELOCK_SECTION,
                'PASS',
                'Genesis timelock storage is exactly the expected one: roles granted only to adminAddress (and TIMELOCK_ADMIN_ROLE to the timelock itself)',
            );
        } else {
            check(
                TIMELOCK_SECTION,
                'FAIL',
                `Genesis timelock storage differs from the expected one in ${storageDiffs.length} slot(s): other addresses may hold timelock roles`,
            );
            mdTable(['Slot', 'Meaning', 'Expected', 'Genesis'], storageDiffs);
        }

        // current L2 state
        try {
            for (const [roleName, roleHash] of Object.entries(TIMELOCK.ROLES)) {
                const [hasRole] = await contractCall(l2Provider, timelockInterface, timelockAddress, 'hasRole', [
                    roleHash,
                    adminAddress,
                ]);
                check(
                    TIMELOCK_SECTION,
                    hasRole ? 'PASS' : 'FAIL',
                    `L2 timelock: adminAddress ${hasRole ? 'has' : 'does NOT have'} ${roleName}`,
                );
            }
            const [l2MinDelay] = await contractCall(l2Provider, timelockInterface, timelockAddress, 'getMinDelay');
            check(TIMELOCK_SECTION, 'INFO', `L2 timelock current minDelay: ${l2MinDelay} seconds`);
        } catch (e: any) {
            check(TIMELOCK_SECTION, 'FAIL', `Error reading the L2 timelock: ${errorMessage(e)}`);
        }

        // roles granted/revoked on L2 after the genesis
        try {
            const roleNames: Record<string, string> = {};
            Object.entries(TIMELOCK.ROLES).forEach(([roleName, roleHash]) => {
                roleNames[roleHash] = roleName;
            });
            const grantedTopic = roleEventsInterface.getEvent('RoleGranted')!.topicHash;
            const revokedTopic = roleEventsInterface.getEvent('RoleRevoked')!.topicHash;
            const logs = await getAllLogs(l2Provider, {
                address: timelockAddress,
                topics: [[grantedTopic, revokedTopic]],
            });

            // genesis role members, then apply the events in order
            const members = new Map<string, Set<string>>();
            Object.values(TIMELOCK.ROLES).forEach((roleHash) => {
                members.set(roleHash, new Set([adminAddress.toLowerCase()]));
            });
            members.get(TIMELOCK.ROLES.TIMELOCK_ADMIN_ROLE)!.add(timelockAddress.toLowerCase());
            for (const log of logs) {
                const event = roleEventsInterface.parseLog(log)!;
                const roleHash = event.args.role as string;
                if (!members.has(roleHash)) {
                    members.set(roleHash, new Set());
                }
                if (event.name === 'RoleGranted') {
                    members.get(roleHash)!.add(event.args.account.toLowerCase());
                } else {
                    members.get(roleHash)!.delete(event.args.account.toLowerCase());
                }
            }

            const unexpectedMembers: string[] = [];
            members.forEach((accounts, roleHash) => {
                accounts.forEach((account) => {
                    const expected =
                        account === adminAddress.toLowerCase() ||
                        (roleHash === TIMELOCK.ROLES.TIMELOCK_ADMIN_ROLE && account === timelockAddress.toLowerCase());
                    if (!expected) {
                        unexpectedMembers.push(`${roleNames[roleHash] ?? roleHash}: ${ethers.getAddress(account)}`);
                    }
                });
            });

            if (unexpectedMembers.length === 0) {
                check(
                    TIMELOCK_SECTION,
                    'PASS',
                    `L2 timelock: no roles granted to other addresses after the genesis (${logs.length} role events)`,
                );
            } else {
                check(
                    TIMELOCK_SECTION,
                    'FAIL',
                    `L2 timelock: roles granted to other addresses after the genesis: ${unexpectedMembers.join(', ')}`,
                );
            }
        } catch (e: any) {
            check(
                TIMELOCK_SECTION,
                'FAIL',
                `Could not scan the complete L2 timelock role history, roles granted to other addresses can not be ruled out: ${errorMessage(e)}`,
            );
        }

        if (!ethers.isAddress(proxyAdminAddress)) {
            check(
                TIMELOCK_SECTION,
                'FAIL',
                `Genesis output has no ${GENESIS_CONTRACT_NAMES.PROXY_ADMIN} address: the ProxyAdmin owner can not be checked`,
            );
        } else {
            // owner must be the timelock from the genesis block, not only now
            for (const [blockTag, when] of [
                ['earliest', 'at genesis'],
                ['latest', 'now'],
            ]) {
                try {
                    const [owner] = await contractCall(
                        l2Provider,
                        ownableInterface,
                        proxyAdminAddress,
                        'owner',
                        [],
                        blockTag,
                    );
                    const ok = sameAddress(owner, timelockAddress);
                    check(
                        TIMELOCK_SECTION,
                        ok ? 'PASS' : 'FAIL',
                        `L2 ProxyAdmin (${proxyAdminAddress}) owner ${when} is ${ok ? 'the timelock' : `NOT the timelock (${owner})`}`,
                    );
                } catch (e: any) {
                    check(
                        TIMELOCK_SECTION,
                        'FAIL',
                        `Error reading the L2 ProxyAdmin owner ${when}: ${errorMessage(e)}`,
                    );
                }
            }

            // every proxy must be administered by the ProxyAdmin (EIP-1967 admin slot), in genesis & on L2
            const proxies = new Map<string, string>();
            Object.entries(accountsMap).forEach(([address, account]) => {
                if ((toStorageMap(account.storage ?? {})[EIP1967_ADMIN_SLOT] ?? 0n) !== 0n) {
                    proxies.set(address.toLowerCase(), namesByAddress[address.toLowerCase()] ?? '');
                }
            });
            Object.entries(genesisOutput.genesisSCNames ?? {}).forEach(([name, address]) => {
                if (name.toLowerCase().endsWith(' proxy')) {
                    proxies.set((address as string).toLowerCase(), name);
                }
            });

            if (proxies.size === 0) {
                check(TIMELOCK_SECTION, 'FAIL', 'No upgradeable proxies found in the genesis');
            } else {
                try {
                    const rows: string[][] = [];
                    const wrongProxies: string[] = [];
                    for (const [address, name] of proxies) {
                        const genesisValue =
                            toStorageMap(genesisAccount(address)?.storage ?? {})[EIP1967_ADMIN_SLOT] ?? 0n;
                        const l2Value = await l2Provider.getStorage(address, EIP1967_ADMIN_SLOT);
                        const genesisAdmin = storageValueToAddress(genesisValue);
                        const l2Admin = storageValueToAddress(l2Value);
                        const ok =
                            sameAddress(genesisAdmin, proxyAdminAddress) && sameAddress(l2Admin, proxyAdminAddress);
                        if (!ok) {
                            wrongProxies.push(`${name || address}`);
                        }
                        rows.push([name, ethers.getAddress(address), genesisAdmin, l2Admin, ok ? 'OK' : '**WRONG**']);
                    }
                    md('### Upgradeable proxies');
                    md();
                    mdTable(['Proxy', 'Address', 'Genesis admin', 'L2 admin', 'Status'], rows);
                    if (wrongProxies.length === 0) {
                        check(
                            TIMELOCK_SECTION,
                            'PASS',
                            `All ${proxies.size} upgradeable proxies are administered by the ProxyAdmin (genesis & L2)`,
                        );
                    } else {
                        check(
                            TIMELOCK_SECTION,
                            'FAIL',
                            `Proxies NOT administered by the ProxyAdmin (genesis or L2): ${wrongProxies.join(', ')}`,
                        );
                    }
                } catch (e: any) {
                    check(TIMELOCK_SECTION, 'FAIL', `Error reading the L2 proxies admin: ${errorMessage(e)}`);
                }
            }
        }

        // 4) Timelock admin on L1
        const ADMIN_SECTION = 'Timelock admin on L1';
        startSection(ADMIN_SECTION);
        const [l1Code, l1Nonce, l1Balance] = await Promise.all([
            l1Provider.getCode(adminAddress),
            l1Provider.getTransactionCount(adminAddress),
            l1Provider.getBalance(adminAddress),
        ]);
        md(
            `adminAddress \`${adminAddress}\` on L1: nonce \`${l1Nonce}\`, balance \`${ethers.formatEther(l1Balance)}\` ETH`,
        );
        md();

        if (l1Code === '0x') {
            if (l1Nonce > 0) {
                check(
                    ADMIN_SECTION,
                    'PASS',
                    `adminAddress is an EOA on L1 (nonce ${l1Nonce}): make sure you control its private key, it is the same address on L2`,
                );
            } else {
                check(
                    ADMIN_SECTION,
                    'WARN',
                    'adminAddress has no code and no transactions on L1: it can NOT be confirmed as an EOA (it could be a not yet deployed contract). Make sure you control it',
                );
            }
            const l2Code = await l2Provider.getCode(adminAddress);
            if (l2Code !== '0x') {
                check(ADMIN_SECTION, 'WARN', 'adminAddress has no code on L1 but it has code on L2, double check it');
            }
        } else if (l1Code.startsWith(EIP7702_DELEGATION_PREFIX) && ethers.dataLength(l1Code) === 23) {
            check(
                ADMIN_SECTION,
                'WARN',
                `adminAddress is an EOA with an EIP-7702 delegation on L1 (to ${ethers.getAddress(ethers.dataSlice(l1Code, 3))}): delegations are per chain, double check it`,
            );
        } else {
            let l1Info: SafeInfo | undefined;
            let l1InfoError: string | undefined;
            try {
                l1Info = await getSafeInfo(l1Provider, adminAddress);
            } catch (e: any) {
                l1InfoError = errorMessage(e);
            }
            if (l1InfoError !== undefined) {
                check(ADMIN_SECTION, 'FAIL', `Could not inspect adminAddress on L1 (RPC error): ${l1InfoError}`);
            } else if (l1Info === undefined || TRUSTED_SAFE_PROXIES[ethers.keccak256(l1Code)] === undefined) {
                const l2AdminCode = await l2Provider.getCode(adminAddress);
                const notSafeReason =
                    l1Info === undefined
                        ? 'that is NOT a Safe'
                        : 'that answers like a Safe but is NOT an official Safe proxy';
                check(
                    ADMIN_SECTION,
                    'WARN',
                    `adminAddress is a contract on L1 ${notSafeReason} (code size ${ethers.dataLength(l1Code)} bytes, codeHash ${ethers.keccak256(l1Code)}): review it manually`,
                );
                check(
                    ADMIN_SECTION,
                    'INFO',
                    l2AdminCode === '0x'
                        ? 'adminAddress has no code on L2'
                        : `adminAddress has code on L2 (${l2AdminCode === l1Code ? 'same' : 'DIFFERENT'} bytecode as L1)`,
                );
            } else {
                check(
                    ADMIN_SECTION,
                    'PASS',
                    `adminAddress is an official ${TRUSTED_SAFE_PROXIES[ethers.keccak256(l1Code)]} on L1 (Safe v${l1Info.version}, threshold ${l1Info.threshold} of ${l1Info.owners.length})`,
                );
                await auditSafeAdmin(l1Provider, l2Provider, adminAddress, l1Code, l1Info);
            }
        }
    }

    // 5) Summary
    const count = (status: Status) => checks.filter((c) => c.status === status).length;
    const failed = count('FAIL') > 0;

    const summary = [
        '',
        '## Summary',
        '',
        `**Result: ${failed ? '❌ FAIL' : '✅ PASS'}** (${count('PASS')} pass, ${count('WARN')} warnings, ${count('FAIL')} failures)`,
        '',
    ];
    const problems = checks.filter((c) => c.status === 'FAIL' || c.status === 'WARN');
    if (problems.length > 0) {
        summary.push('| Status | Section | Check |', '| --- | --- | --- |');
        problems.forEach((c) =>
            summary.push(`| ${STATUS_ICON[c.status]} ${c.status} | ${c.section} | ${escapeMdCell(c.message)} |`),
        );
        summary.push('');
    }
    // summary right after the inputs
    const inputsEnd = report.findIndex((line) => line.startsWith('L2 chainId'));
    report.splice(inputsEnd + 1, 0, ...summary);

    fs.writeFileSync(pathReport, `${report.join('\n')}\n`);

    console.log(chalk.bold('\n=== Summary ==='));
    console.log(
        `${chalk.green(`${count('PASS')} pass`)}, ${chalk.yellow(`${count('WARN')} warnings`)}, ${chalk.red(`${count('FAIL')} failures`)}`,
    );
    problems.forEach((c) => console.log(STATUS_COLOR[c.status](` - [${c.status}] ${c.section}: ${c.message}`)));
    console.log(chalk.bold(`\nReport saved at: ${pathReport}`));

    process.exit(failed ? 1 : 0);
})().catch((e) => {
    console.error(chalk.bgRed.white(errorMessage(e)));
    process.exit(1);
});
