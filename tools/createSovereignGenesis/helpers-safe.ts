/* eslint-disable @typescript-eslint/naming-convention */
import { ethers } from 'ethers';
import safeContracts from './safe-contracts.json';

/**
 * Contracts data in `safe-contracts.json`:
 * - Addresses & codeHashes from https://github.com/safe-global/safe-deployments (canonical deployments)
 * - Runtime bytecode & storage obtained by replaying the Ethereum mainnet deployment transactions on a fresh chain
 *   with a different chainID, and checked against Ethereum mainnet (same address, bytecode & storage at deployment)
 */
interface SafeGenesisContract {
    contractName: string;
    address: string;
    codeHash: string;
    bytecode: string;
    storage?: { [key: string]: string };
}

/**
 * Add contracts to the genesis with the same state they had right after their deployment
 * @param genesis legacy genesis file
 * @param contracts contracts to add
 * @param caller function name used in the error messages
 * @returns genesis with the contracts added
 */
function _addGenesisContracts<T extends { genesis: any[] }>(
    genesis: T,
    contracts: SafeGenesisContract[],
    caller: string,
): T {
    contracts.forEach((contract) => {
        if (ethers.keccak256(contract.bytecode) !== contract.codeHash) {
            throw new Error(`${caller}: ${contract.contractName} bytecode does not match its codeHash`);
        }

        const accountExist = genesis.genesis.find(
            (obj) => obj.address.toLowerCase() === contract.address.toLowerCase(),
        );

        if (accountExist !== undefined) {
            throw new Error(`${caller}: address ${contract.address} already exists in the genesis`);
        }

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

/**
 * Add the deterministic deployment factories needed to deploy Safe contracts deterministically to the genesis
 * - Arachnid DeterministicDeploymentProxy (https://github.com/Arachnid/deterministic-deployment-proxy)
 * - Safe SingletonFactory (https://github.com/safe-global/safe-singleton-factory)
 * @param genesis legacy genesis file
 * @returns genesis with the deterministic deployment factories added
 */
export function addSAFEBytecode<T extends { genesis: any[] }>(genesis: T): T {
    return _addGenesisContracts(genesis, safeContracts.deterministicDeploymentFactories, 'addSAFEBytecode');
}

/**
 * Add Safe v1.3.0 contracts (canonical deployment, through Arachnid DeterministicDeploymentProxy) to the genesis
 * @param genesis legacy genesis file
 * @returns genesis with the Safe v1.3.0 contracts added
 */
export function addSafeV130Bytecode<T extends { genesis: any[] }>(genesis: T): T {
    return _addGenesisContracts(genesis, safeContracts['v1.3.0'], 'addSafeV130Bytecode');
}

/**
 * Add Safe v1.4.1-3 contracts (canonical deployment, through Safe SingletonFactory) to the genesis
 * @param genesis legacy genesis file
 * @returns genesis with the Safe v1.4.1-3 contracts added
 */
export function addSafeV141Bytecode<T extends { genesis: any[] }>(genesis: T): T {
    return _addGenesisContracts(genesis, safeContracts['v1.4.1-3'], 'addSafeV141Bytecode');
}
