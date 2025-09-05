import 'dotenv/config';
import '@openzeppelin/hardhat-upgrades';
import 'hardhat-dependency-compiler';
import 'hardhat-switch-network';
import '@nomiclabs/hardhat-solhint';
import { HardhatUserConfig } from 'hardhat/config';
import 'solidity-coverage';
import '@typechain/hardhat';
import '@nomicfoundation/hardhat-ethers';
import '@nomicfoundation/hardhat-chai-matchers';
import '@nomicfoundation/hardhat-verify';

const DEFAULT_MNEMONIC = 'test test test test test test test test test test test junk';

/*
 * You need to export an object to set up your config
 * Go to https://hardhat.org/config/ to learn more
 */

/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
    typechain: {
        outDir: 'typechain-types',
        target: 'ethers-v6',
    },
    dependencyCompiler: {
        paths: [
            '@openzeppelin/contracts4/token/ERC20/presets/ERC20PresetFixedSupply.sol',
            '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol',
            '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol',
            '@openzeppelin/contracts/proxy/transparent/ProxyAdmin.sol',
            '@openzeppelin/contracts/governance/TimelockController.sol',
        ], // ,
        // keep: true
    },
    solidity: {
        compilers: [
            {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                    evmVersion: 'cancun',
                },
            },
            {
                version: '0.8.20',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                    evmVersion: 'shanghai',
                },
            },
            {
                version: '0.8.17',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                },
            },
            {
                version: '0.6.11',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                },
            },
            {
                version: '0.5.16',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                },
            },
            {
                version: '0.5.12',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                },
            },
        ],
        overrides: {
            // Set all contracts on L2 to use 'evmVersion: Shangai' to be compatible with clients not supporting Cancun opcodes
            'contracts/v2/utils/ClaimCompressor.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                    evmVersion: 'shanghai',
                    // viaIR: true,
                },
            },
            '@openzeppelin/contracts4/proxy/transparent/ProxyAdmin.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                    evmVersion: 'shanghai',
                }, // try yul optimizer
            },
            '@openzeppelin/contracts4/proxy/transparent/TransparentUpgradeableProxy.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                    evmVersion: 'shanghai',
                }, // try yul optimizer
            },
            'contracts/v2/PolygonZkEVMBridgeV2.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 800, // should have same runs than BridgeL2SovereignChain
                    },
                    evmVersion: 'shanghai',
                },
            },
            'contracts/v2/lib/BytecodeStorer.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999,
                    },
                    evmVersion: 'shanghai',
                },
            },
            'contracts/v2/sovereignChains/BridgeL2SovereignChain.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 800, // should have same runs than PolygonZkEVMBridgeV2
                    },
                    evmVersion: 'shanghai',
                }, // try yul optimizer
            },
            'contracts/PolygonZkEVMGlobalExitRootL2.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                    evmVersion: 'shanghai',
                }, // try yul optimizer
            },
            'contracts/v2/sovereignChains/GlobalExitRootManagerL2SovereignChain.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                    evmVersion: 'shanghai',
                }, // try yul optimizer
            },
            // low runs to avoid bytecode max size
            'contracts/v2/PolygonRollupManager.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 100, // Should have the same optimizations as PolygonTransparentProxy
                    },
                    evmVersion: 'cancun',
                }, // try yul optimizer
            },
            // low runs to avoid bytecode max size
            'contracts/v2/newDeployments/PolygonRollupManagerNotUpgraded.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 10, // Should have the same optimizations as PolygonTransparentProxy
                    },
                    evmVersion: 'cancun',
                }, // try yul optimizer
            },
            // low runs to avoid bytecode max size
            'contracts/v2/mocks/PolygonRollupManagerMock.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 100, // Should have the same optimizations as PolygonTransparentProxy
                    },
                    evmVersion: 'cancun',
                }, // try yul optimizer
            },
            // Should have the same optimizations than the RollupManager to verify
            'contracts/v2/lib/PolygonTransparentProxy.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 100,
                    },
                    evmVersion: 'cancun',
                }, // try yul optimizer
            },
            'contracts/v2/lib/TokenWrappedBridgeUpgradeable.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 800,
                    },
                    evmVersion: 'shanghai', // Same evm version than BridgeL2SovereignChain
                },
            },
            'contracts/v2/lib/TokenWrappedTransparentProxy.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 999999,
                    },
                    evmVersion: 'shanghai', // Same evm version than BridgeL2SovereignChain
                    metadata: { bytecodeHash: 'none' }, // Get always same bytecode
                }, // try yul optimizer
            },
            'contracts/v2/lib/bridgeLib.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 800, // should have same runs than PolygonZkEVMBridgeV2
                    },
                    evmVersion: 'shanghai', // Same evm version than PolygonZkEVMBridgeV2
                }, // try yul optimizer
            },
            'contracts/v2/aggchains/AggchainFEP.sol': {
                version: '0.8.28',
                settings: {
                    optimizer: {
                        enabled: true,
                        runs: 1000,
                    },
                    evmVersion: 'cancun',
                },
            },
        },
    },
    networks: {
        mainnet: {
            url: process.env.MAINNET_PROVIDER
                ? process.env.MAINNET_PROVIDER
                : `https://mainnet.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        ropsten: {
            url: process.env.ROPSTEN_PROVIDER
                ? process.env.ROPSTEN_PROVIDER
                : `https://ropsten.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        goerli: {
            url: process.env.GOERLI_PROVIDER
                ? process.env.GOERLI_PROVIDER
                : `https://goerli.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        rinkeby: {
            url: process.env.RINKEBY_PROVIDER
                ? process.env.RINKEBY_PROVIDER
                : `https://rinkeby.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        sepolia: {
            url: process.env.SEPOLIA_PROVIDER
                ? process.env.SEPOLIA_PROVIDER
                : `https://sepolia.infura.io/v3/${process.env.INFURA_PROJECT_ID}`,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        localhost: {
            url: 'http://127.0.0.1:8545',
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        custom: {
            url: process.env.CUSTOM_PROVIDER ? process.env.CUSTOM_PROVIDER : 'http://127.0.0.1:8545',
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        hardhat: {
            initialDate: '0',
            allowUnlimitedContractSize: true,
            initialBaseFeePerGas: 0,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
            chains: {
                747474: {
                    hardforkHistory: {
                        cancun: 0,
                    },
                },
                3443: {
                    hardforkHistory: {
                        cancun: 0,
                    },
                },
            },
        },
        polygonZKEVMTestnet: {
            url: 'https://rpc.cardona.zkevm-rpc.com',
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        polygonZKEVMMainnet: {
            url: 'https://zkevm-rpc.com',
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        zkevmDevnet: {
            url: 'http://123:123:123:123:123',
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
        opSepolia: {
            url: 'https://sepolia.optimism.io',
            chainId: 11155420,
            accounts: {
                mnemonic: process.env.MNEMONIC || DEFAULT_MNEMONIC,
                path: "m/44'/60'/0'/0",
                initialIndex: 0,
                count: 20,
            },
        },
    },
    gasReporter: {
        enabled: !!process.env.REPORT_GAS,
        outputFile: process.env.REPORT_GAS_FILE ? './gas_report.md' : undefined,
        noColors: !!process.env.REPORT_GAS_FILE,
    },
    etherscan: {
        apiKey: {
            polygonZKEVMTestnet: `${process.env.ETHERSCAN_ZKEVM_API_KEY}`,
            polygonZKEVMMainnet: `${process.env.ETHERSCAN_ZKEVM_API_KEY}`,
            goerli: `${process.env.ETHERSCAN_API_KEY}`,
            sepolia: `${process.env.ETHERSCAN_API_KEY}`,
            mainnet: `${process.env.ETHERSCAN_API_KEY}`,
            zkevmDevnet: `${process.env.ETHERSCAN_API_KEY}`,
            custom: `${process.env.CUSTOM_ETHERSCAN_API_KEY}`,
            opSepolia: `${process.env.ETHERSCAN_API_KEY}`,
        },
        customChains: [
            {
                network: 'polygonZKEVMMainnet',
                chainId: 1101,
                urls: {
                    apiURL: 'https://api-zkevm.polygonscan.com/api',
                    browserURL: 'https://zkevm.polygonscan.com/',
                },
            },
            {
                network: 'polygonZKEVMTestnet',
                chainId: 2442,
                urls: {
                    apiURL: 'https://api-cardona-zkevm.polygonscan.com/api',
                    browserURL: 'https://cardona-zkevm.polygonscan.com/',
                },
            },
            {
                network: 'zkevmDevnet',
                chainId: 123,
                urls: {
                    apiURL: 'http://123:123:123:123:123/api',
                    browserURL: 'http://123:123:123:123:123',
                },
            },
            {
                network: 'custom',
                chainId: Number(process.env.CUSTOM_CHAIN_ID),
                urls: {
                    apiURL: `${process.env.CUSTOM_API_URL}`,
                    browserURL: `${process.env.CUSTOM_BROWSER_URL}`,
                },
            },
            {
                network: 'opSepolia',
                chainId: 11155420,
                urls: {
                    apiURL: 'https://api.etherscan.io/v2/api?chainid=11155420',
                    browserURL: 'https://sepolia-optimistic.etherscan.io',
                },
            },
        ],
    },
};

export default config;
