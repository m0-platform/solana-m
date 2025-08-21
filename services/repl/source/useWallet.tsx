import { Connection, Keypair, VersionedTransaction } from '@solana/web3.js';

export const useWallet = () => {
  const key = Keypair.fromSecretKey(Buffer.from(JSON.parse(process.env.PAYER_KEYPAIR!)));
  const connection = new Connection(process.env.RPC_URL!, 'confirmed');

  const signAndSendTransaction = async (transaction: VersionedTransaction) => {
    transaction.sign([key]);
    return await connection.sendTransaction(transaction);
  };

  return {
    publicKey: key.publicKey,
    signAndSendTransaction,
    network: process.env.NETWORK! as 'mainnet' | 'devnet',
  };
};
