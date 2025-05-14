/* eslint-disable no-plusplus, no-await-in-loop */
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
    PolygonZkEVMBridgeV2Pessimistic,
    PolygonZkEVMBridgeV2,
    PolygonZkEVMGlobalExitRoot
} from "../../typechain-types";
import { takeSnapshot } from "@nomicfoundation/hardhat-network-helpers";
import { processorUtils, MTBridge, mtBridgeUtils } from "@0xpolygonhermez/zkevm-commonjs";
import { computeWrappedTokenProxyAddress } from "./helpers/helpers-sovereign-bridge"

describe("BridgeV2 upgrade", () => {

    let bridgeContract: PolygonZkEVMBridgeV2;
    let polygonZkEVMGlobalExitRoot: PolygonZkEVMGlobalExitRoot;

    let deployer: any;
    let rollupManager: any;
    let proxiedTokensManager: any;

    const networkIDMainnet = 0;

    beforeEach("Deploy contracts", async () => {
        // load signers
        [deployer, rollupManager, proxiedTokensManager] = await ethers.getSigners();

        // deploy bridgeV2Pessimistic
        const bridgePessimisticFactory = await ethers.getContractFactory("PolygonZkEVMBridgeV2Pessimistic");
        bridgeContract = (await upgrades.deployProxy(bridgePessimisticFactory, [], {
            initializer: false,
            unsafeAllow: ["constructor", "missing-initializer", "missing-initializer-call"],
        })) as unknown as PolygonZkEVMBridgeV2Pessimistic;

        // deploy global exit root manager
        const PolygonZkEVMGlobalExitRootFactory = await ethers.getContractFactory("PolygonZkEVMGlobalExitRoot");
        polygonZkEVMGlobalExitRoot = await PolygonZkEVMGlobalExitRootFactory.deploy(
            rollupManager.address,
            bridgeContract.target
        );

        // Initialize bridgeV2Pessimistic
        await bridgeContract.initialize(
            networkIDMainnet,
            ethers.ZeroAddress, // zero for ether
            ethers.ZeroAddress, // zero for ether
            polygonZkEVMGlobalExitRoot.target,
            rollupManager.address,
            "0x"
        );

        const bridgeV2Factory = await ethers.getContractFactory("PolygonZkEVMBridgeV2");

        // Upgrade and initialize bridgeV2
        bridgeContract = await upgrades.upgradeProxy(bridgeContract.target, bridgeV2Factory, {
            unsafeAllow: ["constructor", "missing-initializer", "missing-initializer-call"],
            call: {
                fn: "setProxiedTokensManager(address)",
                args: [
                    proxiedTokensManager.address
                ]
            }
        }) as unknown as PolygonZkEVMBridgeV2;

    })


    it("Should check params after upgrade from pessimistic to bridgeV2", async () => {

        // Check new params
        expect(await bridgeContract.getProxiedTokensManager()).to.be.equal(proxiedTokensManager.address);
        expect(await bridgeContract.wrappedTokenBytecodeStorer()).to.not.be.equal(ethers.ZeroAddress);
        expect(await bridgeContract.getWrappedTokenBridgeImplementation()).to.not.be.equal(ethers.ZeroAddress);
    });

    it("Should transfer Proxied tokens manager role correctly", async () => {

        // Check OnlyProxiedTokensManager
        await expect(bridgeContract.transferProxiedTokensManagerRole(rollupManager.address))
            .to.revertedWithCustomError(bridgeContract, "OnlyProxiedTokensManager")

        // Make first role transfer step
        await expect(bridgeContract.connect(proxiedTokensManager).transferProxiedTokensManagerRole(rollupManager.address))
            .to.emit(bridgeContract, "TransferProxiedTokensManagerRole")
            .withArgs(proxiedTokensManager.address, rollupManager.address);

        // Accept role transfer
        // Check OnlyPendingProxiedTokensManager
        await expect(bridgeContract.connect(proxiedTokensManager).acceptProxiedTokensManagerRole())
            .to.revertedWithCustomError(bridgeContract, "OnlyPendingProxiedTokensManager")

        await expect(bridgeContract.connect(rollupManager).acceptProxiedTokensManagerRole())
            .to.emit(bridgeContract, "AcceptProxiedTokensManagerRole")
            .withArgs(proxiedTokensManager.address, rollupManager.address);
    })
});