# x402 Token Market — Next-Phase Cleanup & Polish (for codex)

You are working on a working, demoable multi-service Solana USDC payment
system. The hard architectural work is done; this phase is **mechanical
cleanup + visual consistency + tests + docs**. Do NOT redesign the
architecture, do NOT change the x402 protocol surface, do NOT change
which services exist.

If anything in this file conflicts with what you read in the repo, follow
the **repo** and tell me at the end of your run what looked off.

---

## 0. Quick orientation (read this first)

**Repo root:** `/Users/lidawei/workplace/x402-token-market`

**4-actor flow:**

```
HABA (consumer)  →  NetStars x402 Gateway  →  Wea Facilitator  →  Solana Devnet
                    (resource server)         (verify + settle)    (USDC settle)
```

**4 user-facing UIs (all should look like a product family):**

| Surface | URL | Stack | Brand color | State |
|---|---|---|---|---|
| HABA consumer site | `:3001` | Next.js 15 + React 19 + Tailwind | emerald | already light theme |
| Token Console | `:3000` | Next.js 15 + Tailwind + next-intl | blue | already light theme |
| **NetStars X402 Console** | `:3002` | Next.js 15 + Tailwind | blue | newly built · light theme · has `ArchitectureCrumb` |
| **Wea Facilitator Console** | `:3003` | Next.js 15 + Tailwind | violet | newly built · light theme · has `ArchitectureCrumb` |

**Backend services:** `x402-api :8081` (FastAPI), `wea-api :8082` (Rust axum),
`token-api :8080` (FastAPI), `mysql :3306`, `redis :6379`.

**To bring everything up:** `docker compose up -d`. To verify protocol works:
`python3 scripts/x402_protocol_e2e.py` — must report `35 passed · 0 failed`.

**Uncommitted on master** (do NOT commit these yourself; the project lead
will commit + tag): see `git status`. The big additions are the standard
x402 protocol layer in `netstars/x402/src/x402/{protocol,protected_routes,console_routes,wea_client}.py`,
the WEA facilitator + console module in `wea/src/{facilitator,console}.rs`,
the two new Next.js consoles (`netstars/x402/console/` + `wea/console/`),
and the E2E script.

---

## 1. Load-bearing constraints (do not violate)

These come from prior decisions. If you think one is wrong, surface it —
don't quietly bypass.

- **Standard x402 protocol** must keep working. The check is the E2E
  script — run it after every backend change and confirm 35/35 pass.
- **No demo traces on the HABA consumer surface.** Words like "Netstars",
  "Solana", "Devnet", "Token", "x402", "Console", "Facilitator" must NOT
  appear in any string rendered to `:3001`. They're fine inside backend
  code, comments, server-only Next.js API routes, and on the consoles
  (`:3000` / `:3002` / `:3003`).
- **Default LLM is OpenAI `gpt-4.1`.** Do not switch the HABA Advisor to
  Anthropic — that account is permanently disabled. If you find any
  `claude-*` model literal as a default, change it to `gpt-4.1`.
- **WebAuthn / Touch ID must remain a real `navigator.credentials.create()`
  call** with the challenge derived from the PaymentRequirements
  (`haba/src/lib/biometric.ts`). Do not regress it back to a UI gate.
- **Demo wallet stays on Solana Devnet only.** USDC mint
  `4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU`; demo payer pubkey
  `5gYYVxNa4EfeYafSoM9c2e4YSFuRh1aRaw9G1zzMwYMS`; recipient
  `61e1MSTEN5dTjNGNQcwUivRVubYz6ebYfmz9qvYtkeNr`. Don't hardcode any
  other addresses or networks anywhere new.
- **No `git commit` and no `git push`.** Project lead does all commits.
  When you're done, leave the working tree dirty and write a one-page
  summary at the end of your run.
