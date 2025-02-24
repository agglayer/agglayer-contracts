/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {expect} from "chai";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../.env")});
import {ethers, upgrades} from "hardhat";
import {
    ERC20PermitMock,
    GlobalExitRootManagerL2SovereignChain,
    BridgeL2SovereignChain,
    TokenWrapped,
} from "../../typechain-types";

import {MTBridge, mtBridgeUtils} from "@0xpolygonhermez/zkevm-commonjs";
const MerkleTreeBridge = MTBridge;
const {verifyMerkleProof, getLeafValue} = mtBridgeUtils;

const pathOutput = path.join(__dirname, "./output.json");

async function main() {
    // Load provider
    let currentProvider = ethers.provider;

    // Load deployer
    let deployer = ethers.HDNodeWallet.fromMnemonic(
        ethers.Mnemonic.fromPhrase(process.env.MNEMONIC as string),
        "m/44'/60'/0'/0/0"
    ).connect(currentProvider);

    console.log("deploying with: ", deployer.address);

    // Load initialZkEVMDeployerOwner

    // deploy bridge
    // deploy PolygonZkEVMBridge
    const BridgeL2SovereignChainFactory = await ethers.getContractFactory("BridgeL2SovereignChain");
    const sovereignChainBridgeContract = (await upgrades.deployProxy(BridgeL2SovereignChainFactory, [], {
        initializer: false,
        unsafeAllow: ["constructor", "missing-initializer", "missing-initializer-call"],
    })) as unknown as BridgeL2SovereignChain;

    // deploy global exit root manager
    const GlobalExitRootManagerL2SovereignChainFactory = await ethers.getContractFactory(
        "GlobalExitRootManagerL2SovereignChain"
    );
    const sovereignChainGlobalExitRootContract = (await upgrades.deployProxy(
        GlobalExitRootManagerL2SovereignChainFactory,
        [deployer.address, deployer.address], // Initializer params
        {
            initializer: "initialize", // initializer function name
            constructorArgs: [sovereignChainBridgeContract.target], // Constructor arguments
            unsafeAllow: ["constructor", "state-variable-immutable"],
        }
    )) as unknown as GlobalExitRootManagerL2SovereignChain;

    console.log("#######################\n");
    console.log(`Sovereign bridge L2: ${sovereignChainGlobalExitRootContract.target}`);

    console.log("you can verify the new impl address with:");
    console.log(
        `npx hardhat verify --constructor-args upgrade/arguments.js ${sovereignChainGlobalExitRootContract.target} --network ${process.env.HARDHAT_NETWORK}\n`
    );
    console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", [deployer.address]);

    // intialize the bridge
    await sovereignChainBridgeContract.initialize(
        0,
        ethers.ZeroAddress, // zero for ether
        0, // zero for ether
        sovereignChainGlobalExitRootContract.target,
        ethers.ZeroAddress,
        "0x",
        deployer.address,
        ethers.ZeroAddress,
        false
    );

    const output = {} as any;
    const receiptDeployment = await (await sovereignChainGlobalExitRootContract.deploymentTransaction())?.wait();

    // insert some gers
    const randomInsertedRoots = 2;
    const globalExitRoots: any[] = [];

    // simulate l1 info tree
    const height = 32;
    const merkleTree = new MerkleTreeBridge(height);
    for (let i = 0; i < randomInsertedRoots; i++) {
        const ger = ethers.hexlify(ethers.randomBytes(32));
        await (await sovereignChainGlobalExitRootContract.insertGlobalExitRoot(ger)).wait();

        const block = await ethers.provider.getBlock("latest");
        globalExitRoots.push({
            globalExitRoot: ger,
            blockHash: block?.hash,
            timestamp: block?.timestamp,
        });
        const leafValue = calculateGlobalExitRootLeaf(ger, block?.hash, block?.timestamp);
        merkleTree.add(leafValue);
    }

    // compute proofs
    for (let i = 0; i < randomInsertedRoots; i++) {
        const proof = merkleTree.getProofTreeByIndex(i);
        globalExitRoots[i].proof = proof;
    }

    // make a bridge transaction to udpate the local exit root
    const amount = 1;
    const receiptUpdateExitRoot = await (
        await sovereignChainBridgeContract.bridgeAsset(1, deployer.address, amount, ethers.ZeroAddress, true, "0x", {
            value: amount,
        })
    ).wait();

    console.log("Random global exit roots:", globalExitRoots);

    output.initialBlockNumber = receiptDeployment?.blockNumber;
    output.finalBlockNumber = receiptUpdateExitRoot?.blockNumber;
    output.gerSovereignAddress = sovereignChainGlobalExitRootContract.target;
    output.globalExitRoots = globalExitRoots;
    output.localExitRoot = await sovereignChainGlobalExitRootContract.lastRollupExitRoot();
    output.l1InfoRoot = merkleTree.getRoot();
    output.chainId = Number((await currentProvider.getNetwork()).chainId);

    fs.writeFileSync(pathOutput, JSON.stringify(output, null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});

function calculateGlobalExitRootLeaf(newGlobalExitRoot: any, lastBlockHash: any, timestamp: any) {
    return ethers.solidityPackedKeccak256(
        ["bytes32", "bytes32", "uint64"],
        [newGlobalExitRoot, lastBlockHash, timestamp]
    );
}

Object.defineProperty(BigInt.prototype, "toJSON", {
    get() {
        "use strict";
        return () => String(this);
    },
});
