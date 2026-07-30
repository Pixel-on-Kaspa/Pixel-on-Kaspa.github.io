#!/usr/bin/env bun
/**
 * delete-x.ts — delete a tweet from a single X profile
 *
 * Usage:
 *   bun run scripts/delete-x.ts --profile pixelonkas --id 2082577091665564140
 */

import { TwitterApi } from "twitter-api-v2";
import * as fs from "fs";
import * as path from "path";

const args = process.argv.slice(2);
const get  = (flag: string) => { const i = args.indexOf(flag); return i !== -1 ? args[i + 1] : undefined; };

const profile = get("--profile")?.toLowerCase();
const id      = get("--id");

if (!profile || !id) {
  console.error("Usage: bun run scripts/delete-x.ts --profile <handle> --id <tweetId>");
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

const res = await client.v2.deleteTweet(id);
console.log(res.data.deleted ? `✓ Deleted ${id} from @${profile}` : `✗ Failed to delete ${id}`);
