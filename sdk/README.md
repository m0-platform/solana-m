# M0 Solana SDK

This SDK contains common actions for earn managers and program admins for M and M extensions

```bash
npm i @m0-foundation/solana-m-sdk
```

https://www.npmjs.com/package/@m0-foundation/solana-m-sdk

### Sample Usage

```typescript
import { EarnManager } from '@m0-foundation/solana-m-sdk';

const manager = await EarnManager.fromManagerAddress(connection, evmClient, manager.publicKey);
const ix = await manager.buildAddEarnerInstruction(user);

const earner = await Earner.fromTokenAccount(connection, evmClient, tokenAccount);
const claims = await earner.getHistoricalClaims();
```
