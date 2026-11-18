/* eslint-disable no-await-in-loop, @typescript-eslint/no-use-before-define, no-restricted-syntax, no-continue */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import hre, { ethers, upgrades } from 'hardhat';
import { Etherscan } from '@nomicfoundation/hardhat-verify/etherscan';
import { AgglayerManager } from '../../typechain-types';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pathParameters = path.join(__dirname, './verifyRollup.json');

const DEFAULT_PROXY_CONTRACT = 'contracts/lib/PolygonTransparentProxy.sol:PolygonTransparentProxy';

// Messages of hardhat-verify errors raised when the local proxy build does not match the deployed bytecode
// (BuildInfoCompilerVersionMismatchError, CompilerVersionsMismatchError, DeployedBytecodeMismatchError).
// Matched by message because hardhat plugin errors do not keep their class name
const PROXY_MISMATCH_MESSAGES = ['is being compiled with', 'was compiled with solidity', "bytecode doesn't match"];
const PROXY_MISMATCH_HINT =
    'Hint: the proxy bytecode depends on the rollup manager version that created the rollup. See "Older rollups" in tools/verifyRollup/README.md';
// Etherscan rejects the submission when the constructor arguments do not match the creation code
const CONSTRUCTOR_ARGS_MISMATCH_MESSAGES = ['unable to verify', 'constructor argument'];
const CONSTRUCTOR_ARGS_MISMATCH_HINT =
    'Hint: if the rollup was upgraded, the proxy constructor implementation differs from the current one. See "Upgraded rollups" in tools/verifyRollup/README.md';

interface RollupEntry {
    rollupAddress?: string;
    rollupID?: number;
    // Optional: fully qualified name of the proxy contract (overrides the global value)
    proxyContract?: string;
    // Optional: implementation passed to the proxy constructor (defaults to the current ERC-1967 implementation)
    proxyConstructorImplementation?: string;
    verifyImplementation?: boolean;
    implementationContract?: string;
    implementationConstructorArgs?: any[];
}

interface VerifyRollupParams {
    rollupManagerAddress?: string;
    proxyContract?: string;
    verifyImplementation?: boolean;
    dryRun?: boolean;
    rollups: RollupEntry[];
}

interface VerifyResult {
    label: string;
    target: string;
    address: string;
    status: 'verified' | 'already verified' | 'skipped' | 'dry run' | 'failed';
    error?: string;
}

