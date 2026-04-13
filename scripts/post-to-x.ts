#!/usr/bin/env bun
/**
 * post-to-x.ts — post a media file (PNG or MP4) to a single X profile
 *
 * Usage:
 *   bun run scripts/post-to-x.ts --profile pixelonkas --media /path/to/file.mp4 --text "tweet text"
 */

import { TwitterApi } from "twitter-api-v2";
import * as fs from "fs";
import * as path from "path";

// ── CLI args ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const get  = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };

const profile = get("--profile")?.toLowerCase();
const media   = get("--media");
const text    = get("--text");

if (!profile || !media || !text) {
  console.error("Usage: bun run scripts/post-to-x.ts --profile <handle> --media <path> --text <tweet>");
  process.exit(1);
}

// ── Load .env ─────────────────────────────────────────────────────────────────
const envPath = path.resolve(import.meta.dir, "../.env");
const envRaw  = fs.readFileSync(envPath, "utf8");
const env: Record<string, string> = {};
for (const line of envRaw.split("\n")) {
  const m = line.match(/^([A-Z0-9_]+)=(.+)/);
  if (m) env[m[1]] = m[2].trim();
}

const PREFIX_MAP: Record<string, string> = {
  pixelonkas: "PIXELONKAS",
  marekozor:  "MAREKOZOR",
  synthicoin: "SYNTHICOIN",
};

const prefix = PREFIX_MAP[profile];
if (!prefix) {
  console.error(`Unknown profile: ${profile}. Use pixelonkas, marekozor, or synthicoin.`);
  process.exit(1);
}

const apiKey            = env[`${prefix}_API_KEY`];
const apiSecret         = env[`${prefix}_API_SECRET`];
const accessToken       = env[`${prefix}_ACCESS_TOKEN`];
const accessTokenSecret = env[`${prefix}_ACCESS_TOKEN_SECRET`];

if (!apiKey || !apiSecret || !accessToken || !accessTokenSecret) {
  console.error(`Credentials for @${profile} not found. Fill in the ${prefix}_* values in .env first.`);
  process.exit(1);
}

// ── Client ────────────────────────────────────────────────────────────────────
const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret: accessTokenSecret });

// ── Detect media type ─────────────────────────────────────────────────────────
const ext       = path.extname(media).toLowerCase();
const isVideo   = ext === ".mp4";
const mimeType  = isVideo ? "video/mp4" : "image/png";
const mediaSize = fs.statSync(media).size;

console.log(`Uploading ${path.basename(media)} (${(mediaSize / 1024 / 1024).toFixed(1)} MB) as ${mimeType}…`);

// ── Upload ────────────────────────────────────────────────────────────────────
let mediaId: string;
if (isVideo) {
  mediaId = await client.v1.uploadMedia(media, { mimeType: "video/mp4", target: "tweet" });
} else {
  mediaId = await client.v1.uploadMedia(media, { mimeType: "image/png" });
}

console.log(`Media uploaded — id: ${mediaId}`);

// ── Tweet ─────────────────────────────────────────────────────────────────────
const tweet = await client.v2.tweet({ text, media: { media_ids: [mediaId] } });

console.log(`✓ Posted to @${profile}`);
console.log(`  Tweet ID: ${tweet.data.id}`);
console.log(`  URL: https://x.com/i/web/status/${tweet.data.id}`);
