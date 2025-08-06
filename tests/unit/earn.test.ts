import { Program, AnchorError, BN } from '@coral-xyz/anchor';
import { LiteSVM } from 'litesvm';
import { LiteSVMProvider } from 'anchor-litesvm';
import {
  PublicKey,
  Keypair,
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  TransactionInstruction,
} from '@solana/web3.js';
import {
  ACCOUNT_SIZE,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createInitializeImmutableOwnerInstruction,
  createAssociatedTokenAccountInstruction,
  createCloseAccountInstruction,
  getAccount,
  getAccountLen,
  getMint,
  getMintLen,
  getMinimumBalanceForRentExemptMultisig,
  getAssociatedTokenAddressSync,
  createInitializeAccountInstruction,
  createInitializeMultisigInstruction,
  createMintToCheckedInstruction,
  ExtensionType,
  getExtensionData,
  createApproveCheckedInstruction,
  createThawAccountInstruction,
  createFreezeAccountInstruction,
  AccountState,
} from '@solana/spl-token';
import { randomInt } from 'crypto';

import { MerkleTree, ProofElement } from '../../sdk/src/merkle';
import { Earn as EarnNew } from '../../target/types/earn_new_test';
import { Earn as EarnMigrate } from '../../target/types/earn_migrate_test';

const OLD_EARN_IDL = require('../../programs/earn/idls/old_earn.json');
const OLD_EARN_PROGRAM_ID = new PublicKey('MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c');
import { OldEarn } from '../programs/old_earn';

const PORTAL_PROGRAM_ID = new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY');
const EXT_SWAP_PROGRAM_ID = new PublicKey('MSwapi3WhNKMUGm9YrxGhypgUEt7wYQH3ZgG32XoWzH');

import {
  Comparison,
  createMintInstruction,
  InitializeScaledUiAmountConfigInstructionData,
  ScaledUiAmountConfig,
  ScaledUiAmountConfigLayout,
} from '../test-utils';

// Types for Earn tests
enum Variant {
  New = 'new',
  Migrate = 'migrate',
}

type Earn = EarnNew | EarnMigrate;

interface EarnGlobal {
  admin?: PublicKey;
  mMint?: PublicKey;
  portalAuthority?: PublicKey;
  earnerMerkleRoot?: number[];
  bump?: number;
}

// Earn test harness
class EarnTest<V extends Variant = Variant.New> {
  public variant: V;
  public svm: LiteSVM;
  public provider: LiteSVMProvider;
  public accounts: Record<string, PublicKey | null> = {};
  public earn: Program<Earn>;
  public portal: PublicKey;
  public admin: Keypair;
  public mMint: Keypair;
  public mMintAuthority: Keypair;
  public nonAdmin: Keypair;
  public mEarnerList: PublicKey[] = [];
  public earnerOne: Keypair;
  public earnerTwo: Keypair;
  public nonEarner: Keypair;
  public oldEarn?: Program<OldEarn>;
  public oldMMint?: Keypair;
  public oldMMintAuthority?: Keypair;

  constructor(variant: V, addresses: PublicKey[]) {
    this.variant = variant;
    const EARN_IDL = require(`../../target/idl/earn_${variant}_test.json`);

    // Initialize the SVM instance with all necessary configurations
    this.svm = new LiteSVM()
      .withSplPrograms() // Add SPL programs (including token programs)
      .withBuiltins() // Add builtin programs
      .withSysvars() // Setup standard sysvars
      .withPrecompiles() // Add standard precompiles
      .withBlockhashCheck(true); // Optional: disable blockhash checking for tests

    // Replace the default token2022 program with the (newer) one from the workspace
    this.svm.addProgramFromFile(TOKEN_2022_PROGRAM_ID, 'programs/spl_token_2022.so');

    // Add the earn program to the SVM instance
    this.svm.addProgramFromFile(new PublicKey(EARN_IDL.address), `../target/deploy/earn_${variant}_test.so`);

    // If the variant is 'migrate', we need to load the old earn program
    if (variant === Variant.Migrate) {
      this.svm.addProgramFromFile(OLD_EARN_PROGRAM_ID, 'programs/old_earn.so');
    }

    // Create an anchor provider from the liteSVM instance
    this.provider = new LiteSVMProvider(this.svm);

    // Create program instances
    this.earn = new Program<Earn>(EARN_IDL, this.provider);

    if (variant === Variant.Migrate) {
      this.oldEarn = new Program<OldEarn>(OLD_EARN_IDL, this.provider);
      this.oldMMint = new Keypair();
      this.oldMMintAuthority = new Keypair();
    }

    // Generate keypairs for various roles and fund them
    this.admin = new Keypair();
    this.portal = PORTAL_PROGRAM_ID;
    this.mMint = new Keypair();
    this.mMintAuthority = new Keypair();
    this.nonAdmin = new Keypair();
    this.earnerOne = new Keypair();
    this.earnerTwo = new Keypair();
    this.nonEarner = new Keypair();

    addresses = addresses.concat([
      this.admin.publicKey,
      this.mMintAuthority.publicKey,
      this.nonAdmin.publicKey,
      this.earnerOne.publicKey,
      this.earnerTwo.publicKey,
      this.nonEarner.publicKey,
    ]);

    for (const address of addresses) {
      this.svm.airdrop(address, BigInt(10 * LAMPORTS_PER_SOL));
    }
  }

  public async init(initialIndex: BN) {
    // If a migration, create the old M token and initialize the old earn program
    if (this.variant === Variant.Migrate) {
      await this.createMintWithMultisig(this.oldMMint!, this.oldMMintAuthority!);
      await this.oldEarn!.methods.initialize(this.admin.publicKey, initialIndex, new BN(0))
        .accounts({
          admin: this.admin.publicKey,
          mint: this.oldMMint!.publicKey,
        })
        .signers([this.admin])
        .rpc();
    }

    // Create the new M token mint
    await this.createMMint(this.mMint, this.mMintAuthority);
  }

  // Helper functions for token operations and checks on the SVM instance
  public async expectTokenBalance(
    tokenAccount: PublicKey,
    expectedBalance: BN,
    op: Comparison = Comparison.Equal,
    tolerance?: BN,
  ) {
    const balance = (await getAccount(this.provider.connection, tokenAccount, undefined, TOKEN_2022_PROGRAM_ID)).amount;

    switch (op) {
      case Comparison.GreaterThan:
        expect(balance).toBeGreaterThan(BigInt(expectedBalance.toString()));
        if (tolerance) {
          expect(balance).toBeLessThanOrEqual(BigInt(expectedBalance.add(tolerance).toString()));
        }
        break;
      case Comparison.GreaterThanOrEqual:
        expect(balance).toBeGreaterThanOrEqual(BigInt(expectedBalance.toString()));
        if (tolerance) {
          expect(balance).toBeLessThanOrEqual(BigInt(expectedBalance.add(tolerance).toString()));
        }
        break;
      case Comparison.LessThan:
        expect(balance).toBeLessThan(BigInt(expectedBalance.toString()));
        if (tolerance) {
          expect(balance).toBeGreaterThanOrEqual(BigInt(expectedBalance.sub(tolerance).toString()));
        }
        break;
      case Comparison.LessThanOrEqual:
        expect(balance).toBeLessThanOrEqual(BigInt(expectedBalance.toString()));
        if (tolerance) {
          expect(balance).toBeGreaterThanOrEqual(BigInt(expectedBalance.sub(tolerance).toString()));
        }
        break;
      default:
        if (tolerance) {
          expect(balance).toBeGreaterThanOrEqual(BigInt(expectedBalance.sub(tolerance).toString()));
          expect(balance).toBeLessThanOrEqual(BigInt(expectedBalance.add(tolerance).toString()));
        } else {
          expect(balance).toEqual(BigInt(expectedBalance.toString()));
        }
        break;
    }
  }

  public async expectTokenUiBalance(
    tokenAccount: PublicKey,
    expectedBalance: BN,
    op: Comparison = Comparison.Equal,
    tolerance?: BN,
  ) {
    const rawBalance = (await getAccount(this.provider.connection, tokenAccount, undefined, TOKEN_2022_PROGRAM_ID))
      .amount;

    const multiplier = (await this.getScaledUiAmountConfig(this.mMint.publicKey)).multiplier;

    const scale = 1e12;

    const uiBalance = (rawBalance * BigInt(Math.floor(multiplier * scale))) / BigInt(scale);

    switch (op) {
      case Comparison.GreaterThan:
        expect(uiBalance).toBeGreaterThan(BigInt(expectedBalance.toString()));
        if (tolerance) {
          expect(uiBalance).toBeLessThanOrEqual(BigInt(expectedBalance.add(tolerance).toString()));
        }
        break;
      case Comparison.GreaterThanOrEqual:
        expect(uiBalance).toBeGreaterThanOrEqual(BigInt(expectedBalance.toString()));
        if (tolerance) {
          expect(uiBalance).toBeLessThanOrEqual(BigInt(expectedBalance.add(tolerance).toString()));
        }
        break;
      case Comparison.LessThan:
        expect(uiBalance).toBeLessThan(BigInt(expectedBalance.toString()));
        if (tolerance) {
          expect(uiBalance).toBeGreaterThanOrEqual(BigInt(expectedBalance.sub(tolerance).toString()));
        }
        break;
      case Comparison.LessThanOrEqual:
        expect(uiBalance).toBeLessThanOrEqual(BigInt(expectedBalance.toString()));
        if (tolerance) {
          expect(uiBalance).toBeGreaterThanOrEqual(BigInt(expectedBalance.sub(tolerance).toString()));
        }
        break;
      default:
        if (tolerance) {
          expect(uiBalance).toBeGreaterThanOrEqual(BigInt(expectedBalance.sub(tolerance).toString()));
          expect(uiBalance).toBeLessThanOrEqual(BigInt(expectedBalance.add(tolerance).toString()));
        } else {
          expect(uiBalance).toEqual(BigInt(expectedBalance.toString()));
        }
        break;
    }
  }

