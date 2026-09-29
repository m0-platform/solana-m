import { BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import { EarnAuthority } from '../../sdk/src/earn_auth';
import { currentIndex, getBalanceAt, indexUpdates } from '../../sdk/src/db';
import { validateDatabaseData } from '../../services/shared/validation';

jest.mock('../../sdk/src/db', () => ({
  currentIndex: jest.fn(),
  getBalanceAt: jest.fn(),
  indexUpdates: jest.fn(),
}));

const DAY = 86400;
const T0 = 1_700_000_000;

// $M index updates as the DB holds them, oldest first
type Step = { ts: number; index: number };

function mockDb(steps: Step[], balanceAt: (ts: number) => number) {
  const rows = steps.map((s) => ({ index: s.index, ts: new Date(s.ts * 1000) }));
  const latest = rows[rows.length - 1];

  (currentIndex as jest.Mock).mockResolvedValue(latest);
  (getBalanceAt as jest.Mock).mockImplementation(
    async (_ta, _mint, ts: Date) => new BN(balanceAt(ts.getTime() / 1000)),
  );

  // same bounds and newest-first order as the Mongo query
  (indexUpdates as jest.Mock).mockImplementation(async ({ fromTime, toTime }) =>
    rows.filter((r) => r.ts.getTime() >= fromTime * 1000 && (!toTime || r.ts.getTime() < toTime * 1000)).reverse(),
  );
}

function buildAuthority(opts: {
  extIndex: number;
  mIndex: number;
  timestamp: number;
  mintIndex: number;
  vaultFrozen: boolean;
}) {
  const programId = Keypair.generate().publicKey;
  const mMint = Keypair.generate().publicKey;
  const connection = new Connection('http://127.0.0.1:1');

  const auth: EarnAuthority = new (EarnAuthority as any)(
    connection,
    {
      extMint: Keypair.generate().publicKey,
      mMint,
      variant: 'Crank',
      index: new BN(opts.extIndex),
      mIndex: new BN(opts.mIndex),
      timestamp: new BN(opts.timestamp),
      earnAuthority: Keypair.generate().publicKey,
    },
    programId,
  );

  // vault $M token account, frozen when the vault is not an approved earner
  const data = Buffer.alloc(spl.ACCOUNT_SIZE);
  spl.AccountLayout.encode(
    {
      mint: mMint,
      owner: programId,
      amount: BigInt(0),
      delegateOption: 0,
      delegate: PublicKey.default,
      state: opts.vaultFrozen ? spl.AccountState.Frozen : spl.AccountState.Initialized,
      isNativeOption: 0,
      isNative: BigInt(0),
      delegatedAmount: BigInt(0),
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    data,
  );
  (connection as any).getAccountInfo = async () => ({
    data,
    owner: spl.TOKEN_2022_PROGRAM_ID,
    lamports: 1,
    executable: false,
  });
  jest.spyOn(auth, 'loadMintIndex').mockResolvedValue(new BN(opts.mintIndex));

  // capture the snapshot balance instead of building a real instruction
  (auth as any).program = {
    programId,
    methods: { claimFor: (b: BN) => ({ accountsPartial: () => ({ instruction: async () => b }) }) },
  };

  return auth;
}

function buildEarner(lastClaimIndex: number, lastClaimTimestamp: number) {
  const earnManager = Keypair.generate().publicKey;
  return {
    earnManager,
    earner: {
      pubkey: Keypair.generate().publicKey,
      data: {
        lastClaimIndex: new BN(lastClaimIndex),
        lastClaimTimestamp: new BN(lastClaimTimestamp),
        userTokenAccount: Keypair.generate().publicKey,
        recipientTokenAccount: null,
        earnManager,
      },
    } as any,
  };
}

async function claim(auth: EarnAuthority, earnManager: PublicKey, earner: any): Promise<BN | null> {
  (auth as any).managerCache.set(earnManager, { data: { feeTokenAccount: Keypair.generate().publicKey } });
  return (await auth.buildClaimInstruction(earner, true)) as unknown as BN | null;
}

describe('claim calculation', () => {
  beforeEach(() => jest.clearAllMocks());

  test('walks every index update while global timestamp is frozen', async () => {
    // global timestamp stuck at T0 while $M index grows and the balance jumps 10x
    mockDb(
      [
        { ts: T0, index: 1_000_000_000_000 },
        { ts: T0 + DAY, index: 1_100_000_000_000 },
        { ts: T0 + 2 * DAY, index: 1_210_000_000_000 },
      ],
      (ts) => (ts < T0 + 2 * DAY ? 100 : 1000),
    );
    const auth = buildAuthority({
      extIndex: 1_000_000_000_000,
      mIndex: 1_000_000_000_000,
      timestamp: T0,
      mintIndex: 1_210_000_000_000,
      vaultFrozen: false,
    });
    const { earner, earnManager } = buildEarner(1_000_000_000_000, T0);

    // y = (100 * 1.1 - 100) = 10, then (10 + 1000) * 1.21 / 1.1 - 1000 = 111
    // b* = 111 * 1e12 / 0.21e12 = 528 (a single step at the current balance gives 1000)
    expect((await claim(auth, earnManager, earner))!.toNumber()).toBe(528);
    expect((getBalanceAt as jest.Mock).mock.calls.map((c) => (c[2] as Date).getTime() / 1000)).toEqual([
      T0 + DAY,
      T0 + 2 * DAY,
    ]);
  });

  test('sizes the claim against the projected ext index when ext differs from $M', async () => {
    // new crank: ext index started at 1e12 while $M was already at 1.1e12
    mockDb(
      [
        { ts: T0, index: 1_100_000_000_000 },
        { ts: T0 + DAY, index: 1_210_000_000_000 },
      ],
      () => 1000,
    );
    const auth = buildAuthority({
      extIndex: 1_000_000_000_000,
      mIndex: 1_100_000_000_000,
      timestamp: T0,
      mintIndex: 1_210_000_000_000,
      vaultFrozen: false,
    });
    const { earner, earnManager } = buildEarner(1_000_000_000_000, T0);

    const snapshot = (await claim(auth, earnManager, earner))!;

    // sync writes ext = 1e12 * 1.21e12 / 1.1e12 = 1.1e12, so claim_for pays 1000 * 1.1 - 1000 = 100 = y
    const projectedExt = new BN(1_100_000_000_000);
    expect(snapshot.toNumber()).toBe(1000);
    expect(snapshot.mul(projectedExt).div(earner.data.lastClaimIndex).sub(snapshot).toNumber()).toBe(100);
  });

  test('skips the claim when the vault is not an earner', async () => {
    mockDb(
      [
        { ts: T0, index: 1_100_000_000_000 },
        { ts: T0 + DAY, index: 1_210_000_000_000 },
      ],
      () => 1000,
    );
    const auth = buildAuthority({
      extIndex: 1_000_000_000_000,
      mIndex: 1_100_000_000_000,
      timestamp: T0,
      mintIndex: 1_210_000_000_000,
      vaultFrozen: true,
    });
    const { earner, earnManager } = buildEarner(1_000_000_000_000, T0);

    // sync leaves the ext index unchanged, so there is nothing to claim
    expect(await claim(auth, earnManager, earner)).toBeNull();
  });
});

describe('database validation', () => {
  const authority = (dbIndex: number, mintIndex: number) =>
    ({ loadIndexFromDB: async () => dbIndex, loadMintIndex: async () => new BN(mintIndex) } as any);

  test('throws when the DB is behind the $M mint multiplier', async () => {
    await expect(validateDatabaseData(authority(1_100_000_000_000, 1_210_000_000_000))).rejects.toThrow(
      'Database index is not up to date',
    );
  });

  test('passes when the DB matches the $M mint multiplier', async () => {
    await expect(validateDatabaseData(authority(1_210_000_000_000, 1_210_000_000_000))).resolves.toBeUndefined();
  });
});
