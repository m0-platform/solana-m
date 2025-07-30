import path from 'path';
import {
  Commitment,
  Connection,
  GetAccountInfoConfig,
  Keypair,
  PublicKey,
  SendOptions,
  Signer,
  SystemProgram,
  Transaction,
  TransactionConfirmationStrategy,
  TransactionInstruction,
  VersionedTransaction,
} from '@solana/web3.js';
import fs from 'fs';
import { LiteSVMProvider } from 'anchor-litesvm';
import { FailedTransactionMetadata, LiteSVM, TransactionMetadata } from 'litesvm';
import { bs58 } from '@coral-xyz/anchor/dist/cjs/utils/bytes';
import { Wallet } from '@coral-xyz/anchor';
import {
  createInitializeMintInstruction,
  createInitializeScaledUiAmountConfigInstruction,
  createInitializeDefaultAccountStateInstruction,
  createInitializePermanentDelegateInstruction,
  ExtensionType,
  getMintLen,
  getScaledUiAmountConfig,
  TOKEN_2022_PROGRAM_ID,
  unpackMint,
  AccountState,
  getAssociatedTokenAddressSync,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createUpdateDefaultAccountStateInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
} from '@solana/spl-token';
import { struct, u8, f64 } from '@solana/buffer-layout';
import { publicKey, u64 } from '@solana/buffer-layout-utils';

export function loadKeypair(filePath: string): Keypair {
  const fullPath = path.resolve(filePath);
  const secretKey = Uint8Array.from(JSON.parse(fs.readFileSync(fullPath, 'utf-8')));
  return Keypair.fromSecretKey(secretKey);
}

export function toFixedSizedArray(buffer: Buffer, size: number): number[] {
  const array = new Array(size).fill(0);
  buffer.forEach((value, index) => {
    array[index] = value;
  });
  return array;
}

export async function fetchTransactionLogs(provider: LiteSVMProviderExt, txId: string): Promise<string[]> {
  const txn = await provider.client.getTransaction(bs58.decode(txId));
  return (txn as TransactionMetadata).logs() ?? (txn as FailedTransactionMetadata).meta().logs();
}

// Extend LiteSVMProvider with missing web3.js methods
export class LiteSVMProviderExt extends LiteSVMProvider {
  constructor(public client: LiteSVM, wallet?: Wallet) {
    super(client, wallet);

    this.connection.getLatestBlockhash = async () => ({
      blockhash: this.client.latestBlockhash(),
      lastValidBlockHeight: 10,
    });
    this.connection.getSlot = async (_) => Number(this.client.getClock().slot);

    // litesvm only has sendAndConfirm which will throw on error so we can assume confirmTransaction will always succeed
    this.connection.sendTransaction = async (
      tx: Transaction | VersionedTransaction,
      s?: Signer[] | SendOptions,
      _?: SendOptions,
    ) => this.sendAndConfirm!(tx, s as Signer[]);
    this.connection.confirmTransaction = async (_strat: TransactionConfirmationStrategy | string, _?: Commitment) => ({
      context: { slot: await this.connection.getSlot() },
      value: { err: null },
    });

    // send transaction and thow on error (because transaction immediately confirm)
    this.connection.sendRawTransaction = async (rawTransaction: Buffer, options?: SendOptions): Promise<string> => {
      let tx: Transaction | VersionedTransaction;
      let signature: string;
      try {
        tx = Transaction.from(rawTransaction);
        signature = bs58.encode(tx.signature!);
      } catch {
        tx = VersionedTransaction.deserialize(rawTransaction);
        signature = bs58.encode(tx.signatures[0]);
      }

      // send and check for error
      const result = this.client.sendTransaction(tx);
      if (result instanceof FailedTransactionMetadata) {
        throw new Error(result.meta().logs().join('\n'));
      }

      return signature;
    };

    // these are expected to return null and not throw an error if uninitialized
    this.connection.getAccountInfo = async (pk: PublicKey, _?: Commitment | GetAccountInfoConfig) => {
      const accountInfoBytes = this.client.getAccount(pk);
      return accountInfoBytes
        ? {
            ...accountInfoBytes,
            data: Buffer.from(accountInfoBytes.data ?? []),
          }
        : null;
    };
    this.connection.getAccountInfoAndContext = async (
      pk: PublicKey,
      _?: Commitment | GetAccountInfoConfig | undefined,
    ) => ({
      context: { slot: Number(this.client.getClock().slot) },
      value: await this.connection.getAccountInfo(pk),
    });
  }
}

