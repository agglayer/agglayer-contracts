# Deploy AggOracleCommittee

This tool allows deploying an AggOracleCommittee contract, which is responsible for managing the insertion of Global Exit Roots (GERs) into the AgglayerGERL2 through an oracle committee of signing validators.

## Overview

The AggOracleCommittee contract implements a threshold multi-signature scheme: validators sign each GER off-chain, and the proposer injects it with exactly `threshold` signatures in a single transaction.

Key features:

- A GER is injected only with `threshold` valid validator signatures, sorted by signer address in ascending order
- Only the proposer can inject GERs; validators never send transactions
- A GER is processed only once
- Owner can update the validators, the threshold and the proposer
- Two-step ownership transfer; renouncing ownership is disabled

## Requirements

- Node.js >= 14
- Hardhat
- An RPC endpoint
- A deployer account with sufficient balance

## Configuration

1. Copy the example parameters file:

```bash
cp tools/deployAggOracleCommittee/deploy_parameters.json.example tools/deployAggOracleCommittee/deploy_parameters.json
```

2. Edit `deploy_parameters.json` with your specific configuration:

### Required Parameters:

- `globalExitRootManagerL2SovereignAddress`: Address of the AgglayerGERL2 contract that will receive the consolidated GERs
- `ownerAddress`: Address that will own the AggOracleCommittee contract (typically a timelock contract)
- `proposerAddress`: Address authorized to inject GERs (the aggoracle)
- `validators`: Array of initial validators `{ "addr": "0x...", "url": "..." }`. `url` is optional metadata (e.g. the endpoint where the validator serves signatures) and can be an empty string
- `threshold`: Number of validator signatures required to inject a GER (`1 <= threshold <= validators.length <= 255`)

### Optional Parameters:

- `deployerAddress`: Address of the deployer (if using a specific address)
- `deployerPvtKey`: Private key of the deployer (if not using hardware wallet)
- `maxFeePerGas`: Maximum fee per gas for deployment transaction
- `maxPriorityFeePerGas`: Maximum priority fee per gas
- `multiplierGas`: Gas multiplier for the transaction

## Deployment

### Using Hardhat:

```bash
npx hardhat run tools/deployAggOracleCommittee/deployAggOracleCommittee.ts --network <YOUR_NETWORK>
```

## Output

After successful deployment, the tool will generate a `deploy_output.json` file containing:

- `gitInfo`: Git information of the deployment
- `aggOracleCommitteeAddress`: Deployed contract address
- `deployer`: Address that deployed the contract
- `proxyAdminAddress`: ProxyAdmin contract address
- `proxyOwnerAddress`: Owner of the ProxyAdmin
- `aggOracleOwnerAddress`: Owner of the AggOracleCommittee
- `globalExitRootManagerL2SovereignAddress`: Address of the AgglayerGERL2
- `proposerAddress`: Configured proposer
- `validators`: List of initial validators with their URLs
- `threshold`: Configured threshold

## Post-Deployment

After deployment, the owner can:

1. **Update validators and threshold**: Call `updateValidatorsAndThreshold(RemoveValidatorInfo[], ValidatorInfo[], uint256)`
2. **Update the proposer**: Call `updateAggOracleProposer(address)`
3. **Transfer globalExitRootUpdater role**: Call `transferGlobalExitRootUpdater(address)`
4. **Accept globalExitRootUpdater role**: Call `acceptGlobalExitRootUpdater()`
5. **Transfer ownership**: Call `transferOwnership(address)`; the new owner must call `acceptOwnership()`

The proposer can:

1. **Inject GERs**: Call `injectGER(bytes32, bytes)` with exactly `threshold` concatenated 65-byte signatures

## Important Notes

- The threshold must always be greater than 0 and less than or equal to the number of validators
- The AggOracleCommittee only injects GERs once it is the `globalExitRootUpdater` of the AgglayerGERL2: transfer the role to it (`transferGlobalExitRootUpdater` on the AgglayerGERL2) and accept it with `acceptGlobalExitRootUpdater()` on the committee
- The contract uses OpenZeppelin's upgradeable pattern for future improvements
