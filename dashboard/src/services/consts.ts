import { PublicKey } from '@solana/web3.js';

export const EARN_PROGRAM_ID = new PublicKey('mz2vDzjbQDUDXBH6FPF5s4odCJ4y8YLE5QWaZ8XdZ9Z');
export const EXT_EARN_PROGRAM_ID = new PublicKey('wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko');
export const PORTAL = new PublicKey('mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY');

export const MINTS = { M: new PublicKey('mzerojk9tg56ebsrEAhfkyc9VgKjTW2zDqp6C5mhjzH') };

export const M_EVM = '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b';

export const EVM_TOKENS = [
  {
    address: M_EVM,
    symbol: 'M',
    icon: 'https://gistcdn.githack.com/SC4RECOIN/a729afb77aa15a4aa6b1b46c3afa1b52/raw/209da531ed46c1aaef0b1d3d7b67b3a5cec257f3/M_Symbol_512.svg',
  },
  {
    address: '0x437cc33344a0B27A429f795ff6B469C72698B291',
    symbol: 'wM',
    icon: 'https://gistcdn.githack.com/SC4RECOIN/d383d31baee720e8481edae4620eb047/raw/00cd11302f663bf5fe086d5b71b81d1fb0fb31ac/wM_Symbol_512.svg',
  },
];

export const SWAP_LUT =
  import.meta.env.VITE_NETWORK === 'devnet'
    ? new PublicKey('6GhuWPuAmiJeeSVsr58KjqHcAejJRndCx9BVtHkaYHUR')
    : new PublicKey('9JLRqBqkznKiSoNfotA4ywSRdnWb2fE76SiFrAfkaRCD');
