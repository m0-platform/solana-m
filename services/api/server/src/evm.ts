import { createPublicClient, getContract, http } from 'viem';

const client = createPublicClient({ transport: http(process.env.EVM_RPC!) });

export async function getCurrentIndex(): Promise<number> {
  const contract = getMTokenContract();
  return Number(await contract.read.currentIndex());
}

export async function getEarnerRate(): Promise<number> {
  const contract = getMTokenContract();
  return await contract.read.earnerRate();
}

function getMTokenContract() {
  const abi = [
    {
      inputs: [],
      name: 'currentIndex',
      outputs: [{ internalType: 'uint256', name: 'currentIndex', type: 'uint256' }],
      stateMutability: 'view',
      type: 'function',
    },
    {
      inputs: [],
      name: 'earnerRate',
      outputs: [{ internalType: 'uint32', name: 'earnerRate', type: 'uint32' }],
      stateMutability: 'view',
      type: 'function',
    },
  ] as const;

  return getContract({
    address: '0x866A2BF4E572CbcF37D5071A7a58503Bfb36be1b',
    abi,
    client,
  });
}
