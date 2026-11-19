/**
 * Safe Multisig - Sign Transaction
 *
 * Signs a prepared Safe multisig transaction using EIP-712 typed data signing.
 * Reads transaction details from preparedTransaction.json and adds signature.
 *
 * Usage:
 *   npx hardhat run tools/safeMultisig/signSafeTransaction.ts --network mainnet
 *
 * Environment:
 *   SIGNER_INDEX       - Index of signer to use (default: 0)
 *   ALLOW_DELEGATECALL - Set to true to sign a DelegateCall to a target other than MultiSend / MultiSendCallOnly
 */
/* eslint-disable import/no-unresolved */
import path = require('path');
import fs = require('fs');
import * as dotenv from 'dotenv';
import { ethers } from 'hardhat';
import { logger } from '../../src/logger';
import { checkParams } from '../../src/utils';
import {
    EIP712_SAFE_TX_TYPE,
    MULTI_SEND_ADDRESS,
    MULTI_SEND_CALL_ONLY_ADDRESS,
    SAFE_ABI,
    SafeSignature,
    TransactionData,
    normalizeSignatureV,
    calculateSafeTxHash,
    loadTransactions,
    saveTransactions,
} from './safeUtils';

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

/* //////////////////////////////////////////////////////////////
                            CONSTANTS
////////////////////////////////////////////////////////////// */

const TRANSACTIONS_PATH = path.join(__dirname, './transactions.json');

/* //////////////////////////////////////////////////////////////
                            MAIN
////////////////////////////////////////////////////////////// */

