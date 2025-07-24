# Deploy Outpost Chain - Simplified Deployment

This script deploys all necessary contracts for an outpost chain using **standard deployments**. CREATE3 has been removed to simplify the deployment process.

## Overview

The script deploys the following contracts using standard OpenZeppelin Upgrades:

1. **ProxyAdmin** - Admin contract for managing proxy contracts
2. **TimelockController** - OpenZeppelin's standard timelock contract that owns the ProxyAdmin
3. **BridgeL2SovereignChain** - Bridge contract for outpost chain (with proxy)
4. **GlobalExitRootManagerL2SovereignChain** - Global exit root manager (with proxy)

## Features

- ✅ **Standard Deployments**: Simple, straightforward contract deployments
- ✅ **Proxy Patterns**: Bridge and GER Manager use transparent proxy pattern
- ✅ **Proper Governance**: Timelock contract owns the ProxyAdmin for secure upgrades
- ✅ **Automated Parameter Calculation**: Gas token address, network, and proxy manager auto-derived
- ✅ **Simplified Configuration**: Fewer manual parameters required for outpost setup
- ✅ **Comprehensive Validation**: Basic verification tests for all deployments
- ✅ **Structured Output**: Complete deployment information saved to JSON file
- ✅ **Logger Integration**: Detailed logging throughout the deployment process

## Deployment Strategy

### Standard OpenZeppelin Upgrades

All contracts are deployed using OpenZeppelin's upgrades framework:

- ✅ **TimelockController**: Deployed first as the governance timelock
- ✅ **ProxyAdmin**: Deployed with TimelockController as initial owner
- ✅ **BridgeL2SovereignChain**: Deployed with upgrades.deployProxy() and initialized
- ✅ **GlobalExitRootManagerL2SovereignChain**: Deployed with upgrades.deployProxy() and initialized

### Circular Dependency Handling

Since Bridge and GER Manager reference each other, we use deterministic address pre-calculation:

1. **Pre-calculate Bridge address** using `ethers.getCreateAddress()` based on deployer address and nonce
2. **Deploy GER Manager** with the pre-calculated Bridge address
3. **Deploy Bridge** with the actual GER Manager address
4. **Verify addresses match** - confirms the pre-calculation was correct

**Technical Details:**

- Uses `deployer.getNonce()` to get current nonce
- Bridge proxy deploys at `nonce + 1` (implementation at `nonce`, proxy at `nonce + 1`)
- Address verification ensures deterministic deployment worked correctly

## Setup

1. Install dependencies:

```bash
npm install
```

2. Set environment variables:

```bash
cp .env.example .env
```

Fill `.env` with your `INFURA_PROJECT_ID`, `ETHERSCAN_API_KEY`, and other required variables.

3. Configure deployment parameters:

```bash
cp ./tools/deployOutpostChain/deploy_parameters.json.example ./tools/deployOutpostChain/deploy_parameters.json
```

## Configuration

The `deploy_parameters.json` file contains all deployment configuration grouped by category:

### Network Configuration

```json
{
    "network": {
        "chainID": 1001, // Unique chain identifier
        "rollupID": 1001, // Rollup identifier for gas token derivation
        "networkName": "OutpostChain",
        "tokenName": "Wrapped Ether",
        "tokenSymbol": "WETH",
        "tokenDecimals": 18
    }
}
```

**Automated Parameters:**

- 🤖 `gasTokenAddress`: **Auto-calculated** from `rollupID` by repeating it 5× to create a 160-bit address
- 🤖 `gasTokenNetwork`: **Auto-set** to the `chainID` value
- 🤖 `proxiedTokensManager`: **Auto-set** to the Timelock contract address (proxy owner)

**Note**: The `tokenName`, `tokenSymbol`, and `tokenDecimals` fields are automatically encoded into `gasTokenMetadata` using `abi.encode()` during deployment.

**Example Gas Token Address Derivation:**

```
rollupID: 1001 → hex: 0x000003e9 → repeated 5×: 0x000003e9000003e9000003e9000003e9000003e9
```

### Timelock Configuration

```json
{
    "timelock": {
        "timelockDelay": 3600,
        "timelockAdminAddress": "0x..."
    }
}
```

### Bridge Configuration

```json
{
    "bridge": {
        "bridgeManager": "0x...",
        "emergencyBridgePauser": "0x...",
        "emergencyBridgeUnpauser": "0x..."
    }
}
```

**Note**: `proxiedTokensManager` is automatically set to the **Timelock contract address** during deployment to ensure proper governance control over proxy upgrades.

### Global Exit Root Configuration

```json
{
    "globalExitRoot": {
        "globalExitRootUpdater": "0x...",
        "globalExitRootRemover": "0x..."
    }
}
```

## Usage

### Deploy contracts

```bash
npx hardhat run tools/deployOutpostChain/deployOutpostChain.ts --network <your_network>
```

### Expected Output

**Console Logs:**