  public async expectTokenAccountState(tokenAccount: PublicKey, expectedState: AccountState) {
    const tokenAccountState = await getAccount(
      this.provider.connection,
      tokenAccount,
      undefined,
      TOKEN_2022_PROGRAM_ID,
    );

    switch (expectedState) {
      case AccountState.Uninitialized:
        expect(tokenAccountState.isInitialized).toBe(false);
        expect(tokenAccountState.isFrozen).toBe(false);
        break;
      case AccountState.Initialized:
        expect(tokenAccountState.isInitialized).toBe(true);
        expect(tokenAccountState.isFrozen).toBe(false);
        break;
      case AccountState.Frozen:
        expect(tokenAccountState.isInitialized).toBe(true);
        expect(tokenAccountState.isFrozen).toBe(true);
        break;
      default:
        throw new Error(`Unknown account state: ${expectedState}`);
    }
  }

  public async createATA(mint: PublicKey, owner: PublicKey, use2022: boolean = true) {
    const tokenAccount = getAssociatedTokenAddressSync(
      mint,
      owner,
      true,
      use2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const createATA = createAssociatedTokenAccountInstruction(
      this.admin.publicKey, // payer
      tokenAccount, // ata
      owner, // owner
      mint, // mint
      use2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    let tx = new Transaction().add(createATA);

    await this.provider.sendAndConfirm!(tx, [this.admin]);

    return tokenAccount;
  }

  public async getATA(mint: PublicKey, owner: PublicKey, use2022: boolean = true) {
    // Check to see if the ATA already exists, if so return its key
    const tokenAccount = getAssociatedTokenAddressSync(
      mint,
      owner,
      true,
      use2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID,
    );

    const tokenAccountInfo = this.svm.getAccount(tokenAccount);

    if (!tokenAccountInfo) {
      await this.createATA(mint, owner, use2022);
    }

    return tokenAccount;
  }

  public async createTokenAccount(
    mint: PublicKey,
    owner: PublicKey,
    use2022: boolean = true,
    immutableOwner: boolean = false,
  ) {
    // We want to create a token account that is not the ATA
    const tokenAccount = new Keypair();
    const tokenAccountLen = use2022 && immutableOwner ? getAccountLen([ExtensionType.ImmutableOwner]) : ACCOUNT_SIZE;

    let ixs: TransactionInstruction[] = [];
    ixs.push(
      SystemProgram.createAccount({
        fromPubkey: this.admin.publicKey,
        newAccountPubkey: tokenAccount.publicKey,
        space: tokenAccountLen,
        lamports: await this.provider.connection.getMinimumBalanceForRentExemption(tokenAccountLen),
        programId: use2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      }),
    );
    if (use2022 && immutableOwner) {
      ixs.push(createInitializeImmutableOwnerInstruction(tokenAccount.publicKey, TOKEN_2022_PROGRAM_ID));
    }
    ixs.push(
      createInitializeAccountInstruction(
        tokenAccount.publicKey,
        mint,
        owner,
        use2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID,
      ),
    );

    let tx = new Transaction();
    tx.add(...ixs);

    await this.provider.sendAndConfirm!(tx, [this.admin, tokenAccount]);

    return { tokenAccount: tokenAccount.publicKey };
  }

  public async closeTokenAccount(owner: Keypair, tokenAccount: PublicKey) {
    const closeIx = createCloseAccountInstruction(
      tokenAccount,
      owner.publicKey,
      owner.publicKey,
      [],
      TOKEN_2022_PROGRAM_ID,
    );

    let tx = new Transaction().add(closeIx);

    await this.provider.sendAndConfirm!(tx, [owner]);
  }

  public async createMint(
    mint: Keypair,
    mintAuthority: PublicKey,
    use2022: boolean = true,
    decimals = 6,
    freezeAuthority?: PublicKey,
  ) {
    // Create and initialize mint account

    const tokenProgram = use2022 ? TOKEN_2022_PROGRAM_ID : TOKEN_PROGRAM_ID;
    const freezeAuth = freezeAuthority ?? this.getEarnGlobalAccount();

    const mintLen = getMintLen([]);
    const mintLamports = await this.provider.connection.getMinimumBalanceForRentExemption(mintLen);
    const createMintAccount = SystemProgram.createAccount({
      fromPubkey: this.admin.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: tokenProgram,
    });

    const initializeMint = createInitializeMintInstruction(
      mint.publicKey,
      decimals, // decimals
      mintAuthority, // mint authority
      freezeAuth, // freeze authority
      tokenProgram,
    );

    let tx = new Transaction();
    tx.add(createMintAccount, initializeMint);

    await this.provider.sendAndConfirm!(tx, [this.admin, mint]);

    // Verify the mint was created properly
    const mintInfo = await this.provider.connection.getAccountInfo(mint.publicKey);
    if (!mintInfo) {
      throw new Error('Mint account was not created');
    }

    return mint.publicKey;
  }

  public createInitializeScaledUiAmountConfigInstruction(
    mint: PublicKey,
    authority: PublicKey | null,
    multiplier: number,
    programId: PublicKey = TOKEN_2022_PROGRAM_ID,
  ): TransactionInstruction {
    const keys = [{ pubkey: mint, isSigner: false, isWritable: true }];

    const data = Buffer.alloc(InitializeScaledUiAmountConfigInstructionData.span);
    InitializeScaledUiAmountConfigInstructionData.encode(
      {
        instruction: 43, // scaled ui amount extension
        scaledUiAmountInstruction: 0, // initialize
        authority: authority ?? PublicKey.default,
        multiplier: multiplier,
      },
      data,
    );

    return new TransactionInstruction({ keys, programId, data });
  }

  public async createMMint(mint: Keypair, mintAuthority: Keypair, decimals = 6) {
    // Create and initialize mint account

    const ixs = await createMintInstruction(
      this.provider.connection,
      this.admin,
      mintAuthority.publicKey,
      this.getEarnGlobalAccount(),
      mint.publicKey,
      AccountState.Frozen,
    );

    let tx = new Transaction();
    tx.add(...ixs);

    await this.provider.sendAndConfirm!(tx, [this.admin, mint]);

    // Verify the mint was created properly
    const mintInfo = await this.provider.connection.getAccountInfo(mint.publicKey);
    if (!mintInfo) {
      throw new Error('Mint account was not created');
    }

    return mint.publicKey;
  }

  public async createScaledUiMint(mint: Keypair, mintAuthority: PublicKey, decimals = 6) {
    // Create and initialize mint account

    const tokenProgram = TOKEN_2022_PROGRAM_ID;

    const mintLen = getMintLen([ExtensionType.ScaledUiAmountConfig]);
    const mintLamports = await this.provider.connection.getMinimumBalanceForRentExemption(mintLen);
    const createMintAccount = SystemProgram.createAccount({
      fromPubkey: this.admin.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: tokenProgram,
    });

    const initializeScaledUiAmountConfig = this.createInitializeScaledUiAmountConfigInstruction(
      mint.publicKey,
      mintAuthority,
      1.0,
      tokenProgram,
    );

    const initializeMint = createInitializeMintInstruction(
      mint.publicKey,
      decimals, // decimals
      mintAuthority, // mint authority
      mintAuthority, // freeze authority
      tokenProgram,
    );

    let tx = new Transaction();
    tx.add(createMintAccount, initializeScaledUiAmountConfig, initializeMint);

    await this.provider.sendAndConfirm!(tx, [this.admin, mint]);

    // Verify the mint was created properly
    const mintInfo = await this.provider.connection.getAccountInfo(mint.publicKey);
    if (!mintInfo) {
      throw new Error('Mint account was not created');
    }

    return mint.publicKey;
  }

  public async getScaledUiAmountConfig(mint: PublicKey): Promise<ScaledUiAmountConfig> {
    const mintAccount = await getMint(this.provider.connection, mint, undefined, TOKEN_2022_PROGRAM_ID);
    const extensionData = getExtensionData(ExtensionType.ScaledUiAmountConfig, mintAccount.tlvData);
    if (extensionData === null) {
      throw new Error('Extension data not found');
    }

    return ScaledUiAmountConfigLayout.decode(extensionData);
  }

  public async createMintWithMultisig(mint: Keypair, mintAuthority: Keypair) {
    // Create and initialize multisig mint authority on the token program
    const multisigLen = 355;
    // const multisigLamports = await provider.connection.getMinimumBalanceForRentExemption(multisigLen);
    const multisigLamports = await getMinimumBalanceForRentExemptMultisig(this.provider.connection);

    const createMultisigAccount = SystemProgram.createAccount({
      fromPubkey: this.admin.publicKey,
      newAccountPubkey: mintAuthority.publicKey,
      space: multisigLen,
      lamports: multisigLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    const earnTokenAuthority = this.getEarnTokenAuthority();

    const initializeMultisig = createInitializeMultisigInstruction(
      mintAuthority.publicKey, // account
      [this.admin, earnTokenAuthority],
      1,
      TOKEN_2022_PROGRAM_ID,
    );

    let tx = new Transaction();
    tx.add(createMultisigAccount, initializeMultisig);

    await this.provider.sendAndConfirm!(tx, [this.admin, mintAuthority]);

    // Create and initialize mint account

    const mintLen = getMintLen([]);
    const mintLamports = await this.provider.connection.getMinimumBalanceForRentExemption(mintLen);
    const createMintWithMultisigAccount = SystemProgram.createAccount({
      fromPubkey: this.admin.publicKey,
      newAccountPubkey: mint.publicKey,
      space: mintLen,
      lamports: mintLamports,
      programId: TOKEN_2022_PROGRAM_ID,
    });

    const initializeMint = createInitializeMintInstruction(
      mint.publicKey,
      6, // decimals
      mintAuthority.publicKey, // mint authority
      null, // freeze authority
      TOKEN_2022_PROGRAM_ID,
    );

    tx = new Transaction();
    tx.add(createMintWithMultisigAccount, initializeMint);

    await this.provider.sendAndConfirm!(tx, [this.admin, mint]);

    // Verify the mint was created properly
    const mintInfo = await this.provider.connection.getAccountInfo(mint.publicKey);
    if (!mintInfo) {
      throw new Error('Mint account was not created');
    }

    return mint.publicKey;
  }

  public async mintM(to: PublicKey, amount: BN) {
    const toATA: PublicKey = await this.getATA(this.mMint.publicKey, to);

    // Check if the account is frozen, and if so, thaw it temporarily for minting
    const accountInfo = await getAccount(this.provider.connection, toATA, undefined, TOKEN_2022_PROGRAM_ID);
    const wasFrozen = accountInfo.isFrozen;

    if (wasFrozen) {
      await this.thawTokenAccount(toATA);
    }

    const mintToInstruction = createMintToCheckedInstruction(
      this.mMint.publicKey,
      toATA,
      this.mMintAuthority.publicKey,
      BigInt(amount.toString()),
      6,
      [],
      TOKEN_2022_PROGRAM_ID,
    );

    let tx = new Transaction();
    tx.add(mintToInstruction);
    await this.provider.sendAndConfirm!(tx, [this.mMintAuthority]);

    // Re-freeze the account if it was originally frozen
    if (wasFrozen) {
      await this.freezeTokenAccount(toATA);
    }
  }

  public async getTokenBalance(tokenAccount: PublicKey) {
    const tokenAccountInfo = await getAccount(this.provider.connection, tokenAccount, undefined, TOKEN_2022_PROGRAM_ID);
    if (!tokenAccountInfo) {
      throw new Error('Account not created');
    }

    return new BN(tokenAccountInfo.amount.toString());
  }

  public async getTokenUiBalance(tokenAccount: PublicKey, multiplier?: number) {
    const tokenAccountInfo = await getAccount(this.provider.connection, tokenAccount, undefined, TOKEN_2022_PROGRAM_ID);

    if (!tokenAccountInfo) {
      throw new Error('Account not created');
    }

    const mp = multiplier ?? (await this.getScaledUiAmountConfig(tokenAccountInfo.mint)).multiplier;

    const scale = 1e12;

    const uiBalance = (tokenAccountInfo.amount * BigInt(Math.floor(mp * scale))) / BigInt(scale);

    return new BN(uiBalance.toString());
  }

  public async getTokenSupply(mint: PublicKey) {
    const mintInfo = await getMint(this.provider.connection, mint, undefined, TOKEN_2022_PROGRAM_ID);
    if (!mintInfo) {
      throw new Error('Mint not found');
    }

    return new BN(Math.floor(Number(mintInfo.supply) * (await this.getCurrentMultiplier())));
  }

  public async approve(source: Keypair, delegate: PublicKey, mint: PublicKey, amount: BN) {
    const sourceATA: PublicKey = await this.getATA(mint, source.publicKey);

    const approveIx = createApproveCheckedInstruction(
      sourceATA,
      mint,
      delegate,
      source.publicKey,
      BigInt(amount.toString()),
      6, // decimals
      [],
      TOKEN_2022_PROGRAM_ID,
    );

    let tx = new Transaction();
    tx.add(approveIx);
    await this.provider.sendAndConfirm!(tx, [source]);

    return { sourceATA };
  }

  public async thawTokenAccount(tokenAccount: PublicKey) {
    // For testing purposes, we'll directly manipulate the account state using the SVM
    // In a real scenario, only the freeze authority (global account) can thaw the account
    const accountInfo = this.svm.getAccount(tokenAccount)!;

    // Token account state is at offset 108 for Token2022 accounts
    // AccountState: Uninitialized = 0, Initialized = 1, Frozen = 2
    // We set it to Initialized (1) to thaw it
    accountInfo.data[108] = 1;

    this.svm.setAccount(tokenAccount, accountInfo);
  }

  public async freezeTokenAccount(tokenAccount: PublicKey) {
    // For testing purposes, we'll directly manipulate the account state using the SVM
    // In a real scenario, only the freeze authority (global account) can freeze the account
    const accountInfo = this.svm.getAccount(tokenAccount)!;

    // Token account state is at offset 108 for Token2022 accounts
    // AccountState: Uninitialized = 0, Initialized = 1, Frozen = 2
    // We set it to Frozen (2) to freeze it
    accountInfo.data[108] = 2;

    this.svm.setAccount(tokenAccount, accountInfo);
  }

  // general SVM cheat functions
  public warp(seconds: BN, increment: boolean) {
    const clock = this.svm.getClock();
    clock.unixTimestamp = increment ? clock.unixTimestamp + BigInt(seconds.toString()) : BigInt(seconds.toString());
    this.svm.setClock(clock);
  }

  public currentTime(): BN {
    return new BN(this.svm.getClock().unixTimestamp.toString());
  }

  // Helper functions for Earn and MExt program PDAs
  public getEarnGlobalAccount(): PublicKey {
    const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], this.earn.programId);

    return globalAccount;
  }

  public getEarnTokenAuthority(): PublicKey {
    const [earnTokenAuthority] = PublicKey.findProgramAddressSync(
      [Buffer.from('token_authority')],
      this.earn.programId,
    );

    return earnTokenAuthority;
  }

  public getPortalTokenAuthority(): PublicKey {
    const [portalTokenAuthority] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], this.portal);

    return portalTokenAuthority;
  }

