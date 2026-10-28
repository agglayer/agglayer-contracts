/* eslint-disable no-await-in-loop, @typescript-eslint/no-use-before-define, no-restricted-syntax, no-continue */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import path = require('path');
import fs = require('fs');

import * as dotenv from 'dotenv';
import hre, { ethers, upgrades } from 'hardhat';
import { AgglayerManager } from '../../typechain-types';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const pathParameters = path.join(__dirname, './verifyRollup.json');

const PROXY_CONTRACT = 'contracts/lib/PolygonTransparentProxy.sol:PolygonTransparentProxy';

interface RollupEntry {
    rollupAddress?: string;
    rollupID?: number;
    // Optional: implementation passed to the proxy constructor (defaults to the current ERC-1967 implementation)
    proxyConstructorImplementation?: string;
    verifyImplementation?: boolean;
    implementationContract?: string;
    implementationConstructorArgs?: any[];
}

interface VerifyRollupParams {
    rollupManagerAddress?: string;
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

    if (!dryRun) {
        checkEtherscanApiKey();
    }

    const results: VerifyResult[] = [];

    for (const [index, entry] of params.rollups.entries()) {
        let label =
            entry.rollupID !== undefined && !entry.rollupAddress ? `rollupID ${entry.rollupID}` : `rollups[${index}]`;
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
        results.push(
            await verifyContract(
                label,
                'proxy',
                {
                    contract: PROXY_CONTRACT,
                    address: rollupAddress,
                    constructorArguments: [proxyImplementation, adminAddress, '0x'],
                },
                dryRun,
            ),
        );

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
function checkEtherscanApiKey() {
    const { apiKey } = hre.config.etherscan;
    const networkName = hre.network.name;
    const key = typeof apiKey === 'string' ? apiKey : apiKey[networkName];
    if (key === undefined) {
        throw new Error(
            `No Etherscan API key configured for network "${networkName}" in hardhat.config.ts (etherscan.apiKey)`,
        );
    }
    if (key === '' || key === 'undefined') {
        throw new Error(
            `Etherscan API key for network "${networkName}" is not set. Set the environment variable referenced in hardhat.config.ts (etherscan.apiKey.${networkName}) in your .env`,
        );
    }
}

/**
 * Resolve the rollup address from the entry: either directly or through the AgglayerManager
 */
async function resolveRollupAddress(entry: RollupEntry, rollupManagerAddress?: string): Promise<string> {
    if (entry.rollupAddress !== undefined && entry.rollupAddress !== '') {
        if (!ethers.isAddress(entry.rollupAddress)) {
            throw new Error(`Invalid rollupAddress: ${entry.rollupAddress}`);
        }
        return entry.rollupAddress;
    }
    if (entry.rollupID === undefined) {
        throw new Error('Either "rollupAddress" or "rollupID" must be set');
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
): Promise<VerifyResult> {
    const result = { label, target, address: verifyArgs.address };
    if (dryRun) {
        console.log(`[${label}] Dry run, ${target} would be verified with:`, JSON.stringify(verifyArgs, null, 2));
        return { ...result, status: 'dry run' };
    }
    try {
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
