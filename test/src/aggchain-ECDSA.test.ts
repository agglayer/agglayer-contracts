import {ethers, upgrades} from "hardhat";
import {Address, AggchainECDSA} from "../../typechain-types";
import {expect} from "chai";
import fs = require("fs");
import path = require("path");

const dataECDSA = require("../test-vectors/aggchainECDSA/aggchainECDSA.json");
const pathTestVector = path.join(__dirname, "../test-vectors/aggchainECDSA/aggchainECDSA.json");
const utilsECDSA = require("../../src/utils-aggchain-ECDSA");
const utilsCommon = require("../../src/utils-common-aggchain");

// SIGNERS
let admin: any;
let vKeyManager: any;
let aggchainECDSAContract: AggchainECDSA;

const gerManagerAddress = "0xA00000000000000000000000000000000000000A" as unknown as Address;
const polTokenAddress = "0xB00000000000000000000000000000000000000B" as unknown as Address;
const rollupManagerAddress = "0xC00000000000000000000000000000000000000C" as unknown as Address;
const bridgeAddress = "0xD00000000000000000000000000000000000000D" as unknown as Address;
const aggLayerGatewayAddress = "0xE00000000000000000000000000000000000000E" as unknown as Address;

async function main() {
    const update = process.env.UPDATE === "true";

    for (let i = 0; i < dataECDSA.length; i++) {
        let initializeBytesAggchainV0: string;
        let initializeBytesAggchainV1: string;
        let aggchainParams: string;
        let aggchainSelectors: string[] = [];
        let aggchainData: string[] = [];
        let aggchainHash: string[] = [];

        const data = dataECDSA[i].input;

        it(`generate id: ${i}`, async function () {
            // load signers
            [vKeyManager, admin] = await ethers.getSigners();

            if (data.aggchainVKeySelectors.length !== data.ownedAggchainVkeys.length) {
                throw new Error("aggchainVKeySelectors and ownedAggchainVkeys must have the same length");
            }

            if (data.aggchainVKeySelectors.length !== 0) {
                for (let j = 0; j < data.aggchainVKeySelectors.length; j++) {
                    // get final aggchainSelector
                    aggchainSelectors.push(
                        utilsCommon.getFinalAggchainVKeySelectorFromType(
                            data?.aggchainVKeySelectors[j],
                            utilsECDSA.AGGCHAIN_TYPE_SELECTOR_ECDSA
                        )
                    );

                    // check final aggchainSelector
                    expect(aggchainSelectors[j]).to.be.equal(
                        `${data.aggchainVKeySelectors[j]}${utilsECDSA.AGGCHAIN_TYPE_SELECTOR_ECDSA.slice(2)}`
                    );
                }
            }

            // deploy aggchain
            // create aggchainECDSA implementation
            const aggchainECDSAFactory = await ethers.getContractFactory("AggchainECDSA");
            aggchainECDSAContract = await upgrades.deployProxy(aggchainECDSAFactory, [], {
                initializer: false,
                constructorArgs: [
                    gerManagerAddress,
                    polTokenAddress,
                    bridgeAddress,
                    rollupManagerAddress,
                    aggLayerGatewayAddress,
                ],
                unsafeAllow: ["constructor", "state-variable-immutable"],
            });
            await aggchainECDSAContract.waitForDeployment();

            // encode initializeBytesAggchain
            initializeBytesAggchainV0 = utilsECDSA.encodeInitializeBytesAggchainECDSAv0(
                data.useDefaultGateway,
                data.ownedAggchainVkeys,
                aggchainSelectors,
                vKeyManager.address,
                admin.address,
                data.trustedSequencer,
                data.gasTokenAddress,
                data.trustedSequencerURL,
                data.networkName
            );

            // initialize using rollup manager & initializeBytesAggchain
            await ethers.provider.send("hardhat_impersonateAccount", [rollupManagerAddress]);
            const rollupManagerSigner = await ethers.getSigner(rollupManagerAddress as any);
            await aggchainECDSAContract
                .connect(rollupManagerSigner)
                .initialize(initializeBytesAggchainV0, {gasPrice: 0});

            // check initializeBytesAggchain
            expect(await aggchainECDSAContract.admin()).to.be.equal(admin.address);
            expect(await aggchainECDSAContract.vKeyManager()).to.be.equal(vKeyManager.address);
            expect(await aggchainECDSAContract.trustedSequencer()).to.be.equal(data.trustedSequencer);
            expect(await aggchainECDSAContract.trustedSequencerURL()).to.be.equal(data.trustedSequencerURL);
            expect(await aggchainECDSAContract.networkName()).to.be.equal(data.networkName);
            expect(await aggchainECDSAContract.gasTokenAddress()).to.be.equal(data.gasTokenAddress);

            for (let j = 0; j < aggchainSelectors.length; j++) {
                expect(await aggchainECDSAContract.ownedAggchainVKeys(aggchainSelectors[j])).to.be.equal(
                    data.ownedAggchainVkeys[j]
                );
            }

            // encode aggchainParams
            aggchainParams = utilsECDSA.computeHashAggchainParamsECDSA(data.trustedSequencer);

            // if useDefaultGateway is true, disable it
            if (data.useDefaultGateway) {
                await expect(aggchainECDSAContract.connect(vKeyManager).disableUseDefaultGatewayFlag())
                    .to.emit(aggchainECDSAContract, "UpdateUseDefaultGatewayFlag")
                    .withArgs(false);
            }

            for (let j = 0; j < aggchainSelectors.length; j++) {
                // encode aggchainData
                aggchainData.push(utilsECDSA.encodeAggchainDataECDSA(data.aggchainVKeySelectors[j], data.newStateRoot));
                // get aggchainHash
                aggchainHash.push(
                    utilsCommon.computeAggchainHash(
                        utilsCommon.AggchainType.GENERIC,
                        data.ownedAggchainVkeys[j],
                        aggchainParams
                    )
                );
                // get aggchainHash from contract
                const aggchainHashContract = await aggchainECDSAContract.getAggchainHash(aggchainData[j], {
                    gasPrice: 0,
                });
                // check aggchainHash === aggchainHash from contract
                // with this check we can be sure that the aggchainParams & aggchainHash works correctly
                expect(aggchainHash[j]).to.be.equal(aggchainHashContract);
            }

            // reinitialize using rollup manager & initializeBytesAggchainECDSAv1

            // deploy polygonPessimisticConsensus
            // create polygonPessimisticConsensus implementation
            const ppConsensusFactory = await ethers.getContractFactory("PolygonPessimisticConsensus");
            let ppConsensusContract = await upgrades.deployProxy(ppConsensusFactory, [], {
                initializer: false,
                constructorArgs: [gerManagerAddress, polTokenAddress, bridgeAddress, rollupManagerAddress],
                unsafeAllow: ["constructor", "state-variable-immutable"],
            });
            await ppConsensusContract.waitForDeployment();

            await ppConsensusContract
                .connect(rollupManagerSigner)
                .initialize(
                    admin.address,
                    data.trustedSequencer,
                    0,
                    data.gasTokenAddress,
                    data.trustedSequencerURL,
                    data.networkName,
                    {
                        gasPrice: 0,
                    }
                );

            // upgrade to aggchainECDSA (reinitialize)
            ppConsensusContract = await upgrades.upgradeProxy(ppConsensusContract.target, aggchainECDSAFactory, {
                constructorArgs: [
                    gerManagerAddress,
                    polTokenAddress,
                    bridgeAddress,
                    rollupManagerAddress,
                    aggLayerGatewayAddress,
                ],
                unsafeAllow: [
                    "constructor",
                    "state-variable-immutable",
                    "enum-definition",
                    "struct-definition",
                    "missing-initializer",
                    "missing-initializer-call",
                ],
            });

            // encode initializeBytesAggchain version 1
            initializeBytesAggchainV1 = utilsECDSA.encodeInitializeBytesAggchainECDSAv1(
                data.useDefaultGateway,
                data.ownedAggchainVkeys,
                aggchainSelectors,
                vKeyManager.address
            );

            await ppConsensusContract.connect(rollupManagerSigner).initialize(initializeBytesAggchainV1, {gasPrice: 0});

            // check initializeBytesAggchain
            expect(await aggchainECDSAContract.admin()).to.be.equal(admin.address);
            expect(await aggchainECDSAContract.vKeyManager()).to.be.equal(vKeyManager.address);
            expect(await aggchainECDSAContract.trustedSequencer()).to.be.equal(data.trustedSequencer);
            expect(await aggchainECDSAContract.trustedSequencerURL()).to.be.equal(data.trustedSequencerURL);
            expect(await aggchainECDSAContract.networkName()).to.be.equal(data.networkName);
            expect(await aggchainECDSAContract.gasTokenAddress()).to.be.equal(data.gasTokenAddress);

            for (let j = 0; j < aggchainSelectors.length; j++) {
                expect(await aggchainECDSAContract.ownedAggchainVKeys(aggchainSelectors[j])).to.be.equal(
                    data.ownedAggchainVkeys[j]
                );
            }

            // add data to test-vector
            if (update) {
                dataECDSA[i].id = i;
                dataECDSA[i].output = {};
                dataECDSA[i].output.vKeyManager = vKeyManager.address;
                dataECDSA[i].output.admin = admin.address;
                dataECDSA[i].output.initializeBytesAggchainV0 = initializeBytesAggchainV0;
                dataECDSA[i].output.initializeBytesAggchainV1 = initializeBytesAggchainV1;
                dataECDSA[i].output.aggchainData = aggchainData;
                dataECDSA[i].output.aggchainSelectors = aggchainSelectors;
                dataECDSA[i].output.aggchainHashes = aggchainHash;
                dataECDSA[i].output.aggchainParams = aggchainParams;
            } else {
                expect(dataECDSA[i].output.vKeyManager).to.be.equal(vKeyManager.address);
                expect(dataECDSA[i].output.admin).to.be.equal(admin.address);
                expect(dataECDSA[i].output.initializeBytesAggchainV0).to.be.equal(initializeBytesAggchainV0);
                expect(dataECDSA[i].output.initializeBytesAggchainV1).to.be.equal(initializeBytesAggchainV1);
                expect(dataECDSA[i].output.aggchainData).to.be.deep.equal(aggchainData);
                expect(dataECDSA[i].output.aggchainSelectors).to.be.deep.equal(aggchainSelectors);
                expect(dataECDSA[i].output.aggchainHashes).to.be.deep.equal(aggchainHash);
                expect(dataECDSA[i].output.aggchainParams).to.be.equal(aggchainParams);
            }

            console.log(`Writing data to test-vector: ${i}. Path: ${pathTestVector}`);
            await fs.writeFileSync(pathTestVector, JSON.stringify(dataECDSA, null, 2));
        });
    }
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
