# Audit Genesis

`audit-genesis.ts` audits a sovereign chain genesis:

1. Checks the L2 node runs the chain the genesis was created for (its chainId must be the `chainID` in the genesis output), that the L1 RPC is the L1 the genesis was created against (`l1ChainID` in the genesis output, or its `network` for older outputs), and that its genesis block matches the `genesis.json` file (nonce, balance, bytecode and storage of every account).
2. Checks the L2 timelock gives all its roles to the `timelockParameters.adminAddress` **and to nobody else**, and that the timelock owns the L2 `ProxyAdmin` **from the genesis block** (`owner()` at `earliest` and `latest`). The ProxyAdmin is the only way to upgrade the L2 contracts.
   - `adminAddress` must not be the Polygon multisig, the zero address or the timelock itself (with the last two nobody could ever propose an L2 upgrade).
   - The genesis timelock storage must be exactly the one written by `createSovereignGenesis` (all roles to `adminAddress`, `TIMELOCK_ADMIN_ROLE` also to the timelock itself, `minDelay`). Any other slot fails the audit, and role members are identified when they are known addresses (genesis accounts, Polygon multisig).
   - On the live L2, `adminAddress` must hold every role, and the timelock `RoleGranted`/`RoleRevoked` events are replayed to catch roles granted to other addresses after the genesis. If the RPC rejects the full block range, the events are read in ranges of 10,000 blocks; if the complete history can not be read, the audit fails.
   - Every upgradeable proxy (any account with the EIP-1967 admin slot set, and every `* proxy` in `genesisSCNames`) must be administered by the `ProxyAdmin`, in the genesis and on the live L2. The only exception is the `WETH proxy` created on custom gas token chains, administered by the bridge `proxiedTokensManager` (from the genesis output).
3. Inspects the `adminAddress` on L1 to check that it can control the L2 timelock:
   - **EOA**: an address without bytecode is reported as *most probably an EOA* (chain state can not prove someone holds its key, e.g. a contract can end up without code): make sure you control its private key. EIP-7702 delegated EOAs are flagged.
   - **Safe**: the code at `adminAddress` must be an official Safe proxy (v1.3.0 `GnosisSafeProxy` or v1.4.1 `SafeProxy`), otherwise it is reported as a contract for manual review. Prints its current L1 configuration (all enabled modules included) and its **original setup** (threshold + owners from the `SafeSetup` event). The Safe singleton (the code the proxy delegates to) must be a trusted Safe v1.3.0/v1.4.1 implementation. Then it checks whether the Safe is deployed on the L2:
     - if deployed: the L2 code must be an official Safe proxy and its L2 singleton a trusted Safe implementation (otherwise its owners/threshold can not be trusted), and it prints its L2 configuration (threshold, owners, modules, guard).
     - the owners must be able to sign on L2 (the L2 Safe owners, or the original owners for a Safe not deployed yet): an owner without bytecode is most probably an EOA; a contract owner (e.g. another Safe) can only sign where it is deployed. Zero/sentinel owners (malformed owner list) can not sign. If the threshold is 0, or fewer owners than the threshold can sign on L2, the audit fails; contract owners are reported for manual review.
     - if not deployed: recovers its creation parameters (factory, singleton, initializer, saltNonce) and **simulates the exact original factory call on L2** (`eth_call`): it must succeed and return the Safe address. The factory must be an official Safe proxy factory (v1.3.0 or v1.4.1) on L2. The setup delegatecall must be none or the official `SafeToL2Setup`, and the singleton it switches to must be a trusted Safe implementation on L2; any other setup delegatecall, a creation callback (`createProxyWithCallback`) can change the Safe and can not be verified, so it fails. A setup payment (ETH or ERC-20) also fails: an ERC-20 payment calls the token during the setup, and an ETH payment is 0 in an `eth_call` simulation (gas price 0), so an unfunded Safe would pass it. If the creation can not be recovered (or the L1 RPC fails while recovering it), the audit fails.
   - RPC errors (timeouts, rate limits, server errors) while inspecting the admin fail the audit: they are never read as "not a Safe".
   - **Any other contract**: reported as a warning for manual review (code size, codeHash and whether it has code on L2).
