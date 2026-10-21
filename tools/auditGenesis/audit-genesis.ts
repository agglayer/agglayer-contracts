/* eslint-disable no-console, no-await-in-loop, no-restricted-syntax */

import fs from 'fs';
import path from 'path';
import { ethers } from 'ethers';
import chalk from 'chalk';
import yargs from 'yargs/yargs';
import { getSafeCreation, getSafeInfo, SafeInfo } from './safe-inspector';

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
const POLYGON_MULTISIG = '0x242daE44F5d8fb54B198D03a94dA45B5a4413e21';
const TIMELOCK_CONTRACT_NAME = 'PolygonZkEVMTimelock';
const PROXY_ADMIN_CONTRACT_NAME = 'ProxyAdmin';
const TIMELOCK_ROLES = ['TIMELOCK_ADMIN_ROLE', 'PROPOSER_ROLE', 'EXECUTOR_ROLE', 'CANCELLER_ROLE'];
const TIMELOCK_MIN_DELAY_SLOT = ethers.toBeHex(2, 32);
const EIP7702_DELEGATION_PREFIX = '0xef0100';
const dateStr = new Date().toISOString();
const pathReport = path.join(__dirname, `audit-genesis-${dateStr}.md`);
// ============================= //

const timelockInterface = new ethers.Interface([
    'function hasRole(bytes32 role, address account) view returns (bool)',
    'function getMinDelay() view returns (uint256)',
]);
const ownableInterface = new ethers.Interface(['function owner() view returns (address)']);

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

function md(line = '') {
    report.push(line);
}

function mdTable(headers: string[], rows: (string | number | bigint)[][]) {
    md(`| ${headers.join(' | ')} |`);
    md(`| ${headers.map(() => '---').join(' | ')} |`);
    rows.forEach((row) => md(`| ${row.map((cell) => String(cell).replace(/\|/g, '\\|')).join(' | ')} |`));
    md();
}

const STATUS_ICON: Record<Status, string> = { PASS: '✅', WARN: '⚠️', FAIL: '❌', INFO: 'ℹ️' };
const STATUS_COLOR: Record<Status, chalk.Chalk> = {
    PASS: chalk.green,
    WARN: chalk.yellow,
    FAIL: chalk.red,
    INFO: chalk.blue,
};

