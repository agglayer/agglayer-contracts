# Upgrade V12 - Multi-Contract Upgrade

Script for upgrading four critical contracts in the Polygon ecosystem:

1. **PolygonRollupManager** - Core rollup management contract
2. **AggLayerGateway** - AggLayer gateway contract for cross-chain operations
3. **PolygonZkEVMBridgeV2** - Bridge contract for asset transfers
4. **PolygonZkEVMGlobalExitRootV2** - Global exit root manager

## Overview

This upgrade script performs a coordinated upgrade of all four contracts using a batch timelock operation, ensuring atomic execution and maintaining system consistency.

## Files

- `upgradeV12.ts` - Main upgrade script that deploys implementations and creates timelock operations
- `upgradeV12.test.ts` - Shadow fork test validating all contract upgrades
- `upgrade_parameters.json` - Configuration parameters for the upgrade
- `upgrade_parameters.json.example` - Example configuration file
- `upgrade_output.json` - Generated output after running the upgrade script (created after execution)

## Prerequisites

### Environment Setup

1. **Install packages**

```bash
npm i
```

2. **Set environment variables**

```bash
cp .env.example .env
```

Fill `.env` with your credentials:

- `ETHERSCAN_API_KEY` - For contract verification
- `DEPLOYER_PRIVATE_KEY` - Private key for deployment account
- `INFURA_PROJECT_ID` - For network access (if using Infura)

3. **Copy configuration files**

```bash
cp ./upgrade/upgradeV12/upgrade_parameters.json.example ./upgrade/upgradeV12/upgrade_parameters.json
```

## Configuration

### Required Parameters

Update `upgrade_parameters.json` with the following values:

```json
{
    "tagSCPreviousVersion": "v1.1.0",
    "rollupManagerAddress": "0x5132A183E9F3CB75C0AE5E4CB2E1E6A4229C47DB",
    "timelockDelay": 3600,
    "timelockSalt": "",
    "maxFeePerGas": "",
    "maxPriorityFeePerGas": "",
    "multiplierGas": "",
    "timelockAdminAddress": "0x..",
    "unsafeMode": false,
    "initializeAgglayerGateway": {
        "multisigRole": "0x...",
        "signersToAdd": [
            {
                "addr": "0x...",
                "url": "https://example.com/signer1"
            },
            {
                "addr": "0x...",
                "url": "https://example.com/signer2"
            }
        ],
        "newThreshold": 1
    },
    "forkParams": {
        "rpc": "https://sepolia.infura.io/v3/YOUR_INFURA_KEY",
        "network": "sepolia"
    }
}
```

### Parameters Description

#### Mandatory Parameters

- `tagSCPreviousVersion`: GitHub tag of the previous smart contracts version (for documentation)
- `rollupManagerAddress`: Address of the PolygonRollupManager proxy contract to upgrade (other contract addresses will be automatically obtained from this contract)
- `timelockDelay`: Delay in seconds between schedule and execution (minimum 3600 seconds recommended)
- `initializeAgglayerGateway`: Parameters for AggLayerGateway initialization:
    - `multisigRole`: Address to grant multisig role permissions (cannot be zero address)
    - `signersToAdd`: Array of SignerInfo objects with `addr` (address) and `url` (string) properties (must be valid addresses, no duplicates, non-empty URLs, max 255 signers)
    - `newThreshold`: Minimum number of signatures required for multisig operations (must be ≤ number of signers, > 0 if signers present)

**Note**: The addresses for `aggLayerGatewayAddress`, `bridgeV2Address`, and `globalExitRootV2Address` are automatically obtained from the RollupManager contract.

#### Optional Parameters

- `timelockSalt`: Unique salt for timelock operations (defaults to ethers.ZeroHash)
- `maxFeePerGas`: Maximum fee per gas unit (optional, for EIP-1559 transactions)
- `maxPriorityFeePerGas`: Maximum priority fee per gas (optional, for EIP-1559 transactions)
- `multiplierGas`: Gas multiplier with 3 decimals (e.g., "1500" for 1.5x)
- `timelockAdminAddress`: Address with timelock admin privileges (auto-detected if not provided)
- `unsafeMode`: Boolean flag to disable critical tooling checks (default: false, ⚠️ only for development/testing)

#### Fork Parameters (for testing)