export async function createMintInstruction(
  connection: Connection,
  payer: Keypair,
  mintAuth: PublicKey,
  extensionAuth: PublicKey,
  mint: PublicKey,
  defaultAccountState = AccountState.Initialized,
  vault?: PublicKey,
  mintTokens = false,
) {
  // mint size with extensions
  const mintLen = getMintLen([
    ExtensionType.ScaledUiAmountConfig,
    ExtensionType.DefaultAccountState,
    // ExtensionType.PermanentDelegate,
  ]);

  const lamports = await connection.getMinimumBalanceForRentExemption(mintLen);

  const instructions = [
    SystemProgram.createAccount({
      fromPubkey: payer.publicKey,
      newAccountPubkey: mint,
      space: mintLen,
      lamports,
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeScaledUiAmountConfigInstruction(mint, extensionAuth, 1.0, TOKEN_2022_PROGRAM_ID),
    createInitializeDefaultAccountStateInstruction(mint, AccountState.Initialized, TOKEN_2022_PROGRAM_ID),
    // createInitializePermanentDelegateInstruction(mint, payer.publicKey, TOKEN_2022_PROGRAM_ID),
    createInitializeMintInstruction(mint, 6, payer.publicKey, payer.publicKey, TOKEN_2022_PROGRAM_ID),
  ];

  const tokenAccount = getAssociatedTokenAddressSync(mint, payer.publicKey, false, TOKEN_2022_PROGRAM_ID);

  if (vault) {
    const vaultAccount = getAssociatedTokenAddressSync(mint, vault, true, TOKEN_2022_PROGRAM_ID);
    const ix = createAssociatedTokenAccountInstruction(
      payer.publicKey,
      vaultAccount,
      vault,
      mint,
      TOKEN_2022_PROGRAM_ID,
    );
    instructions.push(ix);
  }

  // Mint tokens to payer
  if (mintTokens) {
    instructions.push(
      createAssociatedTokenAccountInstruction(
        payer.publicKey,
        tokenAccount,
        payer.publicKey,
        mint,
        TOKEN_2022_PROGRAM_ID,
      ),
      createMintToInstruction(mint, tokenAccount, payer.publicKey, 10_000_000n, undefined, TOKEN_2022_PROGRAM_ID),
    );
  }

  if (defaultAccountState === AccountState.Frozen) {
    instructions.push(
      createUpdateDefaultAccountStateInstruction(
        mint,
        AccountState.Frozen,
        payer.publicKey,
        undefined,
        TOKEN_2022_PROGRAM_ID,
      ),
    );
  }

  // Set authorities
  instructions.push(
    createSetAuthorityInstruction(
      mint,
      payer.publicKey,
      AuthorityType.FreezeAccount,
      extensionAuth,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    ),
    createSetAuthorityInstruction(
      mint,
      payer.publicKey,
      AuthorityType.MintTokens,
      mintAuth,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    ),
  );

  return instructions;
}

export async function getScaledUIMult(connection: Connection, mint: PublicKey) {
  const accountInfo = await connection.getAccountInfo(mint);
  const unpackedMint = unpackMint(mint, accountInfo, TOKEN_2022_PROGRAM_ID);
  const extensionData = getScaledUiAmountConfig(unpackedMint);

  if (!extensionData) {
    return 1.0;
  }

  return extensionData.multiplier;
}

// Scaled UI Amount Config Extension Types and Functions since not supported in spl-token library yet
interface InitializeScaledUiAmountConfigData {
  instruction: 43;
  scaledUiAmountInstruction: 0;
  authority: PublicKey | null;
  multiplier: number;
}

export const InitializeScaledUiAmountConfigInstructionData = struct<InitializeScaledUiAmountConfigData>([
  u8('instruction'),
  u8('scaledUiAmountInstruction'),
  publicKey('authority'),
  f64('multiplier'),
]);

export interface ScaledUiAmountConfig {
  authority: PublicKey;
  multiplier: number;
  newMultiplierEffectiveTimestamp: bigint;
  newMultiplier: number;
}

export const ScaledUiAmountConfigLayout = struct<ScaledUiAmountConfig>([
  publicKey('authority'),
  f64('multiplier'),
  u64('newMultiplierEffectiveTimestamp'),
  f64('newMultiplier'),
]);

export enum Comparison {
  Equal,
  GreaterThan,
  GreaterThanOrEqual,
  LessThan,
  LessThanOrEqual,
}
