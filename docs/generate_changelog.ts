import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import readline from 'readline';

const changelogPath = path.join(__dirname, './CHANGELOG.md');
const PREVIOUS_TAG = process.argv[2];

const contracts = [
    'contracts/v2/PolygonRollupManager.sol',
    'contracts/v2/PolygonZkEVMBridgeV2.sol',
    'contracts/v2/PolygonZkEVMGlobalExitRootV2.sol',
    'contracts/v2/AggLayerGateway.sol',
    'contracts/v2/sovereignChains/BridgeL2SovereignChain.sol',
    'contracts/v2/sovereignChains/GlobalExitRootManagerL2SovereignChain.sol',
    'contracts/v2/aggchains/AggchainECDSA.sol',
    'contracts/v2/aggchains/AggchainFEP.sol',
];

function parseVersion(line: string): string | null {
    const match = line.match(/VERSION\s*=\s*["']?([^"';\s]+)/i);
    return match ? match[1] : null;
}

function extractVersionFromTag(filePath: string, tag: string): string | null {
    try {
        const content = execSync(`git show ${tag}:${filePath}`).toString();
        const versionLine = content.split('\n').find((line) => /VERSION\s*=/.test(line));
        return versionLine ? parseVersion(versionLine) : null;
    } catch {
        return null;
    }
}

function extractVersionFromHEAD(filePath: string): string | null {
    try {
        const content = execSync(`git show HEAD:${filePath}`).toString();
        const versionLine = content.split('\n').find((line) => /VERSION\s*=/.test(line));
        return versionLine ? parseVersion(versionLine) : null;
    } catch {
        return null;
    }
}

function classifyContractChange(oldVersion: string, newVersion: string): 'breaking' | 'feature' | 'notes' | null {
    if (!oldVersion) return 'breaking';
    if (oldVersion.startsWith('al-')) {
        oldVersion = oldVersion.replace('al-', '');
    }
    newVersion = newVersion.replace('v', '');
    oldVersion = oldVersion.replace('v', '');
    const [xNew, yNew, zNew] = newVersion.split('.').map(Number);
    const [xOld, yOld, zOld] = oldVersion.split('.').map(Number);

    if (xNew > xOld) return 'breaking';
    if (yNew > yOld) return 'feature';
    if (zNew > zOld) return 'notes';
    return null;
}

function getCommits(fromTag: string, toTag: string): string[] {
    const range = `${fromTag}..${toTag}`;
    try {
        const log = execSync(`git log --pretty=format:"- %s" ${range}`).toString();
        return log.split('\n').filter((line) => line);
    } catch {
        throw Error(`Failed to get commits for range ${range}`);
    }
}

function calculateNewRelease(oldTag: string, bump: { breaking: boolean; feature: boolean }): string {
    const [xOld, yOld, zOld] = oldTag.replace('v', '').split('.').map(Number);
    if (bump.breaking) return `v${xOld + 1}.0.0`;
    if (bump.feature) return `v${xOld}.${yOld + 1}.0`;
    return `v${xOld}.${yOld}.${zOld + 1}`;
}

function updateChangelog(
    newTag: string,
    breakingChanges: string[],
    features: string[],
    notes: string[],
    commits: string[],
) {
    const changelog = fs.readFileSync(changelogPath, 'utf8');
    const date = new Date().toISOString().split('T')[0];

    let entry = `\n## [${newTag}] - ${date}\n`;

    if (breakingChanges.length) {
        entry += `\n### 🚨 Breaking Changes\n${breakingChanges.join('\n')}\n`;
    }
    if (features.length) {
        entry += `\n### ✨ New Features\n${features.join('\n')}\n`;
    }
    if (notes.length) {
        entry += `\n### 📝 Updates / 🐛 Bugfixes\n${notes.join('\n')}\n`;
    }
    if (commits.length) {
        entry += `\n### 📜 Changelog (commits)\n${commits.join('\n')}\n`;
    }

    entry += `\n---\n`;
    fs.writeFileSync(changelogPath, entry + changelog);
}

function askToolingUpdate(): Promise<number> {
    return new Promise((resolve) => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
        });
        rl.question(
            '\nHas there been any tooling update?\n0 - No\n1 - Comment / minor update\n2 - New feature\n3 - Breaking change\n> ',
            (answer) => {
                rl.close();
                resolve(Number(answer));
            },
        );
    });
}

async function main() {
    const breakingChanges: string[] = [];
    const features: string[] = [];
    const notes: string[] = [];

    let hasBreaking = false;
    let hasFeature = false;

    contracts.forEach((file) => {
        const oldVersion = extractVersionFromTag(file, PREVIOUS_TAG);
        const newVersion = extractVersionFromHEAD(file);

        if (oldVersion && newVersion && oldVersion !== newVersion) {
            const changeType = classifyContractChange(oldVersion, newVersion);
            if (!changeType) return;

            const changeString = `${file}: ${oldVersion} -> ${newVersion}`;

            if (changeType === 'breaking') {
                breakingChanges.push(`- ${changeString}`);
                hasBreaking = true;
            } else if (changeType === 'feature') {
                features.push(`- ${changeString}`);
                hasFeature = true;
            } else if (changeType === 'notes') {
                notes.push(`- ${changeString}`);
            }
        } else if (!oldVersion && newVersion) {
            const changeString = `➕ New! ${file}: ${newVersion}`;

            features.push(`- ${changeString}`);
            hasFeature = true;
        }
    });

    const newRelease = calculateNewRelease(PREVIOUS_TAG, { breaking: hasBreaking, feature: hasFeature });
    const commits = getCommits(PREVIOUS_TAG, 'HEAD');

    const toolingAnswer = await askToolingUpdate();
    if (toolingAnswer === 3) {
        breakingChanges.push(`- New tooling package (${newRelease})`);
        hasBreaking = true;
    } else if (toolingAnswer === 2) {
        features.push(`- New tooling package (${newRelease})`);
        hasFeature = true;
    } else if (toolingAnswer === 1) {
        notes.push(`- New tooling package (${newRelease})`);
    }

    updateChangelog(newRelease, breakingChanges, features, notes, commits);
}

main();