  public convertToMultiplier(index: BN): number {
    return index.toNumber() / 1e12;
  }

  public async getCurrentMultiplier(): Promise<number> {
    const scaledUiAmountConfig = await this.getScaledUiAmountConfig(this.mMint.publicKey);
    return scaledUiAmountConfig.multiplier;
  }

  // Utility functions for the tests
  public expectAccountEmpty(account: PublicKey) {
    const accountInfo = this.svm.getAccount(account);

    if (accountInfo) {
      expect(accountInfo.lamports).toBe(0);
      expect(accountInfo.data.length).toBe(0);
      expect(accountInfo.owner).toStrictEqual(SystemProgram.programId);
    }
  }

  public async expectAnchorError(txResult: Promise<string>, errCode: string) {
    try {
      await txResult;
      throw new Error('Transaction should have reverted');
    } catch (e) {
      if (!(e instanceof AnchorError)) throw new Error(`Expected AnchorError, got ${e}`);
      const err: AnchorError = e;
      expect(err.error.errorCode.code).toStrictEqual(errCode);
    }
  }

  public async expectSystemError(txResult: Promise<string>) {
    let reverted = false;
    try {
      await txResult;
    } catch (e) {
      // console.log(e.transactionMessage);
      // console.log(e.logs);
      reverted = true;
    } finally {
      expect(reverted).toBe(true);
    }
  }

  public async expectScaledUiAmountConfig(mint: PublicKey, expected: ScaledUiAmountConfig) {
    const state = await this.getScaledUiAmountConfig(mint);

    if (expected.authority) expect(state.authority).toEqual(expected.authority);
    if (expected.multiplier) {
      // account for javascript vs. rust floating point precision differences
      const exp_high = (Math.floor(expected.multiplier * 1e12) + 1) / 1e12;
      const exp_low = (Math.floor(expected.multiplier * 1e12) - 1) / 1e12;

      expect(state.multiplier).toBeGreaterThanOrEqual(exp_low);
      expect(state.multiplier).toBeLessThanOrEqual(exp_high);
    }
    if (expected.newMultiplierEffectiveTimestamp)
      expect(state.newMultiplierEffectiveTimestamp.toString()).toEqual(
        expected.newMultiplierEffectiveTimestamp.toString(),
      );
    if (expected.newMultiplier) {
      // account for javascript vs. rust floating point precision differences
      const exp_high = (Math.floor(expected.newMultiplier * 1e12) + 1) / 1e12;
      const exp_low = (Math.floor(expected.newMultiplier * 1e12) - 1) / 1e12;

      expect(state.newMultiplier).toBeGreaterThanOrEqual(exp_low);
      expect(state.newMultiplier).toBeLessThanOrEqual(exp_high);
    }
  }

  public async expectGlobalState(expected: EarnGlobal) {
    const state = await this.earn.account.earnGlobal.fetch(this.getEarnGlobalAccount());

    if (expected.admin) expect(state.admin).toEqual(expected.admin);
    if (expected.mMint) expect(state.mMint).toEqual(expected.mMint);
    if (expected.portalAuthority) expect(state.portalAuthority).toEqual(expected.portalAuthority);
    if (expected.earnerMerkleRoot) expect(state.earnerMerkleRoot).toEqual(expected.earnerMerkleRoot);
    if (expected.bump) expect(state.bump).toEqual(expected.bump);
  }

