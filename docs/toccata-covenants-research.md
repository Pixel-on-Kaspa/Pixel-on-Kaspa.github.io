# Toccata Covenants & Silverscript — Research (buildable overview)

**Date:** 2026-07-03 · **Purpose:** technical basis for monetizing Pixel on Kaspa generators/synths — gating paid features and NFT record/mint, where PIXELONKAS/SYKORA (KRC-721) and $PIXEL (KRC-20) already live on Kaspa L1.

**Method:** deep-research harness — 5 search angles → 15 sources fetched → 58 claims → adversarial 3-vote verification. 14 claims confirmed 3-0. Final synthesis assembled manually (workflow synthesis step hit a session limit). Claims not verified to 3-0 are flagged below.

> ⚠️ Toccata activated on mainnet only **2026-06-30** (3 days before this doc). Advanced-covenant tooling is days old. Treat anything beyond the KIP-10 introspection base as new/unproven until verified against primary KIP text.

---

## TL;DR for our build

The primitives needed for **ownership-gating and payments are already live and stable since the Crescendo fork (KIP-10 introspection opcodes)** — *not* new in Toccata. Toccata adds *advanced* covenants (full introspection, stateful identity, zk), but their high-level authoring tool **Silverscript is experimental and Testnet-12-only — not mainnet, not for money logic yet.**

→ Build gating on the stable base now. Prototype stateful covenants on TN12 in parallel.

---

## 1. What Toccata adds at L1 (consensus)

Toccata (mainnet **2026-06-30**, DAA score `474_165_565`) bundles four KIPs [confirmed 3-0]:

- **KIP-17** — extended script opcodes, "the main covenants backbone" (full transaction introspection).
- **KIP-20** — `covenant_id` tracked by consensus: stateful covenant identity/lineage is native. Stateful designs **no longer need** recursive parent/grandparent witness proofs (the previous workaround). [3-0]
- **KIP-16** — zk opcodes + zk-verifier precompile subsystem (Groth16 and RISC Zero STARK).
- **KIP-21** — partitioned sequencing commitment architecture.

Mechanics: outputs gain a **covenant field (up to 35 bytes/output)**, serialized for tx version ≥ 1, carried over P2P. [3-0, rusty-kaspa #914]

### Introspection opcodes (KIP-10, live on mainnet since Crescendo) [3-0, kip-0010]

`OpTxInputCount 0xb3`, `OpTxOutputCount 0xb4`, `OpTxInputIndex 0xb9`, `OpTxInputAmount 0xbe`, `OpTxInputSpk 0xbf`, `OpTxOutputAmount 0xc2`, `OpTxOutputSpk 0xc3`.

A script reads input/output counts, amounts and script-pubkeys during validation → a covenant can enforce e.g. "this UTXO may only be spent into an output with the same address and increased value." This is the stable foundation for payment/gating conditions.

> Correction from verification: the `OpTxOutputAmount`/`OpTxOutputSpk` opcodes belong to **KIP-10**, not KIP-16 (that attribution was refuted 1-2). KIP-16 = zk opcodes.

## 2. Silverscript — what it is

- **CashScript-inspired language + compiler** targeting **native Kaspa Script** (no VM/EVM, no IR). Model = **UTXO / local-state**, not account/EVM. [3-0, repo + Sutton]
- Kaspa's **first** high-level covenant language; initiated by Ori Newman, Michael Sutton, IzioDev, Manyfest — to deploy complex covenants on L1 more safely. [3-0]
- Repo: `github.com/kaspanet/silverscript`. **Status: Experimental** — unstable, breaking changes without notice. **Compiled scripts valid only on Kaspa Testnet-12, not mainnet.** [3-0]

## 3. Native tokens / NFTs (flagged — not fully verified)

- KRC-20/KRC-721 operate as UTXO-embedded assets; KRC-721 mints via a two-phase commit-reveal (P2SH commit → reveal) that blocks front-running. *(sources solid but these specific claims did not receive a final 3-0 vote — session limit; treat as very likely, not 100% verified.)*
- Post-Toccata token/asset handling is more native in the UTXO model — confirm exact form directly from **KIP-14** before building.

## 4. Patterns for our use-cases

- **Ownership-gating (hold NFT/$PIXEL → unlock record/mint):** needs no covenants at all. Verify holdings via indexer + server (Cloudflare Worker), prove address ownership by signature. **Buildable now, stable.**
- **Pay-to-mint / payment-to-treasury:** KIP-10 introspection opcodes can enforce "spend only if an output of X KAS/$PIXEL goes to the treasury address." Stable base. (`TREASURY_ADDRESS` already in `.env`.)
- **Membership-pass as a stateful covenant** (a pass holding state — tier, expiry): exactly what **KIP-20 `covenant_id`** now enables cleanly. But authoring via Silverscript = TN12 only for now.

## 5. Limitations vs EVM/Solidity

- Not a Turing-complete account VM. It's a **UTXO covenant model** — you express *spending conditions*, not arbitrary stateful programs. Rich DeFi logic is harder or impossible vs EVM.
- Several larger mechanistic claims were **refuted** in verification — do not build on them until seen in primary KIP text:
  - exact "compress/open/validate/recompress" covenant model — refuted 0-3
  - introspection giving access to "covenant groups / auth groups" — refuted 0-2
  - "Silverscript is the main/intended covenant authoring language" — refuted 0-3 (don't overstate its official status)

## 6. Maturity — usable vs experimental

| Layer | Status | For build |
|-------|--------|-----------|
| Introspection opcodes (KIP-10) | mainnet-live since Crescendo | ✅ production |
| KRC-20/721 holdings + payments | live | ✅ production |
| Toccata covenants (KIP-17/20/16/21) | mainnet-live 3 days | ⚠️ live but new/unproven |
| **Silverscript** | experimental, **TN12 only** | ❌ not mainnet / not money |

## Recommendation

1. **Phases 0–2 (wallet connect, holdings-gating, treasury payments)** on the stable base (KIP-10 + indexer + Cloudflare Worker) — **independent of Silverscript**. Can start anytime.
2. **Stateful membership covenant** — prototype on **TN12 with Silverscript** in parallel; mainnet only after audit and a stable language version.
3. Before writing covenants, read **KIP-14, KIP-16, KIP-17** first-hand (some derived claims did not pass verification).

## Sources

- [KIP-10 (introspection opcodes)](https://github.com/kaspanet/kips/blob/master/kip-0010.md) — primary
- [Silverscript repo](https://github.com/kaspanet/silverscript/) — primary
- [Michael Sutton — Kaspa Covenants++ "Toccata" Hard-Fork Outlook](https://medium.com/@michaelsuttonil/kaspa-covenants-toccata-hard-fork-outlook-a4d81a40900c) — primary
- [Michael Sutton — Silverscript announcement (X)](https://x.com/michaelsuttonil/status/2021618083694088258) — primary
- [kaspa.org/build](https://kaspa.org/build) — primary
- [docs.kaspa.org/toccata](https://docs.kaspa.org/toccata) — primary
- [rusty-kaspa #914 (covenant field serialization)](https://github.com/kaspanet/rusty-kaspa/issues/914) — primary
- KIP-14 (native assets) — referenced, read first-hand before build

See also: `docs/monetization-architecture.md` (to be written) and memory `pixel-on-kaspa-monetization`.
