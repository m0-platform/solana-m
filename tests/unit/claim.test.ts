import { BN } from '@coral-xyz/anchor';
import { Connection, Keypair, PublicKey } from '@solana/web3.js';
import * as spl from '@solana/spl-token';
import { EarnAuthority, multiplierToIndex } from '../../sdk/src/earn_auth';
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

// $M mint with a ScaledUiAmount config holding the multiplier
function encodeMint(multiplier: number) {
  const data = Buffer.alloc(spl.getMintLen([spl.ExtensionType.ScaledUiAmountConfig]));
  spl.MintLayout.encode(
    {
      mintAuthorityOption: 0,
      mintAuthority: PublicKey.default,
      supply: BigInt(0),
      decimals: 6,
      isInitialized: true,
      freezeAuthorityOption: 0,
      freezeAuthority: PublicKey.default,
    },
    data,
  );
  data[spl.ACCOUNT_SIZE] = spl.AccountType.Mint;

  const tlv = spl.ACCOUNT_SIZE + 1;
  data.writeUInt16LE(spl.ExtensionType.ScaledUiAmountConfig, tlv);
  data.writeUInt16LE(spl.ScaledUiAmountConfigLayout.span, tlv + 2);
  spl.ScaledUiAmountConfigLayout.encode(
    {
      authority: PublicKey.default,
      multiplier,
      newMultiplierEffectiveTimestamp: BigInt(0),
      newMultiplier: multiplier,
    },
    data,
    tlv + 4,
  );
  return data;
}

// vault $M token account, frozen when the vault is not an approved earner
function encodeVault(mMint: PublicKey, owner: PublicKey, frozen: boolean) {
  const data = Buffer.alloc(spl.ACCOUNT_SIZE);
  spl.AccountLayout.encode(
    {
      mint: mMint,
      owner,
      amount: BigInt(0),
      delegateOption: 0,
      delegate: PublicKey.default,
      state: frozen ? spl.AccountState.Frozen : spl.AccountState.Initialized,
      isNativeOption: 0,
      isNative: BigInt(0),
      delegatedAmount: BigInt(0),
      closeAuthorityOption: 0,
      closeAuthority: PublicKey.default,
    },
    data,
  );
  return data;
}

