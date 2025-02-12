/* eslint-disable no-await-in-loop, no-use-before-define, no-lonely-if */
/* eslint-disable no-console, no-inner-declarations, no-undef, import/no-unresolved */
import {utils} from "ffjavascript";
import path = require("path");
import fs = require("fs");

import * as dotenv from "dotenv";
dotenv.config({path: path.resolve(__dirname, "../../../.env")});
import {ethers, network, upgrades} from "hardhat";
import {PolygonZkEVMTimelock} from "../../typechain-types";
import utilsjs from "../utils.js";

const parameters = require("./change_delay_timelock.json");
const dateStr = new Date().toISOString();
const pathOutputJson = path.resolve(__dirname, `./change_delay_output-${dateStr}.json`);

async function main() {
    const outputJson = {} as any;

    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock");
    const timelockContract = (await timelockContractFactory.attach(
        parameters.timelockContractAddress
    )) as PolygonZkEVMTimelock;

    console.log("#######################\n");
    console.log("timelockContract address: ", timelockContract.target);
    console.log("#######################\n");

    const timelockDelay = parameters.timeLockDelay
        ? parameters.timeLockDelay
        : Number(await timelockContract.getMinDelay());
    const salt = parameters.timelockSalt || ethers.ZeroHash;
    const predecessor = parameters.predecessor || ethers.ZeroHash;

    const operation = utilsjs.genOperation(
        parameters.timelockContractAddress,
        0, // value
        timelockContract.interface.encodeFunctionData("updateDelay", [parameters.newMinDelay]),
        predecessor, // predecessor
        salt // salt
    );

    // Schedule operation
    const scheduleData = timelockContractFactory.interface.encodeFunctionData("schedule", [
        operation.target,
        operation.value,
        operation.data,
        operation.predecessor,
        operation.salt,
        timelockDelay,
    ]);

    // Execute operation
    const executeData = timelockContractFactory.interface.encodeFunctionData("execute", [
        operation.target,
        operation.value,
        operation.data,
        operation.predecessor,
        operation.salt,
    ]);

    console.log("timelockDelay: ", timelockDelay);
    console.log({scheduleData});
    console.log({executeData});

    outputJson.scheduleData = scheduleData;
    outputJson.executeData = executeData;

    // Decode the scheduleData for better readability
    const timelockTx = timelockContractFactory.interface.parseTransaction({data: scheduleData});
    const objectDecoded = utilsjs.decodeTimelockTx(timelockTx, timelockContractFactory);
    outputJson.decodedScheduleData = objectDecoded;

    await fs.writeFileSync(pathOutputJson, JSON.stringify(utils.stringifyBigInts(outputJson), null, 1));
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
