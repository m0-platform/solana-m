import { Program, AnchorError, BN } from '@coral-xyz/anchor';
import { LiteSVM } from 'litesvm';
import { fromWorkspace, LiteSVMProvider } from 'anchor-litesvm';
import { PublicKey, Keypair, LAMPORTS_PER_SOL, SystemProgram, Transaction } from '@solana/web3.js';
import {
  ACCOUNT_SIZE,
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMintInstruction,
  createAssociatedTokenAccountInstruction,
  getAccount,
  getMintLen,
  getMinimumBalanceForRentExemptMultisig,
  getAssociatedTokenAddressSync,
  createInitializeAccountInstruction,
  createInitializeMultisigInstruction,
  createMintToCheckedInstruction,
  createCloseAccountInstruction,
  getAccountLen,
} from '@solana/spl-token';
import { randomInt } from 'crypto';

import { MerkleTree, ProofElement } from '../../sdk/src/merkle';
import { loadKeypair } from '../test-utils';
import { Earn } from '../../target/types/earn';

const EARN_IDL = require('../../target/idl/earn.json');
const EARN_PROGRAM_ID = new PublicKey('MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c');

// Unit tests for earn program

const ZERO_WORD = new Array(32).fill(0);

// Setup wallets once at the beginning of the test suite
const admin: Keypair = loadKeypair('keys/admin.json');
const portal: Keypair = loadKeypair('keys/admin.json');
const mint: Keypair = loadKeypair('keys/mint.json');
const earnAuthority: Keypair = new Keypair();
const mintAuthority: Keypair = new Keypair();
const nonAdmin: Keypair = new Keypair();

// Create random addresses for testing
const earnerOne: Keypair = new Keypair();
const earnerTwo: Keypair = new Keypair();
const earnManagerOne: Keypair = new Keypair();
const earnManagerTwo: Keypair = new Keypair();
const nonEarnerOne: Keypair = new Keypair();
const nonEarnManagerOne: Keypair = new Keypair();
const yieldRecipient: Keypair = new Keypair();

let svm: LiteSVM;
let provider: LiteSVMProvider;
let accounts: Record<string, PublicKey | null> = {};
let earn: Program<Earn>;

// Start parameters
const initialSupply = new BN(100_000_000); // 100 tokens with 6 decimals
const initialIndex = new BN(1_000_000_000_000); // 1.0
const claimCooldown = new BN(86_400); // 1 day

// Merkle trees
let earnerMerkleTree: MerkleTree;

// Type definitions for accounts to make it easier to do comparisons

interface Global {
  admin?: PublicKey;
  earnAuthority?: PublicKey;
  mint?: PublicKey;
  index?: BN;
  timestamp?: BN;
  claimCooldown?: BN;
  maxSupply?: BN;
  maxYield?: BN;
  distributed?: BN;
  claimComplete?: boolean;
  earnerMerkleRoot?: number[];
}

interface Earner {
  lastClaimIndex?: BN;
  lastClaimTimestamp?: BN;
  user?: PublicKey;
  userTokenAccount?: PublicKey;
  bump?: number;
}

const getGlobalAccount = () => {
  const [globalAccount] = PublicKey.findProgramAddressSync([Buffer.from('global')], earn.programId);

  return globalAccount;
};

const getEarnTokenAuthority = () => {
  const [earnTokenAuthority] = PublicKey.findProgramAddressSync([Buffer.from('token_authority')], earn.programId);

  return earnTokenAuthority;
};

const getEarnerAccount = (tokenAccount: PublicKey) => {
  const [earnerAccount] = PublicKey.findProgramAddressSync(
    [Buffer.from('earner'), tokenAccount.toBuffer()],
    earn.programId,
  );

  return earnerAccount;
};

// Utility functions for the tests
const expectAccountEmpty = (account: PublicKey) => {
  const accountInfo = svm.getAccount(account);

  if (accountInfo) {
    expect(accountInfo.lamports).toBe(0);
    expect(accountInfo.data.length).toBe(0);
    expect(accountInfo.owner).toStrictEqual(SystemProgram.programId);
  }
};

const expectAnchorError = async (txResult: Promise<string>, errCode: string) => {
  try {
    await txResult;
    throw new Error('Transaction should have reverted');
  } catch (e) {
    if (!(e instanceof AnchorError)) throw new Error(`Expected AnchorError, got ${e}`);
    const err: AnchorError = e;
    expect(err.error.errorCode.code).toStrictEqual(errCode);
  }
};

const expectSystemError = async (txResult: Promise<string>) => {
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
};

const expectGlobalState = async (globalAccount: PublicKey, expected: Global) => {
  const state = await earn.account.global.fetch(globalAccount);

  if (expected.earnAuthority) expect(state.earnAuthority).toEqual(expected.earnAuthority);
  if (expected.index) expect(state.index.toString()).toEqual(expected.index.toString());
  if (expected.timestamp) expect(state.timestamp.toString()).toEqual(expected.timestamp.toString());
  if (expected.claimCooldown) expect(state.claimCooldown.toString()).toEqual(expected.claimCooldown.toString());
  if (expected.maxSupply) expect(state.maxSupply.toString()).toEqual(expected.maxSupply.toString());
  if (expected.maxYield) expect(state.maxYield.toString()).toEqual(expected.maxYield.toString());
  if (expected.distributed) expect(state.distributed.toString()).toEqual(expected.distributed.toString());
  if (expected.claimComplete !== undefined) expect(state.claimComplete).toEqual(expected.claimComplete);
  if (expected.earnerMerkleRoot) expect(state.earnerMerkleRoot).toEqual(expected.earnerMerkleRoot);
};

const expectEarnerState = async (earnerAccount: PublicKey, expected: Earner) => {
  const state = await earn.account.earner.fetch(earnerAccount);

  if (expected.lastClaimIndex) expect(state.lastClaimIndex.toString()).toEqual(expected.lastClaimIndex.toString());
  if (expected.lastClaimTimestamp)
    expect(state.lastClaimTimestamp.toString()).toEqual(expected.lastClaimTimestamp.toString());
  if (expected.user) expect(state.user).toEqual(expected.user);
  if (expected.userTokenAccount) expect(state.userTokenAccount).toEqual(expected.userTokenAccount);
};

const expectTokenBalance = async (tokenAccount: PublicKey, expectedBalance: BN) => {
  const balance = (await getAccount(provider.connection, tokenAccount, undefined, TOKEN_2022_PROGRAM_ID)).amount;

  expect(balance.toString()).toEqual(expectedBalance.toString());
};

const createATA = async (mint: PublicKey, owner: PublicKey) => {
  const tokenAccount = getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const createATA = createAssociatedTokenAccountInstruction(
    admin.publicKey, // payer
    tokenAccount, // ata
    owner, // owner
    mint, // mint
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  let tx = new Transaction().add(createATA);

  await provider.sendAndConfirm!(tx, [admin]);

  return tokenAccount;
};

const getATA = async (mint: PublicKey, owner: PublicKey) => {
  // Check to see if the ATA already exists, if so return its key
  const tokenAccount = getAssociatedTokenAddressSync(
    mint,
    owner,
    true,
    TOKEN_2022_PROGRAM_ID,
    ASSOCIATED_TOKEN_PROGRAM_ID,
  );

  const tokenAccountInfo = svm.getAccount(tokenAccount);

  if (!tokenAccountInfo) {
    await createATA(mint, owner);
  }

  return tokenAccount;
};

const createTokenAccount = async (mint: PublicKey, owner: PublicKey) => {
  // We want to create a token account that is not the ATA
  const tokenAccount = new Keypair();

  let tx = new Transaction();
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: admin.publicKey,
      newAccountPubkey: tokenAccount.publicKey,
      space: ACCOUNT_SIZE,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(ACCOUNT_SIZE),
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeAccountInstruction(tokenAccount.publicKey, mint, owner, TOKEN_2022_PROGRAM_ID),
  );

  await provider.sendAndConfirm!(tx, [admin, tokenAccount]);

  return { tokenAccount: tokenAccount.publicKey };
};