  createUniqueKeyArray = (size: number) => {
    return new Array(size).fill(PublicKey.default).map((_, i, arr) => {
      let key = PublicKey.unique();
      while (key.equals(PublicKey.default) || arr.includes(key)) {
        key = PublicKey.unique();
      }
      return key;
    });
  };

  padKeyArray = (array: PublicKey[], desiredLen: number) => {
    const currentLen = array.length;

    if (currentLen > desiredLen) {
      throw new Error('Array is too long');
    }

    const padding = new Array(desiredLen - currentLen).fill(PublicKey.default);
    return array.concat(padding);
  };

  // instruction convenience functions for earn program

  public async initializeEarn(initialIndex?: BN) {
    // Send the transaction
    switch (this.variant) {
      case Variant.New:
        await this.earn.methods
          .initialize(initialIndex!)
          .accounts({
            admin: this.admin.publicKey,
            mMint: this.mMint.publicKey,
          })
          .signers([this.admin])
          .rpc();
        break;
      case Variant.Migrate:
        await this.earn.methods
          .initialize()
          .accounts({
            admin: this.admin.publicKey,
            mMint: this.mMint.publicKey,
          })
          .signers([this.admin])
          .rpc();
        break;
      default:
        throw new Error(`Unknown variant: ${this.variant}`);
    }
  }

  public async propagateIndex(newIndex: BN, earnerMerkleRoot: number[] = ZERO_WORD) {
    // Send the instruction
    await this.earn.methods
      .propagateIndex(newIndex, earnerMerkleRoot)
      .accounts({
        signer: this.admin.publicKey,
      })
      .signers([this.admin])
      .rpc();
  }

  public async addRegistrarEarner(earner: PublicKey, proof: ProofElement[], earnerTokenAccount?: PublicKey) {
    // Get the earner ATA
    const tokenAccount = earnerTokenAccount ?? (await this.getATA(this.mMint.publicKey, earner));

    // Send the instruction
    await this.earn.methods
      .addRegistrarEarner(earner, proof)
      .accountsPartial({
        signer: this.nonAdmin.publicKey,
        userTokenAccount: tokenAccount,
      })
      .signers([this.nonAdmin])
      .rpc();
  }

  public async removeRegistrarEarner(
    earner: PublicKey,
    proofs: ProofElement[][],
    neighbors: PublicKey[],
    earnerTokenAccount?: PublicKey,
  ) {
    // Get the earner ATA
    const tokenAccount = earnerTokenAccount ?? (await this.getATA(this.mMint.publicKey, earner));

    // Send the instruction
    await this.earn.methods
      .removeRegistrarEarner(
        proofs,
        neighbors.map((n) => [...n.toBytes()].map((b) => Number(b))),
      )
      .accounts({
        signer: this.nonAdmin.publicKey,
        userTokenAccount: tokenAccount,
      })
      .signers([this.nonAdmin])
      .rpc();
  }
}

const ZERO_WORD = new Array(32).fill(0);

// Start parameters
// const initialSupply = new BN(100_000_000); // 100 tokens with 6 decimals
const initialIndex = new BN(1_000_000_000_000); // 1.0

// Merkle trees
let earnerMerkleTree: MerkleTree;

const VARIANTS: Variant[] = [Variant.New, Variant.Migrate];

