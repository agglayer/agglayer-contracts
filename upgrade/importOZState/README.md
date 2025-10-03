# Import OpenZeppelin Upgrade State

## Overview

This script imports OpenZeppelin upgrade state for all proxy contracts in the zkEVM/Agglayer system. It is used to synchronize the OpenZeppelin upgrades plugin with existing deployed contracts.

## Purpose

When working with upgradeable contracts deployed using OpenZeppelin's Transparent Proxy pattern, the OpenZeppelin upgrades plugin maintains a local state (`.openzeppelin` folder) to track deployment information. This script:

1. **Forces import** of existing proxy contracts into OZ's upgrade tracking system
2. **Syncs** the local `.openzeppelin` folder with on-chain deployment state
3. **Enables** subsequent upgrade operations using `prepareUpgrade` and `upgrade` functions

## When to Use

Use this script when:

- You need to perform upgrades on existing deployed contracts
- The `.openzeppelin` folder is missing or out of sync
- You're working from a fresh clone of the repository
- You're switching between different deployment tags/versions
- You need to validate existing deployment state before upgrades

## Prerequisites

1. **Node.js and dependencies installed**

    ```bash
    npm install
    ```

2. **Environment setup**

    - Ensure your `.env` file is properly configured with RPC endpoints
    - You need read access to the target network

3. **Contract compilation**

    ```bash
    npx hardhat compile
    ```

4. **Network access**
    - RPC endpoint must be accessible
    - Contracts must already be deployed on the target network

## Configuration

### Option 1: Environment Variable (Recommended)

Set the RollupManager/AgglayerManager address in your `.env` file:

```bash
ROLLUP_MANAGER_ADDRESS=0xYourAddressHere
```

### Option 2: Direct Edit

Edit the script directly and modify the address:

```typescript
const ROLLUP_MANAGER_ADDRESS = '0xYourAddressHere';
```

## How to Use

### Step 1: Identify the Correct Tag/Version

Before running the script, ensure you're on the correct git tag corresponding to the deployment version:

```bash
# List available tags
git tag -l

# Checkout the deployment tag
git tag checkout <tag-name>
# Example: git checkout v12.0.0
```

### Step 2: Set the RollupManager Address

The script needs the RollupManager (or AgglayerManager) address. Find this from:

- Deployment documentation
- Previous deployment scripts output
- Network deployment records
- `deployments/` folder for the specific network

Example addresses:

- **Mainnet**: Check `deployments/mainnet/` folder
- **Testnet**: Check `deployments/sepolia/` or relevant testnet folder

### Step 3: Run the Script

Execute the script using Hardhat:

```bash
# Using npx
npx hardhat run upgrade/importOZState/importOZState.ts --network <network-name>

# Examples:
npx hardhat run upgrade/importOZState/importOZState.ts --network mainnet
npx hardhat run upgrade/importOZState/importOZState.ts --network sepolia
```

### Step 4: Verify Output

The script will output progress for each contract:

```
========== IMPORTING OZ UPGRADE STATE ==========

Using RollupManager address: 0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff

Loading contract addresses from RollupManager...
✓ Addresses obtained:
  - RollupManager: 0x32d33D5137a7cFFb54c5Bf8371172bcEc5f310ff
  - Bridge V2: 0xABC...
  - Global Exit Root V2: 0xDEF...
  - AggLayer Gateway: 0x123...

========== FORCE IMPORTING PROXIES ==========

1. Importing RollupManager proxy...
   ✅ RollupManager imported successfully

2. Importing AggLayerGateway proxy...
   ✅ AggLayerGateway imported successfully

3. Importing Bridge proxy...
   ✅ Bridge imported successfully

4. Importing GlobalExitRoot proxy...
   ✅ GlobalExitRoot imported successfully

========== IMPORT COMPLETE ==========
✅ All proxy contracts have been imported into OpenZeppelin upgrade state
You can now run prepareUpgrade on these contracts
```

## What the Script Does

The script imports the following proxy contracts:

1. **RollupManager (AgglayerManager)** - Main coordinator contract
2. **AggLayerGateway** - Gateway for aggregation layer
3. **Bridge (AgglayerBridge)** - Bridge contract for cross-chain transfers
4. **GlobalExitRoot (AgglayerGER)** - Global exit root manager

For each contract, it:

- Loads the contract factory for the current version
- Uses `upgrades.forceImport()` to register the proxy in OZ's upgrade state
- Validates the proxy kind (transparent) and constructor arguments

## After Running

Once the script completes successfully:

1. The `.openzeppelin` folder will be updated with deployment information
2. You can run upgrade preparation scripts:
    ```bash
    npx hardhat run upgrade/<your-upgrade-script>.ts --network <network>
    ```
3. Subsequent upgrade operations will recognize the existing deployments

## Troubleshooting

### Error: "ROLLUP_MANAGER_ADDRESS is not set"

- Set the address in `.env` or directly in the script

### Error: "Failed to import [Contract]"

- Verify the contract is deployed at the expected address
- Check network connectivity and RPC endpoint
- Ensure you're on the correct git tag/version matching the deployment
- Verify the contract code matches the deployed bytecode

### Network Connection Issues

- Check your RPC endpoint in `.env`
- Verify API keys are valid
- Try a different RPC provider

### Wrong Contract Version

- Ensure your local code matches the deployed version
- Checkout the correct git tag for the deployment
- Verify constructor arguments match deployment parameters

## Related Scripts

- `upgrade/fullUpgradeV12/` - Full upgrade scripts for v12
- `deployment/v2/` - Deployment scripts for v2 contracts
- Other upgrade folders for different versions

## Notes

- **Read-only operation**: This script only reads from the blockchain and updates local state
- **No gas required**: No transactions are sent
- **Safe to re-run**: Can be executed multiple times without issues
- **Version matching**: Ensure your local contract code matches the deployed version

## Support

For issues or questions:

1. Check deployment documentation in `deployments/` folder
2. Review audit reports in `audits/` folder
3. Consult the team's deployment records
4. Verify against network explorers (Etherscan, Polygonscan, etc.)
