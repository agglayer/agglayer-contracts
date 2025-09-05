# Upgrade BridgeL2SovereignChain to v1.1.0

This folder contains the upgrade scripts and tests for upgrading the BridgeL2SovereignChain contract to version v1.1.0.

## Overview

The upgrade process involves:

1. Deploying a new implementation of BridgeL2SovereignChain v1.1.0
2. Creating timelock operations to schedule and execute the upgrade
3. Verifying the upgrade was successful through comprehensive tests

## Files

- `upgradeSbridge-v1.1.0.ts` - Main upgrade script
- `upgradeSbridge-v1.1.0.test.ts` - Shadow fork test to validate the upgrade
- `upgrade_parameters.json` - Configuration parameters for the upgrade
- `upgrade_parameters.json.example` - Example configuration file
- `upgrade_output.json` - Generated output after running the upgrade script (created after execution)

## Prerequisites

1. Set up your environment variables in `.env` file

```
cp .env.example .env
```

2. Configure the parameters in `upgrade_parameters.json`
   cp ./upgrade/upgradeSbridge-v1.1.0/upgrade_parameters.json.example ./upgrade/upgradeSbridge-v1.1.0/upgrade_parameters.json

3. Ensure you have the necessary permissions and access to the target network

## Configuration

### Required Parameters

Update `upgrade_parameters.json` with the following values:

```json
{
    "tagSCPreviousVersion": "v10.1.0-rc.8",
    "tagSCCurrentVersion": "v10.1.0-rc.10",
    "bridgeL2SovereignChainAddress": "YOUR_BRIDGE_CONTRACT_ADDRESS",
    "timelockDelay": 60,
    "forkParams": {
        "rpc": "YOUR_NETWORK_RPC_URL"
    }
}
```

### Parameters Description

- `tagSCPreviousVersion`: GitHub tag of the previous version of the smart contracts repository (used for tracking and documentation purposes)
- `tagSCCurrentVersion`: GitHub tag of the current version of the smart contracts repository being deployed (should match the version being deployed)
- `bridgeL2SovereignChainAddress`: Address of the BridgeL2SovereignChain proxy contract to upgrade
- `timelockDelay`: Delay in seconds for timelock operations (optional, defaults to minimum delay from timelock smart contract)
- `timelockSalt`: Salt used for timelock operations (optional, defaults to ethers.ZeroHash)
- `timelockAdminAddress`: Address with proposer and executor roles in the timelock (optional, will be auto-detected if not provided), only for testing purposes
- `forkParams.rpc`: RPC URL for the target network (used in shadow fork tests)

**Note**: The tag versions refer to GitHub repository tags, not the contract version constants. These are used for tracking which version of the codebase is being deployed and for documentation purposes in the upgrade output.

## Usage

### 1. Run the Upgrade Script

```bash
npx hardhat run upgrade/upgradeSbridge-v1.1.0/upgradeSbridge-v1.1.0.ts --network <network_name>
```

This will:

- Deploy the new BridgeL2SovereignChain v1.1.0 implementation
- Verify all deployed contracts on Etherscan:
    - Bridge implementation contract
    - Wrapped token bytecode storer
    - Wrapped token bridge implementation
    - BridgeLib library
- Generate timelock schedule and execute data
- Create `upgrade_output.json` with all necessary information

### 2. Execute the Upgrade

After running the script, you'll need to:

1. Schedule the upgrade using the `scheduleData` from `upgrade_output.json`
2. Wait for the timelock delay period
3. Execute the upgrade using the `executeData` from `upgrade_output.json`

### 3. Run Tests

Validate the upgrade with the shadow fork test:

```bash
npx hardhat test upgrade/upgradeSbridge-v1.1.0/upgradeSbridge-v1.1.0.test.ts --network hardhat
```

This test will:

- Fork the network at the deployment block
- Simulate the timelock schedule and execution
- Verify that the contract was upgraded correctly
- Validate that all storage variables are preserved
- Ensure the contract cannot be re-initialized

## What's New in v1.1.0

The BridgeL2SovereignChain v1.1.0 includes:

- Updated version constant to "v1.1.0"
- [Add specific features/improvements here based on the actual changes]

## Security Considerations

1. **Timelock Protection**: All upgrades go through a timelock mechanism for security
2. **Storage Validation**: Tests verify that critical storage variables are preserved
3. **Initialization Protection**: Ensures the contract cannot be re-initialized after upgrade
4. **Contract Verification**: All deployed contracts are automatically verified on Etherscan

## Troubleshooting

### Common Issues

1. **Manifest Import Error**: The script uses `forceImport` to handle contracts deployed in genesis blocks
2. **Network Forking**: Tests may fail if the RPC doesn't support forking or if blocks are not available
3. **Timelock Permissions**: Ensure the deployer has the necessary roles in the timelock contract

### Environment Variables

Make sure your `.env` file contains:

```
MNEMONIC="your mnemonic phrase"
INFURA_PROJECT_ID="your infura project id"
ETHERSCAN_API_KEY="your etherscan api key"
```

## Output Files

After successful execution, the following files will be generated:

- `upgrade_output.json`: Contains all deployment addresses, transaction data, and metadata
    - Bridge implementation address
    - Wrapped token bytecode storer address
    - Wrapped token bridge implementation address
    - BridgeLib library address
    - Timelock schedule and execute transaction data
    - Deployment block number for testing

## Support

For issues or questions regarding this upgrade:

1. Check the test output for specific error messages
2. Verify all parameters in `upgrade_parameters.json`
3. Ensure network connectivity and permissions
4. Review the upgrade output logs for deployment details
