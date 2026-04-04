#!/usr/bin/env bun
/**
 * import-onchain-payouts.ts
 *
 * Fetches all outgoing $PIXEL KRC-20 transfers from the treasury wallet
 * via Kasplex API, cross-references with expected NFT rewards, and
 * writes matching records to logs/ as manually paid entries.
 *
 * Usage:
 *   bun run scripts/import-onchain-payouts.ts [--dry-run]
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const ROOT = join(dirname(Bun.main), "..");
const LOGS_DIR = join(ROOT, "logs");
const TREASURY = "kaspa:qpxdmujaujsse6gqxdhkcnh934ptr3s5mf444aw5lpr9xlsj579uuppf88vkl";
const TICK = "PIXEL";
const DECIMALS = 100_000_000n; // KRC-20 uses 8 decimal places

const KASPLEX_API = "https://api.kasplex.org/v1/krc20";
const KRC721_API = "https://mainnet.krc721.stream/api/v1/krc721/mainnet";
const IPFS_GW = ["https://ipfs.io/ipfs/", "https://dweb.link/ipfs/", "https://cloudflare-ipfs.com/ipfs/"];

// ─── REWARDS CONFIG (same as pay-rewards.ts) ─────────────────────────────────

const COLLECTIONS: Record<string, { buri: string; max: number }> = {
  SYKORA:     { buri: "bafybeifema4upmzu7c4iipvxdagctirxf46g3htmsin6l66zm77dibfhaq", max: 2518 },
  PIXELONKAS: { buri: "bafybeih2phpjzxfrszsscpmxdr44kliaddto3sicsdh44kgx7b3f43fdvm", max: 342  },
};

const REWARDS: Record<string, Record<string, number>> = {
  SYKORA: { Ice: 100_000_000, Black: 80_000_000, Pink: 40_000_000 },
  PIXELONKAS: {
    "Super Broken": 1_000_000_000, Broken: 100_000_000, Grey: 80_000_000,
    Orange: 50_000_000, Yellow: 30_000_000, Pink: 26_000_000, Red: 24_000_000,
    Purple: 22_000_000, White: 20_000_000, Green: 15_000_000, Black: 12_000_000, Blue: 12_000_000,
  },
};

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface OnchainTransfer {
  to: string;
  amount: number;        // in $PIXEL (already divided by 10^8)
  txHash: string;
  timestamp: number;    // Unix ms
  opScore: string;
}

interface ExpectedReward {
  minter: string;
  sykoraTokens: number[];
  pixelonkasTokens: number[];
  totalReward: number;
}

interface CrossRefResult {
  transfer: OnchainTransfer;
  expected: ExpectedReward | null;
  match: "exact" | "partial" | "overpaid" | "unknown";
}

interface LogEntry {
  minterAddress: string;
  sykoraTokens: number[];
  pixelonkasTokens: number[];
  amount: number;
  txHash: string;
  timestamp: string;
  source: string;
}

// ─── HTTP ─────────────────────────────────────────────────────────────────────

async function fetchJson(url: string): Promise<any> {
  const res = await fetch(url, {
    headers: { "User-Agent": "pixel-import-onchain/1.0" },
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
      } catch {}
    }
  }
  return null;
}

// ─── KASPLEX: FETCH ALL OUTGOING TRANSFERS ───────────────────────────────────

async function fetchAllOutgoingTransfers(): Promise<OnchainTransfer[]> {
  const transfers: OnchainTransfer[] = [];
  let cursor: string | null = null;
  let page = 0;

  while (true) {
    let url = `${KASPLEX_API}/oplist?address=${TREASURY}&tick=${TICK}&limit=50`;
    if (cursor) url += `&next=${cursor}`;

    const data = await fetchJson(url);
    const results: any[] = data?.result ?? [];
    page++;

    for (const r of results) {
      if (
        r.from?.toLowerCase() === TREASURY.toLowerCase() &&
        r.opAccept === "1" &&
        !r.opError &&
        r.amt
      ) {
        transfers.push({
          to: r.to,
          amount: Number(BigInt(r.amt) / DECIMALS),
          txHash: r.hashRev,
          timestamp: Number(r.mtsAdd),
          opScore: r.opScore,
        });
      }
    }

    process.stdout.write(`\r  Page ${page}: ${results.length} ops, ${transfers.length} outgoing so far…`);

    const next = data?.next;
    if (!next || next === "0") break;
    cursor = next;
    await new Promise((r) => setTimeout(r, 200));
  }
  console.log();
  return transfers;
}

// ─── EXPECTED REWARDS: replicate pay-rewards.ts logic ────────────────────────

async function runConcurrent<T>(items: T[], fn: (item: T) => Promise<void>, concurrency: number) {
  let i = 0;
  const worker = async () => { while (i < items.length) await fn(items[i++]); };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
}

function parseMintedIds(rangesStr: string, max: number): number[] {
  const nums = String(rangesStr).split(",").map(Number).filter(Number.isFinite);
  const available = new Set<number>();
  for (let i = 0; i < nums.length - 1; i += 2)
    for (let j = 0; j < nums[i + 1]; j++) available.add(nums[i] + j);
  return Array.from({ length: max }, (_, k) => k + 1).filter((id) => !available.has(id));
}

function getAttr(attrs: any[], t: string): string | null {
  const key = t.toLowerCase();
  const a = attrs?.find((a) => (a?.trait_type ?? a?.type ?? "").toLowerCase() === key);
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
  for (const [k, v] of Object.entries(table ?? {}))
    if (k.toLowerCase() === color.toLowerCase()) return v;
  return 0;
}

async function computeExpectedRewards(): Promise<Map<string, ExpectedReward>> {
  const byMinter = new Map<string, ExpectedReward>();

  for (const tick of Object.keys(COLLECTIONS)) {
    process.stdout.write(`  Fetching ${tick} minted IDs… `);
    const raw = await fetchJson(`${KRC721_API}/ranges/${encodeURIComponent(tick)}`);
    const res = raw?.result ?? raw;
    const rangesStr = typeof res === "string" ? res : (res?.ranges ?? "");
    const ids = parseMintedIds(rangesStr, COLLECTIONS[tick].max);
    console.log(`${ids.length} minted`);

    const tokens = ids.map((id) => ({ tick, tokenId: id, minter: "", color: null as string | null, reward: 0 }));
    let done = 0;

    await runConcurrent(tokens, async (token) => {
      const [histRaw, meta] = await Promise.allSettled([
        fetchJson(`${KRC721_API}/history/${encodeURIComponent(tick)}/${token.tokenId}?direction=forward&limit=1`),
        fetchIpfs(COLLECTIONS[tick].buri, token.tokenId),
      ]);

      if (histRaw.status === "fulfilled") {
        const entries = Array.isArray(histRaw.value?.result) ? histRaw.value.result : histRaw.value;
        token.minter = entries?.[0]?.owner ?? "";
      }
      if (meta.status === "fulfilled" && meta.value) {
        const attrs = meta.value.attributes ?? meta.value.properties?.attributes ?? [];
        token.color = resolveColor(tick, attrs);
      }
      token.reward = getReward(tick, token.color);
      done++;
      if (done % 10 === 0 || done === tokens.length)
        process.stdout.write(`\r  ${tick}: ${done}/${tokens.length} processed…`);
    }, 5);
    console.log(`\r  ${tick}: ${tokens.length}/${tokens.length} done.          `);

    for (const t of tokens) {
      if (!t.minter) continue;
      const key = t.minter.toLowerCase();
      if (!byMinter.has(key))
        byMinter.set(key, { minter: t.minter, sykoraTokens: [], pixelonkasTokens: [], totalReward: 0 });
      const row = byMinter.get(key)!;
      if (t.tick === "SYKORA") row.sykoraTokens.push(t.tokenId);
      else row.pixelonkasTokens.push(t.tokenId);
      row.totalReward += t.reward;
    }
  }
  return byMinter;
}

// ─── IDEMPOTENCE ─────────────────────────────────────────────────────────────

function loadAlreadyLoggedHashes(): Set<string> {
  const hashes = new Set<string>();
  if (!existsSync(LOGS_DIR)) return hashes;
  for (const file of readdirSync(LOGS_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const entries: LogEntry[] = JSON.parse(readFileSync(join(LOGS_DIR, file), "utf-8"));
      for (const e of entries) if (e.txHash) hashes.add(e.txHash.toLowerCase());
    } catch {}
  }
  return hashes;
}

// ─── DISPLAY ─────────────────────────────────────────────────────────────────

function fmtDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16).replace("T", " ");
}

function printTable(rows: CrossRefResult[]): void {
  const line = "─".repeat(130);
  console.log("\n" + line);
  console.log(
    "Recipient address".padEnd(67) + "  " +
    "$PIXEL sent".padStart(16) + "  " +
    "Expected".padStart(16) + "  " +
    "Match".padEnd(10) + "  " +
    "SYKORA".padEnd(12) + "  " +
    "PIXELONKAS".padEnd(14) + "  " +
    "Date"
  );
  console.log(line);

  for (const { transfer: t, expected: e, match } of rows) {
    const exp = e ? e.totalReward.toLocaleString("en-US") : "—";
    const syk = e?.sykoraTokens.length ? e.sykoraTokens.join(",") : "—";
    const pxk = e?.pixelonkasTokens.length ? e.pixelonkasTokens.join(",") : "—";
    const matchIcon = match === "exact" ? "✓ exact" : match === "partial" ? "~ partial" : match === "overpaid" ? "! over" : "? unknown";
    console.log(
      t.to.padEnd(67) + "  " +
      t.amount.toLocaleString("en-US").padStart(16) + "  " +
      exp.padStart(16) + "  " +
      matchIcon.padEnd(10) + "  " +
      syk.padEnd(12) + "  " +
      pxk.padEnd(14) + "  " +
      fmtDate(t.timestamp)
    );
    console.log(`    tx: ${t.txHash}`);
  }
  console.log(line);

  const totalSent = rows.reduce((s, r) => s + r.transfer.amount, 0);
  const exact = rows.filter((r) => r.match === "exact").length;
  const unknown = rows.filter((r) => r.match === "unknown").length;
  console.log(`  ${rows.length} transfers  |  Total sent: ${totalSent.toLocaleString("en-US")} $PIXEL`);
  console.log(`  Match: ${exact} exact, ${rows.length - exact - unknown} partial/over, ${unknown} unknown`);
  console.log(line + "\n");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");

  console.log(`\n⬡  PIXEL — Import On-Chain Payouts${dryRun ? "  [DRY RUN]" : ""}`);
  console.log(`  Treasury: ${TREASURY}`);
  console.log("─".repeat(60));

  // ── 1. Fetch on-chain transfers ───────────────────────────────────────────
  console.log("\nFetching all outgoing $PIXEL transfers from treasury…");
  const transfers = await fetchAllOutgoingTransfers();
  console.log(`  ${transfers.length} outgoing transfers found`);

  if (transfers.length === 0) {
    console.log("\nNo outgoing transfers. Nothing to import.\n");
    return;
  }

  // Check which are already in logs
  const loggedHashes = loadAlreadyLoggedHashes();
  const newTransfers = transfers.filter((t) => !loggedHashes.has(t.txHash.toLowerCase()));
  const alreadyLogged = transfers.filter((t) => loggedHashes.has(t.txHash.toLowerCase()));

  if (alreadyLogged.length > 0)
    console.log(`  ${alreadyLogged.length} already in logs (skipping)`);
  if (newTransfers.length === 0) {
    console.log("\nAll on-chain transfers are already logged. Nothing new.\n");
    return;
  }
  console.log(`  ${newTransfers.length} new transfer(s) to import`);

  // ── 2. Compute expected rewards per minter ────────────────────────────────
  console.log("\nComputing expected rewards from NFT metadata…");
  const expectedByAddr = await computeExpectedRewards();
  console.log(`  ${expectedByAddr.size} minter address(es) with rewards > 0`);

  // ── 3. Cross-reference ────────────────────────────────────────────────────
  // Aggregate on-chain per recipient (same address may have multiple transfers)
  const byRecipient = new Map<string, { transfers: OnchainTransfer[]; totalSent: number }>();
  for (const t of newTransfers) {
    const key = t.to.toLowerCase();
    if (!byRecipient.has(key)) byRecipient.set(key, { transfers: [], totalSent: 0 });
    byRecipient.get(key)!.transfers.push(t);
    byRecipient.get(key)!.totalSent += t.amount;
  }

  const rows: CrossRefResult[] = [];
  for (const [addrKey, { transfers: txs, totalSent }] of byRecipient.entries()) {
    const expected = expectedByAddr.get(addrKey) ?? null;
    let match: CrossRefResult["match"];

    if (!expected || expected.totalReward === 0) {
      match = "unknown";
    } else if (totalSent === expected.totalReward) {
      match = "exact";
    } else if (totalSent < expected.totalReward) {
      match = "partial";
    } else {
      match = "overpaid";
    }

    // One row per individual transfer (for log entries)
    for (const t of txs) {
      rows.push({ transfer: t, expected, match });
    }
  }

  // Sort by timestamp descending
  rows.sort((a, b) => b.transfer.timestamp - a.transfer.timestamp);

  // ── 4. Display table ──────────────────────────────────────────────────────
  printTable(rows);

  if (dryRun) {
    console.log("[DRY RUN] No log entries written.\n");
    return;
  }

  // ── 5. Confirm ────────────────────────────────────────────────────────────
  process.stdout.write(`Zapsat ${newTransfers.length} záznam(ů) do logs/ jako manuálně vyplacené? (yes/no): `);

  const answer: string = await new Promise((resolve) => {
    let buf = "";
    process.stdin.setEncoding("utf-8");
    process.stdin.on("data", (chunk) => {
      buf += chunk;
      if (buf.includes("\n")) { resolve(buf.trim().toLowerCase()); process.stdin.pause(); }
    });
    process.stdin.resume();
  });

  if (answer !== "yes") {
    console.log("Aborted.\n");
    return;
  }

  // ── 6. Write log entries ──────────────────────────────────────────────────
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const logFile = join(LOGS_DIR, `rewards-manual-${today}.json`);
  let existing: LogEntry[] = [];
  if (existsSync(logFile)) {
    try { existing = JSON.parse(readFileSync(logFile, "utf-8")); } catch {}
  }

  const newEntries: LogEntry[] = rows.map(({ transfer: t, expected: e }) => ({
    minterAddress: t.to,
    sykoraTokens: e?.sykoraTokens ?? [],
    pixelonkasTokens: e?.pixelonkasTokens ?? [],
    amount: t.amount,
    txHash: t.txHash,
    timestamp: new Date(t.timestamp).toISOString(),
    source: `onchain:kasplex:opScore=${t.opScore}`,
  }));

  writeFileSync(logFile, JSON.stringify([...existing, ...newEntries], null, 2));

  console.log(`\n✓ Written to ${logFile}`);
  console.log(`  ${newEntries.length} on-chain transfer records imported`);
  console.log(`  These addresses will be skipped by pay-rewards.ts (idempotence).\n`);

  // Summary of unknown transfers (not matching any minter)
  const unknownRows = rows.filter((r) => r.match === "unknown");
  if (unknownRows.length > 0) {
    console.log(`NOTE: ${unknownRows.length} transfer(s) did not match any expected NFT minter:`);
    for (const r of unknownRows) {
      console.log(`  ${r.transfer.to}  ${r.transfer.amount.toLocaleString()} $PIXEL  tx:${r.transfer.txHash}`);
    }
    console.log("  These may be manual/promotional payouts outside the NFT reward system.\n");
  }
}

main().catch((e) => { console.error(`\nFatal: ${e?.message ?? e}\n`); process.exit(1); });
