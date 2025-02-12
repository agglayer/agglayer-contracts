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

function loadProvider(parameters) {
    // Load provider
    let currentProvider = ethers.provider;
    if (parameters.multiplierGas || parameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== "hardhat") {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`
            );
            if (parameters.maxPriorityFeePerGas && parameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${parameters.maxPriorityFeePerGas} gwei, MaxFee${parameters.maxFeePerGas} gwei`
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(parameters.maxFeePerGas, "gwei"),
                    ethers.parseUnits(parameters.maxPriorityFeePerGas, "gwei")
                );
                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log("Multiplier gas used: ", parameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await ethers.provider.getFeeData();
                    return new ethers.FeeData(
                        null,
                        ((feedata.maxFeePerGas) * BigInt(parameters.multiplierGas)) / 1000n,
                        ((feedata.maxPriorityFeePerGas) * BigInt(parameters.multiplierGas)) /
                        1000n
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }
    return currentProvider;
}

function loadDeployer(parameters, currentProvider) {
    // Load deployer
    let deployer;
    if (parameters.deployerPvtKey) {
        deployer = new ethers.Wallet(parameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = ethers.HDNodeWallet.fromMnemonic(
            ethers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0"
        ).connect(currentProvider);
    } else {
        [deployer] = await ethers.getSigners();
    }
}

function decodeTimelockTx(timelockTx, contractFactory) {
    const paramsArray = timelockTx?.fragment.inputs;
    const objectDecoded = {};
    for (let i = 0; i < paramsArray?.length; i++) {
        const currentParam = paramsArray[i];
        objectDecoded[currentParam.name] = timelockTx?.args[i];
        if (currentParam.name == "data") {
            const decodedRollupManagerData = contractFactory.interface.parseTransaction({
                data: timelockTx?.args[i],
            });
            const objectDecodedData = {};
            const paramsArrayData = decodedRollupManagerData?.fragment.inputs;

            for (let j = 0; j < paramsArrayData?.length; j++) {
                const currentParam = paramsArrayData[j];
                objectDecodedData[currentParam.name] = decodedRollupManagerData?.args[j];
            }
            objectDecoded["decodedData"] = objectDecodedData;
        }
    }
    return objectDecoded;
}

function addTimelockDelayIfTimelock(params, mandatoryDeploymentParameters) {
    switch (params.type) {
        case utils.transactionTypes.EOA:
        case utils.transactionTypes.MULTISIG:
            break;
        case utils.transactionTypes.TIMELOCK:
            mandatoryDeploymentParameters.push("timelockDelay");
            break;
        default:
            throw new Error(`Invalid type ${params.type}`);
    }
    return mandatoryDeploymentParameters;
}


module.exports = {
    genOperation,
    transactionTypes,
    convertBigIntsToNumbers,
    supportedBridgeContracts,
    loadProvider,
    loadDeployer,
    decodeTimelockTx,
    addTimelockDelayIfTimelock
};
