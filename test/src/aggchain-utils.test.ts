import {ethers, upgrades} from "hardhat";
import {Address, AggchainECDSA} from "../../typechain-types";
import {expect} from "chai";
import fs = require("fs");
import path = require("path");

const pathTestvectors = path.join(__dirname, "../test-vectors/aggchain");
const aggchainHashTestVectors = require(path.join(pathTestvectors, "aggchain-hash.json"));
const finalAggchainSelectorTestVectors = require(path.join(pathTestvectors, "final-aggchain-selector.json"));
const utilsCommon = require("../../src/utils-common-aggchain");

describe("Test vectors aggchain common utils", () => {
    const update = process.env.UPDATE === "true";

    for (let i = 0; i < aggchainHashTestVectors.length; i++) {
        it(`Check test-vectors compute aggchain hash ID=${i}`, async () => {
            const testVector = aggchainHashTestVectors[i].input;
            const aggchainHash = utilsCommon.computeAggchainHash(
                testVector.aggchainType,
                testVector.aggchainVKey,
                testVector.hashAggchainParams
            );
            if (update) {
                aggchainHashTestVectors[i].output = {};
                aggchainHashTestVectors[i].output.aggchainHash = aggchainHash;
                console.log(`WRITE: ${path.join(pathTestvectors, "aggchain-hash.json")}`);
                fs.writeFileSync(
                    path.join(pathTestvectors, "aggchain-hash.json"),
                    JSON.stringify(aggchainHashTestVectors, null, 2)
                );
            } else {
                expect(aggchainHash).to.equal(aggchainHashTestVectors[i].output.aggchainHash);
            }
        });
    }

    for (let i = 0; i < finalAggchainSelectorTestVectors.length; i++) {
        it(`Check test-vectors getFinalAggchainVKeySelectorFromType hash ID=${i}`, async () => {
            const testVector = finalAggchainSelectorTestVectors[i].input;
            const finalAggchainSelector = utilsCommon.getFinalAggchainVKeySelectorFromType(
                testVector.aggchainVKeySelector,
                testVector.aggchainType
            );
            if (update) {
                const AggchainBaseMockFactory = await ethers.getContractFactory("AggchainBaseMock");
                const aggchainContract = await AggchainBaseMockFactory.deploy(
                    "0xA00000000000000000000000000000000000000A",
                    "0xB00000000000000000000000000000000000000B",
                    "0xC00000000000000000000000000000000000000C",
                    "0xD00000000000000000000000000000000000000D",
                    "0xE00000000000000000000000000000000000000E"
                );
                finalAggchainSelectorTestVectors[i].output = {};
                finalAggchainSelectorTestVectors[i].output.finalAggchainVKeySelector =
                    await aggchainContract.getFinalAggchainVKeySelectorFromType(
                        testVector.aggchainVKeySelector,
                        testVector.aggchainType
                    );
                console.log(`WRITE: ${path.join(pathTestvectors, "final-aggchain-selector.json")}`);
                fs.writeFileSync(
                    path.join(pathTestvectors, "final-aggchain-selector.json"),
                    JSON.stringify(finalAggchainSelectorTestVectors, null, 2)
                );
            } else {
                expect(finalAggchainSelector).to.equal(
                    finalAggchainSelectorTestVectors[i].output.finalAggchainVKeySelector
                );
            }
        });
    }
});
