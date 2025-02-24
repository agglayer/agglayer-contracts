/* eslint-disable no-inner-declarations */
/* eslint-disable no-console */
const { Scalar } = require('ffjavascript');
const { ethers } = require('ethers');

/**
 * Adjusts the multiplier gas and/or the maxFeePer gas of the provider depending on the deploy parameters values and returns the adjusted provider
 * @param {Object} deployParameters The input deploy parameters of the script
 * @returns {Object} The adjusted provider or `ethers.provider` if no deploy parameters applied
 * @param {Object} connectedEthers current ethers instance connected to a network
 */
function getProviderAdjustingMultiplierGas(deployParameters, connectedEthers) {
    let currentProvider = connectedEthers.provider;
    if (deployParameters.multiplierGas || deployParameters.maxFeePerGas) {
        if (process.env.HARDHAT_NETWORK !== 'hardhat') {
            currentProvider = ethers.getDefaultProvider(
                `https://${process.env.HARDHAT_NETWORK}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            );
            if (deployParameters.maxPriorityFeePerGas && deployParameters.maxFeePerGas) {
                console.log(
                    `Hardcoded gas used: MaxPriority${deployParameters.maxPriorityFeePerGas} gwei, MaxFee${deployParameters.maxFeePerGas} gwei`,
                );
                const FEE_DATA = new ethers.FeeData(
                    null,
                    ethers.parseUnits(deployParameters.maxFeePerGas, 'gwei'),
                    ethers.parseUnits(deployParameters.maxPriorityFeePerGas, 'gwei'),
                );

                currentProvider.getFeeData = async () => FEE_DATA;
            } else {
                console.log('Multiplier gas used: ', deployParameters.multiplierGas);
                async function overrideFeeData() {
                    const feedata = await connectedEthers.provider.getFeeData();
                    return new connectedEthers.FeeData(
                        null,
                        ((feedata.maxFeePerGas) * BigInt(deployParameters.multiplierGas)) / BigInt(1000),
                        ((feedata.maxPriorityFeePerGas) * BigInt(deployParameters.multiplierGas)) / BigInt(1000),
                    );
                }
                currentProvider.getFeeData = overrideFeeData;
            }
        }
    }
    return currentProvider;
}

/**
 * Resolves a deployer given the deploy parameters and the current provider
 * @param {Object} currentProvider The current provider
 * @param {Object} deployParameters Json OBject with the script deploy parameters
 * @param {Object} connectedEthers current ethers instance connected to a network
 * @returns The resolved deployer
 */
async function getDeployerFromParameters(currentProvider, deployParameters, connectedEthers) {
    let deployer;
    if (deployParameters.deployerPvtKey) {
        deployer = new connectedEthers.Wallet(deployParameters.deployerPvtKey, currentProvider);
    } else if (process.env.MNEMONIC) {
        deployer = connectedEthers.HDNodeWallet.fromMnemonic(
            connectedEthers.Mnemonic.fromPhrase(process.env.MNEMONIC),
            "m/44'/60'/0'/0/0",
        ).connect(currentProvider);
    } else {
        [deployer] = await connectedEthers.getSigners();
    }
    return deployer;
}
/**
 * Check if all params are present in the expectedParams
 * @param {Object} objParams - object with parameters
 * @param {Array} expectedParams - array of expected parameters in string
 * @param {Boolean} checkAddresses - check if the parameter is a correct address in case has Address string in param name
 */
function checkParams(objParams, expectedParams, checkAddresses = false) {
    // eslint-disable-next-line no-restricted-syntax
    for (const parameterName of expectedParams) {
        if (objParams[parameterName] === undefined || objParams[parameterName] === '') {
            throw new Error(`Missing parameter: ${parameterName}`);
        }

        if (checkAddresses) {
        // Check addresses
            if (parameterName.includes('Address') && !ethers.isAddress(objParams[parameterName])) {
                throw new Error(`Invalid parameter address: ${parameterName}`);
            }
        }
    }
}

/**
 * Convert a value into in its hexadecimal string representation
 * @param {Number | BigInt} _value - value to encode
 * @param {Boolean} prefix - attach '0x' at the beginning of the string
 * @returns {String} encoded value in hexadecimal string
 */
function valueToHexStr(_value, prefix = false) {
    if (!(typeof _value === 'number' || typeof _value === 'bigint')) {
        throw new Error('valueToHexStr: _value is not a number or BigInt type');
    }

    if (prefix !== false && typeof prefix !== 'boolean') {
        throw new Error('valueToHexStr: _prefix is not a boolean');
    }

    let valueHex = Scalar.e(_value).toString(16);
    valueHex = valueHex.length % 2 ? `0${valueHex}` : valueHex;

    return prefix ? `0x${valueHex}` : valueHex;
}

/**
 * Pad a string hex number with 0
 * @param {String} str - String input
 * @param {Number} length - Length of the resulting string
 * @returns {String} Resulting string
 */
function padZeros(str, length) {
    if (length > str.length) {
        str = '0'.repeat(length - str.length) + str;
    }

    return str;
}

/**
 * Convert a value into in its hexadecimal string representation with 32 bytes padding
 * @param {Number | BigInt} _value - value to encode
 * @returns {String} encoded value in hexadecimal string
 */
function valueToStorageBytes(_value) {
    const valueHex = valueToHexStr(_value, false);
    return `0x${padZeros(valueHex, 64)}`;
}

/**
 * Scan all SSTORE opcodes in a trace
 * Does not take into account revert operations neither depth
 * @param {Object} trace
 * @returns {Object} - storage writes: {"key": "value"}
 */
function getStorageWrites(trace) {
    const writes = trace.structLogs
        .filter((log) => log.op === 'SSTORE')
        .map((log) => {
            const [newValue, slot] = log.stack.slice(-2);
            return { newValue, slot };
        });

    // print all storage writes in an object fashion style
    const writeObject = {};
    writes.forEach((write) => {
        writeObject[`0x${write.slot}`] = `0x${write.newValue}`;
    });

    return writeObject;
}

/**
 * Get all SLOAD and SSTORE in a trace
 * @param {Object} trace
 * @returns {Object} - storage read and writes: {"key": "value"}
 */
function getStorageReadWrites(trace) {
    return trace.structLogs[trace.structLogs.length - 1].storage;
}

module.exports = {
    getStorageWrites,
    getStorageReadWrites,
    valueToStorageBytes,
    checkParams,
    getProviderAdjustingMultiplierGas,
    getDeployerFromParameters,
};
