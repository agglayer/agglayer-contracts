/* eslint-disable no-await-in-loop, no-restricted-syntax */
import { ethers } from 'ethers';

/**
 * Safe (v1.3.0 & v1.4.1) helpers to inspect a Safe and recover how it was created
 * Storage slots & events from https://github.com/safe-global/safe-smart-account
 */
const SENTINEL_MODULES = '0x0000000000000000000000000000000000000001';
const GUARD_STORAGE_SLOT = ethers.id('guard_manager.guard.address');
const FALLBACK_HANDLER_STORAGE_SLOT = ethers.id('fallback_manager.handler.address');
const PROXY_CREATION_TOPIC = ethers.id('ProxyCreation(address,address)');

const safeInterface = new ethers.Interface([
    'function VERSION() view returns (string)',
    'function getOwners() view returns (address[])',
    'function getThreshold() view returns (uint256)',
    'function nonce() view returns (uint256)',
    'function getModulesPaginated(address start, uint256 pageSize) view returns (address[] array, address next)',
    'function setup(address[] _owners, uint256 _threshold, address to, bytes data, address fallbackHandler, address paymentToken, uint256 payment, address paymentReceiver)',
    'event SafeSetup(address indexed initiator, address[] owners, uint256 threshold, address initializer, address fallbackHandler)',
]);

const factoryInterface = new ethers.Interface([
    'function proxyCreationCode() pure returns (bytes)',
    'function createProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce)',
    'function createProxyWithCallback(address _singleton, bytes initializer, uint256 saltNonce, address callback)',
    'function createChainSpecificProxyWithNonce(address _singleton, bytes initializer, uint256 saltNonce)',
]);

export interface SafeInfo {
    version: string;
    singleton: string;
    owners: string[];
    threshold: bigint;
    nonce: bigint;
    modules: string[];
    guard: string;
    fallbackHandler: string;
}

export interface SafeSetupParams {
    owners: string[];
    threshold: bigint;
    to: string;
    data: string;
    fallbackHandler: string;
    paymentToken: string;
    payment: bigint;
    paymentReceiver: string;
}

export interface SafeCreation {
    blockNumber: number;
    txHash: string;
    // from SafeSetup event: initial configuration
    owners: string[];
    threshold: bigint;
    setupTo: string;
    fallbackHandler: string;
    // from ProxyCreation event & creation transaction
    factory?: string;
    singleton?: string;
    creationMethod?: string;
    initializer?: string;
    saltNonce?: bigint;
    callback?: string;
    setupParams?: SafeSetupParams;
    chainSpecific: boolean;
    predictedAddress?: string;
}

function storageToAddress(value: string): string {
    return ethers.getAddress(ethers.dataSlice(value, 12));
}

async function callSafe(
    provider: ethers.JsonRpcProvider,
    address: string,
    fn: string,
    args: any[],
    blockTag: ethers.BlockTag,
) {
    const data = safeInterface.encodeFunctionData(fn, args);
    return safeInterface.decodeFunctionResult(fn, await provider.call({ to: address, data, blockTag }));
}

/**
 * Read the Safe configuration of an address
 * @param provider provider
 * @param address address to inspect
 * @param blockTag block tag
 * @returns Safe configuration, or undefined if the address does not behave like a Safe
 */
export async function getSafeInfo(
    provider: ethers.JsonRpcProvider,
    address: string,
    blockTag: ethers.BlockTag = 'latest',
): Promise<SafeInfo | undefined> {
    try {
        const [version] = await callSafe(provider, address, 'VERSION', [], blockTag);
        const [owners] = await callSafe(provider, address, 'getOwners', [], blockTag);
        const [threshold] = await callSafe(provider, address, 'getThreshold', [], blockTag);
        const [nonce] = await callSafe(provider, address, 'nonce', [], blockTag);
        const [modules] = await callSafe(provider, address, 'getModulesPaginated', [SENTINEL_MODULES, 50], blockTag);
        const [singletonSlot, guardSlot, fallbackHandlerSlot] = await Promise.all([
            provider.getStorage(address, 0, blockTag),
            provider.getStorage(address, GUARD_STORAGE_SLOT, blockTag),
            provider.getStorage(address, FALLBACK_HANDLER_STORAGE_SLOT, blockTag),
        ]);

        return {
            version,
            singleton: storageToAddress(singletonSlot),
            owners: [...owners],
            threshold,
            nonce,
            modules: [...modules],
            guard: storageToAddress(guardSlot),
            fallbackHandler: storageToAddress(fallbackHandlerSlot),
        };
    } catch (e) {
        return undefined;
    }
}

/**
 * Find the block where a contract was created by binary search on its code (requires an archive node)
 * @param provider provider
 * @param address contract address
 * @returns creation block number
 */
async function findCreationBlock(provider: ethers.JsonRpcProvider, address: string): Promise<number> {
    let low = 0;
    let high = await provider.getBlockNumber();
    while (high - low > 1) {
        const mid = Math.floor((low + high) / 2);
        if ((await provider.getCode(address, mid)) === '0x') {
            low = mid;
        } else {
            high = mid;
        }
    }
    return high;
}

