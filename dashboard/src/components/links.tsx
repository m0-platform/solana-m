import { MINTS } from '../services/consts';
import { NETWORK } from '../services/rpc';

type LinkItem = {
  name: string;
  address: string;
};

const programLinks: LinkItem[] = [
  { name: 'Earn Program', address: 'MzeRokYa9o1ZikH6XHRiSS5nD8mNjZyHpLCBRTBSY4c' },
  { name: 'Ext Earn Program', address: 'wMXX1K1nca5W4pZr1piETe78gcAVVrEFi9f4g46uXko' },
  { name: 'Portal Program', address: 'mzp1q2j5Hr1QuLC3KFBCAUz5aUckT6qyuZKZ3WJnMmY' },
];

const mintLinks: LinkItem[] = [
  { name: 'M by M0', address: MINTS.M.toBase58() },
  { name: 'WrappedM by M0', address: MINTS.wM.toBase58() },
];

export const Links = () => {
  return (
    <div className="pt-10 max-w-4xl mx-auto px-4 space-y-10">
      {Object.entries({ Programs: programLinks, Mints: mintLinks }).map(([title, items]) => (
        <div key={title}>
          <div className="text-xl pl-1 mb-3">{title}</div>
          <table className="w-full text-sm text-left rtl:text-right text-xs">
            <tbody>
              {items?.map((program) => (
                <tr key={program.name} className="border-b border-gray-200">
                  <td className="px-2 py-4">{program.name}</td>
                  <td className="px-2 py-4">
                    <a
                      href={`https://solscan.io/account/${program.address}?cluster=${NETWORK}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline"
                    >
                      <span className="hidden sm:block">{program.address}</span>
                      <span className="sm:hidden">{formatString(program.address, 8)}</span>
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </div>
  );
};

const formatString = (addressOrSig: string, chars = 6) => {
  return `${addressOrSig.slice(0, chars)}...${addressOrSig.slice(-chars)}`;
};