async function main() {
    // ═══════════════════════════════════════════════════════════
    // LOAD TRANSACTION
    // ═══════════════════════════════════════════════════════════

    if (!fs.existsSync(TRANSACTIONS_PATH)) {
        throw new Error(
            `No transactions found.\nExpected: ${TRANSACTIONS_PATH}\n\nRun one of these first:\n` +
                `  - prepareTransaction.ts (for arbitrary transactions)\n` +
                `  - manageOwners.ts (for owner management)`,
        );
    }

    const transactions: TransactionData[] = loadTransactions(TRANSACTIONS_PATH);

    if (transactions.length === 0) {
        throw new Error('Transactions file is empty.');
    }

    // Select transaction to sign (default: latest)
    const txIndex = process.env.TX_INDEX ? parseInt(process.env.TX_INDEX, 10) : transactions.length - 1;

    if (txIndex >= transactions.length || txIndex < 0) {
        throw new Error(`Invalid TX_INDEX: ${txIndex}. Available: 0-${transactions.length - 1}`);
    }

    const transaction = transactions[txIndex];

    const mandatoryFields = ['safeAddress', 'safeTx'];
    checkParams(transaction, mandatoryFields, true);

    const { safeAddress, safeTx, description } = transaction;

    // ═══════════════════════════════════════════════════════════
    // DISPLAY CONFIGURATION
    // ═══════════════════════════════════════════════════════════

    logger.info('');
    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║           SAFE MULTISIG - SIGN TRANSACTION               ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info('Configuration:');
    logger.info(`  Safe Address: ${safeAddress}`);
    if (description) {
        logger.info(`  Description:  ${description} (unverified label from the transactions file: check To and Data)`);
    }

    // ═══════════════════════════════════════════════════════════
    // CONNECT TO NETWORK
    // ═══════════════════════════════════════════════════════════

    const { chainId } = await ethers.provider.getNetwork();
    logger.info(`  Chain ID:     ${chainId}`);
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // LOAD SAFE CONTRACT
    // ═══════════════════════════════════════════════════════════

    const safeContract = await ethers.getContractAt(SAFE_ABI, safeAddress);

    const [nonce, threshold, owners] = await Promise.all([
        safeContract.nonce(),
        safeContract.getThreshold(),
        safeContract.getOwners(),
    ]);

    logger.info('Safe Info:');
    logger.info(`  Nonce:     ${nonce}`);
    logger.info(`  Threshold: ${threshold}`);
    logger.info(`  Owners:    ${(owners as string[]).length}`);
    (owners as string[]).forEach((owner, i) => logger.info(`    [${i}] ${owner}`));
    logger.info('');

    // Validate nonce matches
    if (safeTx.nonce !== Number(nonce)) {
        logger.warn(`⚠️  Transaction nonce (${safeTx.nonce}) differs from current Safe nonce (${nonce})`);
        logger.warn('   The transaction may have already been executed or another transaction was processed.');
        logger.warn('');
    }

    // ═══════════════════════════════════════════════════════════
    // DISPLAY TRANSACTION
    // ═══════════════════════════════════════════════════════════

    logger.info('Transaction:');
    logger.info(`  To:        ${safeTx.to}`);
    logger.info(`  Value:     ${safeTx.value}`);
    logger.info(`  Operation: ${safeTx.operation === 0 ? 'Call' : 'DelegateCall'}`);
    logger.info(`  Nonce:     ${safeTx.nonce}`);
    logger.info(`  Data:      ${safeTx.data}`);
    logger.info('');

    // A DelegateCall runs the target code in the Safe context: only MultiSend batches are expected
    if (safeTx.operation !== 0) {
        const isMultiSend = [MULTI_SEND_ADDRESS, MULTI_SEND_CALL_ONLY_ADDRESS]
            .map((address) => address.toLowerCase())
            .includes(safeTx.to.toLowerCase());
        logger.warn(`⚠️  DelegateCall: ${safeTx.to} code runs with full control of the Safe`);
        if (!isMultiSend && process.env.ALLOW_DELEGATECALL !== 'true') {
            throw new Error(
                `DelegateCall to ${safeTx.to}, which is not MultiSend / MultiSendCallOnly. Set ALLOW_DELEGATECALL=true to sign it anyway.`,
            );
        }
        logger.warn('');
    }

    // Calculate EIP-712 hash
    const txHash = calculateSafeTxHash(safeAddress, safeTx, chainId);
    if (transaction.txHash && transaction.txHash.toLowerCase() !== txHash.toLowerCase()) {
        throw new Error(
            `Stored txHash ${transaction.txHash} does not match the transaction fields (${txHash}): the file was modified or the chain is wrong`,
        );
    }
    logger.info(`Transaction Hash: ${txHash}`);
    // What a Ledger shows when signing Safe EIP-712 typed data
    logger.info(`  Domain hash:  ${ethers.TypedDataEncoder.hashDomain({ verifyingContract: safeAddress, chainId })}`);
    logger.info(`  Message hash: ${ethers.TypedDataEncoder.hashStruct('SafeTx', EIP712_SAFE_TX_TYPE, safeTx)}`);
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // SELECT SIGNER
    // ═══════════════════════════════════════════════════════════

    const signers = await ethers.getSigners();
    const signerIndex = process.env.SIGNER_INDEX ? parseInt(process.env.SIGNER_INDEX, 10) : 0;

    if (signerIndex >= signers.length) {
        throw new Error(`Signer index ${signerIndex} out of range (available: ${signers.length})`);
    }

    const signer = signers[signerIndex];
    const signerAddress = await signer.getAddress();

    logger.info(`Signer: [${signerIndex}] ${signerAddress}`);

    // Verify signer is a Safe owner
    const isOwner = (owners as string[]).map((o) => o.toLowerCase()).includes(signerAddress.toLowerCase());

    if (!isOwner) {
        logger.error('⚠️  WARNING: This address is not a Safe owner!');
        process.exit(1);
    }
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // SIGN TRANSACTION
    // ═══════════════════════════════════════════════════════════

    logger.info('Signing transaction (confirm on device if using Ledger)...');

    const rawSignature = await signer.signTypedData(
        { verifyingContract: safeAddress, chainId },
        EIP712_SAFE_TX_TYPE,
        safeTx,
    );

    const signature = normalizeSignatureV(rawSignature);
    logger.info(`Signature: ${signature.slice(0, 20)}...${signature.slice(-10)}`);
    logger.info('');

    // ═══════════════════════════════════════════════════════════
    // SAVE SIGNATURE
    // ═══════════════════════════════════════════════════════════

    const safeSignature: SafeSignature = { signer: signerAddress, data: signature };

    // Check for duplicate signature
    const alreadySigned = transaction.signatures.some((s) => s.signer.toLowerCase() === signerAddress.toLowerCase());

    if (alreadySigned) {
        logger.warn('⚠️  You have already signed this transaction!');
        logger.info('');
        return;
    }

    // Add signature to the transaction
    transaction.signatures.push(safeSignature);

    // Save back to the same file
    saveTransactions(TRANSACTIONS_PATH, transactions);

    // ═══════════════════════════════════════════════════════════
    // SUMMARY
    // ═══════════════════════════════════════════════════════════

    const sigCount = transaction.signatures.length;
    const thresholdNum = Number(threshold);

    logger.info('╔══════════════════════════════════════════════════════════╗');
    logger.info('║                     SIGNATURE SAVED                      ║');
    logger.info('╚══════════════════════════════════════════════════════════╝');
    logger.info('');
    logger.info(`Progress: ${sigCount}/${thresholdNum} signatures`);
    logger.info('');
    logger.info('Signers:');
    transaction.signatures.forEach((s, i) => logger.info(`  [${i + 1}] ${s.signer}`));
    logger.info('');

    if (sigCount >= thresholdNum) {
        logger.info('✅ THRESHOLD REACHED - Ready to execute!');
        logger.info('   Run: npx hardhat run tools/safeMultisig/executeSafeTransaction.ts --network <network>');
    } else {
        logger.info(`⏳ Need ${thresholdNum - sigCount} more signature(s)`);
    }
    logger.info('');
    logger.info(`Output: ${TRANSACTIONS_PATH}`);
}

main().catch((e) => {
    logger.error(e);
    process.exit(1);
});
