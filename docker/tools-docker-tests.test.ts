import { expect } from 'chai';
import { ethers } from 'hardhat';
import fs from 'fs';
import path from 'path';
import shelljs from 'shelljs';
import { ConsensusContracts } from '../src/pessimistic-utils';
import { AGGCHAIN_CONTRACT_NAMES } from '../src/utils-common-aggchain';
import { GENESIS_CONTRACT_NAMES } from '../src/constants';
import { initializeTimelockStorage } from '../src/genesis/genesis-helpers';
import safeContracts from '../tools/createSovereignGenesis/safe-contracts.json';

import {
    AgglayerManager,
    PolygonPessimisticConsensus,
    PolygonValidiumEtrog,
    PolygonZkEVMEtrog,
    AggchainFEP,
    AggchainECDSAMultisig,
    AgglayerGateway,
} from '../typechain-types';

describe('Tooling docker build tests Contract', () => {
    let rollupContract: PolygonZkEVMEtrog | PolygonPessimisticConsensus | AggchainECDSAMultisig | AggchainFEP;

    it('Create a new rollup', async () => {
        // Read docker deployment output
        const dockerCreateRollupOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, './deploymentOutput/create_rollup_output.json'), 'utf8'),
        );
        const dockerDeploymentOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, './deploymentOutput/deploy_output.json'), 'utf8'),
        );
        // Read create rollup config file
        const createRollupConfig = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../tools/createNewRollup/create_new_rollup.json.example'), 'utf8'),
        );

        // Update example config from docker deployment output
        createRollupConfig.consensusContractName = dockerCreateRollupOutput.consensusContract;
        createRollupConfig.gasTokenAddress = dockerCreateRollupOutput.gasTokenAddress;
        createRollupConfig.outputPath = 'create_new_rollup_output.json';
        createRollupConfig.chainID = 12;
        createRollupConfig.rollupManagerAddress = dockerDeploymentOutput.polygonRollupManagerAddress;
        fs.writeFileSync(
            path.join(__dirname, '../tools/createNewRollup/create_new_rollup.json'),
            JSON.stringify(createRollupConfig, null, 2),
        );

        // Run tool
        shelljs.exec('npx hardhat run ./tools/createNewRollup/createNewRollup.ts --network localhost');

        // Read create rollup output
        const createRollupOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../tools/createNewRollup/create_new_rollup_output.json'), 'utf8'),
        );

        // Check output values with current docker environment
        const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManager');
        const rollupManagerContract = PolygonRollupManagerFactory.attach(
            createRollupOutput.rollupManagerAddress,
        ) as AgglayerManager;

        expect(createRollupConfig.rollupManagerAddress).to.equal(rollupManagerContract.target);
        // Get rollup data
        const rollupId = await rollupManagerContract.rollupAddressToID(createRollupOutput.rollupAddress);
        expect(Number(rollupId)).to.equal(createRollupOutput.rollupID);
        expect(await rollupManagerContract.chainIDToRollupID(createRollupConfig.chainID)).to.equal(
            createRollupOutput.rollupID,
        );
        const rollupFactory = (await ethers.getContractFactory(createRollupConfig.consensusContractName)) as any;

        switch (createRollupConfig.consensusContractName) {
            case ConsensusContracts.PolygonZkEVMEtrog:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as PolygonZkEVMEtrog;
                break;
            case ConsensusContracts.PolygonValidiumEtrog:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as PolygonValidiumEtrog;
                break;
            case ConsensusContracts.PolygonPessimisticConsensus:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as PolygonPessimisticConsensus;
                break;
            case AGGCHAIN_CONTRACT_NAMES.ECDSA:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as AggchainECDSAMultisig;
                break;
            case AGGCHAIN_CONTRACT_NAMES.FEP:
                rollupContract = rollupFactory.attach(createRollupOutput.rollupAddress) as AggchainFEP;
                break;
            default:
                throw new Error('Invalid consensus contract');
        }

        expect(await rollupContract.aggchainManager()).to.equal(createRollupConfig.aggchainParams.aggchainManager);

        // Copy example config file
        fs.copyFileSync(
            path.join(__dirname, './scripts/tools/initialize_rollup.json'),
            path.join(__dirname, '../tools/initializeRollup/initialize_rollup.json'),
        );

        // Read create rollup config file
        const initializeRollupConfig = JSON.parse(
            fs.readFileSync(path.join(__dirname, './scripts/tools/initialize_rollup.json'), 'utf8'),
        );

        // Run tool
        const out = shelljs.exec('npx hardhat run ./tools/initializeRollup/initializeRollup.ts --network localhost');

        if (out.code === 1) {
            throw new Error('Error initializing rollup');
        }

        expect(await rollupContract.admin()).to.equal(initializeRollupConfig.rollupAdminAddress);
    });

    it('Add defaultAggchainVKey', async () => {
        // Copy example config file
        fs.copyFileSync(
            path.join(__dirname, './scripts/tools/parameters-aggchainvkey.json'),
            path.join(__dirname, '../tools/aggLayerGatewayTools/addDefaultAggchainVKey/parameters.json'),
        );

        // Read config file
        const addDefaultAggchainVKey = JSON.parse(
            fs.readFileSync(path.join(__dirname, './scripts/tools/parameters-aggchainvkey.json'), 'utf8'),
        );

        const AgglayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        const agglayerGatewayContract = AgglayerGatewayFactory.attach(
            addDefaultAggchainVKey.aggLayerGatewayAddress,
        ) as AgglayerGateway;

        expect(
            await agglayerGatewayContract.defaultAggchainVKeys(addDefaultAggchainVKey.defaultAggchainSelector),
        ).to.be.equal('0x0000000000000000000000000000000000000000000000000000000000000000');

        // Run tool
        const out = shelljs.exec(
            'npx hardhat run ./tools/aggLayerGatewayTools/addDefaultAggchainVKey/addDefaultAggchainVKey.ts --network localhost',
        );

        if (out.code === 1) {
            throw new Error('Error adding default aggchain vkey rollup');
        }

        expect(
            await agglayerGatewayContract.defaultAggchainVKeys(addDefaultAggchainVKey.defaultAggchainSelector),
        ).to.be.equal('0x1111111111111111111111111111111111111111111111111111111111111111');
    });

    it('Add pessimisticVkey', async () => {
        // Copy example config file
        fs.copyFileSync(
            path.join(__dirname, './scripts/tools/parameters-ppvkey.json'),
            path.join(__dirname, '../tools/aggLayerGatewayTools/addPessimisticVKeyRoute/parameters.json'),
        );

        // Read config file
        const addPessimisticVKeyRoute = JSON.parse(
            fs.readFileSync(path.join(__dirname, './scripts/tools/parameters-ppvkey.json'), 'utf8'),
        );
        const AgglayerGatewayFactory = await ethers.getContractFactory('AgglayerGateway');
        const agglayerGatewayContract = AgglayerGatewayFactory.attach(
            addPessimisticVKeyRoute.aggLayerGatewayAddress,
        ) as AgglayerGateway;

        expect(
            (await agglayerGatewayContract.pessimisticVKeyRoutes(addPessimisticVKeyRoute.pessimisticVKeySelector))[1],
        ).to.be.equal('0x0000000000000000000000000000000000000000000000000000000000000000');

        // Run tool
        const out = shelljs.exec(
            'npx hardhat run ./tools/aggLayerGatewayTools/addPessimisticVKeyRoute/addPessimisticVKeyRoute.ts --network localhost',
        );

        if (out.code === 1) {
            throw new Error('Error adding default aggchain vkey rollup');
        }

        expect(
            (await agglayerGatewayContract.pessimisticVKeyRoutes(addPessimisticVKeyRoute.pessimisticVKeySelector))[1],
        ).to.be.equal('0xac51a6a2e513d02e4f39ea51d4d133cec200b940805f1054eabbb6d6412c959f');
    });

    it('Create a new rollup type', async () => {
        // Read docker deployment output
        const dockerCreateRollupOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, './deploymentOutput/create_rollup_output.json'), 'utf8'),
        );
        const dockerDeploymentOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, './deploymentOutput/deploy_output.json'), 'utf8'),
        );
        // Read create rollup config file
        const createRollupTypeConfig = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../tools/addRollupType/add_rollup_type.json.example'), 'utf8'),
        );

        // Update example config from docker deployment output
        createRollupTypeConfig.consensusContract = dockerCreateRollupOutput.consensusContract;
        createRollupTypeConfig.polygonRollupManagerAddress = dockerCreateRollupOutput.rollupManagerAddress;
        createRollupTypeConfig.verifierAddress = dockerCreateRollupOutput.verifierAddress;
        if (dockerCreateRollupOutput.consensusContract === ConsensusContracts.PolygonPessimisticConsensus) {
            createRollupTypeConfig.genesisRoot = ethers.ZeroHash;
            createRollupTypeConfig.programVKey = dockerCreateRollupOutput.programVKey;
        } else if (Object.values(AGGCHAIN_CONTRACT_NAMES).includes(dockerCreateRollupOutput.consensusContract)) {
            createRollupTypeConfig.genesisRoot = ethers.ZeroHash;
            createRollupTypeConfig.programVKey = ethers.ZeroHash;
            createRollupTypeConfig.verifierAddress = ethers.ZeroAddress;
            createRollupTypeConfig.forkID = 0;
        } else {
            createRollupTypeConfig.genesisRoot = dockerCreateRollupOutput.genesis;
            createRollupTypeConfig.programVKey = ethers.ZeroHash;
        }
        createRollupTypeConfig.polygonRollupManagerAddress = dockerDeploymentOutput.polygonRollupManagerAddress;
        createRollupTypeConfig.outputPath = 'add_rollup_type_output.json';
        delete createRollupTypeConfig.customALGatewayAddress;

        fs.writeFileSync(
            path.join(__dirname, '../tools/addRollupType/add_rollup_type.json'),
            JSON.stringify(createRollupTypeConfig, null, 2),
        );

        // Copy genesis file
        fs.copyFileSync(
            path.join(__dirname, '../tools/addRollupType/genesis.json.example'),
            path.join(__dirname, '../tools/addRollupType/genesis.json'),
        );
        // Run tool
        shelljs.exec('npx hardhat run ./tools/addRollupType/addRollupType.ts --network localhost');

        // Read create rollup output
        const createRollupTypeOutput = JSON.parse(
            fs.readFileSync(path.join(__dirname, '../tools/addRollupType/add_rollup_type_output.json'), 'utf8'),
        );
        // Check output values with current docker environment
        const PolygonRollupManagerFactory = await ethers.getContractFactory('AgglayerManager');
        const rollupManagerContract = PolygonRollupManagerFactory.attach(
            dockerDeploymentOutput.polygonRollupManagerAddress,
        ) as AgglayerManager;

        const rollupType = await rollupManagerContract.rollupTypeMap(Number(createRollupTypeOutput.rollupTypeID));
        // Consensus contract address
        expect(rollupType[0]).to.equal(createRollupTypeOutput.consensusContractAddress);
        // verifier address
        expect(rollupType[1]).to.equal(createRollupTypeConfig.verifierAddress);
        // ForkID
        expect(Number(rollupType[2])).to.equal(createRollupTypeConfig.forkID);
        // Genesis root
        expect(rollupType[5]).to.equal(createRollupTypeConfig.genesisRoot);
        // Program VKey
        expect(rollupType[6]).to.equal(createRollupTypeConfig.programVKey);
    });

    describe('Tool createSovereignGenesis', () => {
        const toolDir = path.join(__dirname, '../tools/createSovereignGenesis');
        const pathParams = path.join(toolDir, 'create-genesis-sovereign-params.json');
        const pathGenesisBase = path.join(toolDir, 'genesis-base.json');
        // output names match the tool .gitignore patterns
        const outputGenesisFile = 'genesis-rollupID-docker-test.json';
        const outputFile = 'output-rollupID-docker-test.json';
        const pathOutputGenesis = path.join(toolDir, outputGenesisFile);
        const pathOutput = path.join(toolDir, outputFile);
        const polygonMultisig = '0x242daE44F5d8fb54B198D03a94dA45B5a4413e21';
        const timelockRoles = ['TIMELOCK_ADMIN_ROLE', 'PROPOSER_ROLE', 'EXECUTOR_ROLE', 'CANCELLER_ROLE'];
        const backups = {} as { [filePath: string]: string };
        let genesisParams: any;

        function runTool(params: any) {
            fs.rmSync(pathOutputGenesis, { force: true });
            fs.rmSync(pathOutput, { force: true });
            fs.writeFileSync(pathParams, JSON.stringify(params, null, 4));

            return shelljs.exec(
                'npx hardhat run ./tools/createSovereignGenesis/create-sovereign-genesis.ts --network localhost',
                { silent: true },
            );
        }

        // storage slot of `account` in the `_roles[role].members` mapping (OZ v4.8.2 AccessControl, slot 0)
        function timelockRoleMemberSlot(role: string, account: string) {
            const roleSlot = ethers.solidityPackedKeccak256(['uint256', 'uint256'], [ethers.id(role), 0]);
            return ethers.solidityPackedKeccak256(['uint256', 'uint256'], [account, roleSlot]);
        }

        before(() => {
            // keep local tool files to restore them after the tests
            [pathParams, pathGenesisBase].forEach((filePath) => {
                if (fs.existsSync(filePath)) {
                    backups[filePath] = fs.readFileSync(filePath, 'utf8');
                }
            });

            // Copy docker genesis and config file
            fs.copyFileSync(path.join(__dirname, './deploymentOutput/genesis.json'), pathGenesisBase);
            genesisParams = JSON.parse(
                fs.readFileSync(path.join(__dirname, './scripts/tools/create-genesis-sovereign-params.json'), 'utf8'),
            );
            genesisParams.outputGenesisPath = `./${outputGenesisFile}`;
            genesisParams.outputPath = `./${outputFile}`;
        });

        after(() => {
            fs.rmSync(pathOutputGenesis, { force: true });
            fs.rmSync(pathOutput, { force: true });
            [pathParams, pathGenesisBase].forEach((filePath) => {
                if (backups[filePath] !== undefined) {
                    fs.writeFileSync(filePath, backups[filePath]);
                } else {
                    fs.rmSync(filePath, { force: true });
                }
            });
        });

        it('Check tool create genesis file', async () => {
            const out = runTool(genesisParams);
            expect(out.code, `${out.stdout}${out.stderr}`).to.equal(0);

            const genesis = JSON.parse(fs.readFileSync(pathOutputGenesis, 'utf8'));
            const output = JSON.parse(fs.readFileSync(pathOutput, 'utf8'));

            // geth format: { [address]: { code, storage, balance, nonce } }
            expect(genesisParams.formatGenesis).to.equal('geth');
            const accounts = Object.fromEntries(
                Object.entries(genesis).map(([address, account]) => [address.toLowerCase(), account]),
            ) as any;

            // Safe deterministic deployment factories, Safe v1.3.0 & Safe v1.4.1-3 contracts
            const safeGenesisContracts = [
                ...safeContracts.deterministicDeploymentFactories,
                ...safeContracts['v1.3.0'],
                ...safeContracts['v1.4.1-3'],
            ] as any[];
            expect(safeGenesisContracts.length).to.equal(23);

            safeGenesisContracts.forEach((contract) => {
                const account = accounts[contract.address.toLowerCase()];
                expect(account, `${contract.contractName} not found in genesis`).to.not.equal(undefined);
                expect(account.code).to.equal(contract.bytecode);
                expect(ethers.keccak256(account.code)).to.equal(contract.codeHash);
                expect(account.nonce).to.equal('0x1');
                expect(account.balance).to.equal('0x0');
                expect(account.storage).to.deep.equal(contract.storage);
                expect(output.genesisSCNames[contract.contractName]).to.equal(contract.address);
            });

            // Safe singletons are locked with threshold = 1 (slot 4)
            ['Safe v1.3.0 GnosisSafe', 'Safe v1.3.0 GnosisSafeL2', 'Safe v1.4.1 Safe', 'Safe v1.4.1 SafeL2'].forEach(
                (contractName) => {
                    const account = accounts[output.genesisSCNames[contractName].toLowerCase()];
                    expect(account.storage[ethers.toBeHex(4, 32)]).to.equal(ethers.toBeHex(1, 32));
                },
            );

            // Timelock storage
            const { adminAddress, minDelay } = genesisParams.timelockParameters;
            const timelockAddress = output.genesisSCNames[GENESIS_CONTRACT_NAMES.POLYGON_TIMELOCK];
            const timelockStorage = accounts[timelockAddress.toLowerCase()].storage;

            expect(timelockStorage).to.deep.equal(initializeTimelockStorage(minDelay, adminAddress, timelockAddress));
            timelockRoles.forEach((role) => {
                expect(BigInt(timelockStorage[timelockRoleMemberSlot(role, adminAddress)])).to.equal(1n);
                expect(timelockStorage[timelockRoleMemberSlot(role, polygonMultisig)]).to.equal(undefined);
            });
            expect(BigInt(timelockStorage[ethers.toBeHex(2, 32)])).to.equal(BigInt(minDelay));
            expect(output.timelockParameters).to.deep.equal(genesisParams.timelockParameters);

            // preMintAccounts
            genesisParams.preMintAccounts.forEach((preMintAccount: { address: string; balance: string }) => {
                expect(BigInt(accounts[preMintAccount.address.toLowerCase()].balance)).to.equal(
                    BigInt(preMintAccount.balance),
                );
            });
        });

        it('Check tool create genesis file fails if setTimelockParameters is missing', async () => {
            const params = { ...genesisParams };
            delete params.setTimelockParameters;

            const out = runTool(params);
            expect(out.code).to.not.equal(0);
            expect(`${out.stdout}${out.stderr}`).to.include('Missing parameter: setTimelockParameters');
            expect(fs.existsSync(pathOutputGenesis)).to.equal(false);
            expect(fs.existsSync(pathOutput)).to.equal(false);
        });

        it('Check tool create genesis file fails if setTimelockParameters is not true', async () => {
            const out = runTool({ ...genesisParams, setTimelockParameters: false });
            expect(out.code).to.not.equal(0);
            expect(`${out.stdout}${out.stderr}`).to.include('setTimelockParameters must be set to true');
            expect(fs.existsSync(pathOutputGenesis)).to.equal(false);
            expect(fs.existsSync(pathOutput)).to.equal(false);
        });

        it('Check tool create genesis file fails if the timelock admin is the Polygon multisig', async () => {
            const out = runTool({
                ...genesisParams,
                timelockParameters: {
                    ...genesisParams.timelockParameters,
                    // check is case insensitive
                    adminAddress: polygonMultisig.toLowerCase(),
                },
            });
            expect(out.code).to.not.equal(0);
            expect(`${out.stdout}${out.stderr}`).to.include(
                `timelockParameters.adminAddress must not be the Polygon multisig (${polygonMultisig})`,
            );
            expect(fs.existsSync(pathOutputGenesis)).to.equal(false);
            expect(fs.existsSync(pathOutput)).to.equal(false);
        });
    });
});
