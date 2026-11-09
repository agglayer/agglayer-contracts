# Deploy Outpost Chain - Simplified Deployment

This script deploys all necessary contracts for an outpost chain using **standard deployments**. CREATE3 has been removed to simplify the deployment process.

## Overview

The script deploys the following contracts using standard OpenZeppelin Upgrades:

1. **ProxyAdmin** - Admin contract for managing proxy contracts
2. **TimelockController** - OpenZeppelin's standard timelock contract that owns the ProxyAdmin
3. **AggOracleCommittee** - _(Optional)_ Oracle committee for managing global exit root updates
4. **AgglayerBridgeL2** - Bridge contract for outpost chain (with proxy)
5. **AgglayerGERL2** - Global exit root manager (with proxy)

### Bridge Internal Contracts

The Bridge deployment involves 4 internal contracts that are automatically deployed:

**During Bridge Implementation Constructor (AgglayerBridge):**

- **WrappedTokenBytecodeStorer** - Stores the bytecode for wrapped token deployments (reduces bridge contract size)
- **WrappedTokenBridgeImplementation** - Implementation contract used as template for all wrapped tokens deployed via proxy pattern
- **BridgeLib** - Library contract containing bridge-related functions (reduces bridge contract size)

**During Bridge Initialization:**

- **WETH Token** - ERC20 representation of L1 ETH on this outpost chain (deployed via `_deployWrappedToken()` because the gas token is not ETH and no `sovereignWETHAddress` is provided). See [Gas Token Configuration](#gas-token-configuration)

## Features

- ✅ **Standard Deployments**: Simple, straightforward contract deployments
- ✅ **Proxy Patterns**: Bridge, GER Manager, and AggOracleCommittee use transparent proxy pattern
- ✅ **Optional Oracle Committee**: Deploy AggOracleCommittee for decentralized global exit root management
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
- ✅ **AggOracleCommittee**: _(Optional)_ Deployed if `useAggOracleCommittee` is true
- ✅ **AgglayerBridgeL2**: Deployed with manual proxy deployment and separate initialization
- ✅ **AgglayerGERL2**: Deployed with atomic proxy initialization

### AggOracleCommittee Integration

When `useAggOracleCommittee` is enabled:

1. **AggOracleCommittee** is deployed with the pre-calculated GER Manager address
2. **AggOracleCommittee address** becomes the `globalExitRootUpdater` for the GER Manager
3. **Oracle members** can propose global exit roots that are consolidated when quorum is reached
4. **Ownership** of the AggOracleCommittee is set to the specified `aggOracleOwner`

**Without AggOracleCommittee:**

- `globalExitRootUpdater` from configuration is used directly

**With AggOracleCommittee:**

- `globalExitRootUpdater` from configuration **must not be set**
- AggOracleCommittee address automatically becomes the `globalExitRootUpdater`

### Circular Dependency Handling

Since Bridge and GER Manager reference each other, we use deterministic address pre-calculation:

1. **Pre-calculate Bridge address** using `ethers.getCreateAddress()` based on deployer address and nonce
2. **Deploy GER Manager** with the pre-calculated Bridge address
3. **Deploy Bridge** with the actual GER Manager address
4. **Verify addresses match** - confirms the pre-calculation was correct

**Technical Details:**

- Uses `deployer.getNonce()` to get current nonce
- Bridge proxy deploys at calculated nonce position
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
        "chainID": 1001, // EVM chain ID of the outpost
        "rollupID": 1001, // Agglayer network ID (rollup ID): bridge networkID and gas token derivation
        "networkName": "OutpostChain",
        "tokenName": "baseETH", // Gas token metadata: name of the native coin
        "tokenSymbol": "BETH", // Gas token metadata: symbol of the native coin
        "tokenDecimals": 18 // Gas token metadata: decimals of the native coin
    }
}
```

**Automated Parameters:**

- 🤖 `gasTokenAddress`: **Auto-calculated** from `rollupID` by repeating it 5× to create a 160-bit address
- 🤖 `gasTokenNetwork`: **Auto-set** to the `rollupID` value (not the `chainID`)
- 🤖 `gasTokenMetadata`: **Auto-encoded** as `abi.encode(tokenName, tokenSymbol, tokenDecimals)`
- 🤖 `sovereignWETHAddress`: **Auto-set** to `0x0` (with `sovereignWETHAddressIsNotMintable = false`), so the bridge deploys its own WETH token
- 🤖 `proxiedTokensManager`: **Auto-set** to the Timelock contract address (proxy owner)

**Note**: `tokenName`, `tokenSymbol` and `tokenDecimals` describe the outpost's **native coin (gas token)**, not the WETH token. Do not set them to "Wrapped Ether"/"WETH". See [Gas Token Configuration](#gas-token-configuration) for what these values mean and why they matter.

**Example Gas Token Address Derivation:**

```
rollupID: 1001 → hex: 0x000003e9 → repeated 5×: 0x000003e9000003e9000003e9000003e9000003e9
rollupID: 63   → hex: 0x0000003f → repeated 5×: 0x0000003f0000003f0000003f0000003f0000003f
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
        "globalExitRootUpdater": "0x...", // Required ONLY if not using AggOracleCommittee
        "globalExitRootRemover": "0x..."
    }
}
```

### AggOracleCommittee Configuration _(Optional)_

```json
{
    "aggOracleCommittee": {
        "useAggOracleCommittee": true, // Set to true to deploy AggOracleCommittee
        "aggOracleOwner": "0x...", // Owner of the AggOracleCommittee (usually timelock)
        "aggOracleMembers": [
            "0x...", // Oracle member 1
            "0x...", // Oracle member 2
            "0x..." // Oracle member N
        ],
        "quorum": 2 // Minimum number of oracle members needed to consolidate a GER
    }
}
```

**AggOracleCommittee Parameters:**

- **`useAggOracleCommittee`**: Boolean flag to enable/disable AggOracleCommittee deployment
- **`aggOracleOwner`**: Address that will own the AggOracleCommittee contract (can add/remove members, change quorum)
- **`aggOracleMembers`**: Array of addresses that can propose global exit roots
- **`quorum`**: Minimum number of oracle members that must vote for a GER to be consolidated

**Important Constraints:**

- ✅ `quorum` must be ≥ 1 and ≤ number of `aggOracleMembers`
- ✅ All `aggOracleMembers` addresses must be unique and valid
- ✅ When `useAggOracleCommittee` is `true`, **do not set** `globalExitRootUpdater`
- ✅ When `useAggOracleCommittee` is `false`, `globalExitRootUpdater` **is required**

## Gas Token Configuration

> ⚠️ **This tool only supports the [native L2 token](#native-l2-token-what-this-tool-deploys) configuration.** The [external token](#external-token-not-supported-by-this-tool) configuration is described below for reference but cannot be deployed with this tool. The gas token is fixed at initialization (see [Immutability](#immutability)), so choose before deploying.

### What the parameters mean

The Agglayer bridge does not know what the outpost's native coin (the coin used to pay gas and sent as `msg.value`) is. `AgglayerBridgeL2.initialize` takes three parameters that declare which Agglayer token the native coin **is**:

- **`gasTokenAddress`**: address of the token on its origin network. `0x0` is reserved for ETH
- **`gasTokenNetwork`**: Agglayer network ID (rollup ID) where the token originates. `0` is Ethereum L1
- **`gasTokenMetadata`**: `abi.encode(string name, string symbol, uint8 decimals)`. Other networks use it to deploy the wrapped token the first time the native coin is claimed there

Every token in the Agglayer is identified by the pair `(originNetwork, originTokenAddress)`. On the outpost:

- **Bridging the native coin out**: `bridgeAsset` with `token = 0x0` and `msg.value = amount`. The coin stays locked in the bridge and the leaf is written with `originNetwork = gasTokenNetwork`, `originTokenAddress = gasTokenAddress` and `metadata = gasTokenMetadata`
- **Claiming the gas token**: a claim whose `(originNetwork, originTokenAddress)` equals `(gasTokenNetwork, gasTokenAddress)` is paid with native coin **transferred from the bridge balance** (nothing is minted). If the bridge does not hold enough native coin, the claim reverts with `EtherTransferFailed`

### How the tool sets them

```
gasTokenAddress      = rollupID as 4-byte hex, repeated 5×   (e.g. 63 → 0x0000003f0000003f0000003f0000003f0000003f)
gasTokenNetwork      = rollupID                              (the outpost's own network ID, not the EVM chainID)
gasTokenMetadata     = abi.encode(network.tokenName, network.tokenSymbol, network.tokenDecimals)
sovereignWETHAddress = 0x0, sovereignWETHAddressIsNotMintable = false
```

The derived `gasTokenAddress` is a convention, not a deployed contract. It only has to be non-zero (`0x0` means ETH and forces `gasTokenNetwork = 0`) and unique to the chain. What makes the native coin a native L2 token is `gasTokenNetwork = rollupID`.

### The WETH token

Because `gasTokenAddress != 0x0` and `sovereignWETHAddress = 0x0`, `initialize` deploys a wrapped token named `Wrapped Ether` / `WETH` / 18 decimals (the `WETH` address in the output file). It is the ERC20 representation of **L1 ETH** (origin network `0`, origin address `0x0`) on the outpost:

- Claims of L1 ETH (asset claims, and the value of message claims) mint WETH. They never pay out native coin
- Bridging WETH out burns it and writes a leaf with origin `(0, 0x0)`, so it is received as ETH on L1
- `bridgeMessage` with `msg.value` reverts (`NoValueInMessagesOnGasTokenNetworks`); use `bridgeMessageWETH` to send ETH value with a message

The bridge manager can later point WETH to a different token with `setSovereignWETHAddress`.

### Native L2 token (what this tool deploys)

`gasTokenNetwork = rollupID` declares that the native coin **originates on the outpost**. For the Agglayer it is a new token, unrelated to ETH, even if the chain calls its coin "ETH". Example: on the Base outpost on Bali (rollup 63), the native coin is `(63, 0x0000003f0000003f0000003f0000003f0000003f)`, shown on other chains as the wrapped token described by its metadata (e.g. `baseETH`).

Implications:

- **Bridging the native coin out creates a wrapped token on the destination** (e.g. a wrapped baseETH ERC20 on L1), deployed with `gasTokenMetadata`. Bridging that wrapped token back burns it, and the claim on the outpost releases the locked native coin
- **No liquidity pre-funding**: the native coin paid on claims is the native coin previously locked by bridging it out
- **Not limited by the local balance tree**: the bridge's `localBalanceTree` and the pessimistic proof skip tokens whose origin network is the chain itself, so users can bridge out any amount of native coin they hold
- **L1 ETH arrives as WETH (ERC20), not as gas**: users cannot pay gas with Agglayer-bridged ETH. They get native coin through the chain's own canonical/native bridge or the genesis allocation
- **Two "ETH-like" assets on each side**: the native coin and WETH on the outpost; ETH and the wrapped native coin on L1. Users and UIs must pick the right one
- **Choose the metadata carefully**: `tokenName`/`tokenSymbol`/`tokenDecimals` are what the wrapped native coin shows on every other chain. Amounts are bridged in the native coin's base unit without conversion, so `tokenDecimals` should match the native coin's decimals (`18`)
- **Fixed at initialization**: see [Immutability](#immutability)

### External token (not supported by this tool)

An external token configuration declares the native coin to be the representation of a token that originates on **another** network:

- **ETH**: `gasTokenAddress = 0x0`, `gasTokenNetwork = 0`. `gasTokenMetadata` is ignored and `sovereignWETHAddress` must be `0x0` with `sovereignWETHAddressIsNotMintable = false` (otherwise `initialize` reverts with `InvalidSovereignWETHAddressParams`). No WETH token is deployed: L1 ETH claims pay out native coin
- **An ERC20 from another network**: `gasTokenAddress` = the token address on its origin network, `gasTokenNetwork` = its origin network ID (`0` for Ethereum L1), `gasTokenMetadata` = the token's `abi.encode(name, symbol, decimals)`. The WETH token is deployed as above

Implications:

- **The native coin is not the origin token**: it is created by the chain's own mechanisms (genesis, canonical bridge). For example, Base's ETH is not L1 ETH: it is backed by Base's canonical bridge, not by the Agglayer bridge. The Agglayer bridge would treat both as interchangeable
- **The bridge acts as a liquidity pool**: claims of the origin token are paid with native coin from the bridge balance, so the bridge must be pre-funded with native coin. Claims revert with `EtherTransferFailed` while it is underfunded. The bridge contracts have no `receive`/`fallback`, so a plain native transfer cannot fund it, and `bridgeAsset` of the native coin cannot either (the local balance tree blocks it in this configuration). The current tooling does not cover funding
- **The local balance tree blocks bridging out**: the native coin counts as a token from another network, so bridging it out decreases its local balance tree entry. Both the bridge (`LocalBalanceTreeUnderflow`) and the pessimistic proof reject bridging out more than has been claimed in. Native coin obtained through other means (genesis, canonical bridge) cannot leave through the Agglayer until at least that amount has been claimed in
- **Backing mismatch**: the origin network only holds what was deposited through the Agglayer bridge. Without the local balance tree check, bridging out native coin declared as ETH would ask the L1 Agglayer bridge to release ETH it never received

Deploying an external token outpost requires initializing `AgglayerBridgeL2` with different values (with a different tool or procedure). This is out of scope for this tool.

### OP stack custom gas token pitfall

The OP stack's own custom gas token (CGT) settings configure the OP native bridge, not the Agglayer bridge. When the Agglayer bridge is the chain's bridge, the gas token is only what `AgglayerBridgeL2.initialize` declares. `gasTokenAddress = 0x0` with `gasTokenNetwork = 0` does **not** mean "no gas token" or "the chain's own coin": it declares the native coin to be **ETH**, with all the external token implications above.

### Immutability

`initialize` can only be called once, by the implementation deployer (`reinitializer(3)` and a `msg.sender == deployer` check, error `OnlyDeployer`), and there is no setter for `gasTokenAddress`, `gasTokenNetwork` or `gasTokenMetadata`. They cannot be changed after initialization without a contract upgrade (the bridge is a proxy owned via ProxyAdmin/Timelock).

### Further reading

- Runbook: [Deploy outpost, Setup GasToken](https://github.com/agglayer/runbooks/blob/main/operations/deploy-outpost.md#setup-gastoken)
- Protocol team docs: [Outposts](https://agglayer.github.io/protocol-team-docs/outposts/) and [Gas token](https://agglayer.github.io/protocol-team-docs/outposts/Gas-token/)

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
🤖 Auto-calculated gas token network: 1001 (using rollupID)
🤖 Auto-calculated proxied tokens manager: timelock address (set during deployment)

=== Step 1: Deploying TimelockController (OpenZeppelin) ===
✅ TimelockController (OpenZeppelin) deployed: 0xTimelockAddress123...

=== Step 2: Deploying ProxyAdmin with Timelock as owner ===
✅ ProxyAdmin deployed with Timelock as owner: 0xProxyAdminAddress...

=== Step 2.5: Deploying AggOracleCommittee ===
✅ AggOracleCommittee implementation deployed: 0xAggOracleImplementation...
✅ AggOracleCommittee proxy deployed and initialized: 0xAggOracleAddress789...
✅ Using AggOracleCommittee as globalExitRootUpdater: 0xAggOracleAddress789...

=== Step 3: Pre-calculating Bridge proxy address ===
📍 Pre-calculated Bridge proxy address: 0xPreCalculatedAddress...

=== Step 4: Deploying AgglayerGERL2 ===
✅ AgglayerGERL2 proxy (initialized): 0xGERManagerAddress...

=== Step 5: Deploying AgglayerBridgeL2 ===
🧮 Derived gas token address from rollupID 1001: 0x000003e9000003e9000003e9000003e9000003e9
✅ AgglayerBridgeL2 proxy (initialized): 0xPreCalculatedAddress...

=== Step 5.1: Verifying address prediction ===
✅ Address prediction successful! Bridge deployed at expected address: 0xPreCalculatedAddress...

🎉 Deployment completed successfully!
```

**The script will:**

1. ✅ Validate all deployment parameters (including AggOracleCommittee if enabled)
2. ✅ Deploy TimelockController contract
3. ✅ Deploy ProxyAdmin contract with Timelock as owner
4. ✅ Deploy AggOracleCommittee _(if enabled)_ and use it as globalExitRootUpdater
5. ✅ Pre-calculate Bridge proxy address using nonce prediction
6. ✅ Deploy AgglayerGERL2 with appropriate globalExitRootUpdater
7. ✅ Deploy AgglayerBridgeL2 with actual GER Manager address
8. ✅ Verify actual Bridge address matches pre-calculated address
9. ✅ Run verification tests (including AggOracleCommittee if deployed)
10. ✅ Generate deployment output JSON

### Output File

A JSON file `deploy_output_YYYY-MM-DD_HH-MM-SS.json` will be created with all deployment information:

**Without AggOracleCommittee:**

```json
{
    "deploymentDate": "2024-01-01 14:30:25",
    "network": {
        "chainID": 1001,
        "rollupID": 1001,
        "networkName": "OutpostChain",
        "gasTokenAddress": "0x000003e9000003e9000003e9000003e9000003e9",
        "gasTokenNetwork": 1001
    },
    "contracts": {
        "proxyAdminAddress": "0x...",
        "timelockAddress": "0x...",
        "bridgeL2SovereignChainAddress": "0x...",
        "bridgeL2SovereignChainImplementation": "0x...",
        "globalExitRootManagerL2SovereignChainAddress": "0x...",
        "globalExitRootManagerL2SovereignChainImplementation": "0x...",
        "wrappedTokenBytecodeStorer": "0x...",
        "wrappedTokenBridgeImplementation": "0x...",
        "WETH": "0x..."
    },
    "configuration": {
        "timelockDelay": 3600,
        "timelockAdmin": "0x...",
        "bridgeManager": "0x...",
        "emergencyBridgePauser": "0x...",
        "emergencyBridgeUnpauser": "0x...",
        "globalExitRootUpdater": "0x...", // From configuration
        "globalExitRootRemover": "0x..."
    }
}
```

**With AggOracleCommittee:**

```json
{
    "deploymentDate": "2024-01-01 14:30:25",
    "network": {
        "chainID": 1001,
        "rollupID": 1001,
        "networkName": "OutpostChain",
        "gasTokenAddress": "0x000003e9000003e9000003e9000003e9000003e9",
        "gasTokenNetwork": 1001
    },
    "contracts": {
        "proxyAdminAddress": "0x...",
        "timelockAddress": "0x...",
        "aggOracleCommitteeAddress": "0x...", // Added when AggOracleCommittee is deployed
        "aggOracleCommitteeImplementation": "0x...", // Added when AggOracleCommittee is deployed
        "bridgeL2SovereignChainAddress": "0x...",
        "bridgeL2SovereignChainImplementation": "0x...",
        "globalExitRootManagerL2SovereignChainAddress": "0x...",
        "globalExitRootManagerL2SovereignChainImplementation": "0x...",
        "wrappedTokenBytecodeStorer": "0x...",
        "wrappedTokenBridgeImplementation": "0x...",
        "WETH": "0x..."
    },
    "configuration": {
        "timelockDelay": 3600,
        "timelockAdmin": "0x...",
        "bridgeManager": "0x...",
        "emergencyBridgePauser": "0x...",
        "emergencyBridgeUnpauser": "0x...",
        "globalExitRootUpdater": "0x...", // AggOracleCommittee address (automatically used)
        "globalExitRootRemover": "0x...",
        "aggOracleCommittee": {
            // Added when AggOracleCommittee is deployed
            "useAggOracleCommittee": true,
            "aggOracleOwner": "0x...",
            "aggOracleMembers": ["0x...", "0x..."],
            "quorum": 2
        }
    }
}
```

## AggOracleCommittee Usage

### When to Use AggOracleCommittee

Use AggOracleCommittee when you want:

- **Decentralized GER Management**: Multiple oracle members can propose global exit roots
- **Consensus-Based Updates**: Require quorum of oracle members to consolidate GERs
- **Governance Control**: Owner can add/remove oracle members and adjust quorum
- **Security**: Prevents single point of failure for global exit root updates

### How AggOracleCommittee Works

1. **Oracle Members** call `proposeGlobalExitRoot(bytes32 ger)` to vote for a GER
2. **Quorum Reached**: When enough members vote for the same GER, it's automatically consolidated
3. **GER Consolidation**: The GER is sent to the AgglayerGERL2
4. **Owner Management**: Contract owner can add/remove members and change quorum

### Configuration Examples

**Simple 1-of-1 Oracle:**

```json
{
    "aggOracleCommittee": {
        "useAggOracleCommittee": true,
        "aggOracleOwner": "0xTimelock...",
        "aggOracleMembers": ["0xOracle1..."],
        "quorum": 1
    }
}
```

**Multi-signature 2-of-3 Oracle:**

```json
{
    "aggOracleCommittee": {
        "useAggOracleCommittee": true,
        "aggOracleOwner": "0xTimelock...",
        "aggOracleMembers": ["0xOracle1...", "0xOracle2...", "0xOracle3..."],
        "quorum": 2
    }
}
```

For additional support, check the deployment logs and output JSON file for detailed information about each deployed contract.
