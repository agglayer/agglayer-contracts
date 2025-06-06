/* eslint-disable no-prototype-builtins */
/* eslint-disable no-restricted-syntax */
const ethers = require('ethers');

const supportedBridgeContracts = ['PolygonZkEVMBridgeV2 proxy', 'PolygonZkEVMBridge proxy', 'BridgeL2SovereignChain proxy'];

function genOperation(target, value, data, predecessor, salt) {
    const abiEncoded = ethers.AbiCoder.defaultAbiCoder().encode(
        ['address', 'uint256', 'bytes', 'uint256', 'bytes32'],
        [target, value, data, predecessor, salt],
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

const transactionTypes = {
    EOA: 'EOA',
    MULTISIG: 'Multisig',
    TIMELOCK: 'Timelock',
};

// Function to recursively convert BigInts to Numbers
function convertBigIntsToNumbers(obj) {
    if (typeof obj === 'bigint') {
        if (obj > BigInt(Number.MAX_SAFE_INTEGER)) {
            throw new Error(`convertBigIntsToNumbers: BigInt exceeds maximum safe integer: ${obj}`);
        }
        return Number(obj); // Convert BigInt to Number
    }

    if (Array.isArray(obj)) {
        return obj.map(convertBigIntsToNumbers); // Recursively process each element in the array
    }

    if (typeof obj === 'object' && obj !== null) {
        const newObj = {};
        for (const key in obj) {
            if (obj.hasOwnProperty(key)) {
                newObj[key] = convertBigIntsToNumbers(obj[key]); // Recursively process each property
            }
        }
        return newObj;
    }

    return obj; // Return the value if it's not a BigInt, object, or array
}

function checkBridgeAddress(genesis, expectedBridgeAddress){
    // get bridge address in genesis file
    let genesisBridgeAddress = ethers.ZeroAddress;
    let bridgeContractName = "";

    for (let i = 0; i < genesis.genesis.length; i++) {
        if (supportedBridgeContracts.includes(genesis.genesis[i].contractName)) {
            genesisBridgeAddress = genesis.genesis[i].address;
            bridgeContractName = genesis.genesis[i].contractName;
            break;
        }
    }

    if (expectedBridgeAddress.toLowerCase() !== genesisBridgeAddress.toLowerCase()) {
        throw new Error(
            `checkBridgeAddress: '${bridgeContractName}' address in the 'genesis.json' does not match the 'expectedBridgeAddress'`
        );
    }
}

module.exports = {
    genOperation,
    transactionTypes,
    convertBigIntsToNumbers,
    supportedBridgeContracts,
    checkBridgeAddress,
};