for (const variant of VARIANTS) {
  let $: EarnTest<Variant>;

  describe(`Earn (${variant}) unit tests`, () => {
    beforeEach(async () => {
      // Create new extenstion test harness and then initialize it
      $ = new EarnTest(variant, []);
      await $.init(initialIndex);
    });

    describe('initialize unit tests', () => {
      // general test cases
      // [X] given the program is already initialized
      //   [X] it reverts with an account already initialized error
      // [X] given the global account does not match the seed + program ID
      //   [X] it reverts with a constraint seed error
      // [X] given the mint is not owned by the token2022 program
      //   [X] it reverts with a mint token program error
      // [X] given the portal token authority PDA does not match the seed + program ID
      //   [X] it reverts with a constraint seed error
      // [X] given the ext swap global PDA does not match the seed + program ID
      //   [X] it reverts with a constraint seed error
      // [ ] TODO: should we check all the token account constraints?
      // [X] given the mint does not have the scaled UI amount config extension enabled
      //   [X] it reverts with an invalid mint error
      // [X] given the mint does not have the default account state extension enabled
      //   [X] it reverts with an invalid mint error
      // [X] given the freeze authority for the mint is not the earn global account
      //   [X] it reverts with an invalid mint error

      // given the program is already initialized
      // it reverts with an account already initialized error
      test('Already initialized - reverts', async () => {
        // Initialize the earn program
        await $.initializeEarn(initialIndex);

        // Expire the blockhash so we can call it again
        await $.svm.expireBlockhash();

        // Try to initialize again
        if (variant === Variant.Migrate) {
          await $.expectSystemError(
            $.earn.methods
              .initialize()
              .accounts({
                admin: $.admin.publicKey,
                mMint: $.mMint.publicKey,
              })
              .signers([$.admin])
              .rpc(),
          );
        } else {
          await $.expectSystemError(
            $.earn.methods
              .initialize(initialIndex)
              .accounts({
                admin: $.admin.publicKey,
                mMint: $.mMint.publicKey,
              })
              .signers([$.admin])
              .rpc(),
          );
        }
      });

      // given the global account does not match the seed + program ID
      // it reverts with a constraint seed error
      test('Global account invalid - reverts', async () => {
        const wrongGlobalAccount = PublicKey.unique();
        if (wrongGlobalAccount.equals($.getEarnGlobalAccount())) {
          return; // Skip if the wrong global account is actually the right one
        }

        if (variant === Variant.Migrate) {
          await $.expectSystemError(
            $.earn.methods
              .initialize()
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: $.mMint.publicKey,
                globalAccount: wrongGlobalAccount,
              })
              .signers([$.admin])
              .rpc(),
          );
        } else {
          await $.expectSystemError(
            $.earn.methods
              .initialize(initialIndex)
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: $.mMint.publicKey,
                globalAccount: wrongGlobalAccount,
              })
              .signers([$.admin])
              .rpc(),
          );
        }
      });

      // given the mint is not owned by the token2022 program
      // it reverts with a mint token program error
      test('Mint not owned by token2022 - reverts', async () => {
        // Create a mint that is not owned by the token2022 program
        const wrongMint = new Keypair();
        await $.createMint(wrongMint, $.mMintAuthority.publicKey, false);

        if (variant === Variant.Migrate) {
          await $.expectAnchorError(
            $.earn.methods
              .initialize()
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: wrongMint.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
              })
              .signers([$.admin])
              .rpc(),
            'InvalidProgramId',
          );
        } else {
          await $.expectAnchorError(
            $.earn.methods
              .initialize(initialIndex)
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: wrongMint.publicKey,
                tokenProgram: TOKEN_PROGRAM_ID,
              })
              .signers([$.admin])
              .rpc(),
            'InvalidProgramId',
          );
        }
      });

      // given the portal token authority PDA does not match the seed + program ID
      // it reverts with a constraint seed error
      test('Portal token authority PDA invalid - reverts', async () => {
        const wrongPortalAuthority = PublicKey.unique();
        if (wrongPortalAuthority.equals($.getPortalTokenAuthority())) {
          return; // Skip if the wrong portal authority is actually the right one
        }

        if (variant === Variant.Migrate) {
          await $.expectSystemError(
            $.earn.methods
              .initialize()
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: $.mMint.publicKey,
                portalTokenAuthority: wrongPortalAuthority,
              })
              .signers([$.admin])
              .rpc(),
          );
        } else {
          await $.expectSystemError(
            $.earn.methods
              .initialize(initialIndex)
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: $.mMint.publicKey,
                portalTokenAuthority: wrongPortalAuthority,
              })
              .signers([$.admin])
              .rpc(),
          );
        }
      });

      // given the ext swap global PDA does not match the seed + program ID
      // it reverts with a constraint seed error
      test('Ext swap global PDA invalid - reverts', async () => {
        const actualExtSwapGlobal = PublicKey.findProgramAddressSync([Buffer.from('global')], EXT_SWAP_PROGRAM_ID)[0];
        const wrongExtSwapGlobal = PublicKey.unique();
        if (wrongExtSwapGlobal.equals(actualExtSwapGlobal)) {
          return; // Skip if the wrong ext swap global is actually the right one
        }

        if (variant === Variant.Migrate) {
          await $.expectSystemError(
            $.earn.methods
              .initialize()
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: $.mMint.publicKey,
                extSwapGlobal: wrongExtSwapGlobal,
              })
              .signers([$.admin])
              .rpc(),
          );
        } else {
          await $.expectSystemError(
            $.earn.methods
              .initialize(initialIndex)
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: $.mMint.publicKey,
                extSwapGlobal: wrongExtSwapGlobal,
              })
              .signers([$.admin])
              .rpc(),
          );
        }
      });

      // given the mint does not have the scaled UI amount config extension enabled
      // it reverts with an invalid mint error
      test('Mint does not have scaled UI amount config extension - reverts', async () => {
        // create a mint without the scaled UI amount config extension
        const wrongMint = new Keypair();
        await $.createMint(wrongMint, $.mMintAuthority.publicKey);

        if (variant === Variant.Migrate) {
          await $.expectAnchorError(
            $.earn.methods
              .initialize()
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: wrongMint.publicKey,
              })
              .signers([$.admin])
              .rpc(),
            'InvalidMint',
          );
        } else {
          await $.expectAnchorError(
            $.earn.methods
              .initialize(initialIndex)
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: wrongMint.publicKey,
              })
              .signers([$.admin])
              .rpc(),
            'InvalidMint',
          );
        }
      });

      // given the mint does not have the default account state extension enabled
      // it reverts with an invalid mint error
      test('Mint does not have default account state extension - reverts', async () => {
        // create a mint with scaled ui but without the default account state extension
        const wrongMint = new Keypair();
        await $.createScaledUiMint(wrongMint, $.mMintAuthority.publicKey);

        if (variant === Variant.Migrate) {
          await $.expectAnchorError(
            $.earn.methods
              .initialize()
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: wrongMint.publicKey,
              })
              .signers([$.admin])
              .rpc(),
            'InvalidMint',
          );
        } else {
          await $.expectAnchorError(
            $.earn.methods
              .initialize(initialIndex)
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: wrongMint.publicKey,
              })
              .signers([$.admin])
              .rpc(),
            'InvalidMint',
          );
        }
      });

      // given the freeze authority for the mint is not the earn global account
      // it reverts with an invalid mint error
      test('Mint freeze authority not earn global account - reverts', async () => {
        const mint = new Keypair();
        await $.createMint(mint, $.mMintAuthority.publicKey, true, 6, $.nonAdmin.publicKey);

        if (variant === Variant.Migrate) {
          await $.expectAnchorError(
            $.earn.methods
              .initialize()
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: mint.publicKey,
              })
              .signers([$.admin])
              .rpc(),
            'InvalidMint',
          );
        } else {
          await $.expectAnchorError(
            $.earn.methods
              .initialize(initialIndex)
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: mint.publicKey,
              })
              .signers([$.admin])
              .rpc(),
            'InvalidMint',
          );
        }
      });

      // new test cases
      // [X] given all the accounts are correct
      //   [X] the global account is created
      //     [X] the admin is set to the signer
      //     [X] the mint is set to the provided mint
      //     [X] the portal authority is set to the token authority PDA on the portal program
      //     [X] the earner merkle root is set to zero
      //     [X] the bump is set correctly
      //   [X] the M token's scaled UI amount config is updated
      //     [X] the new multiplier is set to provided current index
      //     [X] the new multiplier effective timestamp is set to the current timestamp
      //   [X] it thaws the following token accounts:
      //     [X] the portal M token account
      //     [X] the ext swap M token account

      // migrate test cases
      // [X] given the old global account does not match the seed + program ID
      //   [X] it reverts with a constraint seed error
      // [X] given all the accounts are correct
      //   [X] the global account is created
      //     [X] the admin is set to the signer
      //     [X] the mint is set to the provided mint
      //     [X] the portal authority is set to the token authority PDA on the portal program
      //     [X] the earner merkle root is set to zero
      //     [X] the bump is set correctly
      //   [X] the M token's scaled UI amount config is updated
      //     [X] the new multiplier is set to current index on the old global account
      //     [X] the new multiplier effective timestamp is set to timestamp on the old global account

      // migrate variant
      // given the old earn global account does not match the seed + program ID
      // it reverts with a constraint seed error
      if (variant === Variant.Migrate) {
        test('Old earn global account invalid - reverts', async () => {
          const actualGlobalAccount = PublicKey.findProgramAddressSync(
            [Buffer.from('global')],
            $.oldEarn!.programId,
          )[0];
          const wrongGlobalAccount = PublicKey.unique();
          if (wrongGlobalAccount.equals(actualGlobalAccount)) {
            return;
          }

          await $.expectSystemError(
            $.earn.methods
              .initialize()
              .accountsPartial({
                admin: $.admin.publicKey,
                mMint: $.mMint.publicKey,
                oldGlobalAccount: wrongGlobalAccount,
              })
              .signers([$.admin])
              .rpc(),
          );
        });
      }

      // given the admin signs the transaction
      // the global account is created and configured correctly
      test('Initialize earn program', async () => {
        // Calculate the global account and its bump
        const [, bump] = PublicKey.findProgramAddressSync([Buffer.from('global')], $.earn.programId);

        if (variant === Variant.Migrate) {
          // Create and send the transaction
          await $.earn.methods
            .initialize()
            .accounts({
              admin: $.admin.publicKey,
              mMint: $.mMint.publicKey,
            })
            .signers([$.admin])
            .rpc();
        } else {
          // Create and send the transaction
          await $.earn.methods
            .initialize(initialIndex)
            .accounts({
              admin: $.admin.publicKey,
              mMint: $.mMint.publicKey,
            })
            .signers([$.admin])
            .rpc();
        }

        // Verify the global state including zero-initialized Merkle roots
        await $.expectGlobalState({
          admin: $.admin.publicKey,
          mMint: $.mMint.publicKey,
          portalAuthority: $.getPortalTokenAuthority(),
          earnerMerkleRoot: ZERO_WORD,
          bump,
        });

        // Verify the scaled UI amount config is set to the current index
        await $.expectScaledUiAmountConfig($.mMint.publicKey, {
          authority: $.getEarnGlobalAccount(),
          multiplier: $.convertToMultiplier(initialIndex),
          newMultiplierEffectiveTimestamp: BigInt($.currentTime().toString()),
          newMultiplier: $.convertToMultiplier(initialIndex),
        });
      });
    });

    describe('propagate_index unit tests', () => {
      // test cases
      // [X] given the portal does not sign the transaction
      //   [X] the transaction fails with a not authorized error
      // [X] given the portal does sign the transaction
      //   [X] given the new index is less than the existing index
      //     [X] given the new earner merkle root is empty
      //       [X] it is not updated
      //     [X] given the new earner merkle is not empty
      //       [X] it is not updated
      //   [X] given the new index is greater than or equal to the existing index
      //     [X] given the new earner merkle root is empty
      //       [X] it is not updated
      //     [X] given the new earner merkle is not empty
      //       [X] it is updated
      //   [X] given the new index is greater than the existing index
      //     [X] the index is updated to the new index
      //   [X] given the new index is less than or equal to the existing index
      //     [X] the index is not updated

      beforeEach(async () => {
        // Initialize the program
        await $.initializeEarn(initialIndex);

        // Populate the earner merkle tree with the initial earners
        earnerMerkleTree = new MerkleTree([$.admin.publicKey, $.earnerOne.publicKey, $.earnerTwo.publicKey]);

        // Propagate the earner and earn manager merkle roots so they are set to non-zero values
        await $.propagateIndex(initialIndex, earnerMerkleTree.getRoot());
      });

      // given the portal does not sign the transaction
      // the transaction fails with an address constraint error
      test('Non-portal cannot update index - reverts', async () => {
        const newIndex = new BN(1_100_000_000_000);
        const newEarnerRoot = Array(32).fill(1);

        await $.expectAnchorError(
          $.earn.methods
            .propagateIndex(newIndex, newEarnerRoot)
            .accounts({
              signer: $.nonAdmin.publicKey,
            })
            .signers([$.nonAdmin])
            .rpc(),
          'NotAuthorized',
        );
      });

      // given new index is less than the existing index
      // given new earner merkle root is empty
      // nothing is updated
      test('new index < existing index, new earner root empty - earner root is not updated', async () => {
        // Try to propagate a new index with a lower value
        const lowerIndex = new BN(randomInt(0, initialIndex.toNumber()));
        const emptyEarnerRoot = ZERO_WORD;

        await $.propagateIndex(lowerIndex, emptyEarnerRoot);

        // Check the state
        await $.expectGlobalState({
          earnerMerkleRoot: earnerMerkleTree.getRoot(),
        });
      });

      // given new index is less than the existing index
      // given new earner merkle root is not empty
      // nothing is updated
      test('new index < existing index, new earner root not empty - earner root is not updated', async () => {
        // Try to propagate a new index with a lower value
        const lowerIndex = new BN(randomInt(0, initialIndex.toNumber()));
        const newEarnerRoot = new Array(32).fill(1);

        await $.propagateIndex(lowerIndex, newEarnerRoot);

        // Check the state
        await $.expectGlobalState({
          earnerMerkleRoot: earnerMerkleTree.getRoot(),
        });
      });

      // given new index is greater than or equal to the existing index
      // given new earner merkle root is empty
      // nothing is updated
      test('new index >= existing index, new earner root empty - earner root is not updated', async () => {
        // Try to propagate a new index with a higher value
        const higherIndex = new BN(randomInt(initialIndex.toNumber() + 1, initialIndex.toNumber() * 2));
        const emptyEarnerRoot = ZERO_WORD;

        await $.propagateIndex(higherIndex, emptyEarnerRoot);

        // Check the state
        await $.expectGlobalState({
          earnerMerkleRoot: earnerMerkleTree.getRoot(),
        });
      });

      // given new index is greater than or equal to the existing index
      // given new earner merkle root is not empty
      // earner merkle root is updated
      test('new index >= existing index, new earner root not empty - earner root is updated', async () => {
        // Try to propagate a new index with a higher value
        const higherIndex = new BN(randomInt(initialIndex.toNumber() + 1, initialIndex.toNumber() * 2));
        const newEarnerRoot = new Array(32).fill(1);

        await $.propagateIndex(higherIndex, newEarnerRoot);

        // Check the state
        await $.expectGlobalState({
          earnerMerkleRoot: newEarnerRoot,
        });
      });

      // given new index <= existing index
      // the index is not updated
      test('new index <= existing index - index is not updated', async () => {
        const startTime = BigInt($.currentTime().toString());

        // Update the index again with the same or lower value
        const newIndex = new BN(randomInt(0, initialIndex.toNumber()));
        await $.propagateIndex(newIndex);

        // Warp forward in time to be able to differentiate the multiplier timestamp
        $.warp(new BN(60), true);

        // Check that nothing was updated
        await $.expectScaledUiAmountConfig($.mMint.publicKey, {
          authority: $.getEarnGlobalAccount(),
          multiplier: $.convertToMultiplier(initialIndex),
          newMultiplier: $.convertToMultiplier(initialIndex),
          newMultiplierEffectiveTimestamp: startTime,
        });
      });

      // given new index > existing index
      // index is updated to the provided value and timestamp is updated to current timestamp
      test('new index > existing index - index and timestamp are updated', async () => {
        // Warp forward in time to be able to differentiate the multiplier timestamp
        $.warp(new BN(60), true);

        // Update the index again with a higher value
        const newIndex = new BN(randomInt(initialIndex.toNumber() + 1, initialIndex.toNumber() * 2));
        await $.propagateIndex(newIndex);

        // Check that the scaled ui config is updated with the latest index and timestamp
        await $.expectScaledUiAmountConfig($.mMint.publicKey, {
          authority: $.getEarnGlobalAccount(),
          multiplier: $.convertToMultiplier(newIndex),
          newMultiplier: $.convertToMultiplier(newIndex),
          newMultiplierEffectiveTimestamp: BigInt($.currentTime().toString()),
        });
      });
    });

    describe('add_registrar_earner unit tests', () => {
      // test cases
      // [X] given the earner tree is empty and the user is the zero value pubkey
      //   [X] it reverts with an InvalidParam error
      // [X] given the user token account is for the wrong token mint
      //   [X] it reverts with a constraint token mint error
      // [X] given the user token account is not for the user pubkey
      //   [X] it reverts with a constraint token owner error
      // [X] given the user token account is not initialized
      //   [X] it reverts with an account not initialized error
      // [X] given the user token account has a mutable owner
      //   [X] it reverts with an mutable owner error
      // [ ] given the user token account state is already thawed
      //   [ ] it reverts with an invalid account error
      // [X] given the earner account is already initialized
      //   [X] it reverts with an account already initialized error
      // [X] given all the accounts are valid
      //   [X] given the merkle proof for the user in the earner list is invalid
      //     [X] it reverts with an InvalidProof error
      //   [X] given the merkle proof for the user in the earner list is valid
      //     [X] it creates the earner account
      //     [X] it sets the earner account's user to the provided pubkey
      //     [X] it sets the earner account's user_token_account to the provided token account
      //     [X] it sets the earner account's last_claim_index to the current index

      beforeEach(async () => {
        // Initialize the program
        await $.initializeEarn(initialIndex);

        // Populate the earner merkle tree with the initial earners
        earnerMerkleTree = new MerkleTree([$.admin.publicKey, $.earnerOne.publicKey, $.earnerTwo.publicKey]);

        // Propagate a new index to set the merkle root
        await $.propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot());
      });

      test('Earner tree is empty and user is zero value - reverts', async () => {
        // Remove all earners from the merkle tree
        earnerMerkleTree = new MerkleTree([]);

        // Propagate the new merkle root
        await $.propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot());

        // Get the ATA for the zero value pubkey
        const zeroATA = await $.getATA($.mMint.publicKey, PublicKey.default);

        // Get the inclusion proof for the zero value pubkey in the earner merkle tree
        const { proof } = earnerMerkleTree.getInclusionProof(PublicKey.default);

        // Attempt to add earner with empty tree and zero value pubkey
        await $.expectAnchorError(
          $.earn.methods
            .addRegistrarEarner(PublicKey.default, proof)
            .accounts({
              signer: $.nonAdmin.publicKey,
              userTokenAccount: zeroATA,
            })
            .signers([$.nonAdmin])
            .rpc(),
          'InvalidParam',
        );
      });

      // given the user token account is for the wrong token mint
      // it reverts with a constraint token mint error
      test('User token account is for the wrong token mint - reverts', async () => {
        // Create a new token mint
        const wrongMint = new Keypair();
        await $.createMint(wrongMint, $.nonAdmin.publicKey);

        // Get earner one ATA for the wrong mint
        const wrongATA = await $.getATA(wrongMint.publicKey, $.earnerOne.publicKey);

        // Get the inclusion proof for earner one in the earner merkle tree
        const { proof } = earnerMerkleTree.getInclusionProof($.earnerOne.publicKey);

        // Attempt to add earner with wrong token mint
        await $.expectAnchorError(
          $.earn.methods
            .addRegistrarEarner($.earnerOne.publicKey, proof)
            .accountsPartial({
              signer: $.nonAdmin.publicKey,
              mMint: wrongMint.publicKey,
              userTokenAccount: wrongATA,
            })
            .signers([$.nonAdmin])
            .rpc(),
          'InvalidAccount',
        );
      });

      // given the user token account is not owned by the user pubkey
      // it reverts with a constraint token owner error
      test('User token account authority does not match user pubkey - reverts', async () => {
        // Get the ATA for a random user
        const randomATA = await $.getATA($.mMint.publicKey, $.nonAdmin.publicKey);

        // Get the inclusion proof for earner one in the earner merkle tree
        const { proof } = earnerMerkleTree.getInclusionProof($.earnerOne.publicKey);

        // Attempt to add earner with wrong token owner
        await $.expectAnchorError(
          $.earn.methods
            .addRegistrarEarner($.earnerOne.publicKey, proof)
            .accounts({
              signer: $.nonAdmin.publicKey,
              userTokenAccount: randomATA,
            })
            .signers([$.nonAdmin])
            .rpc(),
          'ConstraintTokenOwner',
        );
      });

      // given the user token account is not initialized
      // it reverts with an account not initialized error
      test('User token account is not initialized - reverts', async () => {
        // Calculate the ATA for earner one, but don't create it
        const nonInitATA = getAssociatedTokenAddressSync(
          $.mMint.publicKey,
          $.earnerOne.publicKey,
          true,
          TOKEN_2022_PROGRAM_ID,
          ASSOCIATED_TOKEN_PROGRAM_ID,
        );

        // Get the inclusion proof for earner one in the earner merkle tree
        const { proof } = earnerMerkleTree.getInclusionProof($.earnerOne.publicKey);

        // Attempt to add earner with uninitialized token account
        await $.expectAnchorError(
          $.earn.methods
            .addRegistrarEarner($.earnerOne.publicKey, proof)
            .accounts({
              signer: $.nonAdmin.publicKey,
              userTokenAccount: nonInitATA,
            })
            .signers([$.nonAdmin])
            .rpc(),
          'AccountNotInitialized',
        );
      });

      // given the user token account is already thawed
      // it reverts with an invalid account error
      test('User token account already thawed - reverts', async () => {
        // Get the ATA for earner one
        const earnerOneATA = await $.getATA($.mMint.publicKey, $.earnerOne.publicKey);

        // Get the inclusion proof for earner one in the earner merkle tree
        const { proof } = earnerMerkleTree.getInclusionProof($.earnerOne.publicKey);

        // Add earner one to the earn manager's list
        await $.addRegistrarEarner($.earnerOne.publicKey, proof);

        // Attempt to add earner with already initialized account
        await $.expectSystemError(
          $.earn.methods
            .addRegistrarEarner($.earnerOne.publicKey, proof)
            .accounts({
              signer: $.nonAdmin.publicKey,
              userTokenAccount: earnerOneATA,
            })
            .signers([$.nonAdmin])
            .rpc(),
        );
      });

      test('User token account has mutable owner - reverts', async () => {
        const tokenAccountKeypair = Keypair.generate();
        const tokenAccountLen = getAccountLen([]);
        const lamports = await $.provider.connection.getMinimumBalanceForRentExemption(tokenAccountLen);

        // Create token account without the immutable owner extension
        const transaction = new Transaction().add(
          SystemProgram.createAccount({
            fromPubkey: $.nonAdmin.publicKey,
            newAccountPubkey: tokenAccountKeypair.publicKey,
            space: tokenAccountLen,
            lamports,
            programId: TOKEN_2022_PROGRAM_ID,
          }),
          createInitializeAccountInstruction(
            tokenAccountKeypair.publicKey,
            $.mMint.publicKey,
            $.earnerOne.publicKey,
            TOKEN_2022_PROGRAM_ID,
          ),
        );

        await $.provider.send!(transaction, [$.nonAdmin, tokenAccountKeypair]);

        // Get the inclusion proof for the earner against the earner merkle tree
        const { proof } = earnerMerkleTree.getInclusionProof($.earnerOne.publicKey);

        await $.expectAnchorError(
          $.earn.methods
            .addRegistrarEarner($.earnerOne.publicKey, proof)
            .accountsPartial({
              signer: $.nonAdmin.publicKey,
              userTokenAccount: tokenAccountKeypair.publicKey,
            })
            .signers([$.nonAdmin])
            .rpc(),
          'MutableOwner',
        );
      });

      // given all the accounts are valid
      // given the merkle proof for the user in the earner list is invalid
      // it reverts with an InvalidProof error
      test('Invalid merkle proof for user inclusion - reverts', async () => {
        // Get the ATA for non earner one
        const nonEarnerOneATA = await $.getATA($.mMint.publicKey, $.nonEarner.publicKey);

        // Get the inclusion proof for earner one in the earner merkle tree
        const { proof } = earnerMerkleTree.getInclusionProof($.earnerOne.publicKey);

        // Attempt to add earner with invalid merkle proof
        await $.expectAnchorError(
          $.earn.methods
            .addRegistrarEarner($.nonEarner.publicKey, proof)
            .accounts({
              signer: $.nonAdmin.publicKey,
              userTokenAccount: nonEarnerOneATA,
            })
            .signers([$.nonAdmin])
            .rpc(),
          'InvalidProof',
        );
      });

      // given all the accounts are valid
      // given the merkle proof for the user in the earner list is valid
      // it creates the earner account
      // it sets the earner account's earn_manager to None
      // it sets the earner account's last_claim_index to the current index
      test('Add registrar earner - success', async () => {
        // Get the ATA for earner one
        const earnerOneATA = await $.getATA($.mMint.publicKey, $.earnerOne.publicKey);

        // Get the inclusion proof for earner one in the earner merkle tree
        const { proof } = earnerMerkleTree.getInclusionProof($.earnerOne.publicKey);

        // Add earner one to the earn manager's list
        await $.earn.methods
          .addRegistrarEarner($.earnerOne.publicKey, proof)
          .accounts({
            signer: $.nonAdmin.publicKey,
            userTokenAccount: earnerOneATA,
          })
          .signers([$.nonAdmin])
          .rpc();

        // Check that the token account has been thawed
        await $.expectTokenAccountState(earnerOneATA, AccountState.Initialized);
      });
    });

    describe('remove_registrar_earner unit tests', () => {
      // test cases
      // [X] given the user token account is not initialized
      //   [X] it reverts with an account not initialized error
      // [X] given the user token account is frozen
      //   [X] it reverts with an invalid account error
      // [X] given all the accounts are valid
      //   [X] given empty merkle proof for user exclusion
      //     [X] it reverts with an InvalidProof error
      //   [X] given the merkle proof for user's exclusion from the earner list is invalid
      //     [X] it reverts with an InvalidProof error
      //   [X] given the merkle proof for user's exclusion from the earner list is valid
      //     [X] it closes the earner account and refunds the rent to the signer

      beforeEach(async () => {
        // Initialize the program
        await $.initializeEarn(initialIndex);

        // Populate the earner merkle tree with the initial earners
        earnerMerkleTree = new MerkleTree([$.admin.publicKey, $.earnerOne.publicKey, $.earnerTwo.publicKey]);

        // Propagate a new index to set the merkle roots
        await $.propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot());

        // Register earner one
        const { proof } = earnerMerkleTree.getInclusionProof($.earnerOne.publicKey);
        await $.addRegistrarEarner($.earnerOne.publicKey, proof);

        // Register earner two
        const { proof: proofTwo } = earnerMerkleTree.getInclusionProof($.earnerTwo.publicKey);
        await $.addRegistrarEarner($.earnerTwo.publicKey, proofTwo);

        // Remove earner one from the earner merkle tree
        earnerMerkleTree.removeLeaf($.earnerOne.publicKey);

        // Update the earner merkle root on the global account
        await $.propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot());
      });

      // given the user token account is not initialized
      // it reverts with an account not initialized error
      test('User token account is not initialized - reverts', async () => {
        // Get the ATA for non earner one
        const nonEarnerOneATA = await $.getATA($.mMint.publicKey, $.nonEarner.publicKey);

        // Get the exclusion proof for non earner one against the earner merkle tree
        const { proofs, neighbors } = earnerMerkleTree.getExclusionProof($.nonEarner.publicKey);

        // Attempt to remove earner with uninitialized account
        await $.expectAnchorError(
          $.earn.methods
            .removeRegistrarEarner(proofs, neighbors)
            .accounts({
              signer: $.nonAdmin.publicKey,
              userTokenAccount: nonEarnerOneATA,
            })
            .signers([$.nonAdmin])
            .rpc(),
          'InvalidAccount',
        );
      });

      // given the user token account is frozen
      // it reverts with an invalid account error
      test('User token account is already frozen - reverts', async () => {
        // Get the ATA for non earner
        const nonEarnerOneATA = await $.getATA($.mMint.publicKey, $.nonEarner.publicKey);

        // Attempt to remove earner with frozen token account
        await $.expectAnchorError(
          $.earn.methods
            .removeRegistrarEarner([], [])
            .accounts({
              signer: $.nonAdmin.publicKey,
              userTokenAccount: nonEarnerOneATA,
            })
            .signers([$.nonAdmin])
            .rpc(),
          'InvalidAccount',
        );
      });

      // given all the accounts are valid
      // given no proofs or neighbors are provided
      // it reverts with an InvalidProof error
      test('Empty merkle proof for user exclusion - reverts', async () => {
        // Get the ATA for earner one
        const earnerOneATA = await $.getATA($.mMint.publicKey, $.earnerOne.publicKey);

        // Attempt to remove earner with invalid merkle proof
        await $.expectAnchorError(
          $.earn.methods
            .removeRegistrarEarner([], [])
            .accounts({
              signer: $.nonAdmin.publicKey,
              userTokenAccount: earnerOneATA,
            })
            .signers([$.nonAdmin])
            .rpc(),
          'InvalidProof',
        );
      });

      // given all the accounts are valid
      // given the merkle proof for user's exclusion from the earner list is invalid
      // it reverts with an InvalidProof error
      test('Invalid merkle proof for user exclusion - reverts', async () => {
        // Get the ATA for earner two
        const earnerTwoATA = await $.getATA($.mMint.publicKey, $.earnerTwo.publicKey);

        // Get the exclusion proof for earner one against the earner merkle tree
        const { proofs, neighbors } = earnerMerkleTree.getExclusionProof($.earnerOne.publicKey);

        // Attempt to remove earner with invalid merkle proof
        await $.expectAnchorError(
          $.earn.methods
            .removeRegistrarEarner(proofs, neighbors)
            .accounts({
              signer: $.nonAdmin.publicKey,
              userTokenAccount: earnerTwoATA,
            })
            .signers([$.nonAdmin])
            .rpc(),
          'InvalidProof',
        );
      });

      // given all the accounts are valid
      // given the merkle proof for user's exclusion from the earner list is valid
      // it closes the earner account and refunds the rent to the signer
      test('Remove registrar earner - success', async () => {
        // Get the ATA for earner one
        const earnerOneATA = await $.getATA($.mMint.publicKey, $.earnerOne.publicKey);

        // Expect the token account to be thawed before removal
        await $.expectTokenAccountState(earnerOneATA, AccountState.Initialized);

        // Get the exclusion proof for earner one against the earner merkle tree
        const { proofs, neighbors } = earnerMerkleTree.getExclusionProof($.earnerOne.publicKey);

        // Remove earner one from the earn manager's list
        await $.earn.methods
          .removeRegistrarEarner(proofs, neighbors)
          .accounts({
            signer: $.nonAdmin.publicKey,
            userTokenAccount: earnerOneATA,
          })
          .signers([$.nonAdmin])
          .rpc();

        // Verify the token account is now frozen
        await $.expectTokenAccountState(earnerOneATA, AccountState.Frozen);
      });

      test('Remove registrar earner ownership transfered - success', async () => {
        // Get the ATA for earner two
        const earnerTwoATA = await $.getATA($.mMint.publicKey, $.earnerTwo.publicKey);

        // Check that the token account is thawed before removal
        await $.expectTokenAccountState(earnerTwoATA, AccountState.Initialized);

        // Modify owner on token account
        const accountInfo = $.svm.getAccount(earnerTwoATA)!;
        accountInfo.data[32] = 0x1;
        $.svm.setAccount(earnerTwoATA, accountInfo);

        // Token account
        const account = await getAccount($.provider.connection, earnerTwoATA, undefined, TOKEN_2022_PROGRAM_ID);

        // Get the exclusion proof for earner two against the earner merkle tree
        const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(account.owner);

        // Remove earner one from the earn manager's list
        await $.earn.methods
          .removeRegistrarEarner(proofs, neighbors)
          .accounts({
            signer: $.nonAdmin.publicKey,
            userTokenAccount: earnerTwoATA,
          })
          .signers([$.nonAdmin])
          .rpc();

        // Verify the token account is frozen earner account was closed correctly
        await $.expectTokenAccountState(earnerTwoATA, AccountState.Frozen);
      });
    });

    describe('recover_m unit tests', () => {
      beforeEach(async () => {
        // Initialize the program
        await $.initializeEarn(initialIndex);
      });

      test('source_token_account not frozen - reverts', async () => {
        // Create source and destination token accounts
        const sourceAccount = await $.getATA($.mMint.publicKey, $.earnerOne.publicKey);
        const destinationAccount = await $.getATA($.mMint.publicKey, $.admin.publicKey);

        // Mint some tokens to the source account
        await $.mintM($.earnerOne.publicKey, new BN(1000));

        // Source account should be frozen by default due to M mint configuration
        // Thaw the source account to make it invalid for recover_m
        await $.thawTokenAccount(sourceAccount);

        // Attempt to recover from unfrozen source account should fail
        await $.expectAnchorError(
          $.earn.methods
            .recoverM(null)
            .accountsPartial({
              admin: $.admin.publicKey,
              sourceTokenAccount: sourceAccount,
              destinationTokenAccount: destinationAccount,
            })
            .signers([$.admin])
            .rpc(),
          'InvalidAccount',
        );
      });

      test('m_mint doesnt match stored value in global account - reverts', async () => {
        // Create a different mint
        const wrongMint = new Keypair();
        await $.createMint(wrongMint, $.mMintAuthority.publicKey);

        // Create source and destination token accounts for the wrong mint
        const sourceAccount = await $.getATA(wrongMint.publicKey, $.earnerOne.publicKey);
        const destinationAccount = await $.getATA(wrongMint.publicKey, $.admin.publicKey);

        // Attempt to recover with wrong mint should fail
        await $.expectSystemError(
          $.earn.methods
            .recoverM(null)
            .accountsPartial({
              admin: $.admin.publicKey,
              mMint: wrongMint.publicKey,
              sourceTokenAccount: sourceAccount,
              destinationTokenAccount: destinationAccount,
            })
            .signers([$.admin])
            .rpc(),
        );
      });

      test('token accounts are for the wrong mint - reverts', async () => {
        // Create a different mint
        const wrongMint = new Keypair();
        await $.createMint(wrongMint, $.admin.publicKey);

        // Create source and destination token accounts for the wrong mint
        const sourceAccount = await $.getATA(wrongMint.publicKey, $.earnerOne.publicKey);
        const destinationAccount = await $.getATA(wrongMint.publicKey, $.admin.publicKey);

        // Attempt to recover with token accounts for wrong mint should fail
        await $.expectAnchorError(
          $.earn.methods
            .recoverM(null)
            .accountsPartial({
              admin: $.admin.publicKey,
              sourceTokenAccount: sourceAccount,
              destinationTokenAccount: destinationAccount,
            })
            .signers([$.admin])
            .rpc(),
          'InvalidAccount',
        );
      });

      test('amount is more than source token balance - reverts', async () => {
        // Create source and destination token accounts
        const sourceAccount = await $.getATA($.mMint.publicKey, $.earnerOne.publicKey);
        const destinationAccount = await $.getATA($.mMint.publicKey, $.admin.publicKey);

        // Mint some tokens to the source account
        const sourceBalance = new BN(1000);
        await $.mintM($.earnerOne.publicKey, sourceBalance);

        // Attempt to recover more than available balance
        const excessiveAmount = sourceBalance.add(new BN(500));
        await $.expectSystemError(
          $.earn.methods
            .recoverM(excessiveAmount)
            .accountsPartial({
              admin: $.admin.publicKey,
              sourceTokenAccount: sourceAccount,
              destinationTokenAccount: destinationAccount,
            })
            .signers([$.admin])
            .rpc(),
        );
      });

      test('amount is None, transfers full balance - success', async () => {
        // Create source and destination token accounts
        const sourceAccount = await $.getATA($.mMint.publicKey, $.earnerOne.publicKey);
        const destinationAccount = await $.getATA($.mMint.publicKey, $.admin.publicKey);

        // Mint some tokens to the source account
        const sourceBalance = new BN(1000);
        await $.mintM($.earnerOne.publicKey, sourceBalance);

        // Get initial balances
        const initialSourceBalance = await $.getTokenBalance(sourceAccount);
        const initialDestBalance = await $.getTokenBalance(destinationAccount);

        // Execute recover_m with no amount (should transfer full balance)
        await $.earn.methods
          .recoverM(null)
          .accountsPartial({
            admin: $.admin.publicKey,
            sourceTokenAccount: sourceAccount,
            destinationTokenAccount: destinationAccount,
          })
          .signers([$.admin])
          .rpc();

        // Verify balances after recovery
        await $.expectTokenBalance(sourceAccount, new BN(0));
        await $.expectTokenBalance(destinationAccount, initialDestBalance.add(initialSourceBalance));

        // Verify account states
        await $.expectTokenAccountState(sourceAccount, AccountState.Frozen);
        await $.expectTokenAccountState(destinationAccount, AccountState.Initialized);
      });

      test('amount is less than or equal to source_token_balance - success', async () => {
        // Create source and destination token accounts
        const sourceAccount = await $.getATA($.mMint.publicKey, $.earnerOne.publicKey);
        const destinationAccount = await $.getATA($.mMint.publicKey, $.admin.publicKey);

        // Mint some tokens to the source account
        const sourceBalance = new BN(1000);
        await $.mintM($.earnerOne.publicKey, sourceBalance);

        // Get initial balances
        const initialSourceBalance = await $.getTokenBalance(sourceAccount);
        const initialDestBalance = await $.getTokenBalance(destinationAccount);

        // Execute recover_m with partial amount
        const transferAmount = new BN(600);
        await $.earn.methods
          .recoverM(transferAmount)
          .accountsPartial({
            admin: $.admin.publicKey,
            sourceTokenAccount: sourceAccount,
            destinationTokenAccount: destinationAccount,
          })
          .signers([$.admin])
          .rpc();

        // Verify balances after recovery
        const expectedSourceBalance = initialSourceBalance.sub(transferAmount);
        const expectedDestBalance = initialDestBalance.add(transferAmount);
        await $.expectTokenBalance(sourceAccount, expectedSourceBalance);
        await $.expectTokenBalance(destinationAccount, expectedDestBalance);

        // Verify account states
        await $.expectTokenAccountState(sourceAccount, AccountState.Frozen);
        await $.expectTokenAccountState(destinationAccount, AccountState.Initialized);
      });

      test('destination token account already thawed - success', async () => {
        // Create source and destination token accounts
        const sourceAccount = await $.getATA($.mMint.publicKey, $.earnerOne.publicKey);
        const destinationAccount = await $.getATA($.mMint.publicKey, $.admin.publicKey);

        // Mint some tokens to the source account
        const sourceBalance = new BN(1000);
        await $.mintM($.earnerOne.publicKey, sourceBalance);

        // Thaw destination account
        await $.thawTokenAccount(destinationAccount);

        // Get initial balances
        const initialSourceBalance = await $.getTokenBalance(sourceAccount);
        const initialDestBalance = await $.getTokenBalance(destinationAccount);

        // Execute recover_m
        const transferAmount = new BN(600);
        await $.earn.methods
          .recoverM(transferAmount)
          .accountsPartial({
            admin: $.admin.publicKey,
            sourceTokenAccount: sourceAccount,
            destinationTokenAccount: destinationAccount,
          })
          .signers([$.admin])
          .rpc();

        // Verify balances after recovery
        const expectedSourceBalance = initialSourceBalance.sub(transferAmount);
        const expectedDestBalance = initialDestBalance.add(transferAmount);
        await $.expectTokenBalance(sourceAccount, expectedSourceBalance);
        await $.expectTokenBalance(destinationAccount, expectedDestBalance);

        // Verify account states
        await $.expectTokenAccountState(sourceAccount, AccountState.Frozen);
        await $.expectTokenAccountState(destinationAccount, AccountState.Initialized);
      });

      test('destination token account frozen - success', async () => {
        // Create source and destination token accounts
        const sourceAccount = await $.getATA($.mMint.publicKey, $.earnerOne.publicKey);
        const destinationAccount = await $.getATA($.mMint.publicKey, $.admin.publicKey);

        // Mint some tokens to the source account
        const sourceBalance = new BN(1000);
        await $.mintM($.earnerOne.publicKey, sourceBalance);

        // Destination account should be frozen by default due to M mint configuration
        await $.expectTokenAccountState(destinationAccount, AccountState.Frozen);

        // Get initial balances
        const initialSourceBalance = await $.getTokenBalance(sourceAccount);
        const initialDestBalance = await $.getTokenBalance(destinationAccount);

        // Execute recover_m
        const transferAmount = new BN(600);
        await $.earn.methods
          .recoverM(transferAmount)
          .accountsPartial({
            admin: $.admin.publicKey,
            sourceTokenAccount: sourceAccount,
            destinationTokenAccount: destinationAccount,
          })
          .signers([$.admin])
          .rpc();

        // Verify balances after recovery
        const expectedSourceBalance = initialSourceBalance.sub(transferAmount);
        const expectedDestBalance = initialDestBalance.add(transferAmount);
        await $.expectTokenBalance(sourceAccount, expectedSourceBalance);
        await $.expectTokenBalance(destinationAccount, expectedDestBalance);

        // Verify account states
        await $.expectTokenAccountState(sourceAccount, AccountState.Frozen);
        await $.expectTokenAccountState(destinationAccount, AccountState.Initialized);
      });

      test('non-admin cannot recover - reverts', async () => {
        // Create source and destination token accounts
        const sourceAccount = await $.getATA($.mMint.publicKey, $.earnerOne.publicKey);
        const destinationAccount = await $.getATA($.mMint.publicKey, $.nonAdmin.publicKey);

        // Mint some tokens to the source account
        await $.mintM($.earnerOne.publicKey, new BN(1000));

        // Attempt to recover as non-admin should fail
        await $.expectAnchorError(
          $.earn.methods
            .recoverM(null)
            .accountsPartial({
              admin: $.nonAdmin.publicKey,
              sourceTokenAccount: sourceAccount,
              destinationTokenAccount: destinationAccount,
            })
            .signers([$.nonAdmin])
            .rpc(),
          'NotAuthorized',
        );
      });
    });
  });
}
