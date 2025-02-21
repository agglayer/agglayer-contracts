import {expect} from "chai";
import {ethers, upgrades} from "hardhat";
import {
    DepositContractBase,
    DepositContractBaseV2,
    DepositContractGasComparison
} from "../../typechain-types";

import {MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

describe("DepositContractBaseV2 Contract", () => {
    upgrades.silenceWarnings();

    let depositBase: DepositContractBase;
    let depositBaseV2: DepositContractBaseV2;
    let depositGasComparison: DepositContractGasComparison;

    let deployer: any;
    let rollupManager: any;
    let acc1: any;

    const tokenName = "Matic Token";
    const tokenSymbol = "MATIC";
    const decimals = 18;
    const tokenInitialBalance = ethers.parseEther("20000000");
    const metadataToken = ethers.AbiCoder.defaultAbiCoder().encode(
        ["string", "string", "uint8"],
        [tokenName, tokenSymbol, decimals]
    );

    beforeEach("Deploy contracts", async () => {
        // load signers
        [deployer, rollupManager, acc1] = await ethers.getSigners();

        // deploy
        const depositContractBaseFactory = await ethers.getContractFactory("DepositContractBase");
        depositBase = await depositContractBaseFactory.deploy();

        const depositContractBaseV2Factory = await ethers.getContractFactory("DepositContractBaseV2");
        depositBaseV2 = await depositContractBaseV2Factory.deploy();

        // deploy mock
        const DepositContractGasComparisonFactory = await ethers.getContractFactory("DepositContractGasComparison");
        depositGasComparison = await DepositContractGasComparisonFactory.deploy(depositBase.target, depositBaseV2.target);
    });

    it("Gas comparison", async () => {
        const tx = await depositGasComparison.saveRoot();
        const receipt = await tx.wait();
        console.log("Gas used V0: ", Number(receipt.gasUsed));

        const txV2 = await depositGasComparison.saveRootV2();
        const receiptV2 = await txV2.wait();
        console.log("Gas used V1: ", Number(receiptV2.gasUsed));
    });

    it("Gas comparison", async () => {
        const tx = await depositGasComparison.saveRoot();
        const receipt = await tx.wait();
        console.log("Gas used V0: ", Number(receipt.gasUsed));

        const txV2 = await depositGasComparison.saveRootV2();
        const receiptV2 = await txV2.wait();
        console.log("Gas used V1: ", Number(receiptV2.gasUsed));


        const bytecodeV2 = await ethers.provider.getCode(depositBaseV2.target);
        console.log(bytecodeV2.length / 2);

        const bytecode = await ethers.provider.getCode(depositBase.target);
        console.log(bytecode.length / 2);
    });
});
