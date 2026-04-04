#!/usr/bin/env bun
/**
 * pay-rewards.ts — PIXEL on Kaspa rewards payout
 *
 * Sends $PIXEL KRC-20 rewards to the ORIGINAL MINTER of each NFT.
 * Rewards follow the minter (first owner), not the current holder.
 *
 * Usage:
 *   bun run scripts/pay-rewards.ts [--dry-run] [--collection SYKORA|PIXELONKAS]
 */

import { readFileSync, existsSync, mkdirSync, readdirSync, writeFileSync } from "fs";
import { join, dirname } from "path";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const ROOT = join(dirname(Bun.main), "..");
const LOGS_DIR = join(ROOT, "logs");

function loadEnv(): Record<string, string> {
  const envPath = join(ROOT, ".env");
  if (!existsSync(envPath)) throw new Error(".env not found at repo root");
  const env: Record<string, string> = {};
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

// ─── CONSTANTS ───────────────────────────────────────────────────────────────

const API_BASE = "https://mainnet.krc721.stream/api/v1/krc721/mainnet";
const IPFS_GW = [
  "https://ipfs.io/ipfs/",
  "https://dweb.link/ipfs/",
  "https://cloudflare-ipfs.com/ipfs/",
];
const CONCURRENCY = 5;
const NETWORK = "mainnet";
const TICK = "PIXEL";

const COLLECTIONS: Record<string, { buri: string; max: number }> = {
  SYKORA: {
    buri: "bafybeifema4upmzu7c4iipvxdagctirxf46g3htmsin6l66zm77dibfhaq",
    max: 2518,
  },
  PIXELONKAS: {
    buri: "bafybeih2phpjzxfrszsscpmxdr44kliaddto3sicsdh44kgx7b3f43fdvm",
    max: 342,
  },
};

const REWARDS: Record<string, Record<string, number>> = {
  SYKORA: {
    Ice: 100_000_000,
    Black: 80_000_000,
    Pink: 40_000_000,
  },
  PIXELONKAS: {
    "Super Broken": 1_000_000_000,
    Broken: 100_000_000,
    Grey: 80_000_000,
    Orange: 50_000_000,
    Yellow: 30_000_000,
    Pink: 26_000_000,
    Red: 24_000_000,
    Purple: 22_000_000,
    White: 20_000_000,
    Green: 15_000_000,
    Black: 12_000_000,
    Blue: 12_000_000,
  },
};

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface TokenInfo {
  tick: string;
  tokenId: number;
  minter: string;
  color: string | null;
  edition: string | null;
  reward: number;
}

interface RewardRow {
  minter: string;
  sykoraTokens: number[];
  pixelonkasTokens: number[];
  totalReward: number;
}

interface LogEntry {
  minterAddress: string;
  sykoraTokens: number[];
  pixelonkasTokens: number[];
  amount: number;
  txHash: string;
  timestamp: string;
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": "pixel-pay-rewards/1.0" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`);
  return res.json();
}

async function fetchIpfs(cid: string, tokenId: number): Promise<any> {
  for (const gw of IPFS_GW) {
    for (const path of [`${cid}/${tokenId}`, `${cid}/${tokenId}.json`]) {
      try {
        const res = await fetch(gw + path, { signal: AbortSignal.timeout(12_000) });
        if (res.ok) return await res.json();
      } catch {
        // try next gateway
      }
    }
  }
  return null;
}

// ─── CONCURRENCY ─────────────────────────────────────────────────────────────

async function runConcurrent<T>(
  items: T[],
  fn: (item: T) => Promise<void>,
  concurrency: number
): Promise<void> {
  let i = 0;
  const worker = async () => {
    while (i < items.length) {
      await fn(items[i++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

// ─── MINTED IDs ──────────────────────────────────────────────────────────────

function parseMintedIds(rangesStr: string, max: number): number[] {
  const nums = String(rangesStr)
    .split(",")
    .map(Number)
    .filter((n) => Number.isFinite(n));
  const available = new Set<number>();
  for (let i = 0; i < nums.length - 1; i += 2) {
    for (let j = 0; j < nums[i + 1]; j++) available.add(nums[i] + j);
  }
  const minted: number[] = [];
  for (let id = 1; id <= max; id++) {
    if (!available.has(id)) minted.push(id);
  }
  return minted;
}

async function getMintedIds(tick: string): Promise<number[]> {
  const raw = await fetchJson(`${API_BASE}/ranges/${encodeURIComponent(tick)}`);
  const res = raw?.result ?? raw;
  const rangesStr = typeof res === "string" ? res : (res?.ranges ?? "");
  return parseMintedIds(rangesStr, COLLECTIONS[tick].max);
}

// ─── TOKEN METADATA ───────────────────────────────────────────────────────────

async function getMinter(tick: string, tokenId: number): Promise<string | null> {
  try {
    const raw = await fetchJson(
      `${API_BASE}/history/${encodeURIComponent(tick)}/${tokenId}?direction=forward&limit=1`
    );
    const entries = Array.isArray(raw?.result) ? raw.result : raw;
    return entries?.[0]?.owner ?? null;
  } catch {
    return null;
  }
}

function getAttr(attrs: any[], traitType: string): string | null {
  if (!Array.isArray(attrs)) return null;
  const t = traitType.toLowerCase();
  const a = attrs.find((a) => (a?.trait_type ?? a?.type ?? "").toLowerCase() === t);
  return a ? String(a.value ?? "") : null;
}

function resolveColor(tick: string, attrs: any[]): string | null {
  if (tick === "SYKORA") {
    const rarity = getAttr(attrs, "Rarity");
    return rarity?.toLowerCase() === "special" ? "Ice" : getAttr(attrs, "Style");
  }
  return getAttr(attrs, "Color");
}

function getReward(tick: string, color: string | null): number {
  if (!color) return 0;
  const table = REWARDS[tick];
  if (!table) return 0;
  for (const [k, v] of Object.entries(table)) {
    if (k.toLowerCase() === color.toLowerCase()) return v;
  }
  return 0;
}

// ─── IDEMPOTENCE ──────────────────────────────────────────────────────────────

function loadPaidMinters(): Set<string> {
  const paid = new Set<string>();
  if (!existsSync(LOGS_DIR)) return paid;
  for (const file of readdirSync(LOGS_DIR)) {
    if (!file.startsWith("rewards-") || !file.endsWith(".json")) continue;
    try {
      const entries: LogEntry[] = JSON.parse(readFileSync(join(LOGS_DIR, file), "utf-8"));
      for (const e of entries) {
        if (!e.txHash.startsWith("FAILED:")) paid.add(e.minterAddress.toLowerCase());
      }
    } catch {
      // corrupt log file — skip
    }
  }
  return paid;
}

function saveLog(entries: LogEntry[]): void {
  if (entries.length === 0) return;
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });
  const file = join(LOGS_DIR, `rewards-${new Date().toISOString().slice(0, 10)}.json`);
  // Merge with existing log for the same day if it exists
  let existing: LogEntry[] = [];
  if (existsSync(file)) {
    try {
      existing = JSON.parse(readFileSync(file, "utf-8"));
    } catch {}
  }
  writeFileSync(file, JSON.stringify([...existing, ...entries], null, 2));
  console.log(`\nLog saved: ${file}`);
}

// ─── TABLE ────────────────────────────────────────────────────────────────────

function printTable(rows: RewardRow[]): void {
  const W_ADDR = 67;
  const W_SYK = 14;
  const W_PXK = 16;
  const W_TOT = 20;

  const fmtIds = (ids: number[]) =>
    ids.length === 0
      ? "—"
      : ids.slice(0, 4).join(",") + (ids.length > 4 ? `…(+${ids.length - 4})` : "");

  const line = "─".repeat(W_ADDR + W_SYK + W_PXK + W_TOT + 6);
  const header = [
    "Minter address".padEnd(W_ADDR),
    "SYKORA #".padEnd(W_SYK),
    "PIXELONKAS #".padEnd(W_PXK),
    "$PIXEL reward".padStart(W_TOT),
  ].join("  ");

  console.log("\n" + line);
  console.log(header);
  console.log(line);

  let grand = 0;
  for (const row of rows) {
    console.log(
      [
        row.minter.padEnd(W_ADDR),
        fmtIds(row.sykoraTokens).padEnd(W_SYK),
        fmtIds(row.pixelonkasTokens).padEnd(W_PXK),
        row.totalReward.toLocaleString("en-US").padStart(W_TOT),
      ].join("  ")
    );
    grand += row.totalReward;
  }

  console.log(line);
  console.log(
    `  ${rows.length} addresses  |  TOTAL: ${grand.toLocaleString("en-US")} $PIXEL`
  );
  console.log(line + "\n");
}

// ─── KRC-20 TRANSFER ─────────────────────────────────────────────────────────

async function waitForP2shUtxo(rpc: any, p2shAddress: string, timeoutMs = 120_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { entries } = await rpc.getUtxosByAddresses({ addresses: [p2shAddress] });
    if (entries && entries.length > 0) return;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  throw new Error(`Timeout: commit UTXO not found at ${p2shAddress} after ${timeoutMs / 1000}s`);
}

async function sendKrc20Transfer(
  privateKeyHex: string,
  destination: string,
  amount: number,
  rpc: any,
  kaspa: any
): Promise<string> {
  const {
    PrivateKey,
    ScriptBuilder,
    Opcodes,
    addressFromScriptPublicKey,
    createTransactions,
    kaspaToSompi,
  } = kaspa;

  const privateKey = new PrivateKey(privateKeyHex);
  const publicKey = privateKey.toPublicKey();
  const senderAddress = publicKey.toAddress(NETWORK).toString();

  // Build KRC-20 inscription script
  // amt must be in the token's smallest unit: display_amount × 10^dec (PIXEL dec=8)
  const amtRaw = (BigInt(amount) * 100_000_000n).toString();
  const payload = { p: "krc-20", op: "transfer", tick: TICK, amt: amtRaw, to: destination };
  const script = new ScriptBuilder()
    .addData(publicKey.toXOnlyPublicKey().toString())
    .addOp(Opcodes.OpCheckSig)
    .addOp(Opcodes.OpFalse)
    .addOp(Opcodes.OpIf)
    .addData(Buffer.from("kasplex"))
    .addI64(0n)
    .addData(Buffer.from(JSON.stringify(payload, null, 0)))
    .addOp(Opcodes.OpEndIf);

  const p2shAddress = addressFromScriptPublicKey(
    script.createPayToScriptHashScript(),
    NETWORK
  )!.toString();

  const GAS = kaspaToSompi("0.3")!;

  // ── Step 1: Commit ────────────────────────────────────────────────────────
  const { entries: senderEntries } = await rpc.getUtxosByAddresses({ addresses: [senderAddress] });
  const { transactions: commitTxs } = await createTransactions({
    priorityEntries: [],
    entries: senderEntries,
    outputs: [{ address: p2shAddress, amount: GAS }],
    changeAddress: senderAddress,
    priorityFee: GAS,
    networkId: NETWORK,
  });

  let commitHash = "";
  for (const tx of commitTxs) {
    tx.sign([privateKey]);
    commitHash = await tx.submit(rpc);
  }

  // Wait for commit UTXO to appear on-chain
  await waitForP2shUtxo(rpc, p2shAddress);

  // ── Step 2: Reveal ────────────────────────────────────────────────────────
  const [{ entries: senderEntries2 }, { entries: p2shEntries }] = await Promise.all([
    rpc.getUtxosByAddresses({ addresses: [senderAddress] }),
    rpc.getUtxosByAddresses({ addresses: [p2shAddress] }),
  ]);

  if (!p2shEntries || p2shEntries.length === 0) {
    throw new Error("Reveal: no P2SH UTXO found after commit");
  }

  const { transactions: revealTxs } = await createTransactions({
    priorityEntries: [p2shEntries[0]],
    entries: senderEntries2,
    outputs: [],
    changeAddress: senderAddress,
    priorityFee: GAS,
    networkId: NETWORK,
  });

  let revealHash = "";
  for (const tx of revealTxs) {
    tx.sign([privateKey], false);
    const unsignedIdx = tx.transaction.inputs.findIndex(
      (inp: any) => inp.signatureScript === ""
    );
    if (unsignedIdx !== -1) {
      const sig = await tx.createInputSignature(unsignedIdx, privateKey);
      tx.fillInput(unsignedIdx, script.encodePayToScriptHashSignatureScript(sig));
    }
    revealHash = await tx.submit(rpc);
  }

  return revealHash;
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const collectionArgRaw =
    args.find((a) => a.startsWith("--collection="))?.split("=")[1]
    ?? (args[args.indexOf("--collection") + 1] ?? "");
  const collectionArg = collectionArgRaw.toUpperCase() || undefined;

  console.log(`\n⬡  PIXEL on Kaspa — Rewards Payout${dryRun ? "  [DRY RUN]" : ""}`);
  console.log("─".repeat(60));

  // Load env
  const env = loadEnv();
  const privateKeyHex = env.PIXEL_PRIVATE_KEY ?? "";
  const treasuryAddress = env.TREASURY_ADDRESS ?? "";

  if (!dryRun) {
    if (!privateKeyHex) throw new Error("PIXEL_PRIVATE_KEY missing in .env");
    if (!treasuryAddress) throw new Error("TREASURY_ADDRESS missing in .env");
  }

  // Load idempotence state
  const paidMinters = loadPaidMinters();
  if (paidMinters.size > 0) {
    console.log(`Idempotence: ${paidMinters.size} already-paid minters loaded from logs/\n`);
  }

  // Which collections to process
  const ticks = collectionArg && COLLECTIONS[collectionArg]
    ? [collectionArg]
    : Object.keys(COLLECTIONS);

  // ── Phase 1: Fetch all token data ─────────────────────────────────────────

  const allTokens: TokenInfo[] = [];

  for (const tick of ticks) {
    console.log(`\nFetching minted IDs for ${tick}…`);
    const ids = await getMintedIds(tick);
    console.log(`  ${ids.length} tokens minted`);

    const tokens: TokenInfo[] = ids.map((id) => ({
      tick,
      tokenId: id,
      minter: "",
      color: null,
      edition: null,
      reward: 0,
    }));

    let done = 0;
    await runConcurrent(
      tokens,
      async (token) => {
        const [minter, meta] = await Promise.allSettled([
          getMinter(tick, token.tokenId),
          fetchIpfs(COLLECTIONS[tick].buri, token.tokenId),
        ]);

        token.minter = minter.status === "fulfilled" ? (minter.value ?? "unknown") : "unknown";

        if (meta.status === "fulfilled" && meta.value) {
          const attrs =
            meta.value.attributes ??
            meta.value.properties?.attributes ??
            [];
          token.color = resolveColor(tick, attrs);
          token.edition = tick === "SYKORA" ? getAttr(attrs, "Edition") : null;
        }

        // #1–30 premint — no reward (Pixel on Telegram)
        token.reward = (tick === "SYKORA" && token.tokenId <= 30)
          ? 0
          : getReward(tick, token.color);

        done++;
        if (done % 5 === 0 || done === tokens.length) {
          process.stdout.write(`\r  ${done}/${tokens.length} processed…`);
        }
      },
      CONCURRENCY
    );
    console.log(`\r  ${tokens.length}/${tokens.length} done.          `);
    allTokens.push(...tokens);
  }

  // ── Phase 2: Aggregate per minter ─────────────────────────────────────────

  const byMinter = new Map<string, RewardRow>();
  for (const t of allTokens) {
    if (!t.minter || t.minter === "unknown") continue;
    const key = t.minter.toLowerCase();
    if (!byMinter.has(key)) {
      byMinter.set(key, {
        minter: t.minter,
        sykoraTokens: [],
        pixelonkasTokens: [],
        totalReward: 0,
      });
    }
    const row = byMinter.get(key)!;
    if (t.tick === "SYKORA") row.sykoraTokens.push(t.tokenId);
    else row.pixelonkasTokens.push(t.tokenId);
    row.totalReward += t.reward;
  }

  const allRewards = [...byMinter.values()].filter((r) => r.totalReward > 0);
  const alreadyPaid = allRewards.filter((r) => paidMinters.has(r.minter.toLowerCase()));
  const toPay = allRewards.filter((r) => !paidMinters.has(r.minter.toLowerCase()));

  if (alreadyPaid.length > 0) {
    console.log(`\nSKIPPED — already paid (${alreadyPaid.length} addresses):`);
    for (const r of alreadyPaid) {
      console.log(`  ⚠  ${r.minter}  ${r.totalReward.toLocaleString()} $PIXEL`);
    }
  }

  if (toPay.length === 0) {
    console.log("\nNothing to pay. All minters with rewards have already been paid.\n");
    return;
  }

  printTable(toPay);

  const grandTotal = toPay.reduce((s, r) => s + r.totalReward, 0);

  if (dryRun) {
    console.log("[DRY RUN] No transfers sent. Exiting.\n");
    return;
  }

  // ── Phase 3: Confirm ──────────────────────────────────────────────────────

  process.stdout.write(
    `Send ${grandTotal.toLocaleString()} $PIXEL to ${toPay.length} address(es)?\nTreasury: ${treasuryAddress}\nType "yes" to confirm: `
  );

  const answer: string = await new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      buf += chunk;
      if (buf.includes("\n")) {
        resolve(buf.trim().toLowerCase());
        process.stdin.pause();
      }
    });
    process.stdin.resume();
  });

  if (answer !== "yes") {
    console.log("Aborted.\n");
    return;
  }

  // ── Phase 4: Load kaspa-wasm ──────────────────────────────────────────────

  console.log("\nLoading kaspa-wasm…");
  let kaspa: any;
  try {
    kaspa = await import("@kasdk/nodejs");
  } catch (e: any) {
    console.error(
      `\nERROR: cannot import kaspa-wasm.\n` +
      `  → Install it: bun add @kasdk/nodejs\n` +
      `  → If WASM loading fails at runtime, see scripts/README.md for the manual WASM setup.\n` +
      `  Details: ${e?.message ?? e}`
    );
    process.exit(1);
  }

  const { RpcClient, Encoding, Resolver } = kaspa;
  console.log("Connecting to Kaspa mainnet via public resolver…");
  const rpc = new RpcClient({ resolver: new Resolver(), encoding: Encoding.Borsh, networkId: NETWORK });
  await rpc.connect();
  console.log("RPC connected.\n");

  // ── Phase 5: Execute transfers ────────────────────────────────────────────

  const logEntries: LogEntry[] = [];
  let failed = 0;

  for (const [idx, row] of toPay.entries()) {
    const prefix = `[${idx + 1}/${toPay.length}]`;
    process.stdout.write(`${prefix} ${row.minter}  ${row.totalReward.toLocaleString()} $PIXEL … `);

    try {
      const txHash = await sendKrc20Transfer(privateKeyHex, row.minter, row.totalReward, rpc, kaspa);
      console.log(`✓  ${txHash}`);
      logEntries.push({
        minterAddress: row.minter,
        sykoraTokens: row.sykoraTokens,
        pixelonkasTokens: row.pixelonkasTokens,
        amount: row.totalReward,
        txHash,
        timestamp: new Date().toISOString(),
      });
      // Wait for change UTXO to be available before next transfer
      if (idx < toPay.length - 1) {
        process.stdout.write("  (waiting 12s for UTXO confirmation…)\n");
        await new Promise((r) => setTimeout(r, 12_000));
      }
    } catch (e: any) {
      console.error(`✗  FAILED: ${e?.message ?? e}`);
      failed++;
      // Log the failure for manual follow-up
      logEntries.push({
        minterAddress: row.minter,
        sykoraTokens: row.sykoraTokens,
        pixelonkasTokens: row.pixelonkasTokens,
        amount: row.totalReward,
        txHash: `FAILED: ${e?.message ?? e}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  await rpc.disconnect();

  // ── Phase 6: Save log ─────────────────────────────────────────────────────

  saveLog(logEntries);

  const succeeded = logEntries.length - failed;
  console.log(
    `\nDone: ${succeeded} succeeded, ${failed} failed out of ${toPay.length} transfers.\n`
  );
}

main().catch((e) => {
  console.error(`\nFatal: ${e?.message ?? e}\n`);
  process.exit(1);
});
