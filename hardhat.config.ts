import "dotenv/config";
import "@nomicfoundation/hardhat-toolbox";
import "@openzeppelin/hardhat-upgrades";
import "hardhat-dependency-compiler";

import { HardhatUserConfig } from "hardhat/config";

const DEFAULT_MNEMONIC = "test test test test test test test test test test test junk";
const INFURA_URL = `https://{network}.infura.io/v3/${process.env.INFURA_PROJECT_ID}`;
const MNEMONIC = process.env.MNEMONIC || DEFAULT_MNEMONIC;
const ACCOUNTS_CONFIG = {
    mnemonic: MNEMONIC,
    path: "m/44'/60'/0'/0",
    initialIndex: 0,
    count: 20,
};

const COMPILER_SETTINGS = {
    optimizer: {
        enabled: true,
        runs: 999999,
    },
};

const COMPILER_VERSIONS = [
    "0.8.17",
    "0.8.20",
    "0.6.11",
    "0.5.12",
    "0.5.16"
];

const createNetworkConfig = (network: string, providerUrl?: string) => ({
    url: process.env[`${network.toUpperCase()}_PROVIDER`] || providerUrl.replace("{network}", network),
    accounts: ACCOUNTS_CONFIG,
});

const config: HardhatUserConfig = {
    dependencyCompiler: {
        paths: [
            "@openzeppelin/contracts/token/ERC20/presets/ERC20PresetFixedSupply.sol",
            "@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol",
            "@openzeppelin/contracts/proxy/transparent/TransparentUpgradeableProxy.sol",
        ],
    },
    solidity: {
        compilers: COMPILER_VERSIONS.map(version => ({
            version,
            settings: COMPILER_SETTINGS,
        })),
        overrides: {
            "contracts/v2/PolygonRollupManager.sol": {
                version: "0.8.20",
                settings: {
                    ...COMPILER_SETTINGS,
                    runs: 500,
                    evmVersion: "shanghai",
                },
            },
            "contracts/v2/PolygonZkEVMBridgeV2.sol": {
                version: "0.8.20",
                settings: {
                    ...COMPILER_SETTINGS,
                    runs: 999,
                    evmVersion: "shanghai",
                },
            },
            "contracts/v2/newDeployments/PolygonRollupManagerNotUpgraded.sol": {
                version: "0.8.20",
                settings: {
                    ...COMPILER_SETTINGS,
                    runs: 500,
                    evmVersion: "shanghai",
                },
            },
            "contracts/v2/mocks/PolygonRollupManagerMock.sol": {
                version: "0.8.20",
                settings: {
                    optimizer: { enabled: true, runs: 10 },
                    evmVersion: "shanghai",
                },
            },
            "contracts/v2/lib/PolygonTransparentProxy.sol": {
                version: "0.8.20",
                settings: {
                    ...COMPILER_SETTINGS,
                    runs: 500,
                    evmVersion: "shanghai",
                },
            },
            "contracts/v2/utils/ClaimCompressor.sol": {
                version: "0.8.20",
                settings: {
                    ...COMPILER_SETTINGS,
                    evmVersion: "shanghai",
                },
            },
        },
    },
    networks: {
        mainnet: createNetworkConfig('mainnet', INFURA_URL),
        ropsten: createNetworkConfig('ropsten', INFURA_URL),
        goerli: createNetworkConfig('goerli', INFURA_URL),
        rinkeby: createNetworkConfig('rinkeby', INFURA_URL),
        sepolia: createNetworkConfig('sepolia', INFURA_URL),
        localhost: {
            url: "http://127.0.0.1:8545",
            accounts: ACCOUNTS_CONFIG,
        },
        hardhat: {
            initialDate: "0",
            allowUnlimitedContractSize: true,
            initialBaseFeePerGas: 0,
            accounts: ACCOUNTS_CONFIG,
        },
        polygonZKEVMTestnet: createNetworkConfig('polygonZKEVMTestnet', "https://rpc.cardona.zkevm-rpc.com"),
        polygonZKEVMMainnet: createNetworkConfig('polygonZKEVMMainnet', "https://zkevm-rpc.com"),
        zkevmDevnet: {
            url: "http://123:123:123:123:123",
            accounts: ACCOUNTS_CONFIG,
        },
    },
    gasReporter: {
        enabled: !!process.env.REPORT_GAS,
        outputFile: process.env.REPORT_GAS_FILE ? "./gas_report.md" : undefined,
        noColors: !!process.env.REPORT_GAS_FILE,
    },
    etherscan: {
        apiKey: {
            polygonZKEVMTestnet: process.env.ETHERSCAN_ZKEVM_API_KEY,
            polygonZKEVMMainnet: process.env.ETHERSCAN_ZKEVM_API_KEY,
            goerli: process.env.ETHERSCAN_API_KEY,
            sepolia: process.env.ETHERSCAN_API_KEY,
            mainnet: process.env.ETHERSCAN_API_KEY,
            zkevmDevnet: process.env.ETHERSCAN_API_KEY,
        },
        customChains: [
            {
                network: "polygonZKEVMMainnet",
                chainId: 1101,
                urls: {
                    apiURL: "https://api-zkevm.polygonscan.com/api",
                    browserURL: "https://zkevm.polygonscan.com/",
                },
            },
            {
                network: "polygonZKEVMTestnet",
                chainId: 2442,
                urls: {
                    apiURL: "https://explorer-ui.cardona.zkevm-rpc.com/api",
                    browserURL: "https://explorer-ui.cardona.zkevm-rpc.com",
                },
            },
            {
                network: "zkevmDevnet",
                chainId: 123,
                urls: {
                    apiURL: "http://123:123:123:123:123/api",
                    browserURL: "http://123:123:123:123:123",
                },
            },
        ],
    },
};

export default config;
