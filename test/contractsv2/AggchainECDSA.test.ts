/* eslint-disable no-plusplus, no-await-in-loop */
import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {Address, AggchainECDSA, AggLayerGateway} from "../../typechain-types";

describe("AggchainECDSA", () => {
    let deployer: any;
    let trustedSequencer: any;
    let admin: any;
    let defaultAdminAgglayer: any;

    let aggchainECDSAcontract: AggchainECDSA;
    let aggLayerGatewayContract: AggLayerGateway;

    const gerManagerAddress = "0xA00000000000000000000000000000000000000A" as unknown as Address;
    const polTokenAddress = "0xB00000000000000000000000000000000000000B" as unknown as Address;
    const rollupManagerAddress = "0xC00000000000000000000000000000000000000C" as unknown as Address;
    const bridgeAddress = "0xD00000000000000000000000000000000000000D" as unknown as Address;

    const urlSequencer = "http://zkevm-json-rpc:8123";
    const networkName = "zkevm";

    // Native token will be ether
    const gasTokenAddress = ethers.ZeroAddress;

    // aggLayerGateway variables
    const DEFAULT_ADMIN_ROLE = ethers.ZeroHash;
    const AGGCHAIN_ADMIN_ROLE = ethers.id("AGGCHAIN_ADMIN_ROLE");

    // aggchain variables
    let initilializeBytesCustomChain: string;
    const AGGCHAIN_TYPE_SELECTOR = "0x00";
    const AGGCHAIN_TYPE = 1;
    const aggchainSelector = "0x12345678";
    const newAggChainVKey = "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef";
    const aggchainSelector2 = "0x11111111";
    const newAggChainVKey2 = "0x1111111111111111111111111111111111111111111111111111111111111111";
    const aggchainSelectorBytes2 = "0x1234";
    const newStateRoot = "0x1122334455667788990011223344556677889900112233445566778899001122";

    beforeEach("Deploy contract", async () => {
        upgrades.silenceWarnings();

        // load signers
        [deployer, trustedSequencer, admin, defaultAdminAgglayer] = await ethers.getSigners();

        initilializeBytesCustomChain = ethers.AbiCoder.defaultAbiCoder().encode(
            ["address", "address", "address", "string", "string"],
            [admin.address, trustedSequencer.address, gasTokenAddress, urlSequencer, networkName]
        );

         // deploy AggLayerGateway
        const AggLayerGatewayFactory = await ethers.getContractFactory("AggLayerGateway");
        aggLayerGatewayContract = (await upgrades.deployProxy(AggLayerGatewayFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor"],
        })) as unknown as AggLayerGateway;

        // initialize AggLayerGateway
        await expect(aggLayerGatewayContract.initialize(defaultAdminAgglayer.address))
        .to.emit(aggLayerGatewayContract, "RoleGranted")
        .withArgs(DEFAULT_ADMIN_ROLE, defaultAdminAgglayer.address, deployer.address);

        // grantRole AGGCHAIN_ADMIN_ROLE --> defaultAdminAgglayer
        await expect(aggLayerGatewayContract.connect(defaultAdminAgglayer).grantRole(AGGCHAIN_ADMIN_ROLE, defaultAdminAgglayer.address))
        .to.emit(aggLayerGatewayContract, "RoleGranted")
        .withArgs(AGGCHAIN_ADMIN_ROLE, defaultAdminAgglayer.address, defaultAdminAgglayer.address);
        expect(await aggLayerGatewayContract.hasRole(AGGCHAIN_ADMIN_ROLE, defaultAdminAgglayer.address)).to.be.true;
        
        // AddDefaultAggchainVKey
        await expect(aggLayerGatewayContract.connect(defaultAdminAgglayer).addDefaultAggchainVKey(
            aggchainSelector,
            newAggChainVKey
        ))
        .to.emit(aggLayerGatewayContract, "AddDefaultAggchainVKey")
        .withArgs(aggchainSelector, newAggChainVKey);

        // deploy aggchain
        // create aggchainECDSA implementation
        const aggchainECDSAFactory = await ethers.getContractFactory("AggchainECDSA");
        aggchainECDSAcontract = await upgrades.deployProxy(aggchainECDSAFactory, [], {
            initializer: false,
            constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddress, rollupManagerAddress, aggLayerGatewayContract.target],
            unsafeAllow: ["constructor", "state-variable-immutable"],
        });

        await aggchainECDSAcontract.waitForDeployment();
    });

    it("should check the initalized parameters", async () => {
        // initialize zkEVM using non admin address
        await expect(
            aggchainECDSAcontract.initialize(
                initilializeBytesCustomChain
            )
        ).to.be.revertedWithCustomError(aggchainECDSAcontract, "OnlyRollupManager");

        // initialize using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await aggchainECDSAcontract.connect(rollupManagerSigner).initialize(
            initilializeBytesCustomChain,
            {gasPrice: 0}
        );

        expect(await aggchainECDSAcontract.admin()).to.be.equal(admin.address);
        expect(await aggchainECDSAcontract.trustedSequencer()).to.be.equal(trustedSequencer.address);
        expect(await aggchainECDSAcontract.trustedSequencerURL()).to.be.equal(urlSequencer);
        expect(await aggchainECDSAcontract.networkName()).to.be.equal(networkName);
        expect(await aggchainECDSAcontract.gasTokenAddress()).to.be.equal(gasTokenAddress);

        // initialize again
        await expect(
            aggchainECDSAcontract.connect(rollupManagerSigner).initialize(
                initilializeBytesCustomChain,
                {gasPrice: 0}
            )
        ).to.be.revertedWith("Initializable: contract is already initialized");
    });

    // PolygonConsensusBase
    it("should check admin functions PolygonConsensusBase", async () => {
        // initialize using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await aggchainECDSAcontract.connect(rollupManagerSigner).initialize(
            initilializeBytesCustomChain,
            {gasPrice: 0}
        );

        // setTrustedSequencer
        await expect(aggchainECDSAcontract.setTrustedSequencer(deployer.address)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "OnlyAdmin"
        );

        await expect(aggchainECDSAcontract.connect(admin).setTrustedSequencer(deployer.address))
            .to.emit(aggchainECDSAcontract, "SetTrustedSequencer")
            .withArgs(deployer.address);

        // setTrustedSequencerURL
        await expect(aggchainECDSAcontract.setTrustedSequencerURL("0x1253")).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "OnlyAdmin"
        );
        await expect(aggchainECDSAcontract.connect(admin).setTrustedSequencerURL("0x1253"))
            .to.emit(aggchainECDSAcontract, "SetTrustedSequencerURL")
            .withArgs("0x1253");

        // transferAdminRole & acceptAdminRole
        await expect(aggchainECDSAcontract.transferAdminRole(deployer.address)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "OnlyAdmin"
        );
        await expect(aggchainECDSAcontract.connect(admin).transferAdminRole(deployer.address))
            .to.emit(aggchainECDSAcontract, "TransferAdminRole")
            .withArgs(deployer.address);

        await expect(aggchainECDSAcontract.connect(admin).acceptAdminRole()).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "OnlyPendingAdmin"
        );

        await expect(aggchainECDSAcontract.connect(deployer).acceptAdminRole())
            .to.emit(aggchainECDSAcontract, "AcceptAdminRole")
            .withArgs(deployer.address);
    });

    it("should check admin functions AggchainBase", async () => {
        // initialize using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await aggchainECDSAcontract.connect(rollupManagerSigner).initialize(
            initilializeBytesCustomChain,
            {gasPrice: 0}
        );

        // disableUseDefaultGatewayFlag
        await expect(aggchainECDSAcontract.disableUseDefaultGatewayFlag()).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "OnlyAdmin"
        );

        await expect(aggchainECDSAcontract.connect(admin).disableUseDefaultGatewayFlag())
        .to.emit(aggchainECDSAcontract, "UpdateUseDefaultGatewayFlag")
        .withArgs(false);

        await expect(aggchainECDSAcontract.connect(admin).disableUseDefaultGatewayFlag()).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "UseDefaultGatewayAlreadySet"
        );

        // enableUseDefaultGatewayFlag
        await expect(aggchainECDSAcontract.enableUseDefaultGatewayFlag()).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "OnlyAdmin"
        );

        await expect(aggchainECDSAcontract.connect(admin).enableUseDefaultGatewayFlag())
        .to.emit(aggchainECDSAcontract, "UpdateUseDefaultGatewayFlag")
        .withArgs(true);

        await expect(aggchainECDSAcontract.connect(admin).enableUseDefaultGatewayFlag()).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "UseDefaultGatewayAlreadySet"
        );

        // addOwnedAggchainVKey
        await expect(aggchainECDSAcontract.addOwnedAggchainVKey(aggchainSelector, newAggChainVKey)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "OnlyAdmin"
        );

        await expect(aggchainECDSAcontract.connect(admin).addOwnedAggchainVKey(aggchainSelector, ethers.ZeroHash)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "InvalidAggchainVKey"
        );

        await expect(aggchainECDSAcontract.connect(admin).addOwnedAggchainVKey(aggchainSelector, newAggChainVKey))
        .to.emit(aggchainECDSAcontract, "AddAggchainVKey")
        .withArgs(aggchainSelector, newAggChainVKey);

        await expect(aggchainECDSAcontract.connect(admin).addOwnedAggchainVKey(aggchainSelector, newAggChainVKey)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "OwnedAggchainVKeyAlreadyAdded"
        );

        // updateOwnedAggchainVKey
        await expect(aggchainECDSAcontract.updateOwnedAggchainVKey(aggchainSelector2, newAggChainVKey2)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "OnlyAdmin"
        );

        await expect(aggchainECDSAcontract.connect(admin).updateOwnedAggchainVKey(aggchainSelector2, newAggChainVKey2)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "OwnedAggchainVKeyNotFound"
        );

        await expect(aggchainECDSAcontract.connect(admin).updateOwnedAggchainVKey(aggchainSelector, newAggChainVKey2))
        .to.emit(aggchainECDSAcontract, "UpdateAggchainVKey")
        .withArgs(aggchainSelector, newAggChainVKey2);

        // getAggchainVKey useDefaultGateway === true
        expect(await aggchainECDSAcontract.getAggchainVKey(aggchainSelector))
        .to.be.equal(newAggChainVKey);

        await expect(aggchainECDSAcontract.connect(admin).disableUseDefaultGatewayFlag())
        .to.emit(aggchainECDSAcontract, "UpdateUseDefaultGatewayFlag")
        .withArgs(false);

         // getAggchainVKey useDefaultGateway === false
        expect(await aggchainECDSAcontract.getAggchainVKey(aggchainSelector))
        .to.be.equal(newAggChainVKey2);

    });

    it("should check getAggchainHash", async () => {
        // initialize using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await aggchainECDSAcontract.connect(rollupManagerSigner).initialize(
            initilializeBytesCustomChain,
            {gasPrice: 0}
        );

        // calculate aggchainHash
        const customChainData = ethers.AbiCoder.defaultAbiCoder().encode(["bytes2", "bytes32"], [aggchainSelectorBytes2, newStateRoot]);
        const finalAggchainSelector = ethers.concat([ethers.zeroPadBytes(AGGCHAIN_TYPE_SELECTOR,2), aggchainSelectorBytes2]);
        const aggChainConfig = ethers.solidityPackedKeccak256(["address"], [trustedSequencer.address]);
        const aggchainHash = ethers.solidityPackedKeccak256(["uint32", "bytes32", "bytes32"], [AGGCHAIN_TYPE, newAggChainVKey, aggChainConfig]);

        // new owned aggchain
        await expect(aggchainECDSAcontract.connect(admin).addOwnedAggchainVKey(finalAggchainSelector, newAggChainVKey))
        .to.emit(aggchainECDSAcontract, "AddAggchainVKey")
        .withArgs(finalAggchainSelector, newAggChainVKey);

        // disable default gateway flag
        await expect(aggchainECDSAcontract.connect(admin).disableUseDefaultGatewayFlag())
        .to.emit(aggchainECDSAcontract, "UpdateUseDefaultGatewayFlag")
        .withArgs(false);

        // getAggchainHash
        expect(await aggchainECDSAcontract.getAggchainHash(customChainData)).to.be.equal(aggchainHash);
    });

    it("should check getAggchainHash", async () => {
        // initialize using rollup manager
        await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
        const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
        await aggchainECDSAcontract.connect(rollupManagerSigner).initialize(
            initilializeBytesCustomChain,
            {gasPrice: 0}
        );

        const customChainData = ethers.AbiCoder.defaultAbiCoder().encode(["bytes2", "bytes32"], [aggchainSelectorBytes2, newStateRoot]);

        // check onlyRollupManager
        await expect(aggchainECDSAcontract.onVerifyPessimistic(customChainData)).to.be.revertedWithCustomError(
            aggchainECDSAcontract,
            "OnlyRollupManager"
        );
        
        // onVerifyPessimistic
        await expect(aggchainECDSAcontract.connect(rollupManagerSigner).onVerifyPessimistic(
            customChainData,
            {gasPrice: 0}
        ))
        .to.emit(aggchainECDSAcontract, "OnVerifyPessimistic")
        .withArgs(newStateRoot);

    });
});