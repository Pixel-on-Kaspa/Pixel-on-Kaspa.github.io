# pay-rewards.ts

Payout script for $PIXEL KRC-20 rewards to original NFT minters.

## Rewards go to the MINTER, not the current holder

For each NFT the script fetches the first history entry via:

```
GET /api/v1/krc721/mainnet/history/{tick}/{id}?direction=forward&limit=1
```

The `owner` field in that entry is the minter (mint destination address). Rewards
always go to this address, regardless of subsequent transfers.

---

## Prerequisites

- [Bun](https://bun.sh) >= 1.0
- `kaspa-wasm` npm package (see below)
- Treasury wallet private key (hex, without 0x prefix)

---

## Setup

### 1. Install dependencies

```bash
cd <repo-root>
bun add kaspa-wasm
```

### 2. Configure .env

Copy `.env.example` and fill in your values:

```bash
cp .env.example .env
```

Required keys:

| Variable | Description |
|---|---|
| `PIXEL_PRIVATE_KEY` | Hex private key of the treasury wallet sending $PIXEL |
| `TREASURY_ADDRESS` | kaspa:q… address of that wallet (for display/verification) |

The `.env` file is gitignored. Never commit it.

### 3. WASM binary (if kaspa-wasm npm fails)

If `bun add kaspa-wasm` installs but the script fails at runtime with a WASM loading
error, use the manual WASM approach from coinchimp/kaspa-krc20-apps:

```bash
# Download the Kaspa WASM SDK (nodejs build)
# https://kaspa.aspectron.org/nightly/downloads/
# Extract the zip, copy the nodejs/ folder to <repo-root>/wasm/
```

Then change the import in `pay-rewards.ts`:

```diff
- kaspa = await import("kaspa-wasm");
+ kaspa = await import("../wasm/kaspa");
```

---

## Usage

### Dry run (recommended first)

Fetches all data, prints the payout table, does NOT send any transactions:

```bash
bun run scripts/pay-rewards.ts --dry-run
```

### Pay both collections

```bash
bun run scripts/pay-rewards.ts
```

### Pay a single collection

```bash
bun run scripts/pay-rewards.ts --collection SYKORA
bun run scripts/pay-rewards.ts --collection PIXELONKAS
```

### Dry run for one collection

```bash
bun run scripts/pay-rewards.ts --dry-run --collection SYKORA
```

---

## Reward table

### SYKORA (trait: Rarity / Style)

| Trait | Value | $PIXEL reward |
|---|---|---|
| Rarity | Special (= Ice) | 100,000,000 |
| Style | Black | 80,000,000 |
| Style | Pink | 40,000,000 |
| other | — | 0 |

### PIXELONKAS (trait: Color)

| Color | $PIXEL reward |
|---|---|
| Super Broken | 1,000,000,000 |
| Broken | 100,000,000 |
| Grey | 80,000,000 |
| Orange | 50,000,000 |
| Yellow | 30,000,000 |
| Pink | 26,000,000 |
| Red | 24,000,000 |
| Purple | 22,000,000 |
| White | 20,000,000 |
| Green | 15,000,000 |
| Black | 12,000,000 |
| Blue | 12,000,000 |

---

## Idempotence

Before sending, the script reads all files matching `logs/rewards-*.json` and builds
a set of already-paid minter addresses. Any address found in the logs is skipped with
a warning — it will never be paid twice, even if you re-run the script.

If a transfer fails mid-run (network error, insufficient KAS for gas, etc.), the failed
address is NOT added to the paid set. Re-running the script will retry it.

Log format per entry:

```json
{
  "minterAddress": "kaspa:q…",
  "sykoraTokens": [1181],
  "pixelonkasTokens": [],
  "amount": 100000000,
  "txHash": "abc123…",
  "timestamp": "2026-04-04T10:00:00.000Z"
}
```

Logs are gitignored (`logs/` in .gitignore). Keep them locally as your audit trail.

---

## KRC-20 transfer mechanics

Each payout executes a two-step commit/reveal:

1. **Commit** — sends 0.3 KAS to a P2SH address derived from the inscription script
   (which encodes the KRC-20 transfer data). Costs ~0.3 KAS in gas.

2. **Reveal** — spends the P2SH UTXO, triggering the Kasplex indexer to process the
   inscription and credit the $PIXEL to the destination address.
   Costs another ~0.3 KAS in gas.

Total gas per payout: ~0.6 KAS. Ensure the treasury wallet has enough KAS.
The $PIXEL amount comes from the treasury wallet's KRC-20 balance.

---

## Troubleshooting

**`PIXEL_PRIVATE_KEY missing in .env`**
Add `PIXEL_PRIVATE_KEY=<hex>` to your `.env` file.

**`cannot import kaspa-wasm`**
Run `bun add kaspa-wasm`. If that does not fix it, use the manual WASM approach (see Setup section).

**Transfer fails with `Insufficient KAS for gas`**
Top up the treasury wallet with KAS. Each transfer needs ~0.6 KAS for commit + reveal gas.

**`Timeout: commit UTXO not found`**
The Kaspa network may be congested or the node unresponsive. Re-run — idempotence ensures
already-paid addresses are skipped.
