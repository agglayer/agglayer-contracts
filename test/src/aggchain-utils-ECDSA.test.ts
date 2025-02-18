import {ethers, upgrades} from "hardhat";
import {Address, AggchainECDSA} from "../../typechain-types";
import {expect} from "chai";
import fs = require("fs");
import path = require("path");

const pathTestvectors = path.join(__dirname, "../test-vectors/aggchainECDSA");
const aggchainDataTestvectors = require(path.join(pathTestvectors, "aggchain-data.json"));
const aggchainInitBytesV0 = require(path.join(pathTestvectors, "aggchain-initBytesv0.json"));
const aggchainInitBytesV1 = require(path.join(pathTestvectors, "aggchain-initBytesv1.json"));
const aggchainHashParams = require(path.join(pathTestvectors, "hash-aggchain-params.json"));
const utilsECDSA = require("../../src/utils-aggchain-ECDSA");

describe("Test vectors aggchain common utils", () => {
    const update = process.env.UPDATE === "true";

    for (let i = 0; i < aggchainDataTestvectors.length; i++) {
        it(`Check test-vectors compute aggchain data ID=${i}`, async () => {
            const testVector = aggchainDataTestvectors[i].input;
            const aggchainData = utilsECDSA.encodeAggchainDataECDSA(
                testVector.aggchainVKeySelector,
                testVector.newStateRoot
            );
            if (update) {
                aggchainDataTestvectors[i].output.aggchainData = aggchainData;
                fs.writeFileSync(
                    path.join(pathTestvectors, "aggchain-data.json"),
                    JSON.stringify(aggchainDataTestvectors, null, 2)
                );
            } else {
                expect(aggchainData).to.equal(aggchainDataTestvectors[i].output.aggchainData);
            }
        });
    }

    for (let i = 0; i < aggchainInitBytesV0.length; i++) {
        it(`Check test-vectors encode initialize bytes aggchain version 0 ID=${i}`, async () => {
            const testVector = aggchainInitBytesV0[i].input;
            const initBytesAggchainECDSAv0 = utilsECDSA.encodeInitializeBytesAggchainECDSAv0(
                testVector.useDefaultGateway,
                testVector.ownedAggchainVkeys,
                testVector.aggchainVKeySelectors,
                testVector.vKeyManager,
                testVector.admin,
                testVector.trustedSequencer,
                testVector.gasTokenAddress,
                testVector.trustedSequencerURL,
                testVector.networkName
            );
            if (update) {
                aggchainInitBytesV0[i].output.initBytesAggchainECDSAv0 = initBytesAggchainECDSAv0;
                fs.writeFileSync(
                    path.join(pathTestvectors, "aggchain-initBytesv0.json"),
                    JSON.stringify(aggchainInitBytesV0, null, 2)
                );
            } else {
                expect(initBytesAggchainECDSAv0).to.equal(aggchainInitBytesV0[i].output.initBytesAggchainECDSAv0);
            }
        });
    }

    for (let i = 0; i < aggchainInitBytesV1.length; i++) {
        it(`Check test-vectors encode initialize bytes aggchain version 1 ID=${i}`, async () => {
            const testVector = aggchainInitBytesV1[i].input;
            const initBytesAggchainECDSAv1 = utilsECDSA.encodeInitializeBytesAggchainECDSAv1(
                testVector.useDefaultGateway,
                testVector.ownedAggchainVkeys,
                testVector.aggchainVKeySelectors,
                testVector.vKeyManager
            );
            if (update) {
                aggchainInitBytesV1[i].output.initBytesAggchainECDSAv1 = initBytesAggchainECDSAv1;
                fs.writeFileSync(
                    path.join(pathTestvectors, "aggchain-initBytesv1.json"),
                    JSON.stringify(aggchainInitBytesV1, null, 2)
                );
            } else {
                expect(initBytesAggchainECDSAv1).to.equal(aggchainInitBytesV1[i].output.initBytesAggchainECDSAv1);
            }
        });
    }

    for (let i = 0; i < aggchainHashParams.length; i++) {
        it(`Check test-vectors hash aggchain parameters ID=${i}`, async () => {
            const testVector = aggchainHashParams[i].input;
            const hashAggchainParams = utilsECDSA.computeHashAggchainParamsECDSA(testVector.trustedSequencer);
            if (update) {
                aggchainHashParams[i].output.hashAggchainParams = hashAggchainParams;
                fs.writeFileSync(
                    path.join(pathTestvectors, "aggchain-initBytesv1.json"),
                    JSON.stringify(aggchainHashParams, null, 2)
                );
            } else {
                expect(hashAggchainParams).to.equal(aggchainHashParams[i].output.hashAggchainParams);
            }
        });
    }
});
