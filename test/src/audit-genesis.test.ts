/* eslint-disable no-await-in-loop, no-restricted-syntax, no-console */
import { expect } from 'chai';
import { ethers } from 'ethers';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { ChildProcess, spawn, spawnSync } from 'child_process';
import { getTimelockRoleMemberSlot, initializeTimelockStorage } from '../../src/genesis/genesis-helpers';
import { GENESIS_CONTRACT_NAMES, POLYGON_MULTISIG, TIMELOCK } from '../../src/constants';
import { formatGenesis } from '../../tools/createSovereignGenesis/helpers';
import { addSAFEBytecode } from '../../tools/createSovereignGenesis/helpers-safe';

/**
 * End-to-end tests of tools/auditGenesis: every scenario boots a local L2 (anvil) from a genesis built with the
 * createSovereignGenesis helpers, and audits it against a local L1 (anvil) where the admin Safes are created.
 * No external RPC is used. Skipped when anvil (Foundry) is not installed.
 */
const REPO_ROOT = path.join(__dirname, '../..');
const AUDIT_TOOL = path.join(REPO_ROOT, 'tools/auditGenesis/audit-genesis.ts');
const GENESIS_BASE = path.join(REPO_ROOT, 'tools/createSovereignGenesis/genesis-base.json.example');
const ANVIL_FIRST_PORT = 18600;
const L1_CHAIN_ID = 1337;
const MIN_DELAY = 3600;
const SAFE_FACTORY = '0x4e1DCf7AD4e460CfD30791CCC4F9c8a4f820ec67'; // SafeProxyFactory v1.4.1
const SAFE_L2_SINGLETON = '0x29fcB43b46531BcA003ddC8FCB67FFE91900C762'; // SafeL2 v1.4.1
const SENDER = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266'; // anvil default account
const EIP1967_ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';

const safeInterface = new ethers.Interface([
    'function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)',
]);
const factoryInterface = new ethers.Interface([
    'function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce) returns (address)',
    'function createProxyWithCallback(address _singleton, bytes initializer, uint256 saltNonce, address callback) returns (address)',
]);

const anvilAvailable = spawnSync('anvil', ['--version']).status === 0;

interface GenesisFiles {
    alloc: string;
    output: string;
    chainId: number;
}

interface AuditResult {
    code: number | null;
    out: string;
    fails: string[];
    warns: string[];
}