function buildAuthority(opts: {
  extIndex: number;
  mIndex: number;
  timestamp: number;
  mintMultiplier: number;
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

  // derive the vault ATA by hand so a wrong seed or ATA derivation in the SDK finds no account
  const mVault = PublicKey.findProgramAddressSync([Buffer.from('m_vault')], programId)[0];
  const vaultAta = PublicKey.findProgramAddressSync(
    [mVault.toBuffer(), spl.TOKEN_2022_PROGRAM_ID.toBuffer(), mMint.toBuffer()],
    spl.ASSOCIATED_TOKEN_PROGRAM_ID,
  )[0];
  const accounts = new Map([
    [mMint.toBase58(), encodeMint(opts.mintMultiplier)],
    [vaultAta.toBase58(), encodeVault(mMint, mVault, opts.vaultFrozen)],
  ]);
  (connection as any).getAccountInfo = async (address: PublicKey) => {
    const data = accounts.get(address.toBase58());
    return data ? { data, owner: spl.TOKEN_2022_PROGRAM_ID, lamports: 1, executable: false } : null;
  };

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

async function claim(auth: EarnAuthority, earnManager: PublicKey, earner: any, target?: any): Promise<BN | null> {
  (auth as any).managerCache.set(earnManager, { data: { feeTokenAccount: Keypair.generate().publicKey } });
  return (await auth.buildClaimInstruction(earner, true, target)) as unknown as BN | null;
}

// what claim_for pays for a snapshot balance once the sync writes extIndex
const payout = (snapshot: BN, lastClaimIndex: number, extIndex: number) =>
  snapshot.mul(new BN(extIndex)).div(new BN(lastClaimIndex)).sub(snapshot).toNumber();

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
      mintMultiplier: 1.21,
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
      mintMultiplier: 1.21,
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
      mintMultiplier: 1.21,
      vaultFrozen: true,
    });
    const { earner, earnManager } = buildEarner(1_000_000_000_000, T0);

    // sync leaves the ext index unchanged, so there is nothing to claim
    expect(await claim(auth, earnManager, earner)).toBeNull();
  });

  test('pays only the ext growth when $M grew while the vault was frozen', async () => {
    // ext synced 1.0 -> 1.1, then $M rose 1.1 -> 1.21 while the vault was frozen
    mockDb(
      [
        { ts: T0, index: 1_000_000_000_000 },
        { ts: T0 + DAY, index: 1_100_000_000_000 },
        { ts: T0 + 2 * DAY, index: 1_210_000_000_000 },
      ],
      () => 1000,
    );
    const auth = buildAuthority({
      extIndex: 1_100_000_000_000,
      mIndex: 1_210_000_000_000,
      timestamp: T0 + 2 * DAY,
      mintMultiplier: 1.21,
      vaultFrozen: true,
    });
    const { earner, earnManager } = buildEarner(1_000_000_000_000, T0);

    // y = 210 over $M 1.0 -> 1.21, so b* = 210 / 0.21 = 1000 and claim_for pays 1000 * 0.1 = 100
    // (normalizing against ext 1.1 gives b* = 2100 and pays 210)
    const snapshot = (await claim(auth, earnManager, earner))!;
    expect(snapshot.toNumber()).toBe(1000);
    expect(payout(snapshot, 1_000_000_000_000, 1_100_000_000_000)).toBe(100);
  });

  test('sizes every claim against the pinned target when an index lands mid-loop', async () => {
    const steps = [
      { ts: T0, index: 1_000_000_000_000 },
      { ts: T0 + DAY, index: 1_100_000_000_000 },
      { ts: T0 + 2 * DAY, index: 1_210_000_000_000 },
    ];
    const balanceAt = (ts: number) => (ts < T0 + 3 * DAY ? 1000 : 5000);
    mockDb(steps, balanceAt);
    const auth = buildAuthority({
      extIndex: 1_000_000_000_000,
      mIndex: 1_000_000_000_000,
      timestamp: T0,
      mintMultiplier: 1.21,
      vaultFrozen: false,
    });
    const target = await auth.loadClaimTarget(true);
    expect(target.extIndex.toNumber()).toBe(1_210_000_000_000);

    // a propagation to 1.331 lands after the target is pinned, and the balance jumps with it
    mockDb([...steps, { ts: T0 + 3 * DAY, index: 1_331_000_000_000 }], balanceAt);
    (currentIndex as jest.Mock).mockClear();

    const { earner, earnManager } = buildEarner(1_000_000_000_000, T0);
    expect((await claim(auth, earnManager, earner, target))!.toNumber()).toBe(1000);
    expect(currentIndex).not.toHaveBeenCalled();
  });
});

describe('mint index', () => {
  test('truncates the f64 multiplier like multiplier_to_index', () => {
    // 1e12 * 1.000000000014 is 1000000000013.9999 in f64
    expect(multiplierToIndex(1.000000000014).toNumber()).toBe(1_000_000_000_013);
  });

  test('loadMintIndex decodes the ScaledUiAmount multiplier from the $M mint', async () => {
    const auth = buildAuthority({
      extIndex: 1_000_000_000_000,
      mIndex: 1_000_000_000_000,
      timestamp: T0,
      mintMultiplier: 1.096111330414,
      vaultFrozen: false,
    });
    expect((await auth.loadMintIndex()).toNumber()).toBe(1_096_111_330_414);
  });
});

describe('database validation', () => {
  const authority = (dbIndex: number, mintIndex: number) =>
    ({ loadIndexFromDB: async () => dbIndex, loadMintIndex: async () => new BN(mintIndex) } as any);

  test('throws when the DB is behind the $M mint multiplier', async () => {
    await expect(validateDatabaseData(authority(1_100_000_000_000, 1_210_000_000_000))).rejects.toThrow(
      'Database index does not match mint',
    );
  });

  test('throws when the DB is ahead of the $M mint multiplier', async () => {
    await expect(validateDatabaseData(authority(1_331_000_000_000, 1_210_000_000_000))).rejects.toThrow(
      'Database index does not match mint',
    );
  });

  test('passes when the DB matches the $M mint multiplier', async () => {
    await expect(validateDatabaseData(authority(1_210_000_000_000, 1_210_000_000_000))).resolves.toBeUndefined();
  });

  test('passes when the truncated mint index sits one below the DB', async () => {
    await expect(validateDatabaseData(authority(1_000_000_000_014, 1_000_000_000_013))).resolves.toBeUndefined();
  });
});