function check(section: string, status: Status, message: string) {
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

// hide RPC API keys in the report (e.g. infura `/v3/<key>`, alchemy `/v2/<key>`, `?apikey=<key>`)
function maskRpcUrl(url: string) {
    return url.replace(/\/(v\d+)\/[^/?]+/, '/$1/***').replace(/\?.*$/, '?***');
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
        throw new Error(`Cannot connect to ${label} (${maskRpcUrl(url)}): ${e.message}`);
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
        const normalizedSlot = slot.startsWith('0x') ? slot : `0x${slot}`;
        const actual = await provider.getStorage(address, normalizedSlot, BLOCK_TAG);

        if (BigInt(actual) !== BigInt(expectedValue)) {
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

// storage slot of `account` in the `_roles[role].members` mapping (OZ v4.8.2 AccessControl, slot 0)
function timelockRoleMemberSlot(role: string, account: string) {
    const roleSlot = ethers.solidityPackedKeccak256(['uint256', 'uint256'], [ethers.id(role), 0]);
    return ethers.solidityPackedKeccak256(['uint256', 'uint256'], [account, roleSlot]);
}

async function contractCall(
    provider: ethers.JsonRpcProvider,
    contractInterface: ethers.Interface,
    to: string,
    fn: string,
    args: any[] = [],
) {
    const data = contractInterface.encodeFunctionData(fn, args);
    return contractInterface.decodeFunctionResult(fn, await provider.call({ to, data }));
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

    // original setup on L1
    let creation;
    try {
        creation = await getSafeCreation(l1Provider, adminAddress);
    } catch (e: any) {
        check(
            SECTION,
            'WARN',
            `Could not recover the Safe original setup from L1 (an archive L1 RPC may be needed): ${e.message}`,
        );
    }

    if (creation === undefined) {
        check(SECTION, 'WARN', 'SafeSetup event not found on L1: original setup unknown');
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

        const l2Info = await getSafeInfo(l2Provider, adminAddress);
        if (l2Info === undefined) {
            check('Timelock admin Safe on L2', 'FAIL', 'Code deployed on L2 at the admin address is not a Safe');
            return;
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
        return;
    }

    // check all contracts needed to deploy the Safe at the same address are on L2
    const dependencies: [string, string][] = [
        ['Factory', creation.factory],
        ['Singleton', creation.singleton],
    ];
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

    if (
        allDependenciesOk &&
        creation.predictedAddress !== undefined &&
        sameAddress(creation.predictedAddress, adminAddress)
    ) {
        check(
            'Timelock admin Safe on L2',
            'PASS',
            'The Safe can be deployed on L2 at the same address by replaying its creation',
        );
        md();
        md('Deploy it on L2 calling the factory with the original parameters:');
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
        md('```');
    } else if (!allDependenciesOk) {
        check(
            'Timelock admin Safe on L2',
            'FAIL',
            'The Safe can NOT be deployed on L2 at the same address: contracts needed are missing or different on L2',
        );
    } else {
        check(
            'Timelock admin Safe on L2',
            'FAIL',
            'Can NOT verify the Safe can be deployed on L2 at the same address: its creation parameters are unknown',
        );
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
            check('Genesis vs L2 genesis block', 'FAIL', `Error checking ${address}: ${e.message}`);
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
    const timelockAddress = genesisOutput.genesisSCNames?.[TIMELOCK_CONTRACT_NAME];
    const proxyAdminAddress = genesisOutput.genesisSCNames?.[PROXY_ADMIN_CONTRACT_NAME];

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

        // genesis file storage
        const timelockGenesis = genesisAccount(timelockAddress);
        const timelockStorage = timelockGenesis?.storage ?? {};
        const storageValue = (slot: string) => {
            const entry = Object.entries(timelockStorage).find(([key]) => BigInt(key) === BigInt(slot));
            return entry === undefined ? 0n : BigInt(entry[1]);
        };

        const genesisRolesOk = TIMELOCK_ROLES.every(
            (role) => storageValue(timelockRoleMemberSlot(role, adminAddress)) === 1n,
        );
        check(
            TIMELOCK_SECTION,
            genesisRolesOk ? 'PASS' : 'FAIL',
            `Genesis timelock storage grants ${genesisRolesOk ? '' : 'NOT '}all roles (${TIMELOCK_ROLES.join(', ')}) to adminAddress`,
        );
        const genesisMinDelayOk = storageValue(TIMELOCK_MIN_DELAY_SLOT) === BigInt(minDelay);
        check(
            TIMELOCK_SECTION,
            genesisMinDelayOk ? 'PASS' : 'FAIL',
            `Genesis timelock minDelay ${genesisMinDelayOk ? 'is' : 'is NOT'} ${minDelay}`,
        );

        // current L2 state
        try {
            for (const role of TIMELOCK_ROLES) {
                const [hasRole] = await contractCall(l2Provider, timelockInterface, timelockAddress, 'hasRole', [
                    ethers.id(role),
                    adminAddress,
                ]);
                check(
                    TIMELOCK_SECTION,
                    hasRole ? 'PASS' : 'FAIL',
                    `L2 timelock: adminAddress ${hasRole ? 'has' : 'does NOT have'} ${role}`,
                );
            }
            const [l2MinDelay] = await contractCall(l2Provider, timelockInterface, timelockAddress, 'getMinDelay');
            check(TIMELOCK_SECTION, 'INFO', `L2 timelock current minDelay: ${l2MinDelay} seconds`);
        } catch (e: any) {
            check(TIMELOCK_SECTION, 'FAIL', `Error reading the L2 timelock: ${e.message}`);
        }

        if (ethers.isAddress(proxyAdminAddress)) {
            try {
                const [owner] = await contractCall(l2Provider, ownableInterface, proxyAdminAddress, 'owner');
                const ok = sameAddress(owner, timelockAddress);
                check(
                    TIMELOCK_SECTION,
                    ok ? 'PASS' : 'FAIL',
                    `L2 ProxyAdmin (${proxyAdminAddress}) owner is ${ok ? 'the timelock' : `NOT the timelock (${owner})`}`,
                );
            } catch (e: any) {
                check(TIMELOCK_SECTION, 'FAIL', `Error reading the L2 ProxyAdmin owner: ${e.message}`);
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
            const l1Info = await getSafeInfo(l1Provider, adminAddress);
            if (l1Info === undefined) {
                const l2AdminCode = await l2Provider.getCode(adminAddress);
                check(
                    ADMIN_SECTION,
                    'WARN',
                    `adminAddress is a contract on L1 that is NOT a Safe (code size ${ethers.dataLength(l1Code)} bytes, codeHash ${ethers.keccak256(l1Code)}): review it manually`,
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
                    `adminAddress is a Safe v${l1Info.version} on L1 (threshold ${l1Info.threshold} of ${l1Info.owners.length})`,
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
            summary.push(
                `| ${STATUS_ICON[c.status]} ${c.status} | ${c.section} | ${c.message.replace(/\|/g, '\\|')} |`,
            ),
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
    console.error(chalk.bgRed.white(e.message));
    process.exit(1);
});