describe('Tool auditGenesis', function () {
    this.timeout(600000);

    const anvils: ChildProcess[] = [];
    let nextPort = ANVIL_FIRST_PORT;
    let nextChainId = 9000;
    let tmpDir: string;
    let l1Url: string;
    let l1: ethers.JsonRpcProvider;

    /**
     * Build a sovereign genesis (geth alloc) with the timelock admin and the Safe contracts, plus its
     * createSovereignGenesis-like output
     */
    function buildGenesis(
        name: string,
        adminAddress: string,
        mutate?: (alloc: any, genesisSCNames: Record<string, string>) => void,
    ): GenesisFiles {
        const chainId = nextChainId;
        nextChainId += 1;
        let genesis = JSON.parse(fs.readFileSync(GENESIS_BASE, 'utf8'));
        const timelock = genesis.genesis.find(
            (obj: any) => obj.contractName === GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK,
        );
        timelock.storage = initializeTimelockStorage(MIN_DELAY, adminAddress, timelock.address);
        genesis = addSAFEBytecode(genesis);

        const genesisSCNames: Record<string, string> = {};
        genesis.genesis.forEach((obj: any) => {
            if (obj.bytecode !== undefined) {
                genesisSCNames[obj.contractName] = obj.address;
            }
        });
        const alloc: any = formatGenesis(genesis, 'geth');
        if (mutate !== undefined) {
            mutate(alloc, genesisSCNames);
        }

        const files = {
            alloc: path.join(tmpDir, `${name}-alloc.json`),
            output: path.join(tmpDir, `${name}-output.json`),
            chainId,
        };
        fs.writeFileSync(files.alloc, JSON.stringify(alloc));
        fs.writeFileSync(
            files.output,
            JSON.stringify({
                chainID: chainId,
                l1ChainID: L1_CHAIN_ID,
                genesisSCNames,
                timelockParameters: { adminAddress, minDelay: MIN_DELAY },
            }),
        );
        return files;
    }

    async function startAnvil(alloc: string, chainId: number): Promise<string> {
        const port = nextPort;
        nextPort += 1;
        const genesisPath = path.join(tmpDir, `anvil-${port}.json`);
        const forks = [
            'homesteadBlock',
            'eip150Block',
            'eip155Block',
            'eip158Block',
            'byzantiumBlock',
            'constantinopleBlock',
            'petersburgBlock',
            'istanbulBlock',
            'berlinBlock',
            'londonBlock',
            'shanghaiTime',
            'cancunTime',
        ];
        fs.writeFileSync(
            genesisPath,
            JSON.stringify({
                config: { chainId, ...Object.fromEntries(forks.map((fork) => [fork, 0])) },
                gasLimit: '0x1c9c380',
                difficulty: '0x0',
                alloc: JSON.parse(fs.readFileSync(alloc, 'utf8')),
            }),
        );
        anvils.push(spawn('anvil', ['--port', String(port), '--init', genesisPath, '--silent'], { stdio: 'ignore' }));

        const url = `http://127.0.0.1:${port}`;
        for (let i = 0; i < 100; i++) {
            try {
                const res = await fetch(url, {
                    method: 'POST',
                    headers: { 'content-type': 'application/json' },
                    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'eth_chainId', params: [] }),
                });
                if (res.ok) {
                    return url;
                }
            } catch (e) {
                // not listening yet
            }
            await new Promise((resolve) => {
                setTimeout(resolve, 100);
            });
        }
        throw new Error(`anvil on port ${port} did not start`);
    }

    async function startL2(files: GenesisFiles) {
        return startAnvil(files.alloc, files.chainId);
    }

    function runAudit(l2Url: string, files: GenesisFiles, outputFile = files.output, l1RpcUrl = l1Url): AuditResult {
        const res = spawnSync(
            'npx',
            [
                'ts-node',
                '--transpile-only',
                AUDIT_TOOL,
                '--l2-rpc',
                l2Url,
                '--genesis',
                files.alloc,
                '--genesis-output',
                outputFile,
                '--l1-rpc',
                l1RpcUrl,
            ],
            { cwd: REPO_ROOT, encoding: 'utf8', timeout: 300000 },
        );
        // eslint-disable-next-line no-control-regex
        const out = `${res.stdout}${res.stderr}`.replace(/\x1b\[[0-9;]*m/g, '');
        const report = out.match(/Report saved at: (.*)/);
        if (report !== null) {
            fs.rmSync(report[1].trim(), { force: true });
        }
        const lines = out.split('\n');
        return {
            code: res.status,
            out,
            fails: lines.filter((line) => line.startsWith('[FAIL]')),
            warns: lines.filter((line) => line.startsWith('[WARN]')),
        };
    }

    async function sendAs(url: string, from: string, to: string, data: string) {
        const provider = new ethers.JsonRpcProvider(url, undefined, { staticNetwork: true });
        await provider.send('anvil_impersonateAccount', [from]);
        await provider.send('anvil_setBalance', [from, '0x56bc75e2d63100000']);
        const hash = await provider.send('eth_sendTransaction', [{ from, to, data, gas: '0x1c9c380' }]);
        const receipt = await provider.waitForTransaction(hash);
        provider.destroy();
        expect(receipt!.status).to.equal(1);
    }

    /**
     * Create a Safe v1.4.1 on the local L1
     * @returns Safe address and the factory calldata (to replay it on L2)
     */
    async function createSafe(owners: string[], threshold: number, saltNonce: number, callback?: string) {
        const initializer = safeInterface.encodeFunctionData('setup', [
            owners,
            threshold,
            ethers.ZeroAddress,
            '0x',
            ethers.ZeroAddress,
            ethers.ZeroAddress,
            0,
            ethers.ZeroAddress,
        ]);
        const calldata =
            callback === undefined
                ? factoryInterface.encodeFunctionData('createProxyWithNonce', [
                      SAFE_L2_SINGLETON,
                      initializer,
                      saltNonce,
                  ])
                : factoryInterface.encodeFunctionData('createProxyWithCallback', [
                      SAFE_L2_SINGLETON,
                      initializer,
                      saltNonce,
                      callback,
                  ]);
        const [safe] = ethers.AbiCoder.defaultAbiCoder().decode(
            ['address'],
            await l1.call({ from: SENDER, to: SAFE_FACTORY, data: calldata }),
        );
        await sendAs(l1Url, SENDER, SAFE_FACTORY, calldata);
        return { safe: safe as string, calldata };
    }

    before(async function () {
        if (!anvilAvailable) {
            console.warn('    anvil (Foundry) is not installed: skipping auditGenesis tests');
            this.skip();
        }
        tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-genesis-test-'));

        // local L1 with the Safe contracts
        nextChainId = L1_CHAIN_ID;
        const l1Files = buildGenesis('l1', SENDER);
        nextChainId = 9000;
        l1Url = await startAnvil(l1Files.alloc, L1_CHAIN_ID);
        l1 = new ethers.JsonRpcProvider(l1Url, undefined, { staticNetwork: true });
    });

    after(() => {
        anvils.forEach((anvil) => anvil.kill());
        if (l1 !== undefined) {
            l1.destroy();
        }
        if (tmpDir !== undefined) {
            fs.rmSync(tmpDir, { recursive: true, force: true });
        }
    });

    it('EOA admin (no bytecode): reported as most probably an EOA, PASS', async () => {
        const admin = ethers.Wallet.createRandom().address;
        const files = buildGenesis('eoa', admin);
        const res = runAudit(await startL2(files), files);

        expect(res.code, res.out).to.equal(0);
        expect(res.fails).to.deep.equal([]);
        expect(res.warns).to.deep.equal([]);
        expect(res.out).to.include('adminAddress is most probably an EOA since it has no bytecode');
        expect(res.out).to.include('Genesis timelock storage is exactly the expected one');
        expect(res.out).to.include('upgradeable proxies are administered by the ProxyAdmin');
        expect(res.out).to.include('owner at genesis is the timelock');
    });

    it('Polygon multisig, zero address and the timelock itself as admin: FAIL', async () => {
        const multisig = buildGenesis('multisig', POLYGON_MULTISIG);
        const resMultisig = runAudit(await startL2(multisig), multisig);
        expect(resMultisig.code).to.equal(1);
        expect(resMultisig.fails.join('\n')).to.include('adminAddress is the Polygon multisig');

        const zero = buildGenesis('zero', ethers.ZeroAddress);
        const resZero = runAudit(await startL2(zero), zero);
        expect(resZero.code).to.equal(1);
        expect(resZero.fails.join('\n')).to.include('adminAddress is the zero address');

        const base = JSON.parse(fs.readFileSync(GENESIS_BASE, 'utf8'));
        const timelockAddress = base.genesis.find(
            (obj: any) => obj.contractName === GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK,
        ).address;
        const self = buildGenesis('timelock-self', timelockAddress);
        const resSelf = runAudit(await startL2(self), self);
        expect(resSelf.code).to.equal(1);
        expect(resSelf.fails.join('\n')).to.include('adminAddress is the timelock itself');
    });

    it('L2 chainId different from the genesis chainID: FAIL', async () => {
        const admin = ethers.Wallet.createRandom().address;
        const files = buildGenesis('wrong-chain', admin);
        const l2Url = await startL2(files);
        const wrongOutput = path.join(tmpDir, 'wrong-chain-output-bad.json');
        const output = JSON.parse(fs.readFileSync(files.output, 'utf8'));
        fs.writeFileSync(wrongOutput, JSON.stringify({ ...output, chainID: files.chainId + 1 }));

        const res = runAudit(l2Url, files, wrongOutput);
        expect(res.code).to.equal(1);
        expect(res.fails.join('\n')).to.include('wrong chain');
    });

    it('L2 RPC passed as --l1-rpc: FAIL (wrong L1 RPC)', async () => {
        // the L1 Safe is not on L2: with the wrong L1 RPC it would look like an EOA
        const { safe } = await createSafe([SENDER], 1, 7);
        const files = buildGenesis('wrong-l1', safe);
        const l2Url = await startL2(files);

        const res = runAudit(l2Url, files, files.output, l2Url);
        expect(res.code).to.equal(1);
        expect(res.fails.join('\n')).to.include('wrong L1 RPC');
    });

    it('extra timelock role member in the genesis: FAIL and identified', async () => {
        const admin = ethers.Wallet.createRandom().address;
        const intruder = SENDER;
        const files = buildGenesis('extra-role', admin, (alloc, genesisSCNames) => {
            const timelock = genesisSCNames[GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK];
            alloc[timelock].storage[getTimelockRoleMemberSlot(TIMELOCK.ROLES.PROPOSER_ROLE, intruder)] = ethers.toBeHex(
                1,
                32,
            );
        });
        const res = runAudit(await startL2(files), files);

        expect(res.code).to.equal(1);
        expect(res.fails.join('\n')).to.include('Genesis timelock storage differs from the expected one');
    });

    it('proxy not administered by the ProxyAdmin: FAIL', async () => {
        const admin = ethers.Wallet.createRandom().address;
        const files = buildGenesis('proxy-admin', admin, (alloc) => {
            const proxy = Object.keys(alloc).find(
                (address) => (alloc[address].storage ?? {})[EIP1967_ADMIN_SLOT] !== undefined,
            )!;
            alloc[proxy].storage[EIP1967_ADMIN_SLOT] = ethers.toBeHex(0xdead, 32);
        });
        const res = runAudit(await startL2(files), files);

        expect(res.code).to.equal(1);
        expect(res.fails.join('\n')).to.include('Proxies NOT administered by the ProxyAdmin');
    });

    it('Safe admin with EOA owners: not on L2 yet (simulated), then deployed on L2', async () => {
        const { safe, calldata } = await createSafe([SENDER], 1, 1);
        const files = buildGenesis('safe', safe);
        const l2Url = await startL2(files);

        // not deployed on L2: the original factory call is simulated
        const before = runAudit(l2Url, files);
        expect(before.code, before.out).to.equal(0);
        expect(before.fails).to.deep.equal([]);
        expect(before.out).to.include('Simulated on L2: replaying the original factory call deploys the Safe');
        expect(before.out).to.include(
            'Original Safe owners: all 1 owners have no bytecode (most probably EOAs) and can sign on L2',
        );

        // replay the creation on L2: the deployed Safe is verified
        await sendAs(l2Url, SENDER, SAFE_FACTORY, calldata);
        const after = runAudit(l2Url, files);
        expect(after.code, after.out).to.equal(0);
        expect(after.fails).to.deep.equal([]);
        expect(after.out).to.include('is an official SafeProxy v1.4.1');
        expect(after.out).to.include(
            'L2 Safe owners: all 1 owners have no bytecode (most probably EOAs) and can sign on L2',
        );
    });

    it('Safe deployed on L2 with threshold 0: FAIL', async () => {
        const { safe, calldata } = await createSafe([SENDER], 1, 6);
        const files = buildGenesis('threshold-zero', safe);
        const l2Url = await startL2(files);
        await sendAs(l2Url, SENDER, SAFE_FACTORY, calldata);
        // Safe threshold is in storage slot 4
        const l2 = new ethers.JsonRpcProvider(l2Url, undefined, { staticNetwork: true });
        await l2.send('anvil_setStorageAt', [safe, ethers.toBeHex(4, 32), ethers.toBeHex(0, 32)]);
        l2.destroy();

        const res = runAudit(l2Url, files);
        expect(res.code).to.equal(1);
        expect(res.fails.join('\n')).to.include('L2 Safe owners: threshold is 0');
    });

    it('Safe deployed on L2 with a malformed owner list (zero address owner): FAIL', async () => {
        const { safe, calldata } = await createSafe([SENDER], 1, 8);
        const files = buildGenesis('zero-owner', safe);
        const l2Url = await startL2(files);
        await sendAs(l2Url, SENDER, SAFE_FACTORY, calldata);
        // owners linked list (slot 2) emptied with ownerCount (slot 3) = 1: getOwners() returns [address(0)]
        const sentinel = '0x0000000000000000000000000000000000000001';
        const ownersSentinelSlot = ethers.solidityPackedKeccak256(['uint256', 'uint256'], [sentinel, 2]);
        const l2 = new ethers.JsonRpcProvider(l2Url, undefined, { staticNetwork: true });
        await l2.send('anvil_setStorageAt', [safe, ownersSentinelSlot, ethers.toBeHex(1, 32)]);
        expect(await l2.call({ to: safe, data: ethers.id('getOwners()').slice(0, 10) })).to.include(
            '0000000000000000000000000000000000000000000000000000000000000000',
        );
        l2.destroy();

        const res = runAudit(l2Url, files);
        expect(res.code).to.equal(1);
        expect(res.fails.join('\n')).to.include('L2 Safe owners: only 0 of 1 owners can sign on L2');
    });

    it('Safe admin owned by another Safe that is not on L2: FAIL (owners can not sign on L2)', async () => {
        const { safe: ownerSafe } = await createSafe([SENDER], 1, 2);
        const { safe } = await createSafe([ownerSafe], 1, 3);
        const files = buildGenesis('nested-safe', safe);
        const res = runAudit(await startL2(files), files);

        expect(res.code).to.equal(1);
        expect(res.fails.join('\n')).to.include('Original Safe owners: only 0 of 1 owners can sign on L2');
    });

    it('Safe created with a creation callback: FAIL', async () => {
        // the Safe singleton accepts the callback call (fallback without handler)
        const { safe } = await createSafe([SENDER], 1, 4, SAFE_L2_SINGLETON);
        const files = buildGenesis('callback', safe);
        const res = runAudit(await startL2(files), files);

        expect(res.code).to.equal(1);
        expect(res.fails.join('\n')).to.include('created with a callback');
    });

    it('fake Safe on L2 (not an official Safe proxy): FAIL', async () => {
        const { safe } = await createSafe([SENDER], 1, 5);
        const files = buildGenesis('fake-proxy', safe);
        const l2Url = await startL2(files);
        const l2 = new ethers.JsonRpcProvider(l2Url, undefined, { staticNetwork: true });
        // the singleton code answers every Safe getter but it is not a proxy
        await l2.send('anvil_setCode', [safe, await l2.getCode(SAFE_L2_SINGLETON)]);
        l2.destroy();

        const res = runAudit(l2Url, files);
        expect(res.code).to.equal(1);
        expect(res.fails.join('\n')).to.include('is NOT an official Safe proxy');
    });
});
