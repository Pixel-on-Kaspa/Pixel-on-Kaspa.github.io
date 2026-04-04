#!/usr/bin/env bun
/**
 * fetch-paid-from-x.ts — extract already-paid reward records from X posts
 *
 * Scans @PixelonKas posts for reward/airdrop/payout mentions that contain
 * Kaspa addresses, then saves them as manual log entries.
 *
 * Usage:
 *   bun run scripts/fetch-paid-from-x.ts                         # search X API
 *   bun run scripts/fetch-paid-from-x.ts --url <tweet_url> [...]  # specific tweets
 *   bun run scripts/fetch-paid-from-x.ts --dry-run               # show only, no write
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "fs";
import { join, dirname } from "path";

// ─── CONFIG ──────────────────────────────────────────────────────────────────

const ROOT = join(dirname(Bun.main), "..");
const LOGS_DIR = join(ROOT, "logs");
const OUT_FILE = join(ROOT, "already-paid-from-x.json");

function loadEnv(): Record<string, string> {
  const p = join(ROOT, ".env");
  if (!existsSync(p)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(p, "utf-8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

const X_API = "https://api.twitter.com/2";

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface ExtractedRecord {
  tweetId: string;
  tweetUrl: string;
  createdAt: string;
  tweetText: string;
  kaspaAddress: string;
  sykoraTokens: number[];
  pixelonkasTokens: number[];
  pixelAmount: number | null;
  confirmedInReply: string | null;  // reply text that looks like tx confirmation
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

// ─── REGEX ───────────────────────────────────────────────────────────────────

const RE_KASPA = /kaspa:[a-z0-9]{61,65}/gi;
const RE_SYKORA = /SYKORA\s*#?(\d+)/gi;
const RE_PIXELONKAS = /PIXELONKAS\s*#?(\d+)/gi;
const RE_PIXEL_AMOUNT = /([0-9][0-9,]*)\s*\$?PIXEL/gi;
const RE_TOKEN_GENERIC = /#(\d+)/g;
// Kaspa tx hashes are 64-char hex
const RE_TX_HASH = /\b([0-9a-f]{64})\b/gi;
const RE_REWARD_KEYWORDS = /reward|airdrop|payout|paid|sending|sent|transfer/i;

function extractFromText(text: string, tweetId: string): Omit<ExtractedRecord, "tweetUrl" | "createdAt" | "confirmedInReply"> | null {
  const addresses = [...text.matchAll(RE_KASPA)].map((m) => m[0].toLowerCase());
  if (addresses.length === 0) return null;  // no kaspa address → skip

  const sykoraTokens: number[] = [];
  let m: RegExpExecArray | null;

  RE_SYKORA.lastIndex = 0;
  while ((m = RE_SYKORA.exec(text)) !== null) sykoraTokens.push(Number(m[1]));

  const pixelonkasTokens: number[] = [];
  RE_PIXELONKAS.lastIndex = 0;
  while ((m = RE_PIXELONKAS.exec(text)) !== null) pixelonkasTokens.push(Number(m[1]));

  let pixelAmount: number | null = null;
  RE_PIXEL_AMOUNT.lastIndex = 0;
  const amtMatch = RE_PIXEL_AMOUNT.exec(text);
  if (amtMatch) pixelAmount = Number(amtMatch[1].replace(/,/g, ""));

  return {
    tweetId,
    tweetText: text,
    kaspaAddress: addresses[0],   // primary address — first one found
    sykoraTokens,
    pixelonkasTokens,
    pixelAmount,
  };
}

function extractTxFromReplies(replies: { text: string; id: string }[]): string | null {
  for (const reply of replies) {
    RE_TX_HASH.lastIndex = 0;
    const m = RE_TX_HASH.exec(reply.text);
    if (m) return `tx:${m[1]} (reply ${reply.id})`;
    if (/confirm|success|done|sent|✓|✔/i.test(reply.text)) {
      return `confirmed in reply ${reply.id}: ${reply.text.slice(0, 80)}`;
    }
  }
  return null;
}

// ─── X API ───────────────────────────────────────────────────────────────────

async function xGet(path: string, bearer: string): Promise<any> {
  const url = `${X_API}${path}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${bearer}` },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json();
  if (!res.ok) {
    const detail = body?.errors?.[0]?.message ?? body?.detail ?? JSON.stringify(body);
    throw Object.assign(new Error(`X API ${res.status}: ${detail}`), { status: res.status, body });
  }
  return body;
}

async function getPixelonKasUserId(bearer: string): Promise<string> {
  const data = await xGet("/users/by/username/PixelonKas?user.fields=id,name", bearer);
  const id = data?.data?.id;
  if (!id) throw new Error("Could not resolve @PixelonKas user ID");
  return id;
}

async function searchRewardTweets(bearer: string): Promise<{ id: string; text: string; created_at: string; conversation_id: string }[]> {
  // Search for tweets from @PixelonKas containing reward keywords OR kaspa: address
  // Use two queries (API allows limited OR logic)
  const queries = [
    // "kaspa" as plain word — colon after it is not valid X search syntax, use the word alone
    `from:PixelonKas kaspa`,
    `from:PixelonKas (reward OR airdrop OR payout OR paid) PIXEL`,
  ];

  const seen = new Set<string>();
  const results: { id: string; text: string; created_at: string; conversation_id: string }[] = [];

  for (const q of queries) {
    const encoded = encodeURIComponent(q);
    try {
      const data = await xGet(
        `/tweets/search/recent?query=${encoded}&tweet.fields=text,created_at,conversation_id,author_id&max_results=50`,
        bearer
      );
      for (const tweet of data?.data ?? []) {
        if (!seen.has(tweet.id)) {
          seen.add(tweet.id);
          results.push(tweet);
        }
      }
    } catch (e: any) {
      if (e.status === 403 || e.status === 401) throw e;  // auth error — bubble up
      console.warn(`  Search query failed (${e.message}) — skipping this query`);
    }
    // Small delay between queries
    await new Promise((r) => setTimeout(r, 500));
  }

  return results;
}

async function getReplies(
  conversationId: string,
  bearer: string
): Promise<{ id: string; text: string }[]> {
  try {
    const data = await xGet(
      `/tweets/search/recent?query=conversation_id:${conversationId}&tweet.fields=text,author_id&max_results=25`,
      bearer
    );
    return (data?.data ?? []).map((t: any) => ({ id: t.id, text: t.text }));
  } catch {
    return [];
  }
}

async function getTweetById(id: string, bearer: string): Promise<{ id: string; text: string; created_at: string; conversation_id: string } | null> {
  try {
    const data = await xGet(
      `/tweets/${id}?tweet.fields=text,created_at,conversation_id,author_id`,
      bearer
    );
    return data?.data ?? null;
  } catch (e: any) {
    console.warn(`  Could not fetch tweet ${id}: ${e.message}`);
    return null;
  }
}

function parseTweetIdFromUrl(url: string): string | null {
  const m = url.match(/status\/(\d+)/);
  return m ? m[1] : null;
}

// ─── LOGS ─────────────────────────────────────────────────────────────────────

function loadExistingPaidAddresses(): Set<string> {
  const paid = new Set<string>();
  if (!existsSync(LOGS_DIR)) return paid;
  for (const file of readdirSync(LOGS_DIR)) {
    if (!file.endsWith(".json")) continue;
    try {
      const entries: LogEntry[] = JSON.parse(readFileSync(join(LOGS_DIR, file), "utf-8"));
      for (const e of entries) paid.add(e.minterAddress.toLowerCase());
    } catch {}
  }
  return paid;
}

// ─── DISPLAY ─────────────────────────────────────────────────────────────────

function printTable(records: ExtractedRecord[]): void {
  const W_ADDR = 67;
  const line = "─".repeat(120);
  console.log("\n" + line);
  console.log(
    "Kaspa address".padEnd(W_ADDR) + "  " +
    "SYKORA".padEnd(14) + "  " +
    "PIXELONKAS".padEnd(14) + "  " +
    "$PIXEL".padStart(16) + "  " +
    "Confirmation"
  );
  console.log(line);
  for (const r of records) {
    const syk = r.sykoraTokens.length > 0 ? r.sykoraTokens.join(",") : "—";
    const pxk = r.pixelonkasTokens.length > 0 ? r.pixelonkasTokens.join(",") : "—";
    const amt = r.pixelAmount != null ? r.pixelAmount.toLocaleString("en-US") : "?";
    const conf = r.confirmedInReply ? "✓ reply found" : "—";
    console.log(
      r.kaspaAddress.padEnd(W_ADDR) + "  " +
      syk.padEnd(14) + "  " +
      pxk.padEnd(14) + "  " +
      amt.padStart(16) + "  " +
      conf
    );
    console.log(`  → Tweet: ${r.tweetUrl}`);
    console.log(`    "${r.tweetText.replace(/\n/g, " ").slice(0, 100)}"`);
    if (r.confirmedInReply) console.log(`    Confirmation: ${r.confirmedInReply}`);
    console.log();
  }
  console.log(line);
  console.log(`  ${records.length} record(s) found`);
  console.log(line + "\n");
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const urlArgs = args.flatMap((a, i) =>
    a === "--url" ? [args[i + 1]].filter(Boolean) :
    a.startsWith("--url=") ? [a.slice(6)] : []
  );

  console.log(`\n⬡  PIXEL on Kaspa — Fetch Paid from X${dryRun ? "  [DRY RUN]" : ""}`);
  console.log("─".repeat(60));

  // ── Load env ────────────────────────────────────────────────────────────
  const env = loadEnv();
  const bearer =
    env.X_BEARER_TOKEN ||
    env.PIXELONKAS_BEARER_TOKEN ||
    "";

  if (!bearer) {
    console.error(`
ERROR: No X Bearer Token found in .env

Add one of these to your .env file:
  X_BEARER_TOKEN=<bearer_token>
  PIXELONKAS_BEARER_TOKEN=<bearer_token>

How to get a Bearer Token:
  1. Go to https://developer.twitter.com/en/portal/projects-and-apps
  2. Open your App → "Keys and tokens"
  3. Copy the "Bearer Token" (not API key or access token)
  4. Paste it into .env as X_BEARER_TOKEN=...

Alternatively, pass specific tweet URLs directly:
  bun run scripts/fetch-paid-from-x.ts --url https://x.com/PixelonKas/status/123456789
`);
    process.exit(1);
  }

  // ── Fetch tweets ─────────────────────────────────────────────────────────
  let rawTweets: { id: string; text: string; created_at: string; conversation_id: string }[] = [];

  if (urlArgs.length > 0) {
    // --url mode: fetch specific tweets
    console.log(`Fetching ${urlArgs.length} tweet(s) by URL…`);
    for (const url of urlArgs) {
      const id = parseTweetIdFromUrl(url);
      if (!id) {
        console.warn(`  Could not parse tweet ID from: ${url}`);
        continue;
      }
      const tweet = await getTweetById(id, bearer);
      if (tweet) rawTweets.push(tweet);
    }
  } else {
    // API search mode
    console.log("Searching @PixelonKas tweets for reward/payout mentions…");
    try {
      rawTweets = await searchRewardTweets(bearer);
      console.log(`  Found ${rawTweets.length} tweet(s) matching search queries`);
    } catch (e: any) {
      if (e.status === 403) {
        console.error(`
X API access denied (403 Forbidden).

Your Bearer Token may not have search access. Free-tier X API does not include
search/recent endpoint. You need Basic access or higher.

Workaround — pass specific tweet URLs instead:
  bun run scripts/fetch-paid-from-x.ts --url https://x.com/PixelonKas/status/...

To upgrade API access: https://developer.twitter.com/en/portal/products
`);
        process.exit(1);
      }
      if (e.status === 401) {
        console.error(`
X API authentication failed (401 Unauthorized).

Check that PIXELONKAS_BEARER_TOKEN in .env is correct and not expired.
Bearer tokens do not expire but can be invalidated if regenerated.
`);
        process.exit(1);
      }
      throw e;
    }
  }

  if (rawTweets.length === 0) {
    console.log("\nNo tweets found. Nothing to process.\n");
    return;
  }

  // ── Extract records ───────────────────────────────────────────────────────
  console.log("\nExtracting kaspa addresses and token mentions…");
  const records: ExtractedRecord[] = [];

  for (const tweet of rawTweets) {
    // Filter: must have at least reward keyword or kaspa address to be worth processing
    if (!RE_REWARD_KEYWORDS.test(tweet.text) && !RE_KASPA.test(tweet.text)) continue;

    const extracted = extractFromText(tweet.text, tweet.id);
    if (!extracted) continue;  // no kaspa address found

    // Fetch replies if we have a conversation_id
    let confirmedInReply: string | null = null;
    if (tweet.conversation_id && tweet.conversation_id !== tweet.id) {
      const replies = await getReplies(tweet.conversation_id, bearer);
      confirmedInReply = extractTxFromReplies(replies);
      await new Promise((r) => setTimeout(r, 300));
    }

    records.push({
      ...extracted,
      tweetUrl: `https://x.com/PixelonKas/status/${tweet.id}`,
      createdAt: tweet.created_at ?? "",
      confirmedInReply,
    });
  }

  if (records.length === 0) {
    console.log("\nNo reward records with kaspa addresses found in the tweets.\n");
    return;
  }

  // ── Cross-check with existing logs ───────────────────────────────────────
  const alreadyInLogs = loadExistingPaidAddresses();
  const newRecords = records.filter((r) => !alreadyInLogs.has(r.kaspaAddress.toLowerCase()));
  const dupRecords = records.filter((r) => alreadyInLogs.has(r.kaspaAddress.toLowerCase()));

  if (dupRecords.length > 0) {
    console.log(`\nAlready in logs (${dupRecords.length} record(s) — skipping):`);
    for (const r of dupRecords) console.log(`  ⚠  ${r.kaspaAddress}`);
  }

  if (newRecords.length === 0) {
    console.log("\nAll found records are already present in logs/. Nothing new.\n");
    return;
  }

  printTable(newRecords);

  // ── Save already-paid-from-x.json ────────────────────────────────────────
  writeFileSync(OUT_FILE, JSON.stringify(records, null, 2));
  console.log(`Saved: already-paid-from-x.json (${records.length} total record(s))`);

  if (dryRun) {
    console.log("\n[DRY RUN] No log entries written.\n");
    return;
  }

  // ── Confirm write to logs/ ────────────────────────────────────────────────
  process.stdout.write(
    `\nZapsat ${newRecords.length} záznam(ů) do logs/ jako manuálně vyplacené? (yes/no): `
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
    console.log("Skipped. Run again to re-import.\n");
    return;
  }

  // ── Write log entries ─────────────────────────────────────────────────────
  if (!existsSync(LOGS_DIR)) mkdirSync(LOGS_DIR, { recursive: true });

  const today = new Date().toISOString().slice(0, 10);
  const logFile = join(LOGS_DIR, `rewards-manual-${today}.json`);

  let existing: LogEntry[] = [];
  if (existsSync(logFile)) {
    try { existing = JSON.parse(readFileSync(logFile, "utf-8")); } catch {}
  }

  const newLogEntries: LogEntry[] = newRecords.map((r) => ({
    minterAddress: r.kaspaAddress,
    sykoraTokens: r.sykoraTokens,
    pixelonkasTokens: r.pixelonkasTokens,
    amount: r.pixelAmount ?? 0,
    // Only a real 64-char hex on-chain tx hash counts as proof of payment.
    // Anything else is prefixed UNCONFIRMED: so loadPaidAmounts() skips it.
    txHash: r.confirmedInReply ?? `UNCONFIRMED:imported-from-x:${r.tweetId}`,
    timestamp: r.createdAt || new Date().toISOString(),
    source: r.tweetUrl,
  }));

  writeFileSync(logFile, JSON.stringify([...existing, ...newLogEntries], null, 2));

  console.log(`\n✓ Written to ${logFile}`);
  console.log(`  ${newLogEntries.length} new manual entries added`);
  console.log(
    `  These addresses will be skipped by pay-rewards.ts on next run (idempotence).\n`
  );
}

main().catch((e) => {
  console.error(`\nFatal: ${e?.message ?? e}\n`);
  process.exit(1);
});
