import { ethers, run } from "hardhat";

/**
 * Generates a timelock operation with the given input valies
 * @param target The timelock contract address to call
 * @param value Amount of ether to sent to the call
 * @param data The encoded data of the transaction to execute
 * @param predecessor timelock operation predecessor
 * @param salt timelock operation salt
 * @returns The timelock operation params
 */
function genTimelockOperation(target: any, value: any, data: any, predecessor: any, salt: any) {
    const abiEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ["address", "uint256", "bytes", "uint256", "bytes32"],
        [target, value, data, predecessor, salt]
    );
    const id = ethers.keccak256(abiEncoded);
    return {
        id,
        target,
        value,
        data,
        predecessor,
        salt,
    };
}

/**
 * Function to handle the verification of a contract on etherscan
 * @param implementationAddress the contract address to verify
 * @param constructorArguments the constructor arguments of the contract
 * @dev In case the verification fails, the function will print the command to run the verification manually
 */
async function verifyContractEtherscan(implementationAddress: string, constructorArguments: Array<string>) {
    try {
        console.log(`Trying to verify implementation contract ${implementationAddress} with arguments ${constructorArguments}`);
        // wait a few seconds before trying etherscan verification
        await new Promise((r) => setTimeout(r, 5000));
        // verify
        await run("verify:verify", {
            address: implementationAddress,
            constructorArguments: constructorArguments,
        });
    } catch (error) {
        console.log("Error verifying the new implementation contract: ", error);
        console.log("you can verify the new impl address with:");
        console.log(
            `npx hardhat verify --constructor-args upgrade/arguments.js ${implementationAddress} --network ${process.env.HARDHAT_NETWORK}\n`
        );
        console.log("Copy the following constructor arguments on: upgrade/arguments.js \n", constructorArguments);
    }
}

/**
 * Decode the data of a schedule transaction to a timelock contract for better readability
 * @param scheduleData The data of the schedule transaction
 * @param proxyAdmin The proxy admin contract
 * @returns The decoded data
 */
async function decodeScheduleData(scheduleData: any, proxyAdmin: any) {
    const timelockContractFactory = await ethers.getContractFactory("PolygonZkEVMTimelock");
    const timelockTx = timelockContractFactory.interface.parseTransaction({ data: scheduleData });
    const objectDecoded = {} as any;
    const paramsArray = timelockTx?.fragment.inputs as any;
    for (let i = 0; i < paramsArray?.length; i++) {
        const currentParam = paramsArray[i];
        objectDecoded[currentParam.name] = timelockTx?.args[i];

        if (currentParam.name == "data") {
            const decodedProxyAdmin = proxyAdmin.interface.parseTransaction({
                data: timelockTx?.args[i],
            });
            const objectDecodedData = {} as any;
            const paramsArrayData = decodedProxyAdmin?.fragment.inputs as any;

            objectDecodedData.signature = decodedProxyAdmin?.signature;
            objectDecodedData.selector = decodedProxyAdmin?.selector;

            for (let j = 0; j < paramsArrayData?.length; j++) {
                const currentParam = paramsArrayData[j];
                objectDecodedData[currentParam.name] = decodedProxyAdmin?.args[j];
            }
            objectDecoded["decodedData"] = objectDecodedData;
        }
    }
    return objectDecoded;
}

export { genTimelockOperation, verifyContractEtherscan, decodeScheduleData };