- `forkParams.rpc`: RPC URL for shadow fork testing
- `forkParams.network`: Network name ("mainnet" or "sepolia")

## Usage

### 1. Deploy Implementations

Run the upgrade script to deploy new implementations and generate timelock operations:

```bash
npx hardhat run ./upgrade/upgradeV12/upgradeV12.ts --network sepolia
```

**Optional: Unsafe Mode**

To disable critical tooling checks, set `"unsafeMode": true` in `upgrade_parameters.json`:

```json
{
    "tagSCPreviousVersion": "v1.0.0",
    "rollupManagerAddress": "0x...",
    "timelockDelay": 3600,
    "unsafeMode": true,
    "..."
}
```

**Verification Tracking**

The script automatically tracks contract verification on Etherscan and includes results in the output JSON.

⚠️ **Warning**: Setting `"unsafeMode": true` disables critical tooling checks including:

- Git tag validation (ensures deployment matches tagged version)
- Repository state verification
- Critical deployment safeguards

Only use `unsafeMode: true` for development/testing purposes. **Never use in production deployments.**

This will:

**Deploy and verify new implementations:**

- PolygonRollupManager implementation
- AggLayerGateway implementation
- PolygonZkEVMBridgeV2 implementation
- PolygonZkEVMGlobalExitRootV2 implementation
- Bridge auxiliary contracts (BytecodeStorer, TokenWrapper, BridgeLib)

**Validate AggLayerGateway initialization parameters:**

- Ensures multisigRole is not zero address
- Validates all SignerInfo objects have valid structure (addr + url properties)
- Ensures all signer addresses are valid and unique
- Validates all URLs are non-empty strings
- Checks threshold constraints (≤ signers count, > 0 if signers present)
- Enforces maximum signer limit (255)

**Generate timelock operations:**

- Batch schedule data for all four contract upgrades
- Batch execute data for atomic execution
- Decoded operation details for transparency

**Create output file:**

- `upgrade_output.json` with all deployment addresses and transaction data

### 2. Execute Upgrade

After running the deployment script:

1. **Schedule the batch upgrade:**

    ```bash
    # Use the scheduleData from upgrade_output.json
    # Send transaction to timelock contract
    ```

2. **Wait for timelock delay:**

    ```bash
    # Wait for the configured timelockDelay period
    # Monitor the timelock contract for readiness
    ```

3. **Execute the batch upgrade:**
    ```bash
    # Use the executeData from upgrade_output.json
    # Send transaction to timelock contract
    ```

### 3. Validate Upgrade

Run the shadow fork test:

```bash
npx hardhat test ./upgrade/upgradeV12/upgradeV12.test.ts --network hardhat
```

The test performs:

**Network Setup:**

- Forks the target network at deployment block
- Impersonates timelock admin account
- Funds accounts for transaction execution

**Upgrade Execution:**

- Simulates timelock schedule transaction
- Fast-forwards time to bypass delay
- Executes the batch upgrade atomically

**Validation:**

- ✅ Verifies all 4 contracts upgraded to v1.2.0
- ✅ Validates all storage variables preserved
- ✅ Confirms auxiliary contracts deployed correctly
- ✅ Tests re-initialization protection
- ✅ Validates cross-contract references maintained

## Contract Upgrade Details

### 1. PolygonRollupManager

- **Function:** Core rollup management and sequencing
- **Upgrade Type:** `upgrade` (simple proxy upgrade, no re-initialization)
- **Key Validations:** Batch fees, emergency state, rollup counts, aggregation timestamps

### 2. AggLayerGateway

- **Function:** Cross-chain communication and AggLayer integration
- **Upgrade Type:** `upgradeAndCall` with re-initialization (reinitializer(2))
- **Initialize Parameters:** multisigRole, signersToAdd, newThreshold
- **Key Validations:** Gateway version

### 3. PolygonZkEVMBridgeV2

- **Function:** Asset bridging and token management
- **Upgrade Type:** `upgrade` (simple proxy upgrade, no re-initialization)
- **Key Validations:** Bridge version, token implementations, gas token settings, deposit counts
- **Auxiliary Contracts:** BytecodeStorer, TokenWrapper, BridgeLib

### 4. PolygonZkEVMGlobalExitRootV2

