# Earn

Manages the approved $M earner registry and turns index updates from Ethereum into
[ScaledUiAmount](https://www.solana-program.com/docs/token-2022/extensions#scaled-ui-amount)
multiplier updates on the $M mint. Yield accrues automatically to every thawed token account —
there are no claim cycles. Holding $M is permissioned: the mint's default account state is
Frozen, and only accounts of merkle-proven earners get thawed.

Program ID: `mz2vDzjbQDUDXBH6FPF5s4odCJ4y8YLE5QWaZ8XdZ9Z`

## Instructions

| Instruction | Caller | Effect |
| --- | --- | --- |
| `initialize(current_index)` | admin | Creates `EarnGlobal`, validates the mint extensions (see below), sets the initial multiplier, thaws the Portal and `ext_swap` ATAs. With the `migrate` feature it instead takes no args and copies index, timestamp, and merkle root from the v1 earn program |
| `recover_m(amount?)` | admin | Recovers $M from a frozen token account: thaw → transfer via permanent delegate → re-freeze |
| `update_portal_authority()` | admin | Re-derives the Portal's authority PDA into `portal_authority` and thaws its ATA |
| `propagate_index(index, root)` | portal authority¹ | Stores a non-zero earner merkle root and raises the multiplier if the index increased (monotonic; stale cross-chain updates are ignored). Emits `IndexUpdateV2` |
| `add_registrar_earner(user, proof)` | anyone | Verifies merkle **inclusion** of `user` and thaws their token account (must be frozen with an immutable owner) |
| `remove_registrar_earner(proofs, neighbors)` | anyone | Verifies merkle **exclusion** of the account owner and freezes their token account; Portal/`ext_swap` accounts cannot be removed |

¹ With the `testing` feature, the admin may also call `propagate_index`.

## State & PDAs

- **`EarnGlobal`** — seed `"global"`, the single config account and program signer: `admin`,
  `m_mint`, `portal_authority`, `ext_swap_global_account`, `earner_merkle_root`, `bump`.
- The Portal's token authority is derived with seed `"authority"` under the Portal program
  (`MzBrgc8yXBj4P16GTkcSyDZkEQZB9qDqf3fh9bByJce`, source in
  [solana-portal](https://github.com/m0-foundation/solana-portal)).

`initialize` enforces that the $M mint carries the **ScaledUiAmount**, **DefaultAccountState
(Frozen)**, and **PermanentDelegate** extensions with the `EarnGlobal` PDA as scaled-ui
authority, freeze authority, and permanent delegate.

## Index → multiplier math

The $M index is the multiplier scaled by `1e12` (`INDEX_SCALE`): a multiplier of `1.05` is the
index `1_050_000_000_000`. `propagate_index` only ever raises the multiplier. The
`utils/conversion.rs` helpers convert between raw principal and UI amount with integer math,
with explicit `_up`/`_down` rounding variants so dust never favors the user.

## Feature flags

Defined in [Cargo.toml](Cargo.toml); always pass `--no-default-features` when selecting flags.

- `testing` *(default)* — additionally lets the admin call `propagate_index`
- `migrate` — `initialize` migrates state from the v1 earn program instead of taking an index
- `devnet` / `mainnet` — environment builds for deployment
- `cpi` — generates the CPI client crate (implies `no-entrypoint`)

## Build & test

```bash
anchor build -p earn
make build-test-earn-programs   # builds the testing + migrate,testing fixtures (required once)
make test-earn
```

Audited by Asymmetric Research, Sec3, OtterSec, and Halborn ([audits/](../../audits/));
security policy in [SECURITY.md](../../SECURITY.md).
