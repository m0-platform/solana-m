import { Connection, PublicKey, TransactionInstruction } from '@solana/web3.js';
import { PublicClient } from 'viem';

import { EvmCaller } from './evm_caller';
import { Earner } from './earner';
import { ETH_M_ADDRESS, ETH_MERKLE_TREE_BUILDER, GLOBAL_ACCOUNT, MINT, PROGRAM_ID, TOKEN_2022_ID } from '.';
import { MerkleTree } from './merkle';
import * as spl from '@solana/spl-token';
import { Program } from '@coral-xyz/anchor';
import { getProgram } from './idl';
import { Earn } from './idl/earn';
import { MockLogger, Logger } from './logger';
import { unpackAccount } from '@solana/spl-token';

export class Registrar {
  private logger: Logger;
  private connection: Connection;
  private evmClient: PublicClient;
  private program: Program<Earn>;
  private _mint: PublicKey | undefined;

  constructor(connection: Connection, evmClient: PublicClient, logger: Logger = new MockLogger()) {
    this.connection = connection;
    this.logger = logger;
    this.evmClient = evmClient;
    this.program = getProgram(connection);
  }

  async getMint(): Promise<PublicKey> {
    if (this._mint) {
      return this._mint;
    }
    this._mint = (await this.program.account.global.fetch(GLOBAL_ACCOUNT)).mint;
    return this._mint;
  }

  async buildMissingEarnersInstructions(
    signer: PublicKey,
    merkleTreeAddress = ETH_MERKLE_TREE_BUILDER,
  ): Promise<TransactionInstruction[]> {
    // get all earners that should be registered
    const evmCaller = new EvmCaller(this.evmClient, ETH_M_ADDRESS, merkleTreeAddress);
    const earners = await evmCaller.getEarners();

    const ixs: TransactionInstruction[] = [];
    for (const user of earners) {
      const existingEarners = await Earner.fromUserAddress(this.connection, this.evmClient, user, PROGRAM_ID);
      if (existingEarners.length > 0) {
        continue;
      }

      this.logger.info('adding earner', { user: user.toBase58() });

      // derive token account for user
      const userTokenAccount = spl.getAssociatedTokenAddressSync(
        await this.getMint(),
        user,
        true,
        spl.TOKEN_2022_PROGRAM_ID,
      );

      // build proof
      const tree = new MerkleTree(earners);
      const { proof } = tree.getInclusionProof(user);

      ixs.push(
        await this.program.methods
          .addRegistrarEarner(user, proof)
          .accounts({
            signer: signer,
            userTokenAccount,
          })
          .instruction(),
      );
    }

    return ixs;
  }

  async buildRemovedEarnersInstructions(
    signer: PublicKey,
    merkleTreeAddress = ETH_MERKLE_TREE_BUILDER,
  ): Promise<TransactionInstruction[]> {
    // get all earners on registrar
    const evmCaller = new EvmCaller(this.evmClient, ETH_M_ADDRESS, merkleTreeAddress);
    const earners = await evmCaller.getEarners();

    // get all eaners on the earn program
    const programEarners = await this.getRegistrarEarners();

    const ixs: TransactionInstruction[] = [];
    for (const earner of programEarners) {
      // load token account to get owner
      try {
        const info = await this.connection.getAccountInfo(earner.data.userTokenAccount);

        // if token account is not found then continue to remove earner
        if (info) {
          const tokenAccount = unpackAccount(earner.data.userTokenAccount, info, TOKEN_2022_ID);

          // token account owner is part of registrar
          if (earners.find((e) => e.equals(tokenAccount.owner))) {
            continue;
          }
        }
      } catch (e) {
        this.logger.error('failed to load token account', {
          tokenAccount: earner.data.userTokenAccount.toBase58(),
          earner: earner.pubkey.toBase58(),
          error: e,
        });
        continue;
      }

      this.logger.info('removing earner', {
        user: earner.data.user.toBase58(),
        pubkey: earner.pubkey.toBase58(),
      });

      // build proof
      const tree = new MerkleTree(earners);
      const { proofs, neighbors } = tree.getExclusionProof(earner.data.user);

      ixs.push(
        await this.program.methods
          .removeRegistrarEarner(proofs, neighbors)
          .accounts({
            signer: signer,
          })
          .instruction(),
      );
    }

    return ixs;
  }

  async getRegistrarEarners(): Promise<Earner[]> {
    const accounts = await getProgram(this.connection).account.earner.all();
    return accounts.map((a) => new Earner(this.connection, this.evmClient, a.publicKey, a.account, MINT));
  }
}