- **Function:** Global state root management for cross-chain operations
- **Upgrade Type:** `upgrade` (simple proxy upgrade, no re-initialization)
- **Key Validations:** GER version, bridge reference, rollup manager reference

## Security Considerations

### Timelock Protection

- All upgrades executed through timelock with configurable delay
- Batch execution ensures atomicity across all contracts
- Admin roles verified before execution

### Storage Validation

- Storage layout compatibility checked by OpenZeppelin Upgrades plugin
- Critical storage variables validated before and after upgrade
- Emergency rollback procedures documented

### Contract Verification

- All implementations automatically verified on Etherscan
- Constructor arguments validated and documented
- Deployment addresses recorded for transparency

### Testing Coverage

- Shadow fork testing on actual network state
- All contract interactions tested end-to-end
- Storage preservation validated
- Re-initialization protection verified

## Troubleshooting

### Common Issues

1. **Storage Layout Conflicts**

    ```
    Error: Storage layout incompatible
    Solution: Review storage changes, consider using unsafeSkipStorageCheck for testing only
    ```

2. **Timelock Permission Issues**

    ```
    Error: Timelock admin address does not have proposer/executor role
    Solution: Verify timelockAdminAddress has correct roles or leave empty for auto-detection
    ```

3. **Network Fork Issues**

    ```
    Error: Forked block is lower than implementation deploy block
    Solution: Ensure RPC supports historical data, wait for block synchronization
    ```

4. **Gas Estimation Problems**
    ```
    Error: Transaction underpriced
    Solution: Adjust maxFeePerGas/maxPriorityFeePerGas or increase multiplierGas
    ```

### Environment Variables

Ensure your `.env` file contains:

```env
# Deployment account
DEPLOYER_PRIVATE_KEY=0x...

# Network access
INFURA_PROJECT_ID=your_infura_project_id

# Contract verification
ETHERSCAN_API_KEY=your_etherscan_api_key

# Optional: Custom RPC endpoints
MAINNET_RPC_URL=https://mainnet.infura.io/v3/...
SEPOLIA_RPC_URL=https://sepolia.infura.io/v3/...
```

## Output Files

After successful execution:

### `upgrade_output.json` contains:

```json
{
  "tagSCPreviousVersion": "v1.1.0",
  "gitInfo": { ... },
  "scheduleData": "0x...",
  "executeData": "0x...",
  "timelockContractAddress": "0x...",
  "implementationDeployBlockNumber": 12345678,
  "inputs": {
    "rollupManagerAddress": "0x...",
    "aggLayerGatewayAddress": "0x...",
    "bridgeV2Address": "0x...",
    "globalExitRootV2Address": "0x...",
    "timelockDelay": 3600,
    "salt": "0x..."
  },
  "decodedScheduleData": { ... },
  "deployedContracts": {
    "rollupManagerImplementation": "0x...",
    "aggLayerGatewayImplementation": "0x...",
    "bridgeImplementation": "0x...",
    "globalExitRootManagerImplementation": "0x...",
    "wrappedTokenBytecodeStorer": "0x...",
    "wrappedTokenBridgeImplementation": "0x...",
    "bridgeLib": "0x..."
  },
  "verification": {
    "rollupManagerImplementation": "OK",
    "aggLayerGatewayImplementation": "OK",
    "bridgeImplementation": "OK",
    "globalExitRootManagerImplementation": {
      "status": "FAILED",
      "address": "0x...",
      "constructorArgs": ["0x...", "0x..."],
      "error": "Contract verification failed"
    },
    "wrappedTokenBytecodeStorer": "OK",
    "wrappedTokenBridgeImplementation": "OK",
    "bridgeLib": "OK"
  }
}
```

## Support

For issues or questions regarding this upgrade:

1. **Review test output** for specific error messages and validation failures
2. **Verify parameters** in `upgrade_parameters.json` match target network
3. **Check network connectivity** and ensure RPC endpoints are accessible
4. **Validate permissions** for timelock admin and deployment accounts
5. **Review deployment logs** for contract verification and deployment details

## Version History

- **v1.2.0**: Multi-contract upgrade with enhanced AggLayer integration
- **v1.1.0**: Previous version with basic functionality
- **v1.0.0**: Initial deployment version

---

⚠️ **Important**: This upgrade affects critical infrastructure contracts. Always test thoroughly on testnets before mainnet deployment.
