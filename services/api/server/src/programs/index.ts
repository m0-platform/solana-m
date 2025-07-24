import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet';
import { ExtSwap } from './ext_swap';
import EXT_SWAP from './ext_swap.json';
import { AnchorProvider, Program } from '@coral-xyz/anchor';
import { Connection, Keypair } from '@solana/web3.js';

export const getSwapProgram = (connection: Connection) => {
  const dummyKey = Keypair.generate();
  return new Program<ExtSwap>(EXT_SWAP, new AnchorProvider(connection, new NodeWallet(dummyKey)));
};
