/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import { expect } from 'chai';
import path = require('path');
import fs = require('fs');
import * as dotenv from 'dotenv';
import { ethers, upgrades } from 'hardhat';
import { processorUtils, Constants } from '@0xpolygonhermez/zkevm-commonjs';
import { VerifierType } from '../../src/pessimistic-utils';
import { genOperation, transactionTypes, convertBigIntsToNumbers } from '../utils';
import { AGGCHAIN_CONTRACT_NAMES, encodeInitAggchainManager } from '../../src/utils-common-aggchain';
import { GENESIS_CONTRACT_NAMES, DEFAULT_ADMIN_ROLE, CREATE_ROLLUP_ROLE } from '../../src/constants';
import createRollupParameters from './create_new_rollup.json';
import updateVanillaGenesis from '../../deployment/v2/utils/updateVanillaGenesis';
import { logger } from '../../src/logger';
import { AgglayerManager, AgglayerBridge } from '../../typechain-types';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

async function main() {
    logger.info(`Starting script to create new rollup from ${createRollupParameters.type}...`);
    const outputJson = {} as any;
    const dateStr = new Date().toISOString();
    const destPath = createRollupParameters.outputPath
        ? path.join(__dirname, createRollupParameters.outputPath)
        : path.join(__dirname, `create_new_rollup_output_${createRollupParameters.type}_${dateStr}.json`);

    /*
     * Check deploy parameters
     * Check that every necessary parameter is fulfilled
     */
    const mandatoryDeploymentParameters = [
        'trustedSequencerURL',
        'networkName',
        'trustedSequencer',
        'chainID',
        'rollupAdminAddress',
        'consensusContractName',
        'rollupManagerAddress',
        'rollupTypeId',
        'gasTokenAddress',
        'type',
    ];
    // check create rollup type
    switch (createRollupParameters.type) {
        case transactionTypes.EOA:
        case transactionTypes.MULTISIG:
            break;
        case transactionTypes.TIMELOCK:
            mandatoryDeploymentParameters.push('timelockDelay');
            break;
        default:
            throw new Error(`Invalid type ${createRollupParameters.type}`);
    }

    mandatoryDeploymentParameters.forEach((parameterName: string) => {
        const value = createRollupParameters[parameterName as keyof typeof createRollupParameters];
        if (value === undefined || value === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }
    });

    // trustedSequencerURL, networkName and rollupAdminAddress are set later by the aggchain manager (initializeRollup tool)
    const { trustedSequencer, chainID, consensusContractName, isVanillaClient, sovereignParams, proxiedTokensManager } =
        createRollupParameters;

    // Check supported consensus is correct
    // Only aggchains (VerifierType.ALGateway) can be created: StateTransition and Pessimistic consensus are deprecated
    const supportedAggchainsArray = Object.values(AGGCHAIN_CONTRACT_NAMES);

    if (!supportedAggchainsArray.includes(consensusContractName)) {
        throw new Error(
            `Consensus contract ${consensusContractName} not supported, supported contracts are: ${supportedAggchainsArray}`,
        );
    }

    // Load provider
    let currentProvider = ethers.provider;
    if (createRollupParameters.multiplierGas || createRollupParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            ) as any;
            if (createRollupParameters.maxPriorityFeePerGas && createRollupParameters.maxFeePerGas) {
                logger.info(
                    `Hardcoded gas used: MaxPriority${createRollupParameters.maxPriorityFeePerGas} gwei, MaxFee${createRollupParameters.maxFeePerGas} gwei`,
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(createRollupParameters.maxFeePerGas, 'gwei'),
                    ethers.parseUnits(createRollupParameters.maxPriorityFeePerGas, 'gwei'),
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                logger.info(`Multiplier gas used: ${createRollupParameters.multiplierGas}`);
                async function overrideFeeData() {
                    const feeData = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feeData.maxFeePerGas as bigint) * BigInt(createRollupParameters.multiplierGas)) / 1000n,
                        ((feeData.maxPriorityFeePerGas as bigint) * BigInt(createRollupParameters.multiplierGas)) /
                            1000n,
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }

    // Load deployer
    let deployer;
    if (createRollupParameters.deployerPvtKey) {
        deployer = new ethers.Wallet(createRollupParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0",
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }

    // Load Rollup manager
    const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManager', deployer);
    const rollupManagerContract = PolygonRollupManagerFactory.attach(
        createRollupParameters.rollupManagerAddress,
    ) as AgglayerManager;

    // Load global exit root manager
    const globalExitRootManagerFactory = await ethers.getContractFactory('AgglayerGER', deployer);
    const globalExitRootManagerAddress = await rollupManagerContract.globalExitRootManager();
    const globalExitRootManagerContract = globalExitRootManagerFactory.attach(
        globalExitRootManagerAddress,
    ) as AgglayerManager;

    const polygonConsensusFactory = (await ethers.getContractFactory(consensusContractName, deployer)) as any;
    // Check chainID
    let rollupID = await rollupManagerContract.chainIDToRollupID(chainID);
    if (Number(rollupID) !== 0) {
        throw new Error(`Rollup with chainID ${chainID} already exists`);
    }
    // Check rollupTypeId
    const rollupType = await rollupManagerContract.rollupTypeMap(createRollupParameters.rollupTypeId);
    const consensusContractAddress = rollupType[0];
    const verifierType = Number(rollupType[3]);
    if (verifierType !== VerifierType.ALGateway) {
        throw new Error(
            `Mismatch RollupTypeID: Verifier type should be ${VerifierType.ALGateway} for ${consensusContractName}`,
        );
    }

    // Get rollup address deterministically
    const nonce = await currentProvider.getTransactionCount(rollupManagerContract.target);
    const createdRollupAddress = ethers.getCreateAddress({
        from: rollupManagerContract.target as string,
        nonce,
    });
    let batchData = {};
    // Populate output json
    outputJson.consensusContractName = consensusContractName;
    outputJson.rollupAddress = createdRollupAddress;
    outputJson.genesis = rollupType.genesis;
    outputJson.gasTokenAddress = createRollupParameters.gasTokenAddress;
    outputJson.rollupManagerAddress = createRollupParameters.rollupManagerAddress;

    // Aggchains are initialized by the aggchain manager after creation
    const initializeBytes = encodeInitAggchainManager(createRollupParameters.aggchainParams.aggchainManager);

    if (createRollupParameters.type === transactionTypes.TIMELOCK) {
        logger.info('Creating timelock txs for rollup creation...');
        const salt = createRollupParameters.timelockSalt || ethers.ZeroHash;
        const predecessor = ethers.ZeroHash;
        const timelockContractFactory = await ethers.getContractFactory('PolygonZkEVMTimelock', deployer);
        const operation = genOperation(
            createRollupParameters.rollupManagerAddress,
            0, // value
            PolygonRollupManagerFactory.interface.encodeFunctionData('attachAggchainToAL', [
                createRollupParameters.rollupTypeId,
                chainID,
                initializeBytes,
            ]),
            predecessor, // predecessor
            salt, // salt
        );
        // Schedule operation
        const scheduleData = timelockContractFactory.interface.encodeFunctionData('schedule', [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
            createRollupParameters.timelockDelay,
        ]);
        // Execute operation
        const executeData = timelockContractFactory.interface.encodeFunctionData('execute', [
            operation.target,
            operation.value,
            operation.data,
            operation.predecessor,
            operation.salt,
        ]);
        logger.info({ scheduleData });
        logger.info({ executeData });
        outputJson.scheduleData = scheduleData;
        outputJson.executeData = executeData;
        // Decode the scheduleData for better readability
        const timelockTx = timelockContractFactory.interface.parseTransaction({
            data: scheduleData,
        });
        const paramsArray = timelockTx?.fragment.inputs;
        const objectDecoded = {};
        for (let i = 0; i < paramsArray?.length; i++) {
            const currentParam = paramsArray[i];

            objectDecoded[currentParam.name] = timelockTx?.args[i];

            if (currentParam.name === 'data') {
                const decodedRollupManagerData = PolygonRollupManagerFactory.interface.parseTransaction({
                    data: timelockTx?.args[i],
                });
                const objectDecodedData = {};
                const paramsArrayData = decodedRollupManagerData?.fragment.inputs;

                for (let j = 0; j < paramsArrayData?.length; j++) {
                    const currentParamData = paramsArrayData[j];
                    objectDecodedData[currentParamData.name] = decodedRollupManagerData?.args[j];
                }
                objectDecoded.decodedData = objectDecodedData;
            }
        }

        outputJson.decodedScheduleData = convertBigIntsToNumbers(objectDecoded);
        fs.writeFileSync(destPath, JSON.stringify(outputJson, null, 1));
        logger.info(`Finished script, output saved at: ${destPath}`);
        process.exit(0);
    } else if (createRollupParameters.type === transactionTypes.MULTISIG) {
        logger.info('Creating calldata for rollup creation from multisig...');
        const txDeployRollupCalldata = PolygonRollupManagerFactory.interface.encodeFunctionData('attachAggchainToAL', [
            createRollupParameters.rollupTypeId,
            chainID,
            initializeBytes,
        ]);
        outputJson.txDeployRollupCalldata = txDeployRollupCalldata;
        fs.writeFileSync(destPath, JSON.stringify(outputJson, null, 1));
        logger.info(`Finished script, output saved at: ${destPath}`);
        process.exit(0);
    } else {
        // EOA: the deployer creates the rollup, so it needs CREATE_ROLLUP_ROLE (granted here if it is the admin)
        if ((await rollupManagerContract.hasRole(CREATE_ROLLUP_ROLE, deployer.address)) === false) {
            if ((await rollupManagerContract.hasRole(DEFAULT_ADMIN_ROLE, deployer.address)) === false) {
                throw new Error(
                    `Deployer ${deployer.address} has neither CREATE_ROLLUP_ROLE nor the admin role to grant it. Use the Timelock or Multisig type to generate the calldata`,
                );
            }
            await (await rollupManagerContract.grantRole(CREATE_ROLLUP_ROLE, deployer.address)).wait();
        }

        logger.info('Deploying rollup....');
        // Create new rollup
        const txDeployRollup = await rollupManagerContract.attachAggchainToAL(
            createRollupParameters.rollupTypeId,
            chainID,
            initializeBytes,
        );

        const receipt = (await txDeployRollup.wait()) as any;
        const blockDeploymentRollup = await receipt?.getBlock();

        batchData = {
            timestamp: blockDeploymentRollup.timestamp,
            l1BlockNumber: blockDeploymentRollup.number,
            l1BlockHash: blockDeploymentRollup.hash,
            l1ParentHash: blockDeploymentRollup.parentHash,
        };
        outputJson.createRollupBlockNumber = blockDeploymentRollup.number;
        logger.info('#######################\n');
        logger.info(
            `Created new ${consensusContractName} Rollup: ${createdRollupAddress} with rollupTypeId: ${createRollupParameters.rollupTypeId}`,
        );

        // Assert admin address
        expect(await upgrades.erc1967.getAdminAddress(createdRollupAddress)).to.be.equal(rollupManagerContract.target);
        expect(await upgrades.erc1967.getImplementationAddress(createdRollupAddress)).to.be.equal(
            consensusContractAddress,
        );
    }
    // Update rollupId
    rollupID = await rollupManagerContract.chainIDToRollupID(chainID);

    let gasTokenAddress;
    let gasTokenNetwork;
    let gasTokenMetadata;

    // Get bridge instance
    const bridgeFactory = await ethers.getContractFactory('AgglayerBridge', deployer);
    const bridgeContractAddress = await rollupManagerContract.bridgeAddress();
    const rollupBridgeContract = bridgeFactory.attach(bridgeContractAddress) as AgglayerBridge;
    if (
        ethers.isAddress(createRollupParameters.gasTokenAddress) &&
        createRollupParameters.gasTokenAddress !== ethers.ZeroAddress
    ) {
        // Get token metadata
        gasTokenMetadata = await rollupBridgeContract.getTokenMetadata(createRollupParameters.gasTokenAddress);
        outputJson.gasTokenMetadata = gasTokenMetadata;
        // If gas token metadata includes `0x124e4f545f56414c49445f454e434f44494e47 (NOT_VALID_ENCODING)` means there is no erc20 token deployed at the selected gas token network
        if (gasTokenMetadata.includes('124e4f545f56414c49445f454e434f44494e47')) {
            throw new Error(
                `Invalid gas token address, no ERC20 token deployed at the selected gas token network ${createRollupParameters.gasTokenAddress}`,
            );
        }
        const wrappedData = await rollupBridgeContract.wrappedTokenToTokenInfo(createRollupParameters.gasTokenAddress);
        if (wrappedData.originNetwork !== 0n) {
            // Wrapped token
            gasTokenAddress = wrappedData.originTokenAddress;
            gasTokenNetwork = wrappedData.originNetwork;
        } else {
            // Mainnet token
            gasTokenAddress = createRollupParameters.gasTokenAddress;
            gasTokenNetwork = 0n;
        }
    } else {
        gasTokenAddress = ethers.ZeroAddress;
        gasTokenNetwork = 0;
        gasTokenMetadata = '0x';
    }

    /**
    If the system is running a "vanilla client" (i.e., a basic, unmodified Ethereum client or rollup setup), the genesis block should include the deployment of the sovereign contracts,
    and these contracts should already be initialized with their required initial state and configurations.
    This means that the genesis block will contain the initial state for these contracts, allowing the system to start running without needing any additional initialization steps.
    However, for other rollups, additional configuration is needed. In this case, instead of having everything pre-initialized in the genesis block,
    we must inject an "initialization batch" into the genesis file. This batch will contain specific instructions for initializing the contracts at the time of rollup deployment.
    The injected initialization batch allows the system to be configured dynamically during deployment.
    */

    if (isVanillaClient) {
        logger.info('Vanilla client detected, updating genesis...');
        const pathGenesis = path.join(__dirname, './genesis.json');
        let genesis = JSON.parse(fs.readFileSync(pathGenesis, 'utf8'));
        const initializeParams = {
            rollupID,
            gasTokenAddress,
            gasTokenNetwork,
            polygonRollupManager: ethers.ZeroAddress,
            gasTokenMetadata,
            bridgeManager: sovereignParams.bridgeManager,
            sovereignWETHAddress: sovereignParams.sovereignWETHAddress,
            sovereignWETHAddressIsNotMintable: sovereignParams.sovereignWETHAddressIsNotMintable,
            globalExitRootUpdater: sovereignParams.globalExitRootUpdater,
            globalExitRootRemover: sovereignParams.globalExitRootRemover,
            proxiedTokensManager,
            emergencyBridgePauser: sovereignParams.emergencyBridgePauser,
            emergencyBridgeUnpauser: sovereignParams.emergencyBridgeUnpauser,
        };
        try {
            genesis = await updateVanillaGenesis(genesis, chainID, initializeParams);
            // Add weth address to deployment output if gas token address is provided and sovereignWETHAddress is not provided
            if (
                gasTokenAddress !== ethers.ZeroAddress &&
                ethers.isAddress(gasTokenAddress) &&
                (sovereignParams.sovereignWETHAddress === ethers.ZeroAddress ||
                    !ethers.isAddress(sovereignParams.sovereignWETHAddress))
            ) {
                logger.info('Rollup with custom gas token, adding WETH proxy address to deployment output...');
                const wethObject = genesis.genesis.find(function (obj: { contractName: string }) {
                    return obj.contractName === GENESIS_CONTRACT_NAMES.WETH_PROXY;
                });
                outputJson.WETHAddress = wethObject.address;
            }
            outputJson.genesis_sovereign = genesis;
        } catch (e) {
            logger.info(`ERROR UPDATING GENESIS: ${e}`);
        }
    } else {
        if (consensusContractName === AGGCHAIN_CONTRACT_NAMES.ECDSA) {
            logger.info('Non vanilla AggchainECDSAMultisig rollup detected, injecting initialization batch...');
            // Add the first batch of the created rollup
            const newPessimisticRollup = (await polygonConsensusFactory.attach(createdRollupAddress)) as any;

            // Get last GER
            const lastGER = await globalExitRootManagerContract.getLastGlobalExitRoot();

            const dataInjectedTx = await rollupBridgeContract.interface.encodeFunctionData(
                'initialize(uint32,address,uint32,address,address,bytes)',
                [
                    rollupID,
                    gasTokenAddress,
                    gasTokenNetwork,
                    Constants.ADDRESS_GLOBAL_EXIT_ROOT_MANAGER_L2, // Global exit root address on L2
                    ethers.ZeroAddress, // Rollup manager on L2 does not exist
                    gasTokenMetadata as any,
                ],
            );

            // check maximum length is 65535
            if ((dataInjectedTx.length - 2) / 2 > 0xffff) {
                // throw error
                throw new Error(`HugeTokenMetadataNotSupported`);
            }

            const injectedTx = {
                type: 0, // force ethers to parse it as a legacy transaction
                chainId: 0, // force ethers to parse it as a pre-EIP155 transaction
                to: await newPessimisticRollup.bridgeAddress(),
                value: 0,
                gasPrice: 0,
                gasLimit: 30000000,
                nonce: 0,
                data: dataInjectedTx,
                signature: {
                    v: '0x1b',
                    r: '0x00000000000000000000000000000000000000000000000000000005ca1ab1e0',
                    s: '0x000000000000000000000000000000000000000000000000000000005ca1ab1e',
                },
            };

            // serialize transactions
            const txObject = ethers.Transaction.from(injectedTx);

            const customData = processorUtils.rawTxToCustomRawTx(txObject.serialized);
            batchData = Object.assign(batchData, {
                batchL2Data: customData,
                globalExitRoot: lastGER,
                sequencer: trustedSequencer,
            });
        }
    }
    outputJson.firstBatchData = batchData;
    outputJson.rollupID = Number(rollupID);

    fs.writeFileSync(destPath, JSON.stringify(outputJson, null, 1));
    logger.info(`Finished script, output saved at: ${destPath}`);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
