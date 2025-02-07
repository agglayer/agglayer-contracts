import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {
    AggLayerGateway,
    ERC20PermitMock,
    PolygonRollupManagerMock,
    PolygonZkEVMGlobalExitRootV2,
    PolygonZkEVMBridgeV2,
    AggchainECDSA,
    VerifierRollupHelperMock,
} from "../../typechain-types";
const {VerifierType, AggchainSelector, AggchainType, computeRandomBytes} = require("../../src/pessimistic-utils");

// SIGNERS
let deployer: any;
let trustedSequencer: any;
let trustedAggregator: any;
let admin: any;
let timelock: any;
let emergencyCouncil: any;
let aggLayerAdmin: any;
let tester: any;

// CONTRACTS
let polygonZkEVMBridgeContract: PolygonZkEVMBridgeV2;
let polTokenContract: ERC20PermitMock;
let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRootV2;
let rollupManagerContract: PolygonRollupManagerMock;
let aggLayerGatewayContract: AggLayerGateway;
let aggchainECDSAContract: AggchainECDSA;
let verifierContract: VerifierRollupHelperMock;

/// CONSTANTS
const POL_TOKEN_NAME = "POL Token";
const POL_TOKEN_SYMBOL = "POL";
const POL_INITIAL_BALANCE = ethers.parseEther("20000000");
// BRIDGE CONSTANTS
const NETWORK_ID_MAINNET = 0;
const NETWORK_ID_ROLLUP = 1;
const LEAF_TYPE_ASSET = 0;
// AGGLAYER CONSTANTS
const AGGCHAIN_ADMIN_ROLE = ethers.id("AGGCHAIN_ADMIN_ROLE");
const PESSIMISTIC_SELECTOR = "0x00000001";
// AGGCHAIN CONSTANTS
const ECDSA_SELECTOR = "0x0001";
const randomNewStateRoot = computeRandomBytes(32);
const CUSTOM_DATA_ECDSA = ethers.AbiCoder.defaultAbiCoder().encode(["bytes2", "bytes32"], [ECDSA_SELECTOR, randomNewStateRoot]);

