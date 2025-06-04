import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';

async function main() {
    const address = '0x0...';
    const deployedTxHash = '0x..';

    const { provider } = ethers;
    const code = await provider.getCode(address);
    if (code === '0x') {
        console.error('No contract deployed at this address.');
        process.exit(1);
    }

    // Get the creation transaction
    const creationTx = await provider.getTransaction(deployedTxHash);
    if (!creationTx) {
        console.error('Could not find creation transaction.');
        process.exit(1);
    }
    const initCode = creationTx.data;

    // Load all artifacts from Hardhat
    const artifactsDir = path.join(__dirname, '../../artifacts/contracts');
    const artifactFiles: string[] = [];
    function findArtifacts(dir: string) {
        for (const file of fs.readdirSync(dir)) {
            const full = path.join(dir, file);
            if (fs.statSync(full).isDirectory()) findArtifacts(full);
            else if (file.endsWith('.json')) artifactFiles.push(full);
        }
    }
    findArtifacts(artifactsDir);

    let found = false;
    for (const artifactPath of artifactFiles) {
        const artifact = JSON.parse(fs.readFileSync(artifactPath, 'utf8'));
        if (!artifact.contractName) continue;
        let factory: any;
        try {
            factory = await ethers.getContractFactory(artifact.contractName);
        } catch {
            continue;
        }
        const artifactInitCode: string = factory.bytecode;

        // Compare the start of the initCode with the artifact's init bytecode (allowing for constructor args)
        if (initCode.startsWith(artifactInitCode)) {
            found = true;
            console.log(`Contract at ${address} matches artifact: ${artifact.contractName}`);
            // Try to decode constructor args
            const { abi } = artifact;
            const constructorAbi = abi.find((x: any) => x.type === 'constructor');
            if (constructorAbi && constructorAbi.inputs.length > 0) {
                const argTypes = constructorAbi.inputs.map((x: any) => x.type);
                const argNames = constructorAbi.inputs.map((x: any) => x.name);
                // The encoded constructor args are after the bytecode
                const encodedArgs = `0x${initCode.slice(artifactInitCode.length)}`;
                try {
                    const decoded = ethers.AbiCoder.defaultAbiCoder().decode(argTypes, encodedArgs);
                    for (let i = 0; i < argNames.length; i++) {
                        console.log(`  ${argNames[i]}:`, decoded[i]);
                    }
                } catch (e) {
                    console.log(e);
                    console.log('  Could not decode constructor arguments.');
                }
            } else {
                console.log('  No constructor arguments.');
            }
            break;
        }
    }
    if (!found) {
        console.log('No matching artifact found for deployed code.');
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
