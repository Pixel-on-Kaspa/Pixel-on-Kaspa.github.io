#!/usr/bin/env bun
/**
 * reply-x.ts — post a text-only reply to an existing tweet on a single X profile
 *
 * Usage:
 *   bun run scripts/reply-x.ts --profile pixelonkas --id <tweetId> --text "reply text"
 */

import { TwitterApi } from "twitter-api-v2";
import * as fs from "fs";
import * as path from "path";

const args = process.argv.slice(2);
const get  = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };

const profile = get("--profile")?.toLowerCase();
const id      = get("--id");
const text    = get("--text");

if (!profile || !id || !text) {
  console.error("Usage: bun run scripts/reply-x.ts --profile <handle> --id <tweetId> --text <reply>");
  process.exit(1);
}

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

const client = new TwitterApi({ appKey: apiKey, appSecret: apiSecret, accessToken, accessSecret: accessTokenSecret });

const res = await client.v2.tweet({ text, reply: { in_reply_to_tweet_id: id } });
console.log(`✓ Replied on @${profile}`);
console.log(`  Tweet ID: ${res.data.id}`);
console.log(`  URL: https://x.com/i/web/status/${res.data.id}`);
