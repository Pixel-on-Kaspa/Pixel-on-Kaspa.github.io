# Posting Pipeline Audit — X (Twitter)

Audit of the X publishing pipeline as of 2026-05-30. Maps which component does what, where the human gate sits, and what is (and isn't) logged.

## Scripts involved

| File | Role |
|---|---|
| `scripts/post-to-x.ts` | Publisher. Thin wrapper around `twitter-api-v2`. Takes `--profile`, `--media`, `--text`, uploads media, posts the tweet, prints the resulting URL. ~84 lines. |
| `scripts/fetch-paid-from-x.ts` | Reader. Searches `@PixelonKas` tweets for reward/payout mentions and extracts Kaspa addresses. Read-only, not part of the publish path. |
| `scripts/post-templates/visual-generator-posts.md` | Static reference templates (AFTER / ORIGINAL / SERIES / RECRUITMENT patterns + anti-patterns). Markdown only, not consumed by code. |
| `.claude/commands/post.md` (and `mint-post.md`, `post-promo.md`, `post-kaspa.md`, `post-engage.md`) | Slash-command playbooks — the orchestration logic, executed by Claude. |
| `.claude/post-state.json` | Single-key state file: last artist + last post UTC timestamp + rotation order. Gitignored. |

## 1. Where post text is generated

**Composed by an LLM operator, no programmatic generation.**

- `scripts/post-to-x.ts` contains **zero hardcoded post text** — `--text` is mandatory and passed in from the caller (`scripts/post-to-x.ts:19`, `:21`).
- The text is composed by Claude during execution of the `/post` slash command, following the voice/tone/hashtag rules and per-profile constraints encoded in `.claude/commands/post.md` (~450 lines of instructions).
- `scripts/post-templates/visual-generator-posts.md` provides reference patterns but is not loaded at runtime by any script — it is reference material the LLM may consult.
- **No direct Anthropic/OpenAI API call from any script.** The LLM runs as the human operator's agent via Claude Code; there is no headless `client.messages.create(...)` call anywhere in `scripts/`.

→ The "text generator" is the Claude Code session itself. Without an operator running `/post`, nothing is ever drafted.

## 2. Human-in-the-loop

**Yes — strong gate, but it lives in the orchestrator, not the publisher.**

- `.claude/commands/post.md` Step 4 displays all drafts and requires the user to pick profiles; Step 5 then asks `Post this to @handle now? (yes / edit / skip)` per profile before any API call.
- `scripts/post-to-x.ts` itself has **no confirmation prompt** — once invoked it publishes immediately. (Contrast: `scripts/fetch-paid-from-x.ts:411–426` has an interactive `yes/no` prompt before writing local log entries.)
- There is no Slack/email/file-based out-of-band draft review. The gate is fully in-band: the operator sees drafts inline in the Claude Code conversation and confirms inline.
- Implication: anyone who can invoke `scripts/post-to-x.ts` directly bypasses the gate entirely. The HITL is a convention enforced by the `/post` skill, not by the code.

## 3. Inputs / triggers

**Manual only.** Triggered when a user invokes a slash command (`/post`, `/mint-post`, `/post-promo`, `/post-kaspa`, `/post-engage`) in a Claude Code session.

- No cron job. `.github/workflows/ci.yml` runs only on `push` and `pull_request` events and is solely a Jekyll build; it contains no X API calls.
- No webhook. No HTTP server, no external event source.
- No scheduler in `scripts/`. Nothing on `launchd` / `crontab` per project convention.
- CLI args for the publisher: `--profile <pixelonkas|marekozor|synthicoin>`, `--media <path>`, `--text <string>` (`scripts/post-to-x.ts:17–24`). All three required.

## 4. Logging

**The publisher does not persist any record of what it posted.**

- `scripts/post-to-x.ts:81–83` prints the tweet ID and URL to stdout. The process exits, the terminal buffer is the only "log."
- `.claude/post-state.json` records `last_artist` and `last_post_at` (`.claude/post-state.json:2–3`) for rotation purposes — but **not the post text, tweet ID, profile, or media filename.**
- `logs/` exists but is for KRC-20 reward payouts (`scripts/pay-rewards.ts`, `scripts/fetch-paid-from-x.ts`); it does not store posted-tweet records. Both `logs/` and `.claude/post-state.json` are gitignored.
- No database, no append-only journal, no JSONL of past posts.
- The de-facto audit trail is **X itself** — `scripts/fetch-paid-from-x.ts` reverse-engineers posting history by hitting `GET /2/tweets/search/recent` against `from:PixelonKas`. This only covers `@PixelonKas` and only the X-API recent-search window (~7 days on free/basic tiers).

→ Once a post is older than the X recent-search window and the terminal buffer is gone, the only artifact is the tweet itself.

## 5. Engagement tracking

**None.** "Publish and forget."

- No script reads back like/view/retweet counts after publishing.
- `scripts/fetch-paid-from-x.ts` does call the X API after the fact, but it scrapes tweet **text** for Kaspa addresses to reconstruct reward payouts — it ignores `public_metrics`.
- No `GET /2/tweets/:id?tweet.fields=public_metrics` call exists in the codebase.
- No analytics dashboard, no scheduled re-fetch of past posts.

---

## Summary

```
[User invokes /post]
        │
        ▼
[Claude session]  ── reads ──► .claude/commands/post.md, templates/
        │                     ~/Desktop/pixel-exports/{artist}/
        │                     .claude/post-state.json (rotation)
        │
        │  drafts 3 posts (one per profile)
        ▼
[User approves per profile]  ◄── Steps 4 & 5 of /post skill
        │
        ▼
[bun run scripts/post-to-x.ts --profile X --media Y --text Z]
        │
        ▼
[X API v1.1 media upload + v2 tweet create]
        │
        ▼
[stdout: tweet URL]  ─────── nothing else persisted ────────► (end)
```

**Risk surface for future hardening:**

1. **No post log.** Bug or regret-mode rollback is impossible from the local repo — must use X's own delete flow and X's UI as the only record.
2. **HITL bypass.** Calling `scripts/post-to-x.ts` directly skips the approval gate. If automation is ever added, the gate would need to move into the publisher (or into a wrapping CLI).
3. **No metrics loop.** No data on which voice/hashtag mix performs — every choice is intuition-based.
4. **Rotation state is the only persisted side effect**, and it only tracks artist + timestamp, not which media file was used. Re-running could pick the same file again.
