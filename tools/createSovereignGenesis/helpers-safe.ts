import { ethers } from 'ethers';
import safeContracts from './safe-contracts.json';

/**
 * Contracts data in `safe-contracts.json`, grouped by:
 * - deterministicDeploymentFactories: Arachnid DeterministicDeploymentProxy & Safe SingletonFactory
 * - v1.3.0: Safe v1.3.0 canonical deployment (through Arachnid DeterministicDeploymentProxy)
 * - v1.4.1-3: Safe v1.4.1-3 canonical deployment (through Safe SingletonFactory)
 * Addresses & codeHashes from https://github.com/safe-global/safe-deployments (canonical deployments)
 * Runtime bytecode & storage obtained by replaying the Ethereum mainnet deployment transactions on a fresh chain
 * with a different chainID, and checked against Ethereum mainnet (same address, bytecode & storage at deployment)
 */
interface SafeGenesisContract {
    contractName: string;
    address: string;
    codeHash: string;
    bytecode: string;
    storage?: { [key: string]: string };
}

/**
 * Add all the contracts in `safe-contracts.json` to the genesis, with the same state they had right after their
 * deployment: deterministic deployment factories, Safe v1.3.0 & Safe v1.4.1-3 contracts
 * @param genesis legacy genesis file
 * @returns genesis with the Safe contracts added
 */
export function addSAFEBytecode<T extends { genesis: any[] }>(genesis: T): T {
    const existingAddresses = new Set(genesis.genesis.map((obj) => obj.address.toLowerCase()));

    Object.values(safeContracts)
        .flat()
        .forEach((contract: SafeGenesisContract) => {
            if (ethers.keccak256(contract.bytecode) !== contract.codeHash) {
                throw new Error(`addSAFEBytecode: ${contract.contractName} bytecode does not match its codeHash`);
            }

            if (existingAddresses.has(contract.address.toLowerCase())) {
                throw new Error(`addSAFEBytecode: address ${contract.address} already exists in the genesis`);
            }
            existingAddresses.add(contract.address.toLowerCase());

            const genesisEntry: any = {
                contractName: contract.contractName,
                balance: '0',
                nonce: '1',
                address: contract.address,
                bytecode: contract.bytecode,
            };

            if (contract.storage !== undefined) {
                genesisEntry.storage = contract.storage;
            }

            genesis.genesis.push(genesisEntry);
        });

    return genesis;
}