/**
 * Get the SafeSetup log of a Safe (emitted only once, when the Safe is set up)
 * @param provider provider
 * @param address Safe address
 * @returns SafeSetup log or undefined if not found
 */
async function getSafeSetupLog(provider: ethers.JsonRpcProvider, address: string): Promise<ethers.Log | undefined> {
    const topic = safeInterface.getEvent('SafeSetup')!.topicHash;
    let logs: ethers.Log[];
    try {
        logs = await provider.getLogs({ address, topics: [topic], fromBlock: 0, toBlock: 'latest' });
    } catch (e) {
        // RPC does not allow the whole block range: look only at the creation block
        const creationBlock = await findCreationBlock(provider, address);
        logs = await provider.getLogs({ address, topics: [topic], fromBlock: creationBlock, toBlock: creationBlock });
    }
    return logs[0];
}

/**
 * Recover how a Safe was created and its initial configuration
 * @param provider provider of the chain where the Safe is deployed
 * @param address Safe address
 * @returns Safe creation information, or undefined if the SafeSetup event is not found
 */
export async function getSafeCreation(
    provider: ethers.JsonRpcProvider,
    address: string,
): Promise<SafeCreation | undefined> {
    const setupLog = await getSafeSetupLog(provider, address);
    if (setupLog === undefined) {
        return undefined;
    }

    const setupEvent = safeInterface.parseLog(setupLog)!;
    const creation: SafeCreation = {
        blockNumber: setupLog.blockNumber,
        txHash: setupLog.transactionHash,
        owners: [...setupEvent.args.owners],
        threshold: setupEvent.args.threshold,
        setupTo: setupEvent.args.initializer,
        fallbackHandler: setupEvent.args.fallbackHandler,
        chainSpecific: false,
    };

    // ProxyCreation event emitted by the factory (proxy is indexed on v1.4.1, not indexed on v1.3.0)
    const receipt = (await provider.getTransactionReceipt(setupLog.transactionHash))!;
    for (const log of receipt.logs) {
        if (log.topics[0] === PROXY_CREATION_TOPIC) {
            let proxy;
            let singleton;
            if (log.topics.length === 2) {
                proxy = storageToAddress(log.topics[1]);
                [singleton] = ethers.AbiCoder.defaultAbiCoder().decode(['address'], log.data);
            } else {
                [proxy, singleton] = ethers.AbiCoder.defaultAbiCoder().decode(['address', 'address'], log.data);
            }

            if (proxy.toLowerCase() === address.toLowerCase()) {
                creation.factory = ethers.getAddress(log.address);
                creation.singleton = ethers.getAddress(singleton);
                break;
            }
        }
    }

    // creation parameters, only recoverable if the factory was called directly
    const tx = (await provider.getTransaction(setupLog.transactionHash))!;
    if (creation.factory === undefined || tx.to === null || tx.to.toLowerCase() !== creation.factory.toLowerCase()) {
        return creation;
    }

    const parsedTx = factoryInterface.parseTransaction({ data: tx.data });
    if (parsedTx === null) {
        return creation;
    }

    creation.creationMethod = parsedTx.name;
    creation.initializer = parsedTx.args.initializer;
    creation.saltNonce = parsedTx.args.saltNonce;
    creation.chainSpecific = parsedTx.name === 'createChainSpecificProxyWithNonce';

    let saltNonce = parsedTx.args.saltNonce as bigint;
    if (parsedTx.name === 'createProxyWithCallback') {
        creation.callback = parsedTx.args.callback;
        saltNonce = BigInt(ethers.solidityPackedKeccak256(['uint256', 'address'], [saltNonce, parsedTx.args.callback]));
    }

    const salt = creation.chainSpecific
        ? ethers.solidityPackedKeccak256(
              ['bytes32', 'uint256', 'uint256'],
              [ethers.keccak256(creation.initializer!), saltNonce, (await provider.getNetwork()).chainId],
          )
        : ethers.solidityPackedKeccak256(['bytes32', 'uint256'], [ethers.keccak256(creation.initializer!), saltNonce]);

    const [proxyCreationCode] = factoryInterface.decodeFunctionResult(
        'proxyCreationCode',
        await provider.call({ to: creation.factory, data: factoryInterface.encodeFunctionData('proxyCreationCode') }),
    );
    const deploymentData = ethers.solidityPacked(['bytes', 'uint256'], [proxyCreationCode, creation.singleton]);
    creation.predictedAddress = ethers.getCreate2Address(creation.factory, salt, ethers.keccak256(deploymentData));

    try {
        const setup = safeInterface.decodeFunctionData('setup', creation.initializer!);
        creation.setupParams = {
            owners: [...setup._owners],
            threshold: setup._threshold,
            to: setup.to,
            data: setup.data,
            fallbackHandler: setup.fallbackHandler,
            paymentToken: setup.paymentToken,
            payment: setup.payment,
            paymentReceiver: setup.paymentReceiver,
        };
    } catch (e) {
        // initializer is not a Safe setup call
    }

    return creation;
}