async function main() {
    if (!fs.existsSync(pathParameters)) {
        throw new Error(
            `Parameters file not found: ${pathParameters}. Copy verifyRollup.json.example to verifyRollup.json and set your parameters`,
        );
    }
    const params: VerifyRollupParams = JSON.parse(fs.readFileSync(pathParameters, 'utf8'));
    const dryRun = params.dryRun === true;

    if (!Array.isArray(params.rollups) || params.rollups.length === 0) {
        throw new Error('Parameter "rollups" must be a non-empty array');
    }

    let etherscan: Etherscan | undefined;
    if (!dryRun) {
        const chainConfig = await Etherscan.getCurrentChainConfig(
            hre.network.name,
            hre.network.provider,
            hre.config.etherscan.customChains,
        );
        // hardhat-verify resolves the API key with the network name of the matched chain config
        checkEtherscanApiKey(chainConfig.network);
        keepApiUrlQueryParams(chainConfig.urls.apiURL);
        etherscan = Etherscan.fromChainConfig(hre.config.etherscan.apiKey, chainConfig);
    }

    const results: VerifyResult[] = [];

    for (const [index, entry] of params.rollups.entries()) {
        let label = entry.rollupID !== undefined ? `rollupID ${entry.rollupID}` : `rollups[${index}]`;
        let rollupAddress: string;
        try {
            rollupAddress = await resolveRollupAddress(entry, params.rollupManagerAddress);
        } catch (error: any) {
            console.log(`[${label}] Failed to resolve rollup address: ${error.message}`);
            results.push({ label, target: 'proxy', address: '-', status: 'failed', error: error.message });
            continue;
        }

        if (label.startsWith('rollups[')) {
            label = rollupAddress;
        }
        console.log(`\n=== Verifying ${label === rollupAddress ? rollupAddress : `${label} (${rollupAddress})`} ===`);

        let implementationAddress: string;
        let adminAddress: string;
        try {
            implementationAddress = await upgrades.erc1967.getImplementationAddress(rollupAddress);
            adminAddress = await upgrades.erc1967.getAdminAddress(rollupAddress);
        } catch (error: any) {
            console.log(`[${label}] Failed to read ERC-1967 slots: ${error.message}`);
            results.push({ label, target: 'proxy', address: rollupAddress, status: 'failed', error: error.message });
            continue;
        }
        console.log(`Implementation: ${implementationAddress}`);
        console.log(`Admin:          ${adminAddress}`);

        // Proxy verification
        const proxyImplementation = entry.proxyConstructorImplementation ?? implementationAddress;
        if (!ethers.isAddress(proxyImplementation)) {
            const error = `Invalid proxyConstructorImplementation: ${proxyImplementation}`;
            console.log(`[${label}] ${error}`);
            results.push({ label, target: 'proxy', address: rollupAddress, status: 'failed', error });
            continue;
        }
        const proxyResult = await verifyContract(
            label,
            'proxy',
            {
                contract: entry.proxyContract ?? params.proxyContract ?? DEFAULT_PROXY_CONTRACT,
                address: rollupAddress,
                constructorArguments: [proxyImplementation, adminAddress, '0x'],
            },
            dryRun,
            etherscan,
        );
        if (
            proxyResult.status === 'failed' &&
            PROXY_MISMATCH_MESSAGES.some((message) => proxyResult.error?.includes(message))
        ) {
            console.log(`[${label}] ${PROXY_MISMATCH_HINT}`);
            proxyResult.error = `${proxyResult.error} ${PROXY_MISMATCH_HINT}`;
        } else if (
            proxyResult.status === 'failed' &&
            CONSTRUCTOR_ARGS_MISMATCH_MESSAGES.some((message) => proxyResult.error?.toLowerCase().includes(message))
        ) {
            console.log(`[${label}] ${CONSTRUCTOR_ARGS_MISMATCH_HINT}`);
            proxyResult.error = `${proxyResult.error} ${CONSTRUCTOR_ARGS_MISMATCH_HINT}`;
        }
        results.push(proxyResult);

        // Implementation verification
        const verifyImplementation = entry.verifyImplementation ?? params.verifyImplementation ?? true;
        if (!verifyImplementation) {
            console.log(`[${label}] Implementation verification disabled`);
            continue;
        }
        if (entry.implementationContract === undefined || entry.implementationConstructorArgs === undefined) {
            const reason = '"implementationContract" and/or "implementationConstructorArgs" not set';
            console.log(`[${label}] Skipping implementation verification: ${reason}`);
            results.push({ label, target: 'implementation', address: implementationAddress, status: 'skipped' });
            continue;
        }
        results.push(
            await verifyContract(
                label,
                'implementation',
                {
                    contract: entry.implementationContract,
                    address: implementationAddress,
                    constructorArguments: entry.implementationConstructorArgs,
                },
                dryRun,
                etherscan,
            ),
        );
    }

    // Summary
    console.log('\n=== Summary ===');
    console.table(
        results.map((r) => ({
            rollup: r.label,
            target: r.target,
            address: r.address,
            status: r.status,
            error: r.error ?? '',
        })),
    );

    const failed = results.filter((r) => r.status === 'failed');
    if (failed.length > 0) {
        console.error(`${failed.length} verification(s) failed`);
        process.exit(1);
    }
}

/**
 * Fail fast if the Etherscan API key used by hardhat-verify for the selected network is not set
 */
function checkEtherscanApiKey(networkName: string) {
    const { apiKey } = hre.config.etherscan;
    const key = typeof apiKey === 'string' ? apiKey : apiKey[networkName];
    const keyPath = typeof apiKey === 'string' ? 'etherscan.apiKey' : `etherscan.apiKey.${networkName}`;
    if (key === undefined) {
        throw new Error(
            `No Etherscan API key configured for network "${networkName}" in hardhat.config.ts (etherscan.apiKey)`,
        );
    }
    if (key === '' || key === 'undefined') {
        throw new Error(
            `Etherscan API key for network "${networkName}" is not set. Set the environment variable referenced in hardhat.config.ts (${keyPath}) in your .env`,
        );
    }
}

/**
 * hardhat-verify 1.1.1 replaces the whole query string of the API URL in its GET requests (isVerified, getVerificationStatus),
 * dropping the "chainid" parameter required by Etherscan V2 URLs (https://api.etherscan.io/v2/api?chainid=<chainId>).
 * Wrap its GET helper to add back the query parameters of the configured API URL
 */