```bash
🚀 Starting Outpost Chain deployment...
✅ All mandatory parameters validated

Deploying with address: 0x1234567890123456789012345678901234567890
Network: OutpostChain (Chain ID: 1001)
Rollup ID: 1001
🤖 Auto-calculated gas token address: 0x000003e9000003e9000003e9000003e9000003e9
🤖 Auto-calculated gas token network: 1001 (using chainID)
🤖 Auto-calculated proxied tokens manager: timelock address (set during deployment)

=== Step 1: Deploying TimelockController (OpenZeppelin) ===
✅ TimelockController (OpenZeppelin) deployed: 0xTimelockAddress123...

=== Step 2: Deploying ProxyAdmin with Timelock as owner ===
✅ ProxyAdmin deployed with Timelock as owner: 0xProxyAdminAddress456...

=== Step 3: Pre-calculating Bridge proxy address ===
📍 Pre-calculated Bridge proxy address: 0xPreCalculatedAddress123...
👤 Deployer address: 0x1234567890123456789012345678901234567890
🔢 Current nonce: 44

=== Step 4: Deploying GlobalExitRootManagerL2SovereignChain ===
✅ GlobalExitRootManagerL2SovereignChain proxy (initialized): 0xGERManagerAddress789...

=== Step 5: Deploying BridgeL2SovereignChain ===
🧮 Derived gas token address from rollupID 1001: 0x000003e9000003e9000003e9000003e9000003e9
✅ BridgeL2SovereignChain proxy (initialized): 0xPreCalculatedAddress123...

=== Step 5.1: Verifying address prediction ===
✅ Address prediction successful! Bridge deployed at expected address: 0xPreCalculatedAddress123...

🎉 Deployment completed successfully!
```

**The script will:**

1. ✅ Validate all deployment parameters
2. ✅ Deploy TimelockController contract
3. ✅ Deploy ProxyAdmin contract with Timelock as owner
4. ✅ Pre-calculate Bridge proxy address using nonce prediction
5. ✅ Deploy GlobalExitRootManagerL2SovereignChain with pre-calculated Bridge address
6. ✅ Deploy BridgeL2SovereignChain with actual GER Manager address
7. ✅ Verify actual Bridge address matches pre-calculated address
8. ✅ Run verification tests
9. ✅ Generate deployment output JSON

### Output File

A JSON file `deploy_output_YYYY-MM-DD.json` will be created with all deployment information:

```json
{
    "deploymentDate": "2024-01-01",
    "network": {
        "chainID": 1001,
        "rollupID": 1001,
        "networkName": "OutpostChain",
        "derivedGasTokenAddress": "0x000003e9000003e9000003e9000003e9000003e9",
        "gasTokenNetwork": 1001
    },
    "contracts": {
        "proxyAdminAddress": "0x...",
        "timelockAddress": "0x...",
        "bridgeL2SovereignChainAddress": "0x...",
        "bridgeL2SovereignChainImplementation": "0x...",
        "globalExitRootManagerL2SovereignChainAddress": "0x...",
        "globalExitRootManagerL2SovereignChainImplementation": "0x..."
    },
    "configuration": {
        "timelockDelay": 3600,
        "timelockAdmin": "0x...",
        "bridgeManager": "0x...",
        "emergencyBridgePauser": "0x...",
        "emergencyBridgeUnpauser": "0x...",
        "globalExitRootUpdater": "0x...",
        "globalExitRootRemover": "0x..."
    }
}
```

## Key Changes from CREATE3 Version

### ✅ **Simplified Deployment**

- **Before**: Complex CREATE3 factory deployment with pre-calculated addresses
- **After**: Standard OpenZeppelin upgrades deployment

### ✅ **No Address Determinism**

- **Before**: Same addresses across all chains using CREATE3
- **After**: Different addresses per chain (standard behavior)

### ✅ **Easier Debugging**

- **Before**: Complex CREATE3 proxy bytecode and salt management
- **After**: Standard deployment patterns, easier to understand and debug

### ✅ **Faster Deployment**

- **Before**: Multiple steps for CREATE3 factory, proxy deployment, initialization
- **After**: Direct proxy deployment with initialization in one step

### ✅ **Reduced Complexity**

- **Before**: Pre-calculation of addresses, frontrunning protection logic
- **After**: Simple deployment flow with standard patterns

## Important Notes

✅ **Circular Dependency Resolved**: Bridge and GER Manager dependencies are resolved using deterministic address pre-calculation with `ethers.getCreateAddress()`.

✅ **Address Verification**: The script automatically verifies that actual deployed addresses match pre-calculated addresses, ensuring deployment integrity.

⚠️ **No Address Determinism**: Unlike CREATE3, these deployments will have different addresses on each chain.

## Troubleshooting

### Common Issues

1. **Contract Verification**: After deployment, verify contracts on Etherscan using the implementation addresses
2. **Proxy Admin Ownership**: Ensure the Timelock has proper ownership of the ProxyAdmin
3. **Bridge Configuration**: Verify the Bridge contract is properly initialized with correct parameters
4. **GER Manager Setup**: Confirm the GER Manager has the correct bridge address reference

For additional support, check the deployment logs and output JSON file for detailed information about each deployed contract.
