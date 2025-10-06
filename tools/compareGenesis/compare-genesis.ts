/* eslint-disable no-console, no-await-in-loop, prettier/prettier, no-restricted-syntax */

import fs from "fs";
import { ethers } from "ethers";
import chalk from "chalk";

// ======= CONFIGURATION ======= //
const RPC_URL = process.argv[2];          // e.g., http://localhost:8545
const GENESIS_FILE = process.argv[3];     // e.g., ./genesis.json
const BLOCK_TAG = "earliest";             // Genesis block
// ============================= //

if (!RPC_URL || !GENESIS_FILE) {
  console.error("Usage: ts-node compare-genesis.ts <RPC_URL> <GENESIS_FILE>");
  process.exit(1);
}

const provider = new ethers.JsonRpcProvider(RPC_URL);

interface GenesisAccount {
  balance?: string;
  nonce?: string;
  code?: string;
  storage?: Record<string, string>;
}

interface CompareResult {
  address: string;
  nonce_match: boolean;
  balance_match: boolean;
  code_match: boolean;
  storage_mismatches: { slot: string; expected: string; actual: string }[];
}

async function compareAddressState(address: string, expected: GenesisAccount): Promise<CompareResult> {
  const result: CompareResult = {
    address,
    nonce_match: true,
    balance_match: true,
    code_match: true,
    storage_mismatches: [],
  };

  const [nonce, balance, code] = await Promise.all([
    provider.getTransactionCount(address, BLOCK_TAG),
    provider.getBalance(address, BLOCK_TAG),
    provider.getCode(address, BLOCK_TAG),
  ]);

  const expectedNonce = BigInt(expected.nonce || "0x0");
  const expectedBalance = BigInt(expected.balance || "0x0");
  const expectedCode = (expected.code || "0x").toLowerCase();

  // === Nonce ===
  result.nonce_match = BigInt(nonce) === expectedNonce;
  if (!result.nonce_match) {
    console.log(chalk.red(`✗ Nonce mismatch for ${address}`));
    console.log(`    Expected: ${chalk.yellow(expectedNonce.toString())}`);
    console.log(`    Got:      ${chalk.cyan(nonce.toString())}`);
  } else {
    console.log(chalk.green(`✓ Nonce OK for ${address}`));
  }

  // === Balance ===
  result.balance_match = balance.toString() === expectedBalance.toString();
  if (!result.balance_match) {
    console.log(chalk.red(`✗ Balance mismatch for ${address}`));
    console.log(`    Expected: ${chalk.yellow(expectedBalance.toString())}`);
    console.log(`    Got:      ${chalk.cyan(balance.toString())}`);
  } else {
    console.log(chalk.green(`✓ Balance OK for ${address}`));
  }

  // === Code ===
  result.code_match = code.toLowerCase() === expectedCode;
  if (!result.code_match) {
    console.log(chalk.red(`✗ Code mismatch for ${address}`));
    console.log(`    Expected: ${chalk.yellow(expectedCode.slice(0, 60))}...`);
    console.log(`    Got:      ${chalk.cyan(code.slice(0, 60))}...`);
  } else {
    console.log(chalk.green(`✓ Code OK for ${address}`));
  }

  // === Storage ===
  const storage = expected.storage || {};
  for (const [slot, expectedValue] of Object.entries(storage)) {
    // if your ethers build uses getStorage instead of getStorageAt, change this line accordingly
    const actual = await (provider as any).getStorage(address, slot, BLOCK_TAG);
    if (actual.toLowerCase() !== expectedValue.toLowerCase()) {
      result.storage_mismatches.push({ slot, expected: expectedValue, actual });
      console.log(chalk.red(`✗ Storage mismatch at slot ${slot} for ${address}`));
      console.log(`    Expected: ${chalk.yellow(expectedValue)}`);
      console.log(`    Got:      ${chalk.cyan(actual)}`);
    } else {
      console.log(chalk.green(`✓ Storage slot ${slot} OK for ${address}`));
    }
  }

  return result;
}

(async () => {
  let genesis: Record<string, GenesisAccount> = {};
  try {
    genesis = JSON.parse(fs.readFileSync(GENESIS_FILE, "utf8"));
  } catch (e: any) {
    console.error(chalk.bgRed.white(`Failed to parse genesis file: ${GENESIS_FILE}\n${e.message}`));
    process.exit(1);
  }

  const accounts = (genesis as any).alloc || genesis;
  const addresses = Object.keys(accounts);
  const results: CompareResult[] = [];

  for (const address of addresses) {
    console.log(chalk.blue.bold(`\n=== Checking ${address} ===`));
    try {
      const res = await compareAddressState(address, accounts[address]);
      results.push(res);
    } catch (e: any) {
      console.error(chalk.bgRed.white(`Error checking ${address}: ${e.message}`));
    }
  }

  console.log(chalk.bold("\n=== Summary ==="));
  for (const r of results) {
    console.log(`${chalk.bold(r.address)}:`);
    console.log(` - Nonce:   ${r.nonce_match ? chalk.green("OK") : chalk.red("Mismatch")}`);
    console.log(` - Balance: ${r.balance_match ? chalk.green("OK") : chalk.red("Mismatch")}`);
    console.log(` - Code:    ${r.code_match ? chalk.green("OK") : chalk.red("Mismatch")}`);
    console.log(` - Storage: ${r.storage_mismatches.length === 0 ? chalk.green("OK") : chalk.red(`${r.storage_mismatches.length} mismatches`)}`);
  }

  const hasMismatch = results.some(
    (r) =>
      !r.nonce_match ||
      !r.balance_match ||
      !r.code_match ||
      (r.storage_mismatches && r.storage_mismatches.length > 0)
  );

  process.exit(hasMismatch ? 1 : 0);
})();
