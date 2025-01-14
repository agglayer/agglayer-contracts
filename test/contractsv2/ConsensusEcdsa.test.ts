/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {Address, ConsensusEcdsa} from "../../typechain-types";

describe("ConsensusEcdsa", () => {
    let deployer: any;
    let trustedSequencer: any;
    let admin: any;

    let consensusEcdsaContract: ConsensusEcdsa;

    const gerManagerAddress = "0xA00000000000000000000000000000000000000A" as unknown as Address;
    const polTokenAddress = "0xB00000000000000000000000000000000000000B" as unknown as Address;
    const rollupManagerAddress = "0xC00000000000000000000000000000000000000C" as unknown as Address;
    const bridgeAddress = "0xD00000000000000000000000000000000000000D" as unknown as Address;

    const urlSequencer = "http://zkevm-json-rpc:8123";
    const networkName = "zkevm";
    const consensusVKey = "0x1122334455667788990011223344556677889900112233445566778899001122";

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;

    beforeEach("Deploy contract", async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedSequencer, admin] = await ethers.getSigners();

        // deploy consensus
        // create polygonPessimisticConsensus implementation
        const consensusEcdsaFactory = await ethers.getContractFactory("ConsensusEcdsa");
        consensusEcdsaContract = await upgrades.deployProxy(consensusEcdsaFactory, [], {
            initializer: false,
            constructorArgs: [rollupManagerAddress],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        });

        await consensusEcdsaContract.waitForDeployment();
    });

    it("should check the initalized parameters", async () => {
      
        // initialize zkEVM using non admin address
        await expect(
            consensusEcdsaContract.initialize(
                consensusVKey,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName
            )
        ).to.be.revertedWithCustomError(consensusEcdsaContract, "OnlyRollupManager");

        // initialize using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await consensusEcdsaContract.connect(rollupManagerSigner).initialize(
            consensusVKey,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            {gasPrice: 0}
        );

        expect(await consensusEcdsaContract.admin()).to.be.equal(admin.address);
        expect(await consensusEcdsaContract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await consensusEcdsaContract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await consensusEcdsaContract.networkName()).to.be.equal(networkName);
        expect(await consensusEcdsaContract.gasTokenAddress()).to.be.equal(gasTokenAddress);
    
        // initialize again
        await expect(
            consensusEcdsaContract.connect(rollupManagerSigner).initialize(
                consensusVKey,
                admin.address,
                trustedSequencer.address,
                gasTokenAddress,
                urlSequencer,
                networkName,
                {gasPrice: 0}
            )
        ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    it("should check admin functions", async () => {
        // initialize using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await consensusEcdsaContract.connect(rollupManagerSigner).initialize(
            consensusVKey,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            {gasPrice: 0}
        );

        // setTrustedSequencer
        await expect(consensusEcdsaContract.setTrustedSequencer(deployer.address)).to.be.revertedWithCustomError(
            consensusEcdsaContract,
            "OnlyAdmin"
        );

        await expect(consensusEcdsaContract.connect(admin).setTrustedSequencer(deployer.address))
            .to.emit(consensusEcdsaContract, "SetTrustedSequencer")
            .withArgs(deployer.address);

        // setTrustedSequencerURL
        await expect(consensusEcdsaContract.setTrustedSequencerURL("0x1253")).to.be.revertedWithCustomError(
            consensusEcdsaContract,
            "OnlyAdmin"
        );
        await expect(consensusEcdsaContract.connect(admin).setTrustedSequencerURL("0x1253"))
            .to.emit(consensusEcdsaContract, "SetTrustedSequencerURL")
            .withArgs("0x1253");

        // transferAdminRole & acceptAdminRole
        await expect(consensusEcdsaContract.connect(admin).transferAdminRole(deployer.address))
            .to.emit(consensusEcdsaContract, "TransferAdminRole")
            .withArgs(deployer.address);

        await expect(consensusEcdsaContract.connect(admin).acceptAdminRole()).to.be.revertedWithCustomError(
            consensusEcdsaContract,
            "OnlyPendingAdmin"
        );

        await expect(consensusEcdsaContract.connect(deployer).acceptAdminRole())
            .to.emit(consensusEcdsaContract, "AcceptAdminRole")
            .withArgs(deployer.address);
    });

    it("should check getConsensusHash", async () => {
        // initialize using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await consensusEcdsaContract.connect(rollupManagerSigner).initialize(
            consensusVKey,
            admin.address,
            trustedSequencer.address,
            gasTokenAddress,
            urlSequencer,
            networkName,
            {gasPrice: 0}
        );

        // pessimistic constant CONSENSUS_TYPE = 0;
        const CONSENSUS_TYPE = 1;
        const consensusConfig = ethers.solidityPackedKeccak256(["address"], [trustedSequencer.address]);
        const consensusHashJs = ethers.solidityPackedKeccak256(
            ["uint32", "bytes32", "bytes32"],
            [CONSENSUS_TYPE, consensusVKey, consensusConfig]
        );

        // getConsensusHash
        const resGetConsensusHash = await consensusEcdsaContract.getConsensusHash("0x");

        expect(resGetConsensusHash).to.be.equal(consensusHashJs);
    });
});