4. Writes a markdown report `audit-genesis-${timestamp}.md` in this folder. Reports are git ignored.

> A Safe deployed on L2 at the same address gets its **original** owners & threshold, not the current L1 ones.

## Usage

Run from the repository root:

```bash
npx ts-node tools/auditGenesis/audit-genesis.ts \
    --l2-rpc <L2_RPC_URL> \
    --genesis <GENESIS_FILE> \
    --genesis-output <GENESIS_OUTPUT_FILE> \
    --l1-rpc <L1_RPC_URL>
```

## Parameters

- `--l2-rpc`: RPC of the L2 node started from the genesis.
- `--genesis`: genesis file. Accepted formats: geth `alloc`, a plain `{ [address]: account }` map, or repo-style `{ root, genesis: [...] }`.
- `--genesis-output`: the `output-rollupID-*.json` file written by [createSovereignGenesis](../createSovereignGenesis/). The tool reads `timelockParameters` and `genesisSCNames` from it.
- `--l1-rpc`: L1 RPC, used to inspect the `adminAddress`. Recovering a Safe original setup uses `eth_getLogs`. If the RPC limits the block range, the tool falls back to a binary search of the creation block, which needs an **archive** node.

### Example

```bash
npx ts-node tools/auditGenesis/audit-genesis.ts \
    --l2-rpc http://localhost:8545 \
    --genesis ./tools/createSovereignGenesis/genesis-rollupID-1__2025-01-01T00:00:00.000Z.json \
    --genesis-output ./tools/createSovereignGenesis/output-rollupID-1__2025-01-01T00:00:00.000Z.json \
    --l1-rpc https://mainnet.infura.io/v3/<INFURA_PROJECT_ID>
```

## Results

Each check is reported as:

- `PASS`: check succeeded.
- `WARN`: needs a manual review, e.g. a Safe not deployed on L2 yet, or L1 owners that changed since the Safe creation.
- `FAIL`: the genesis is wrong or the timelock admin can not be verified, e.g. a genesis mismatch, a missing or extra timelock role, a missing ProxyAdmin, the Polygon multisig set as admin, or a Safe that can not be deployed at the same address on L2.
- `INFO`: informational only.

RPC urls are shown in the report, the console and RPC error messages as scheme + host only (`https://mainnet.infura.io/***`), so API keys in the path, query string or credentials are never written.

## Tests

`test/src/audit-genesis.test.ts` (run by `npm run test`) boots local L1/L2 chains with anvil and audits genesis files built with the `createSovereignGenesis` helpers: EOA and Safe admins, wrong chainId, wrong L1 RPC, extra timelock roles, wrong proxy admin, Safe threshold 0, malformed owner list, nested Safe owners, creation callbacks and fake Safe proxies. No external RPC is needed. The tests are skipped when anvil ([Foundry](https://book.getfoundry.sh/getting-started/installation)) is not installed.

```bash
npx hardhat test test/src/audit-genesis.test.ts
```

## Exit Codes

- `0`: no `FAIL` checks (there may be warnings).
- `1`: at least one `FAIL` check, or a wrong input/RPC.

## Notes

- The genesis comparison uses `blockTag = "earliest"`, so it checks against the **genesis block**. The node must answer `eth_get*` calls at `earliest` (archive or genesis state kept); otherwise every account fails.
- The timelock and Safe checks on L2 use the `latest` block.
- The Safe creation parameters can only be recovered when the factory was called directly. Safes created through a relayer, a multicall or an ERC-4337 EntryPoint are reported as not verifiable.
- Safes created with `createChainSpecificProxyWithNonce` can not be deployed at the same address on another chain: the audit fails only if the Safe is not on L2 yet.
- **Limitation:** the bytecode of the genesis contracts (timelock, ProxyAdmin, proxies) is compared with the live L2, not authenticated against trusted compiled artifacts. Always audit a genesis produced by `createSovereignGenesis` from this repository.
- **Limitation:** the genesis comparison only reads the storage slots listed in the genesis file (contract storage can not be listed over RPC). A slot present in the live L2 genesis but missing from the file (e.g. an extra timelock role member, which emits no event) is not detected. Always audit the genesis file produced by `createSovereignGenesis` for that chain.