describe("Aggchain ECDSA", () => {
    before("Deploy contract", async () => {
        // load signers
        [deployer, trustedSequencer, trustedAggregator, admin, timelock, emergencyCouncil, aggLayerAdmin, tester] =
            await ethers.getSigners();

        // Deploy L1 contracts
        // deploy pol token contract
        const polTokenFactory = await ethers.getContractFactory("ERC20PermitMock");
        polTokenContract = await polTokenFactory.deploy(
            POL_TOKEN_NAME,
            POL_TOKEN_SYMBOL,
            deployer.address,
            POL_INITIAL_BALANCE
        );

        // deploy PolygonZkEVMBridgeV2, it's no initialized yet because rollupManager and globalExitRootManager addresses are not set yet (not deployed)
        const polygonZkEVMBridgeFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");
        polygonZkEVMBridgeContract = await upgrades.deployProxy(polygonZkEVMBridgeFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor", "missing-initializer"],
        });

        // Deploy aggLayerGateway and initialize it
        const aggLayerGatewayFactory = await ethers.getContractFactory("AggLayerGateway");
        aggLayerGatewayContract = await upgrades.deployProxy(aggLayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor", "missing-initializer"],
        });
        await aggLayerGatewayContract.initialize(admin.address, aggLayerAdmin.address);

        // The rollupManager address need to be precalculated because it's used in the globalExitRoot constructor
        const currentDeployerNonce = await ethers.provider.getTransactionCount(deployer.address);
        const precalculateRollupManagerAddress = ethers.getCreateAddress({
            from: deployer.address,
            nonce: currentDeployerNonce + 3,
        });
        // deploy globalExitRootV2
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRootV2");
        polygonZkEVMGlobalExitRoot = await upgrades.deployProxy(PolygonZkEVMGlobalExitRootFactory, [], {
            constructorArgs: [precalculateRollupManagerAddress, polygonZkEVMBridgeContract.target],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        });

        // deploy PolygonRollupManager
        const PolygonRollupManagerFactory = await ethers.getContractFactory("PolygonRollupManagerMock");

        rollupManagerContract = (await upgrades.deployProxy(PolygonRollupManagerFactory, [], {
            initializer: false,
            constructorArgs: [
                polygonZkEVMGlobalExitRoot.target,
                polTokenContract.target,
                polygonZkEVMBridgeContract.target,
                aggLayerGatewayContract.target,
            ],
            unsafeAllow: ["constructor", "state-variable-immutable", "missing-initializer", "missing-initializer-call"],
        })) as unknown as PolygonRollupManagerMock;

        await rollupManagerContract.waitForDeployment();
        // Initialize Mock
        await rollupManagerContract.initializeMock(
            trustedAggregator.address,
            admin.address,
            timelock.address,
            emergencyCouncil.address
        );

        // check precalculated address
        expect(precalculateRollupManagerAddress).to.be.equal(rollupManagerContract.target);

        await polygonZkEVMBridgeContract.initialize(
            NETWORK_ID_MAINNET,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManagerContract.target,
            "0x"
        );

        // fund sequencer address with Matic tokens
        await polTokenContract.transfer(trustedSequencer.address, ethers.parseEther("1000"));

        // deploy mock verifier
        const VerifierRollupHelperFactory = await ethers.getContractFactory("VerifierRollupHelperMock");
        verifierContract = await VerifierRollupHelperFactory.deploy();
    });

    it("should check initializers and deploy parameters", async () => {
        await expect(aggLayerGatewayContract.initialize(timelock.address, aggLayerAdmin.address)).to.be.revertedWith(
            "Initializable: contract is already initialized"
        );
    });

    it("should create a ECDSA rollup type", async () => {
        // deploy ECDSA implementation contract
        const aggchainECDSAFactory = await ethers.getContractFactory("AggchainECDSA");
        const aggchainECDSAContract = await aggchainECDSAFactory.deploy(
            polygonZkEVMGlobalExitRoot.target,
            polTokenContract.target,
            polygonZkEVMBridgeContract.target,
            rollupManagerContract.target,
            aggLayerGatewayContract.target
        );

        // Create rollup type for ECDSA where verifier is not zero to trigger InvalidRollupType error
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainECDSAContract.target,
                trustedAggregator.address, // verifier wrong, must be zero
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                "", // description
                ethers.ZeroHash // programVKey
            )
        ).to.be.revertedWithCustomError(rollupManagerContract, "InvalidRollupType");

        // Create rollup type for  ECDSA
        await expect(
            rollupManagerContract.connect(timelock).addNewRollupType(
                aggchainECDSAContract.target,
                ethers.ZeroAddress, // verifier
                0, // fork id
                VerifierType.ALGateway,
                ethers.ZeroHash, // genesis
                "", // description
                ethers.ZeroHash // programVKey
            )
        )
            .to.emit(rollupManagerContract, "AddNewRollupType")
            .withArgs(
                1 /*rollupTypeID*/,
                aggchainECDSAContract.target,
                ethers.ZeroAddress,
                0,
                VerifierType.ALGateway,
                ethers.ZeroHash,
                "",
                ethers.ZeroHash
            );

        // assert new rollup type
        const createdRollupType = await rollupManagerContract.rollupTypeMap(1);

        const expectedRollupType = [
            aggchainECDSAContract.target,
            ethers.ZeroAddress,
            0,
            VerifierType.ALGateway,
            false,
            ethers.ZeroHash,
            ethers.ZeroHash,
        ];
        expect(createdRollupType).to.be.deep.equal(expectedRollupType);
    });

    it("should create a rollup with rollup type ECDSA", async () => {
        // Precalculate rollup address
        const rollupManagerNonce = await ethers.provider.getTransactionCount(rollupManagerContract.target);
        const precomputedAggchainECDSAAddress = ethers.getCreateAddress({
            from: rollupManagerContract.target as string,
            nonce: rollupManagerNonce,
        });
        // Create new rollup with rollup type ECDSA
        const initializeBytesCustomChain = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "address", "string", "string"],
            [
                admin.address,
                trustedSequencer.address,
                ethers.ZeroAddress, // gas token address
                "", // trusted sequencer url
                "", // network name
            ]
        );
        await expect(
            rollupManagerContract.connect(admin).createNewRollup(
                1, // rollupTypeID
                1001, // chainID
                admin.address,
                trustedSequencer.address,
                ethers.ZeroAddress, // gas token address
                "", // sequencer url
                "", // network name
                initializeBytesCustomChain // initialize bytes custom chain
            )
        )
            .to.emit(rollupManagerContract, "CreateNewRollup")
            .withArgs(
                NETWORK_ID_ROLLUP, // rollupID
                1, // rollupType ID
                precomputedAggchainECDSAAddress,
                1001, // chainID
                ethers.ZeroAddress // gasTokenAddress
            );

        // Check created rollup
        const aggchainECDSAFactory = await ethers.getContractFactory("AggchainECDSA");
        aggchainECDSAContract = aggchainECDSAFactory.attach(precomputedAggchainECDSAAddress);

        expect(await aggchainECDSAContract.aggLayerGateway()).to.be.equal(aggLayerGatewayContract.target);
    });

    it("should getAggchainHash using default gateway", async () => {
        // Add default aggchain verification key
        // Add permission to add default aggchain verification key
        await aggLayerGatewayContract.connect(admin).grantRole(AGGCHAIN_ADMIN_ROLE, aggLayerAdmin.address);
        expect(await aggLayerGatewayContract.hasRole(AGGCHAIN_ADMIN_ROLE, aggLayerAdmin.address)).to.be.true;
        // Generate random aggchain verification key
        const aggchainVKey = computeRandomBytes(32);
        // Compose selector for generated aggchain verification key
        const defaultAggchainSelector = `0x${AggchainSelector.ECDSA}0001`;
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(defaultAggchainSelector, aggchainVKey)
        )
            .to.emit(aggLayerGatewayContract, "AddDefaultAggchainVKey")
            .withArgs(defaultAggchainSelector, aggchainVKey);

        // Try to add same key with same selector for reverting
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(defaultAggchainSelector, aggchainVKey)
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, "AggchainVKeyAlreadyExists");

        // Try to add same key with wrong role
        await expect(
            aggLayerGatewayContract.connect(aggLayerAdmin).addDefaultAggchainVKey(defaultAggchainSelector, aggchainVKey)
        ).to.be.revertedWithCustomError(aggLayerGatewayContract, "AggchainVKeyAlreadyExists");

        // Check added vkey
        expect(await aggLayerGatewayContract.getDefaultAggchainVKey(defaultAggchainSelector)).to.be.equal(aggchainVKey);

        // Get aggchain hash
        const precomputedAggchainHash = ethers.solidityPackedKeccak256(
            ["uint32", "bytes32", "bytes32"],
            [
                AggchainType.GENERIC,
                aggchainVKey,
                ethers.solidityPackedKeccak256(["address"], [trustedSequencer.address]),
            ]
        );

        expect(await aggchainECDSAContract.getAggchainHash(CUSTOM_DATA_ECDSA)).to.be.equal(precomputedAggchainHash);
    });

    it("should add a new verifier to aggLayer gateway", async () => {
        const randomPessimisticVKey = computeRandomBytes(32);
        await expect(
            aggLayerGatewayContract
                .connect(aggLayerAdmin)
                .addPessimisticVKeyRoute(PESSIMISTIC_SELECTOR, verifierContract.target, randomPessimisticVKey)
        )
            .to.emit(aggLayerGatewayContract, "RouteAdded")
            .withArgs(PESSIMISTIC_SELECTOR, verifierContract.target, randomPessimisticVKey);
    });

    it("should bridge ether and update global exit root", async () => {
        // bridge message
        await expect(
            polygonZkEVMBridgeContract.bridgeMessage(NETWORK_ID_ROLLUP, tester.address, true, "0x", {
                value: ethers.parseEther("1"),
            })
        )
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTree")
            .to.emit(polygonZkEVMGlobalExitRoot, "UpdateL1InfoTreeV2");

        expect(await polygonZkEVMBridgeContract.depositCount()).to.be.equal(1);
    });

    it("should verify a pessimistic proof for a ECDSA aggchain", async () => {
        // call rollup manager verify function
        // Compute random values for proof generation
        const randomNewLocalExitRoot = computeRandomBytes(32);
        const randomNewPessimisticRoot = computeRandomBytes(32);
        const randomProof = computeRandomBytes(128);
        // append first 4 bytes to the proof to select the pessimistic vkey
        const proofWithSelector = `${PESSIMISTIC_SELECTOR}${randomProof.slice(2)}`;
        expect(
            await rollupManagerContract.connect(trustedAggregator).verifyPessimisticTrustedAggregator(
                NETWORK_ID_ROLLUP, // rollupID
                1, // l1InfoTreeCount
                randomNewLocalExitRoot,
                randomNewPessimisticRoot,
                proofWithSelector,
                CUSTOM_DATA_ECDSA
            )
        )
            .to.emit(rollupManagerContract, "VerifyBatchesTrustedAggregator")
            .to.emit(aggchainECDSAContract, "OnVerifyPessimistic")
            .withArgs(randomNewStateRoot);
    });
});