const createMint = async (mint: Keypair, mintAuthority: Keypair) => {
  // Create and initialize mint account

  const mintLen = getMintLen([]);
  const mintLamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);
  const createMintAccount = SystemProgram.createAccount({
    fromPubkey: admin.publicKey,
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

  let tx = new Transaction();
  tx.add(createMintAccount, initializeMint);

  await provider.sendAndConfirm!(tx, [admin, mint]);

  // Verify the mint was created properly
  const mintInfo = await provider.connection.getAccountInfo(mint.publicKey);
  if (!mintInfo) {
    throw new Error('Mint account was not created');
  }

  return mint.publicKey;
};

const createMintWithMultisig = async (mint: Keypair, mintAuthority: Keypair) => {
  // Create and initialize multisig mint authority on the token program
  const multisigLen = 355;
  // const multisigLamports = await provider.connection.getMinimumBalanceForRentExemption(multisigLen);
  const multisigLamports = await getMinimumBalanceForRentExemptMultisig(provider.connection);

  const createMultisigAccount = SystemProgram.createAccount({
    fromPubkey: admin.publicKey,
    newAccountPubkey: mintAuthority.publicKey,
    space: multisigLen,
    lamports: multisigLamports,
    programId: TOKEN_2022_PROGRAM_ID,
  });

  const earnTokenAuthority = getEarnTokenAuthority();

  const initializeMultisig = createInitializeMultisigInstruction(
    mintAuthority.publicKey, // account
    [portal, earnTokenAuthority],
    1,
    TOKEN_2022_PROGRAM_ID,
  );

  let tx = new Transaction();
  tx.add(createMultisigAccount, initializeMultisig);

  await provider.sendAndConfirm!(tx, [admin, mintAuthority]);

  // Create and initialize mint account

  const mintLen = getMintLen([]);
  const mintLamports = await provider.connection.getMinimumBalanceForRentExemption(mintLen);
  const createMintWithMultisigAccount = SystemProgram.createAccount({
    fromPubkey: admin.publicKey,
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

  await provider.sendAndConfirm!(tx, [admin, mint]);

  // Verify the mint was created properly
  const mintInfo = await provider.connection.getAccountInfo(mint.publicKey);
  if (!mintInfo) {
    throw new Error('Mint account was not created');
  }

  return mint.publicKey;
};

const mintM = async (to: PublicKey, amount: BN) => {
  const toATA: PublicKey = await getATA(mint.publicKey, to);

  const mintToInstruction = createMintToCheckedInstruction(
    mint.publicKey,
    toATA,
    mintAuthority.publicKey,
    BigInt(amount.toString()),
    6,
    [portal],
    TOKEN_2022_PROGRAM_ID,
  );

  let tx = new Transaction();
  tx.add(mintToInstruction);
  await provider.sendAndConfirm!(tx, [portal]);
};

const warp = (seconds: BN, increment: boolean) => {
  const clock = svm.getClock();
  clock.unixTimestamp = increment ? clock.unixTimestamp + BigInt(seconds.toString()) : BigInt(seconds.toString());
  svm.setClock(clock);
};

// instruction convenience functions
const prepInitialize = (signer: Keypair, mint: PublicKey) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Populate accounts for the instruction
  accounts = {};
  accounts.admin = signer.publicKey;
  accounts.globalAccount = globalAccount;
  accounts.mint = mint;
  accounts.systemProgram = SystemProgram.programId;

  return { globalAccount };
};

const initialize = async (mint: PublicKey, earnAuthority: PublicKey, initialIndex: BN, claimCooldown: BN) => {
  // Setup the instruction
  const { globalAccount } = prepInitialize(admin, mint);

  // Send the transaction
  await earn.methods
    .initialize(earnAuthority, initialIndex, claimCooldown)
    .accountsPartial({ ...accounts })
    .signers([admin])
    .rpc();

  // Confirm the global account state
  await expectGlobalState(globalAccount, {
    admin: admin.publicKey,
    mint,
    earnAuthority,
    index: initialIndex,
    claimCooldown,
    claimComplete: true,
  });

  return globalAccount;
};

const prepSetEarnAuthority = (signer: Keypair) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Populate accounts for the instruction
  accounts = {};
  accounts.admin = signer.publicKey;
  accounts.globalAccount = globalAccount;

  return { globalAccount };
};

const prepSetClaimCooldown = (signer: Keypair) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Populate accounts for the instruction
  accounts = {};
  accounts.admin = signer.publicKey;
  accounts.globalAccount = globalAccount;

  return { globalAccount };
};

const prepPropagateIndex = (signer: Keypair) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Populate accounts
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;
  accounts.mint = mint.publicKey;

  return { globalAccount };
};

const propagateIndex = async (newIndex: BN, earnerMerkleRoot: number[] = ZERO_WORD) => {
  // Setup the instruction
  const { globalAccount } = prepPropagateIndex(portal);

  // Send the instruction
  await earn.methods
    .propagateIndex(newIndex, earnerMerkleRoot)
    .accountsPartial({ ...accounts })
    .signers([portal])
    .rpc();

  // We don't check state here because it depends on the circumstances

  return { globalAccount };
};

const prepClaimFor = async (signer: Keypair, mint: PublicKey, earner: PublicKey) => {
  // Get the global and token authority PDAs
  const globalAccount = getGlobalAccount();
  const earnTokenAuthority = getEarnTokenAuthority();

  // Get the earner ATA
  const earnerATA = await getATA(mint, earner);

  // Get the earner account
  const earnerAccount = getEarnerAccount(earnerATA);

  // Populate accounts
  accounts = {};
  accounts.earnAuthority = signer.publicKey;
  accounts.globalAccount = globalAccount;
  accounts.earnerAccount = earnerAccount;
  accounts.mint = mint;
  accounts.mintMultisig = mintAuthority.publicKey;
  accounts.tokenAuthorityAccount = earnTokenAuthority;
  accounts.userTokenAccount = earnerATA;
  accounts.tokenProgram = TOKEN_2022_PROGRAM_ID;

  return { globalAccount, earnerAccount, earnerATA };
};

const prepCompleteClaims = (signer: Keypair) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Populate accounts
  accounts = {};
  accounts.earnAuthority = signer.publicKey;
  accounts.globalAccount = globalAccount;

  return { globalAccount };
};

const completeClaims = async () => {
  // Setup the instruction
  prepCompleteClaims(earnAuthority);

  // Send the instruction
  await earn.methods
    .completeClaims()
    .accountsPartial({ ...accounts })
    .signers([earnAuthority])
    .rpc();
};

const prepAddRegistrarEarner = (signer: Keypair, earnerATA: PublicKey) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Get the earner account
  const earnerAccount = getEarnerAccount(earnerATA);

  // Populate accounts
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.userTokenAccount = earnerATA;
  accounts.globalAccount = globalAccount;
  accounts.earnerAccount = earnerAccount;
  accounts.systemProgram = SystemProgram.programId;

  return { globalAccount, earnerAccount };
};