- **No new heavy dependencies** without asking. Specifically: no
  `@solana/web3.js` in HABA, no `solana-client` / `solana-sdk` Rust
  crates in WEA (the design is intentionally lightweight — WEA calls
  Solana via `reqwest` JSON-RPC, and SPL tx parsing is delegated to
  x402-api's `/internal/verify-payment-payload`).

---

## 2. Backlog — do in this order

Each task is bounded. Finish + verify before starting the next.

### Task A · Sync HABA i18n locales (mechanical, ~10 min)

**Why:** All 3 locale files at `haba/messages/{zh-CN,ja,en}.json` currently
share the same top-level keys (`brand`, `hero`, `nav`, `agent`,
`products`, `footer`), but the **nested keys inside each may have
drifted** after several rounds of feature deletion (we removed B2B,
resale, scenario picker, etc.). The HABA app currently only uses
`brand`, `nav.home`, `agent.*`(some), `products.*`, `footer.disclaimer`.

**Do:**

1. Run `rg -o "useTranslations\(\"[a-z.]+\"\)" haba/src` and similar to
   list every i18n key the code actually references.
2. For each of the 3 locales, prune unused keys and add any missing keys
   so all 3 are structurally identical.
3. For ja.json and en.json, translate the values **from zh-CN** (don't
   leave Chinese strings in en/ja). Use natural Japanese / English; the
   audience is JP/Western executives.

**Acceptance:**
- All 3 files have identical key trees.
- `docker compose build haba-site` succeeds (no i18n missing-key warnings
  in build log).
- Manually switching locale at `:3001` via the LocaleSwitcher shows
  Japanese / English strings, not Chinese fallbacks.

---

### Task B · Delete dead exports + dead data files in `lib/haba/` (~10 min)

**Why:** When we deleted the B2B / resale / scenario-picker components,
the data files they imported from (`lib/haba/{partners,resale,scenarios}.ts`
and their types) became orphan exports re-exported from `lib/haba/index.ts`.
Dead code is misleading.

**Do:**

1. List all symbols re-exported in `haba/src/lib/haba/index.ts` and check
   each one's references with `rg -F "habaB2BPartners" haba/src` etc.
2. For each symbol with **zero non-test references** in `haba/src/`,
   remove the export from `index.ts`.
3. Look at the source files (`lib/haba/partners.ts`, `lib/haba/resale.ts`,
   `lib/haba/scenarios.ts`) — if a whole file's exports are now all
   unused, delete the file too.
4. `lib/haba/types.ts` is a wildcard export (`export * from "./types"`)
   — leave alone unless every type is unused.

**Acceptance:**
- `docker compose build haba-site` succeeds.
- `rg -F "from \"@/lib/haba\"" haba/src | rg -F "getScenarioById\\|habaB2BPartners\\|tokenResalePlans"` returns zero matches.
- No regression on `:3001` — Advisor still recommends SKUs, checkout
  still works, end-to-end.

---

### Task C · Update README + ARCHITECTURE.md to reflect current state (~30 min)

**Why:** Several docs are out of date.

**Do:**

1. **Root `README.md`** — add a "Services" section at the top with the
   table from §0 above. Add a "Quickstart" with `docker compose up -d`,
   `make migrate-x402`, then `python3 scripts/x402_protocol_e2e.py` to
   verify the protocol layer.
2. **`ARCHITECTURE.md`** — section §6.1 was already rewritten for the
   standard x402 flow. Re-read the rest of the file and patch any
   sections that still describe the old "create-order-then-pay" flow
   (look for references to `dev-checkout`, `admin-confirm`,
   "token-purchase", `x402TopupSteps`). Either remove or annotate as
   "legacy v0.3.0".
3. **Per-service READMEs** — `netstars/x402/console/README.md` and
   `wea/console/README.md` don't exist yet. Write 1 page each:
   - what the console does
   - which backend endpoint it polls
   - how to run locally + URL
   - which scenarios are available
   - screenshot path (`smoke-*.png` exists at repo root for older
     versions; do not generate new ones).
4. **`docs/PROGRESS.md`** — add a new section
   "## 第六轮 · 标准 x402 协议层 + 双 console" summarizing v0.8.0:
   - what changed at the protocol level (HTTP 402, X-PAYMENT, retry,
     resource binding, replay, expiry, WebAuthn challenge derivation)
   - what changed at the role boundary (gateway / facilitator / consumer)
   - the 4 consoles
   - the E2E test (`scripts/x402_protocol_e2e.py`, 35/35)
   Cite specific commit hashes only if they exist (`git log --oneline`).

**Acceptance:** All four files exist, are mutually consistent, and link
to each other where relevant. No mention of `dev-checkout` or
`admin-confirm` as user-facing endpoints (they're removed).

---

### Task D · Add `ArchitectureCrumb` to HABA + Token Console (~20 min)

**Why:** Right now only `:3002` and `:3003` have the architecture-crumb
strip showing the 4 actors with the current one highlighted. The user
wants all 4 surfaces to feel like one product family.

**Do:**

1. Look at the existing crumb at
   `netstars/x402/console/src/components/ArchitectureCrumb.tsx` and the
   identical copy at `wea/console/src/components/ArchitectureCrumb.tsx`.
2. Adapt it for HABA (`haba/src/components/layout/HabaTopBar.tsx`):
   - Render with `current="haba"`.
   - The HABA surface is consumer-facing — keep the crumb **subtle**:
     hide on the homepage hero (so it doesn't compete with the AI
     Advisor) but show on `/cart`. Or render as a single discrete row
     below the top nav, not above the brand logo.
   - Style must match HABA's light theme + emerald accent (don't import
     the slate-50 backdrop; HABA's existing tokens are
     `surface-base`, `border-subtle`, etc).
3. Same for `netstars/token/console/` — add `current="gateway"` if its
   role is gateway-adjacent (it's Token-API operations, so probably
   "gateway" works). Match its existing Tailwind tokens.
4. The 4-node list (HABA / NetStars Gateway / Wea Facilitator / Solana
   Devnet) and the URLs must match the existing two copies. If you want
   to deduplicate the component, **don't** — the four Next.js apps are
   intentionally independent. Just copy with adaptations.

**Acceptance:**
- Open `:3001/cart` → see the crumb with HABA node highlighted, others
  clickable.
- Open `:3000` → see the crumb with the appropriate node highlighted.
- Clicking another node opens that console in the same tab.
- No regression on consumer surface (HABA homepage still doesn't
  expose "Solana / Netstars / x402" in the **rendered** hero area).

---

### Task E · Unit tests for `netstars/x402/src/x402/protocol.py` (~45 min)

**Why:** The protocol module is the wire-format contract. It currently
has zero tests. The E2E script exercises it end-to-end but doesn't
isolate unit-level edge cases.

**Do:**

1. Mirror the existing pytest setup at
   `netstars/x402/.pytest_cache/` (look at
   `netstars/token/api/tests/test_openai_provider.py` for conventions).
2. Create `netstars/x402/tests/test_protocol.py` with tests for:
   - **Round-trip:** `encode_x_payment_header(p) → decode_x_payment_header → equal to p` for a valid payload.
   - **Malformed base64** → raises `XPaymentDecodeError`.
   - **Non-JSON bytes** after base64 → raises `XPaymentDecodeError`.
   - **Missing required field** → raises `XPaymentDecodeError` (use
     pydantic ValidationError catch).
   - **`assert_payload_matches_requirements`:**
     - scheme mismatch → ValueError
     - network mismatch → ValueError
     - resource mismatch vs payload → ValueError
     - resource mismatch vs `expected_resource` → ValueError
     - all matching → returns without raising
   - **`build_requirements`:** verify the returned object has
     `extra.nonce`, `extra.facilitator`, `extra.expiresAt`,
     `extra.decimals==6`, `extra.name=="USDC"`, and
     `maxAmountRequired` is a `str` (per x402 spec — not int).
3. Add a `pyproject.toml` script entry or a `Makefile` target so
   `make test-x402` runs `pytest netstars/x402/tests/`.

**Acceptance:**
- `cd netstars/x402 && pytest tests/test_protocol.py -v` → all green.
- Coverage is meaningful (≥80% of `protocol.py` lines).

---

### Task F · Demo wallet auto-topup helper (~20 min)

**Why:** Demo payer wallet
`5gYYVxNa4EfeYafSoM9c2e4YSFuRh1aRaw9G1zzMwYMS` runs out of Devnet USDC
during repeat demos. Right now the only way to refund is to manually go
to the Circle faucet. A small helper script saves time.

**Do:**

1. Create `scripts/topup_demo_wallet.py` that:
   - Reads `DEMO_PAYER_PUBKEY` from `.env` (fall back to the hard-coded
     literal above).
   - Checks current SOL + USDC balance on Devnet via JSON-RPC.
   - Prints them with a "low / OK / good" classification (`<0.05 SOL`
     or `<5 USDC` = low).
   - If `--airdrop` flag, calls `requestAirdrop` for 1 SOL (works on
     Devnet without manual faucet for SOL; USDC still needs Circle).
   - If `--print-faucet-url`, prints the Circle faucet URL
     (https://faucet.circle.com) and the address pre-filled in a
     copy-pasteable form.
   - Does not require any new pip dependency — use stdlib `urllib` like
     `scripts/x402_protocol_e2e.py` does.
2. Add `make topup-check` and `make topup-airdrop` targets that
   delegate to this script.

**Acceptance:**
- `python3 scripts/topup_demo_wallet.py` prints both balances.
- `python3 scripts/topup_demo_wallet.py --airdrop` requests 1 SOL on
  Devnet and the SOL balance increases within ~10 s.
- Doesn't introduce any new pip dependencies; runs on
  `/Users/lidawei/.pyenv/versions/3.10.6/bin/python3`.

---

### Task G (stretch) · Add "Expired order" scenario to NetStars Console (~30 min)

**Why:** I deferred this earlier because the protected endpoint uses a
global `X402_EXPIRY_SECONDS=600`. The other 5 scenarios all work; this
one rounds out the spec coverage.

**Do:**

1. Backend (`netstars/x402/src/x402/protected_routes.py`): inside the
   `ProtectedCheckoutIn` body, accept an optional
   `_demo_expiry_seconds` field (int, ≤60). When present, override
   `expiry_seconds` when calling `OrderService.create_payment`. Document
   that this field is for the console demo only and should be removed
   before production.
2. New scenario file
   `netstars/x402/console/src/app/api/scenarios/expired/route.ts`:
   - POST the protected endpoint with `_demo_expiry_seconds: 2` to get
     a 402 + short-lived requirements.
   - Build the payload (still valid for 2 s).
   - Sleep 3 s.
   - POST the retry with X-PAYMENT.
   - Expect `410 EXPIRED` (the gateway already enforces this — see
     protected_routes.py:121-136).
3. Wire the scenario into the console UI (`page.tsx`) as a 6th button.
4. Update `scripts/x402_protocol_e2e.py` with a Test 10 for expired.

**Acceptance:**
- Clicking "Expired order" on `:3002` shows `410 EXPIRED` after ~3 s.
- `python3 scripts/x402_protocol_e2e.py` shows 36+ passed assertions
  with the new test included.

---

## 3. Out of scope (DO NOT do)

- Any change to the x402 protocol module (`protocol.py`,
  `protected_routes.py`, `wea_client.py`) beyond what Task G asks for.
- Any change to WEA's Rust facilitator (`wea/src/facilitator.rs`,
  `wea/src/console.rs`).
- Any change to the demo wallet keypair or the Solana network config.
- Any new package.json dependency, any new Cargo crate, any new pip
  package — without asking first.
- Any `git commit`, `git push`, `git tag`, `git branch -D`,
  `git reset --hard`, `git push --force`, `--no-verify`. Leave a dirty
  working tree.
- Any UI overhaul beyond what Task D specifies. Don't redesign
  HABA's Hero, don't move buttons around the consoles, don't introduce
  a new color or font.
- Any change to docker-compose.yml beyond adding new services that are
  required (Task F adds no services).

---

## 4. End-of-run report

When done (or when blocked), write a single message that includes:

1. **Each task** — done / partial / blocked + 1-line note.
2. **Files changed** — `git status --short` paste.
3. **Test results** — output of:
   - `docker compose build haba-site netstars-x402-console wea-console`
     (just the last `DONE` lines)
   - `python3 scripts/x402_protocol_e2e.py` (the final summary line)
   - `cd netstars/x402 && pytest tests/test_protocol.py -v` (the
     summary line)
4. **Anything surprising you found** — code that looked wrong, comments
   that don't match reality, dependencies that seem unnecessary, etc.
   Don't fix — just flag.
5. **Anything you wanted to do but didn't** because it felt out of scope.

Do not paste full file contents. Do not paste full build logs. Keep it
tight.