function keepApiUrlQueryParams(apiURL: string) {
    const apiUrl = new URL(apiURL);
    if (apiUrl.search === '') {
        return;
    }
    // eslint-disable-next-line global-require, @typescript-eslint/no-var-requires
    const undici = require('@nomicfoundation/hardhat-verify/internal/undici');
    const { sendGetRequest } = undici;
    undici.sendGetRequest = (url: URL) => {
        if (url.origin === apiUrl.origin && url.pathname === apiUrl.pathname) {
            apiUrl.searchParams.forEach((value, key) => {
                if (!url.searchParams.has(key)) {
                    url.searchParams.set(key, value);
                }
            });
        }
        return sendGetRequest(url);
    };
}

/**
 * Resolve the rollup address from the entry: either directly or through the AgglayerManager.
 * If both "rollupAddress" and "rollupID" are set, they must match
 */
async function resolveRollupAddress(entry: RollupEntry, rollupManagerAddress?: string): Promise<string> {
    const hasRollupAddress = entry.rollupAddress !== undefined && entry.rollupAddress !== '';
    if (hasRollupAddress && !ethers.isAddress(entry.rollupAddress)) {
        throw new Error(`Invalid rollupAddress: ${entry.rollupAddress}`);
    }
    if (entry.rollupID === undefined) {
        if (!hasRollupAddress) {
            throw new Error('Either "rollupAddress" or "rollupID" must be set');
        }
        return entry.rollupAddress as string;
    }
    if (hasRollupAddress && rollupManagerAddress === undefined) {
        console.log(
            `WARNING: "rollupID" ${entry.rollupID} cannot be checked against "rollupAddress" ${entry.rollupAddress} because "rollupManagerAddress" is not set. Using "rollupAddress"`,
        );
        return entry.rollupAddress as string;
    }
    if (rollupManagerAddress === undefined || !ethers.isAddress(rollupManagerAddress)) {
        throw new Error('"rollupManagerAddress" must be a valid address when using "rollupID"');
    }
    const rollupManager = (await ethers.getContractAt(
        'AgglayerManager',
        rollupManagerAddress,
    )) as unknown as AgglayerManager;
    const rollupData = await rollupManager.rollupIDToRollupData(entry.rollupID);
    if (rollupData.rollupContract === ethers.ZeroAddress) {
        throw new Error(`rollupID ${entry.rollupID} does not exist in AgglayerManager ${rollupManagerAddress}`);
    }
    if (hasRollupAddress && rollupData.rollupContract.toLowerCase() !== (entry.rollupAddress as string).toLowerCase()) {
        throw new Error(
            `"rollupAddress" ${entry.rollupAddress} does not match rollupID ${entry.rollupID} contract ${rollupData.rollupContract} in AgglayerManager ${rollupManagerAddress}`,
        );
    }
    return rollupData.rollupContract;
}

/**
 * Run hardhat-verify, treating "already verified" as success
 */
async function verifyContract(
    label: string,
    target: string,
    verifyArgs: { contract: string; address: string; constructorArguments: any[] },
    dryRun: boolean,
    etherscan?: Etherscan,
): Promise<VerifyResult> {
    const result = { label, target, address: verifyArgs.address };
    if (dryRun) {
        console.log(`[${label}] Dry run, ${target} would be verified with:`, JSON.stringify(verifyArgs, null, 2));
        return { ...result, status: 'dry run' };
    }
    try {
        // hardhat-verify only logs (does not throw) for already verified contracts, so check it beforehand
        if (etherscan !== undefined && (await etherscan.isVerified(verifyArgs.address))) {
            console.log(`[${label}] ${target} already verified: ${etherscan.getContractUrl(verifyArgs.address)}`);
            return { ...result, status: 'already verified' };
        }
        await hre.run('verify:verify', verifyArgs);
        console.log(`[${label}] ${target} verified`);
        return { ...result, status: 'verified' };
    } catch (error: any) {
        if (error.message?.toLowerCase().includes('already verified')) {
            console.log(`[${label}] ${target} already verified`);
            return { ...result, status: 'already verified' };
        }
        console.log(`[${label}] ${target} verification failed: ${error.message}`);
        return { ...result, status: 'failed', error: error.message };
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