const addRegistrarEarner = async (earner: PublicKey, proof: ProofElement[]) => {
  // Get the earner ATA
  const earnerATA = await getATA(mint.publicKey, earner);

  // Setup the instruction
  prepAddRegistrarEarner(nonAdmin, earnerATA);

  // Send the instruction
  await earn.methods
    .addRegistrarEarner(earner, proof)
    .accountsPartial({ ...accounts })
    .signers([nonAdmin])
    .rpc();
};

const prepRemoveRegistrarEarner = (signer: Keypair, earnerATA: PublicKey) => {
  // Get the global PDA
  const globalAccount = getGlobalAccount();

  // Get the earner account
  const earnerAccount = getEarnerAccount(earnerATA);

  // Populate accounts
  accounts = {};
  accounts.signer = signer.publicKey;
  accounts.globalAccount = globalAccount;
  accounts.userTokenAccount = earnerATA;
  accounts.earnerAccount = earnerAccount;

  return { globalAccount, earnerAccount };
};

describe('Earn unit tests', () => {
  beforeEach(async () => {
    // Initialize the SVM instance with all necessary configurations
    svm = fromWorkspace('../')
      .withSplPrograms() // Add SPL programs (including token programs)
      .withBuiltins() // Add builtin programs
      .withSysvars() // Setup standard sysvars
      .withPrecompiles() // Add standard precompiles
      .withBlockhashCheck(true); // Optional: disable blockhash checking for tests

    // Create an anchor provider from the liteSVM instance
    provider = new LiteSVMProvider(svm);

    // Create program instances
    earn = new Program<Earn>(EARN_IDL, provider);

    // Fund the wallets
    svm.airdrop(admin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(portal.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(earnAuthority.publicKey, BigInt(10 * LAMPORTS_PER_SOL));
    svm.airdrop(nonAdmin.publicKey, BigInt(10 * LAMPORTS_PER_SOL));

    // Create the token mint
    await createMintWithMultisig(mint, mintAuthority);

    // Mint some tokens to have a non-zero supply
    await mintM(admin.publicKey, initialSupply);
  });

  describe('initialize unit tests', () => {
    // test cases
    //   [X] given the admin signs the transaction
    //      [X] the global account is created
    //      [X] the admin is set to the signer
    //      [X] the mint is set correctly
    //      [X] the earn authority is set correctly
    //      [X] the initial index is set correctly
    //      [X] the claim cooldown is set correctly

    // given the admin signs the transaction
    // the global account is created and configured correctly
    test('Admin can initialize earn program', async () => {
      // Setup the instruction call
      const { globalAccount } = prepInitialize(admin, mint.publicKey);

      // Create and send the transaction
      await earn.methods
        .initialize(earnAuthority.publicKey, initialIndex, claimCooldown)
        .accountsPartial({ ...accounts })
        .signers([admin])
        .rpc();

      // Verify the global state including zero-initialized Merkle roots
      await expectGlobalState(globalAccount, {
        admin: admin.publicKey,
        mint: mint.publicKey,
        earnAuthority: earnAuthority.publicKey,
        index: initialIndex,
        claimCooldown,
        claimComplete: true,
        earnerMerkleRoot: ZERO_WORD,
      });
    });
  });

  describe('set_earn_authority unit tests', () => {
    // test cases
    //   [X] given the admin signs the transaction
    //      [X] the earn authority is updated
    //   [X] given a non-admin signs the transaction
    //      [X] the transaction reverts with a not authorized error

    beforeEach(async () => {
      // Initialize the program
      await initialize(mint.publicKey, earnAuthority.publicKey, initialIndex, claimCooldown);
    });

    test('Admin can set new earn authority', async () => {
      // Setup new earn authority
      const newEarnAuthority = new Keypair();

      // Setup the instruction
      const { globalAccount } = prepSetEarnAuthority(admin);

      // Send the transaction
      await earn.methods
        .setEarnAuthority(newEarnAuthority.publicKey)
        .accountsPartial({ ...accounts })
        .signers([admin])
        .rpc();

      // Verify the global state was updated
      await expectGlobalState(globalAccount, {
        earnAuthority: newEarnAuthority.publicKey,
      });
    });

    test('Non-admin cannot set earn authority', async () => {
      // Attempt to set new earn authority with non-admin
      const newEarnAuthority = new Keypair();

      prepSetEarnAuthority(nonAdmin);

      await expectAnchorError(
        earn.methods
          .setEarnAuthority(newEarnAuthority.publicKey)
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'NotAuthorized',
      );
    });
  });

  describe('set_claim_cooldown unit tests', () => {
    // test cases
    // [X] given the admin does not sign the transaction
    //   [X] it reverts with a NotAuthorized error
    // [X] given the admin does sign then transaction
    //   [X] given the new cooldown is greater than 1 week
    //     [X] it reverts with an InvalidParam error
    //   [X] given the new cooldown is less than or equal to 1 week
    //     [X] the claim cooldown is updated

    beforeEach(async () => {
      // Initialize the program
      await initialize(mint.publicKey, earnAuthority.publicKey, initialIndex, claimCooldown);
    });

    test('Admin does not sign transaction - reverts', async () => {
      // Attempt to set the claim cooldown without the admin signing
      prepSetClaimCooldown(nonAdmin);

      await expectAnchorError(
        earn.methods
          .setClaimCooldown(new BN(1))
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'NotAuthorized',
      );
    });

    test('Admin tries to set cooldown to more than  1 week - reverts', async () => {
      // Attempt to set the claim cooldown to more than 1 week

      const randomCooldown = randomInt(604_801, 2 ** 32);

      prepSetClaimCooldown(admin);

      await expectAnchorError(
        earn.methods
          .setClaimCooldown(new BN(randomCooldown))
          .accountsPartial({ ...accounts })
          .signers([admin])
          .rpc(),
        'InvalidParam',
      );
    });

    test('Admin sets cooldown to less than or equal to 1 week - success', async () => {
      // Attempt to set the claim cooldown to less than or equal to 1 week
      const newCooldown = new BN(randomInt(0, 604_800));

      const { globalAccount } = prepSetClaimCooldown(admin);

      await earn.methods
        .setClaimCooldown(newCooldown)
        .accountsPartial({ ...accounts })
        .signers([admin])
        .rpc();

      // Verify the global state was updated
      await expectGlobalState(globalAccount, {
        claimCooldown: newCooldown,
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
    //   [X] given the new index is greater than or eqal to the existing index
    //     [X] given the new earner merkle root is empty
    //       [X] it is not updated
    //     [X] given the new earner merkle is not empty
    //       [X] it is updated
    //   [X] given the last claim hasn't been completed
    //     [X] given the time is within the cooldown period
    //       [X] given the new index is less than or equal to the existing index
    //         [X] given current supply is less than or equal to max supply
    //           [X] nothing is updated
    //         [X] given current supply is greater than max supply
    //           [X] max supply is updated to the current supply
    //       [X] given the new index is greater the existing index
    //         [X] given current supply is less than or equal to max supply
    //           [X] nothing is updated
    //         [X] given current supply is greater than max supply
    //           [X] max supply is updated to the current supply
    //     [X] given the time is past the cooldown period
    //       [X] given the new index is less than or equal to the existing index
    //         [X] given the current supply is less than or equal to max supply
    //           [X] nothing is updated
    //         [X] given the current supply is greater than max supply
    //           [X] max supply is updated to the current supply
    //       [X] given the new index is greater the existing index
    //         [X] given current supply is less than or equal to max supply
    //           [X] nothing is updated
    //         [X] given current supply is greater than max supply
    //           [X] max supply is updated to the current supply
    //   [X] given the last claim has been completed
    //     [X] given the time is within the cooldown period
    //       [X] given the new index is less than or equal to the existing index
    //         [X] given current supply is greater than max supply
    //           [X] max supply is updated to the current supply
    //         [X] given current supply is less than or equal to max supply
    //           [X] nothing is updated
    //       [X] given the new index is greater the existing index
    //         [X] given current supply is less than or equal to max supply
    //           [X] nothing is updated
    //         [X] given current supply is greater than max supply
    //           [X] max supply is updated to the current supply
    //     [X] given the time is past the cooldown period
    //       [X] given the new index is less than or equal to the existing index
    //         [X] given current supply is less than or equal to max supply
    //           [X] nothing is updated
    //         [X] given current supply is greater than max supply
    //           [X] max supply is updated to the current supply
    //       [X] given the new index is greater the existing index
    //         [X] a new claim cycle starts:
    //           [X] index is updated to the provided value
    //           [X] timestamp is updated to the current timestamp
    //           [X] max supply is set to the current supply
    //           [X] distributed is set to 0
    //           [X] max yield is updated
    //           [X] claim complete is set to false

    beforeEach(async () => {
      // Initialize the program
      await initialize(mint.publicKey, earnAuthority.publicKey, initialIndex, claimCooldown);

      // Populate the earner merkle tree with the initial earners
      earnerMerkleTree = new MerkleTree([admin.publicKey, earnerOne.publicKey, earnerTwo.publicKey]);

      // Propagate the earner and earn manager merkle roots so they are set to non-zero values
      await propagateIndex(initialIndex, earnerMerkleTree.getRoot());

      // Warp past the initial cooldown period
      warp(claimCooldown, true);
    });

    // given the portal does not sign the transaction
    // the transaction fails with an address constraint error
    test('Non-portal cannot update index - reverts', async () => {
      const newIndex = new BN(1_100_000_000_000);
      const newEarnerRoot = Array(32).fill(1);

      prepPropagateIndex(nonAdmin);

      await expectAnchorError(
        earn.methods
          .propagateIndex(newIndex, newEarnerRoot)
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'NotAuthorized',
      );
    });

    // given new index is less than the existing index
    // given new earner merkle root is empty
    // nothing is updated
    test('new index < existing index, new earner root empty', async () => {
      // Try to propagate a new index with a lower value
      const lowerIndex = new BN(999_999_999_999);
      const emptyEarnerRoot = ZERO_WORD;
      const emptyEarnManagerRoot = ZERO_WORD;

      const { globalAccount } = await propagateIndex(lowerIndex, emptyEarnerRoot);

      // Check the state
      await expectGlobalState(globalAccount, {
        earnerMerkleRoot: earnerMerkleTree.getRoot(),
      });
    });

    // given new index is less than the existing index
    // given new earner merkle root is not empty
    // nothing is updated
    test('new index < existing index, new earner root not empty', async () => {
      // Try to propagate a new index with a lower value
      const lowerIndex = new BN(999_999_999_999);
      const newEarnerRoot = new Array(32).fill(1);

      const { globalAccount } = await propagateIndex(lowerIndex, newEarnerRoot);

      // Check the state
      await expectGlobalState(globalAccount, {
        earnerMerkleRoot: earnerMerkleTree.getRoot(),
      });
    });

    // given new index is greater than or equal to the existing index
    // given new earner merkle root is empty
    // nothing is updated
    test('new index >= existing index, new earner root empty', async () => {
      // Try to propagate a new index with a higher value
      const randomIncrement = randomInt(0, 2 ** 32);
      const higherIndex = initialIndex.add(new BN(randomIncrement));
      const emptyEarnerRoot = ZERO_WORD;

      const { globalAccount } = await propagateIndex(higherIndex, emptyEarnerRoot);

      // Check the state
      await expectGlobalState(globalAccount, {
        earnerMerkleRoot: earnerMerkleTree.getRoot(),
      });
    });

    // given new index is greater than or equal to the existing index
    // given new earner merkle root is not empty
    // earner merkle root is updated
    test('new index >= existing index, new earner root not empty', async () => {
      // Try to propagate a new index with a higher value
      const randomIncrement = randomInt(0, 2 ** 32);
      const higherIndex = initialIndex.add(new BN(randomIncrement));
      const newEarnerRoot = new Array(32).fill(1);

      const { globalAccount } = await propagateIndex(higherIndex, newEarnerRoot);

      // Check the state
      await expectGlobalState(globalAccount, {
        earnerMerkleRoot: newEarnerRoot,
      });
    });

    // given new index <= existing index
    // given the last claim hasn't been completed
    // given the time is within the cooldown period
    // given current supply is less than or equal to max supply
    // nothing is updated
    test('new index <= existing index, claim not complete, within cooldown period, supply <= max supply', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());
      const { globalAccount } = await propagateIndex(startIndex);

      // Expire the blockhash
      svm.expireBlockhash();

      // Update the index again with the same or lower value
      const randomDecrement = randomInt(0, startIndex.toNumber());
      const newIndex = startIndex.sub(new BN(randomDecrement));

      await propagateIndex(newIndex);

      // Confirm that the index, timestamp, and Merkle roots are updated
      await expectGlobalState(globalAccount, {
        index: startIndex,
        timestamp: startTimestamp,
        maxSupply: initialSupply,
      });
    });

    // given new index <= existing index
    // given the last claim hasn't been completed
    // given the time is within the cooldown period
    // given current supply is greater than max supply
    // max supply is updated to the current supply
    test('new index <= existing index, claim not complete, within cooldown period, supply > max supply', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());
      const { globalAccount } = await propagateIndex(startIndex);

      // Mint more tokens to increase supply
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Warp forward in time slightly
      warp(new BN(1), true);

      // Update the index again with the same or lower value
      const randomDecrement = randomInt(0, startIndex.toNumber());
      const newIndex = startIndex.sub(new BN(randomDecrement));
      await propagateIndex(newIndex);

      // Check that only max supply was updated
      await expectGlobalState(globalAccount, {
        index: startIndex,
        timestamp: startTimestamp,
        maxSupply: newSupply,
      });
    });

    // given new index <= existing index
    // given the last claim has been completed
    // given the time is within the cooldown period
    // given current supply is greater than max supply
    // max supply is updated to the current supply
    test('new index <= existing index, claim complete, within cooldown period, supply > max supply', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());
      const { globalAccount } = await propagateIndex(startIndex);

      // Set claim complete
      await completeClaims();

      // Mint more tokens
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Warp forward in time slightly
      warp(new BN(1), true);

      // Update the index again with the same or lower value
      const randomDecrement = randomInt(0, startIndex.toNumber());
      const newIndex = startIndex.sub(new BN(randomDecrement));
      await propagateIndex(newIndex);

      // Check that only max supply was updated
      await expectGlobalState(globalAccount, {
        index: startIndex,
        timestamp: startTimestamp,
        maxSupply: newSupply,
      });
    });

    // given new index <= existing index
    // given the last claim has been completed
    // given the time is within the cooldown period
    // given current supply is less than or equal to max supply
    // nothing is updated
    test('new index <= existing index, claim complete, within cooldown period, supply <= max supply', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());
      const { globalAccount } = await propagateIndex(startIndex);

      // Set claim complete
      await completeClaims();

      // Warp forward in time slightly
      warp(new BN(1), true);

      // Update the index again with the same or lower value
      const randomDecrement = randomInt(0, startIndex.toNumber());
      const newIndex = startIndex.sub(new BN(randomDecrement));
      await propagateIndex(newIndex);

      // Check that nothing was updated
      await expectGlobalState(globalAccount, {
        index: startIndex,
        timestamp: startTimestamp,
        maxSupply: initialSupply,
      });
    });

    // given new index <= existing index
    // given the last claim hasn't been completed
    // given the time is past the cooldown period
    // given the current supply is greater than max supply
    // max supply is updated to the current supply
    test('new index <= existing index, claim not complete, past cooldown period, supply > max supply', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());
      const { globalAccount } = await propagateIndex(startIndex);

      // Mint more tokens
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Expire the blockhash
      svm.expireBlockhash();

      // Warp forward past the cooldown period
      warp(claimCooldown.add(new BN(1)), true);

      // Update the index again with the same or lower value
      const randomDecrement = randomInt(0, startIndex.toNumber());
      const newIndex = startIndex.sub(new BN(randomDecrement));
      await propagateIndex(newIndex);

      // Check that only max supply was updated
      await expectGlobalState(globalAccount, {
        index: startIndex,
        timestamp: startTimestamp,
        maxSupply: newSupply,
      });
    });

    // given new index <= existing index
    // given the last claim hasn't been completed
    // given the time is past the cooldown period
    // given the current supply is less than or equal to max supply
    // nothing is updated
    test('new index <= existing index, claim not complete, past cooldown period, supply <= max supply', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());
      const { globalAccount } = await propagateIndex(startIndex);

      // Expire the blockhash
      svm.expireBlockhash();

      // Warp forward past the cooldown period
      warp(claimCooldown.add(new BN(1)), true);

      // Update the index again with the same or lower value
      const randomDecrement = randomInt(0, startIndex.toNumber());
      const newIndex = startIndex.sub(new BN(randomDecrement));
      await propagateIndex(newIndex);

      // Check that nothing was updated
      await expectGlobalState(globalAccount, {
        index: startIndex,
        timestamp: startTimestamp,
        maxSupply: initialSupply,
      });
    });

    // given new index > existing index
    // given the last claim hasn't been completed
    // given the time is within the cooldown period
    // given current supply is less than or equal to max supply
    // nothing is updated
    test('new index > existing index, claim not complete, within cooldown period, supply <= max supply', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());
      const { globalAccount } = await propagateIndex(startIndex);

      // Expire the blockhash
      svm.expireBlockhash();

      // Warp forward slightly
      warp(new BN(1), true);

      // Update the index again with a higher value
      const randomIncrement = randomInt(1, 2 ** 32);
      const newIndex = startIndex.add(new BN(randomIncrement));
      await propagateIndex(newIndex);

      // Check that nothing was updated
      await expectGlobalState(globalAccount, {
        index: startIndex,
        timestamp: startTimestamp,
        maxSupply: initialSupply,
      });
    });

    // given new index > existing index
    // given the last claim hasn't been completed
    // given the time is within the cooldown period
    // given current supply is greater than max supply
    // max supply is updated to the current supply
    test('new index > existing index, claim not complete, within cooldown period, supply > max supply', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());
      const { globalAccount } = await propagateIndex(startIndex);

      // Mint more tokens
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Warp forward slightly
      warp(new BN(1), true);

      // Update the index again with a higher value
      const randomIncrement = randomInt(1, 2 ** 32);
      const newIndex = startIndex.add(new BN(randomIncrement));
      await propagateIndex(newIndex);

      // Check that only max supply was updated
      await expectGlobalState(globalAccount, {
        index: startIndex,
        timestamp: startTimestamp,
        maxSupply: newSupply,
      });
    });

    // given new index > existing index
    // given the last claim has been completed
    // given the time is within the cooldown period
    // given current supply is less than or equal to max supply
    // nothing is updated
    test('new index > existing index, claim complete, within cooldown period, supply <= max supply', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());
      const { globalAccount } = await propagateIndex(startIndex);

      // Set claim complete
      await completeClaims();

      // Warp forward slightly
      warp(new BN(1), true);

      // Update the index again with a higher value
      const randomIncrement = randomInt(1, 2 ** 32);
      const newIndex = startIndex.add(new BN(randomIncrement));
      await propagateIndex(newIndex);

      // Check that nothing was updated
      await expectGlobalState(globalAccount, {
        index: startIndex,
        timestamp: startTimestamp,
        maxSupply: initialSupply,
      });
    });

    // given new index > existing index
    // given the last claim has been completed
    // given the time is within the cooldown period
    // given current supply is greater than max supply
    // max supply is updated to the current supply
    test('new index > existing index, claim complete, within cooldown period, supply > max supply', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());
      const { globalAccount } = await propagateIndex(startIndex);

      // Set claim complete
      await completeClaims();

      // Mint more tokens
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Warp forward slightly
      warp(new BN(1), true);

      // Update the index again with a higher value
      const randomIncrement = randomInt(1, 2 ** 32);
      const newIndex = startIndex.add(new BN(randomIncrement));
      await propagateIndex(newIndex);

      // Check that only max supply was updated
      await expectGlobalState(globalAccount, {
        index: startIndex,
        timestamp: startTimestamp,
        maxSupply: newSupply,
      });
    });

    // given new index > existing index
    // given the last claim hasn't been completed
    // given the time is past the cooldown period
    // given current supply is less than or equal to max supply
    // nothing is updated
    test('new index > existing index, claim not complete, past cooldown period, supply <= max supply', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());
      const { globalAccount } = await propagateIndex(startIndex);

      // Expire the blockhash
      svm.expireBlockhash();

      // Warp forward past the cooldown period
      warp(claimCooldown.add(new BN(1)), true);

      // Update the index again with a higher value
      const randomIncrement = randomInt(1, 2 ** 32);
      const newIndex = startIndex.add(new BN(randomIncrement));
      await propagateIndex(newIndex);

      // Check that nothing was updated
      await expectGlobalState(globalAccount, {
        index: startIndex,
        timestamp: startTimestamp,
        maxSupply: initialSupply,
      });
    });

    // given new index > existing index
    // given the last claim hasn't been completed
    // given the time is past the cooldown period
    // given current supply is greater than max supply
    // max supply is updated to the current supply
    test('new index > existing index, claim not complete, past cooldown period, supply > max supply', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const startTimestamp = new BN(svm.getClock().unixTimestamp.toString());
      const { globalAccount } = await propagateIndex(startIndex);

      // Mint more tokens
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Expire the blockhash
      svm.expireBlockhash();

      // Warp forward past the cooldown period
      warp(claimCooldown.add(new BN(1)), true);

      // Update the index again with a higher value
      const randomIncrement = randomInt(1, 2 ** 32);
      const newIndex = startIndex.add(new BN(randomIncrement));
      await propagateIndex(newIndex);

      // Check that only max supply was updated
      await expectGlobalState(globalAccount, {
        index: startIndex,
        timestamp: startTimestamp,
        maxSupply: newSupply,
      });
    });

    // given new index > existing index
    // given the last claim has been completed
    // given the time is past the cooldown period
    // the index is updated to the provided value
    // max supply is set to the current supply
    // distributed is set to 0
    // max yield is updated
    // claim complete is set to false
    test('new index > existing index, claim complete, past cooldown period, new cycle starts', async () => {
      // Update the index initially so the claim is not complete and the time is within the cooldown period
      const startIndex = new BN(1_100_000_000_000);
      const { globalAccount } = await propagateIndex(startIndex);
      const startGlobalState = await earn.account.global.fetch(globalAccount);

      // Set claim complete
      await completeClaims();

      // Mint more tokens
      const additionalSupply = new BN(50_000_000);
      await mintM(admin.publicKey, additionalSupply);
      const newSupply = initialSupply.add(additionalSupply);

      // Warp forward past the cooldown period
      warp(claimCooldown.add(new BN(1)), true);

      // Update the index again with a higher value
      const randomIncrement = randomInt(1, 2 ** 32);
      const newIndex = startIndex.add(new BN(randomIncrement));
      await propagateIndex(newIndex);

      // Calculate expected rewards per token and max yield
      const supplyPlusLeftover = initialSupply.add(startGlobalState.maxYield).sub(startGlobalState.distributed);

      const maxYield = supplyPlusLeftover
        .mul(newIndex)
        .div(startIndex)
        .sub(supplyPlusLeftover)
        .add(startGlobalState.maxYield);

      // Check that a new cycle started with all updates
      const clock = svm.getClock();
      await expectGlobalState(globalAccount, {
        index: newIndex,
        timestamp: new BN(clock.unixTimestamp.toString()),
        maxSupply: newSupply,
        maxYield,
        distributed: new BN(0),
        claimComplete: false,
      });
    });
  });

  describe('claim_for unit tests', () => {
    // test cases
    // [X] given the earn authority does not sign the transaction
    //   [X] it reverts with an address constraint error
    // [X] given the earn authority signs the transaction
    //   [X] given the user token account's earner account is not initialized
    //     [X] it reverts with an account not initialized error
    //   [X] given the earner's last claim index is the current index
    //     [X] it reverts with an AlreadyClaimed error
    //   [X] given the amonut to be minted causes the total distributed to exceed the max yield
    //     [X] it reverts with am ExceedsMaxYield error
    //   [X] otherwise
    //     [X] the correct amount is minted to the earner's token account

    beforeEach(async () => {
      // Initialize the program
      await initialize(mint.publicKey, earnAuthority.publicKey, initialIndex, claimCooldown);

      // Populate the earner merkle tree with the initial earners
      earnerMerkleTree = new MerkleTree([admin.publicKey, earnerOne.publicKey, earnerTwo.publicKey]);

      // Warp past the initial cooldown period
      warp(claimCooldown, true);

      // Propagate the earner and earn manager merkle roots so we can add earners
      await propagateIndex(initialIndex, earnerMerkleTree.getRoot());

      // Add earner one as a registrar earner
      const { proof: earnerOneProof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);
      await addRegistrarEarner(earnerOne.publicKey, earnerOneProof);

      // Send earner one 10 tokens so they have a positive balance
      await mintM(earnerOne.publicKey, new BN(10_000_000));
    });

    // given the earn authority doesn't sign the transaction
    // it reverts with an address constraint error
    test('Non-earn authority cannot claim - reverts', async () => {
      // Setup the instruction
      await prepClaimFor(nonAdmin, mint.publicKey, earnerOne.publicKey);

      // Attempt to claim with non-earn authority
      await expectAnchorError(
        earn.methods
          .claimFor(new BN(100_000_000))
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'NotAuthorized',
      );
    });

    // given the earn authority signs the transaction
    // given the user token account's earner account is not initialized
    // it reverts with an account not initialized error
    test('Earner account not initialized - reverts', async () => {
      // Setup the instruction
      await prepClaimFor(earnAuthority, mint.publicKey, earnerTwo.publicKey);

      // Attempt to claim for non-initialized earner
      await expectAnchorError(
        earn.methods
          .claimFor(new BN(10_000_000))
          .accountsPartial({ ...accounts })
          .signers([earnAuthority])
          .rpc(),
        'AccountNotInitialized',
      );
    });

    // given the earn authority signs the transaction
    // given the earner's last claim index is the current index
    // it reverts with an AlreadyClaimed error
    test('Earner already claimed - reverts', async () => {
      // Setup the instruction
      await prepClaimFor(earnAuthority, mint.publicKey, earnerOne.publicKey);

      // Attempt to claim, but the earner is already up to date
      await expectAnchorError(
        earn.methods
          .claimFor(new BN(10_000_000))
          .accountsPartial({ ...accounts })
          .signers([earnAuthority])
          .rpc(),
        'AlreadyClaimed',
      );
    });

    // given the earn authority signs the transaction
    // given the amount to be minted causes the total distributed to exceed the max yield
    // it reverts with an ExceedsMaxYield error
    test('Exceeds max yield - reverts', async () => {
      // Update the index so there is outstanding yield
      await propagateIndex(new BN(1_100_000_000_000));

      // Setup the instruction
      await prepClaimFor(earnAuthority, mint.publicKey, earnerOne.publicKey);

      // Attempt to claim an amount that exceeds the max yield
      await expectAnchorError(
        earn.methods
          .claimFor(new BN(120_000_001))
          .accountsPartial({ ...accounts })
          .signers([earnAuthority])
          .rpc(),
        'ExceedsMaxYield',
      );
    });

    // given the earn authority signs the transaction
    // given the inputs are correct
    // the correct amount is minted to the earner's token account
    test('Claim for - success', async () => {
      // Update the index so there is outstanding yield
      await propagateIndex(new BN(1_100_000_000_000));

      // Setup the instruction
      const { earnerAccount, earnerATA } = await prepClaimFor(earnAuthority, mint.publicKey, earnerOne.publicKey);

      // Verify the starting values
      await expectTokenBalance(earnerATA, new BN(10_000_000));
      expectEarnerState(earnerAccount, {
        lastClaimIndex: initialIndex,
      });

      // Claim for the earner
      await earn.methods
        .claimFor(new BN(10_000_000))
        .accountsPartial({ ...accounts })
        .signers([earnAuthority])
        .rpc();

      const currentTime = new BN(svm.getClock().unixTimestamp.toString());

      // Verify the user token account was minted the correct amount
      // and the last claim index was updated
      await expectTokenBalance(earnerATA, new BN(11_000_000));
      expectEarnerState(earnerAccount, {
        lastClaimIndex: new BN(1_100_000_000_000),
        lastClaimTimestamp: currentTime,
      });
    });
  });

  describe('complete_claims unit tests', () => {
    // test cases
    // [X] given the earn authority does not sign the transaction
    //   [X] it reverts with an address constraint error
    // [X] given the earn authority signs the transaction
    //   [X] given the most recent claim is complete
    //     [X] it reverts with a NoActiveClaim error
    //   [X] given the most recent claim is not complete
    //     [X] it sets the claim complete flag to true in the global account

    beforeEach(async () => {
      // Initialize the program
      await initialize(mint.publicKey, earnAuthority.publicKey, initialIndex, claimCooldown);

      // Warp past the initial cooldown period
      warp(claimCooldown, true);

      // Propagate a new index to start a new claim cycle
      await propagateIndex(new BN(1_100_000_000_000));
    });

    // given the earn authority does not sign the transaction
    // it reverts with an address constraint error
    test('Earn authority does not sign - reverts', async () => {
      // Setup the instruction
      prepCompleteClaims(nonAdmin);

      // Attempt to complete claim with non-earn authority
      await expectAnchorError(
        earn.methods
          .completeClaims()
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'NotAuthorized',
      );
    });

    // given the earn authority signs the transaction
    // given the most recent claim is complete
    // it reverts with a NoActiveClaim error
    test('Claim already complete - reverts', async () => {
      // Complete the active claim
      await completeClaims();

      // Expire the blockhash so the same txn can be sent again (in a new block)
      svm.expireBlockhash();

      // Setup the instruction
      prepCompleteClaims(earnAuthority);

      // Attempt to complete claim when already complete
      await expectAnchorError(
        earn.methods
          .completeClaims()
          .accountsPartial({ ...accounts })
          .signers([earnAuthority])
          .rpc(),
        'NoActiveClaim',
      );
    });

    // given the earn authority signs the transaction
    // given the most recent claim is not complete
    // it sets the claim complete flag to true in the global account
    test('Complete claims - success', async () => {
      // Setup the instruction
      const { globalAccount } = prepCompleteClaims(earnAuthority);

      // Complete the claim
      await earn.methods
        .completeClaims()
        .accountsPartial({ ...accounts })
        .signers([earnAuthority])
        .rpc();

      // Verify the global state was updated
      await expectGlobalState(globalAccount, {
        claimComplete: true,
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
    //   [X] it reverts with an immutable owner error
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
      await initialize(mint.publicKey, earnAuthority.publicKey, initialIndex, claimCooldown);

      // Populate the earner merkle tree with the initial earners
      earnerMerkleTree = new MerkleTree([admin.publicKey, earnerOne.publicKey, earnerTwo.publicKey]);

      // Warp time forward past the initial cooldown period
      warp(claimCooldown, true);

      // Propagate a new index to start a new claim cycle and set the merkle roots
      await propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot());
    });

    test('Earner tree is empty and user is zero value - reverts', async () => {
      // Remove all earners from the merkle tree
      earnerMerkleTree = new MerkleTree([]);

      // Propagate the new merkle root
      await propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot());

      // Get the ATA for the zero value pubkey
      const zeroATA = await getATA(mint.publicKey, PublicKey.default);

      // Get the inclusion proof for the zero value pubkey in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(PublicKey.default);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, zeroATA);

      // Attempt to add earner with empty tree and zero value pubkey
      await expectAnchorError(
        earn.methods
          .addRegistrarEarner(PublicKey.default, proof)
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'InvalidParam',
      );
    });

    test('Earner tree is empty and user is zero value - reverts', async () => {
      // Remove all earners from the merkle tree
      earnerMerkleTree = new MerkleTree([]);

      // Propagate the new merkle root
      await propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot());

      // Get the ATA for the zero value pubkey
      const zeroATA = await getATA(mint.publicKey, PublicKey.default);

      // Get the inclusion proof for the zero value pubkey in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(PublicKey.default);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, zeroATA);

      // Attempt to add earner with empty tree and zero value pubkey
      await expectAnchorError(
        earn.methods
          .addRegistrarEarner(PublicKey.default, proof)
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'InvalidParam',
      );
    });

    // given the user token account is for the wrong token mint
    // it reverts with a constraint token mint error
    test('User token account is for the wrong token mint - reverts', async () => {
      // Create a new token mint
      const wrongMint = new Keypair();
      await createMint(wrongMint, nonAdmin);

      // Get earner one ATA for the wrong mint
      const wrongATA = await getATA(wrongMint.publicKey, earnerOne.publicKey);

      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, wrongATA);

      // Attempt to add earner with wrong token mint
      await expectAnchorError(
        earn.methods
          .addRegistrarEarner(earnerOne.publicKey, proof)
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'ConstraintTokenMint',
      );
    });

    // given the user token account is not owned by the user pubkey
    // it reverts with a constraint token owner error
    test('User token account authority does not match user pubkey - reverts', async () => {
      // Get the ATA for a random user
      const randomATA = await getATA(mint.publicKey, nonAdmin.publicKey);

      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, randomATA);

      // Attempt to add earner with wrong token owner
      await expectAnchorError(
        earn.methods
          .addRegistrarEarner(earnerOne.publicKey, proof)
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'ConstraintTokenOwner',
      );
    });

    // given the user token account is not initialized
    // it reverts with an account not initialized error
    test('User token account is not initialized - reverts', async () => {
      // Calculate the ATA for earner one, but don't create it
      const nonInitATA = getAssociatedTokenAddressSync(
        mint.publicKey,
        earnerOne.publicKey,
        true,
        TOKEN_2022_PROGRAM_ID,
        ASSOCIATED_TOKEN_PROGRAM_ID,
      );

      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, nonInitATA);

      // Attempt to add earner with uninitialized token account
      await expectAnchorError(
        earn.methods
          .addRegistrarEarner(earnerOne.publicKey, proof)
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'AccountNotInitialized',
      );
    });

    // given the earner account is already initialized
    // it reverts with an account already initialized error
    test('Earner account already initialized - reverts', async () => {
      // Get the ATA for earner one
      const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Add earner one to the earn manager's list
      await addRegistrarEarner(earnerOne.publicKey, proof);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, earnerOneATA);

      // Attempt to add earner with already initialized account
      await expectSystemError(
        earn.methods
          .addRegistrarEarner(earnerOne.publicKey, proof)
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
      );
    });

    test('User token account has mutable owner - reverts', async () => {
      const tokenAccountKeypair = Keypair.generate();
      const tokenAccountLen = getAccountLen([]);
      const lamports = await provider.connection.getMinimumBalanceForRentExemption(tokenAccountLen);

      // Create token account without the immutable owner extension
      const transaction = new Transaction().add(
        SystemProgram.createAccount({
          fromPubkey: nonAdmin.publicKey,
          newAccountPubkey: tokenAccountKeypair.publicKey,
          space: tokenAccountLen,
          lamports,
          programId: TOKEN_2022_PROGRAM_ID,
        }),
        createInitializeAccountInstruction(
          tokenAccountKeypair.publicKey,
          mint.publicKey,
          earnerOne.publicKey,
          TOKEN_2022_PROGRAM_ID,
        ),
      );

      await provider.send!(transaction, [nonAdmin, tokenAccountKeypair]);

      // Get the inclusion proof for the earner against the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, tokenAccountKeypair.publicKey);

      await expectAnchorError(
        earn.methods
          .addRegistrarEarner(nonEarnerOne.publicKey, proof)
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'MutableOwner',
      );
    });

    // given all the accounts are valid
    // given the merkle proof for the user in the earner list is invalid
    // it reverts with an InvalidProof error
    test('Invalid merkle proof for user inclusion - reverts', async () => {
      // Get the ATA for non earner one
      const nonEarnerOneATA = await getATA(mint.publicKey, nonEarnerOne.publicKey);

      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Setup the instruction
      prepAddRegistrarEarner(nonAdmin, nonEarnerOneATA);

      // Attempt to add earner with invalid merkle proof
      await expectAnchorError(
        earn.methods
          .addRegistrarEarner(nonEarnerOne.publicKey, proof)
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
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
      const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

      // Get the inclusion proof for earner one in the earner merkle tree
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);

      // Setup the instruction
      const { earnerAccount } = prepAddRegistrarEarner(nonAdmin, earnerOneATA);

      // Add earner one to the earn manager's list
      await earn.methods
        .addRegistrarEarner(earnerOne.publicKey, proof)
        .accountsPartial({ ...accounts })
        .signers([nonAdmin])
        .rpc();

      const currentTime = new BN(svm.getClock().unixTimestamp.toString());

      // Verify the earner account was initialized correctly
      await expectEarnerState(earnerAccount, {
        lastClaimIndex: new BN(1_100_000_000_000),
        lastClaimTimestamp: currentTime,
        user: earnerOne.publicKey,
        userTokenAccount: earnerOneATA,
      });
    });
  });

  describe('remove_registrar_earner unit tests', () => {
    // test cases
    // [X] given the earner account is not initialized
    //   [X] it reverts with an account not initialized error
    // [X] given all the accounts are valid
    //   [X] given empty merkle proof for user exclusion
    //     [X] it reverts with an InvalidProof error
    //   [X] given the merkle proof for user's exclusion from the earner list is invalid
    //     [X] it reverts with an InvalidProof error
    //   [X] given the merkle proof for user's exclusion from the earner list is valid
    //     [X] it closes the earner account and refunds the rent to the signer

    beforeEach(async () => {
      // Initialize the program
      await initialize(mint.publicKey, earnAuthority.publicKey, initialIndex, claimCooldown);

      // Populate the earner merkle tree with the initial earners
      earnerMerkleTree = new MerkleTree([admin.publicKey, earnerOne.publicKey, earnerTwo.publicKey]);

      // Warp time forward past the initial cooldown period
      warp(claimCooldown, true);

      // Propagate a new index to start a new claim cycle and set the merkle roots
      await propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot());

      // Create an earner account for earner one
      const { proof } = earnerMerkleTree.getInclusionProof(earnerOne.publicKey);
      await addRegistrarEarner(earnerOne.publicKey, proof);

      // Create an earner account for earner two
      const { proof: proofTwo } = earnerMerkleTree.getInclusionProof(earnerTwo.publicKey);
      await addRegistrarEarner(earnerTwo.publicKey, proofTwo);

      // Remove earner one from the earner merkle tree
      earnerMerkleTree.removeLeaf(earnerOne.publicKey);

      // Update the earner merkle root on the global account
      const { globalAccount } = await propagateIndex(new BN(1_100_000_000_000), earnerMerkleTree.getRoot());

      // Confirm the global account is updated
      expectGlobalState(globalAccount, {
        index: new BN(1_100_000_000_000),
        earnerMerkleRoot: earnerMerkleTree.getRoot(),
      });
    });

    // given the earner account is not initialized
    // it reverts with an account not initialized error
    test('Earner account is not initialized - reverts', async () => {
      // Get the ATA for non earner one
      const nonEarnerOneATA = await getATA(mint.publicKey, nonEarnerOne.publicKey);

      // Get the exclusion proof for non earner one against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(nonEarnerOne.publicKey);

      // Setup the instruction
      prepRemoveRegistrarEarner(nonAdmin, nonEarnerOneATA);

      // Attempt to remove earner with uninitialized account
      await expectAnchorError(
        earn.methods
          .removeRegistrarEarner(proofs, neighbors)
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'AccountNotInitialized',
      );
    });

    // given all the accounts are valid
    // given no proofs or neighbors are provided
    // it reverts with an InvalidProof error
    test('Empty merkle proof for user exclusion - reverts', async () => {
      // Get the ATA for earner one
      const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

      // Setup the instruction
      prepRemoveRegistrarEarner(nonAdmin, earnerOneATA);

      // Attempt to remove earner with invalid merkle proof
      await expectAnchorError(
        earn.methods
          .removeRegistrarEarner([], [])
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'InvalidProof',
      );
    });

    // given all the accounts are valid
    // given the merkle proof for user's exclusion from the earner list is invalid
    // it reverts with an InvalidProof error
    test('Invalid merkle proof for user exclusion - reverts', async () => {
      // Get the ATA for earner two
      const earnerTwoATA = await getATA(mint.publicKey, earnerTwo.publicKey);

      // Get the exclusion proof for earner one against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(earnerOne.publicKey);

      // Setup the instruction
      prepRemoveRegistrarEarner(nonAdmin, earnerTwoATA);

      // Attempt to remove earner with invalid merkle proof
      await expectAnchorError(
        earn.methods
          .removeRegistrarEarner(proofs, neighbors)
          .accountsPartial({ ...accounts })
          .signers([nonAdmin])
          .rpc(),
        'InvalidProof',
      );
    });

    // given all the accounts are valid
    // given the merkle proof for user's exclusion from the earner list is valid
    // it closes the earner account and refunds the rent to the signer
    test('Remove registrar earner - success', async () => {
      // Get the ATA for earner one
      const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

      // Get the exclusion proof for earner one against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(earnerOne.publicKey);

      // Setup the instruction
      const { earnerAccount } = prepRemoveRegistrarEarner(nonAdmin, earnerOneATA);

      // Remove earner one from the earn manager's list
      await earn.methods
        .removeRegistrarEarner(proofs, neighbors)
        .accountsPartial({ ...accounts })
        .signers([nonAdmin])
        .rpc();

      // Verify the earner account was closed correctly
      expectAccountEmpty(earnerAccount);
    });

    test('Remove registrar earner ownership transfered - success', async () => {
      // Get the ATA for earner two
      const earnerTwoATA = await getATA(mint.publicKey, earnerTwo.publicKey);

      // Setup the instruction
      const { earnerAccount } = prepRemoveRegistrarEarner(nonAdmin, earnerTwoATA);

      // Modify owner on token account
      const accountInfo = svm.getAccount(earnerTwoATA)!;
      accountInfo.data[32] = 0x1;
      svm.setAccount(earnerTwoATA, accountInfo);

      // Token account
      const account = await getAccount(provider.connection, earnerTwoATA, undefined, TOKEN_2022_PROGRAM_ID);

      // Get the exclusion proof for earner two against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(account.owner);

      // Remove earner one from the earn manager's list
      await earn.methods
        .removeRegistrarEarner(proofs, neighbors)
        .accountsPartial({ ...accounts })
        .signers([nonAdmin])
        .rpc();

      // Verify the earner account was closed correctly
      expectAccountEmpty(earnerAccount);
    });

    test('Remove registrar earner, closed token account - success', async () => {
      // Get the ATA for earner one
      const earnerOneATA = await getATA(mint.publicKey, earnerOne.publicKey);

      // Get the exclusion proof for earner one against the earner merkle tree
      const { proofs, neighbors } = earnerMerkleTree.getExclusionProof(earnerOne.publicKey);

      // Setup the instruction
      const { earnerAccount } = prepRemoveRegistrarEarner(nonAdmin, earnerOneATA);

      let ix = createCloseAccountInstruction(
        earnerOneATA,
        nonAdmin.publicKey,
        earnerOne.publicKey,
        [],
        TOKEN_2022_PROGRAM_ID,
      );
      let tx = new Transaction();
      tx.add(ix);
      await provider.sendAndConfirm!(tx, [earnerOne]);
      expectAccountEmpty(earnerOneATA);

      // Remove earner one from the earn manager's list
      await earn.methods
        .removeRegistrarEarner(proofs, neighbors)
        .accountsPartial({ ...accounts })
        .signers([nonAdmin])
        .rpc();

      expectAccountEmpty(earnerAccount);
    });
  });
});
