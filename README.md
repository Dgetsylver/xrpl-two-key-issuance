# Harrowquay test dapp: quick guide

**Try it:** https://dgetsylver.github.io/xrpl-two-key-issuance/ (XRPL **testnet** only; the fund is fictional and nothing here is an offer).

This is a **preview fork**. The `preview` branch merges the open pull requests of [theahaco/carbon-coin](https://github.com/theahaco/carbon-coin), so the whole demo can be tried before they land upstream:

- #10: SDK stack
- #15: RequireAuth, AssetScale and bootstrap admission
- #12, #16: testnet issuances
- #13: Phase 1 redesign
- #17: holder admission
- #18: Register controls

Plans: issues #11 (Phase 1) and #14 (Phase 2).

## What the demo shows

A tokenised share class (`HQUAY`) of a fictional real-estate fund, run by **two separate 2-of-3 multisig key sets**:

- **The Register** (issuer account) creates units, admits holders and holds the controls: stop-transfer and lost-key replacement.
- **The Dealing Desk** (governance account, the manager's "box") receives each dealing day's units, sells them to investors the same day and ends the day holding none.

Every Register and Dealing Desk step needs two of three passkeys; investors sign their own steps alone. Every step lands on the public ledger.

The separation is **procedure plus a public audit trail**, not a ledger rule. The Register's keys *could* pay an investor directly, and the app would flag that as OFF-PROCEDURE.

## Before you start

1. **Passkey wallets ([ghostsig.dev](https://ghostsig.dev)).**
   - **To sign as a keyholder**, sign in with the passkey behind one of the six addresses below. A new GhostSig account gets a new address, which isn't on either list.
   - **To play the investor**, use a separate GhostSig account (passkey: Touch ID, Windows Hello or a security key). A keyholder address shows its seat on the overview, not an investor card.
   - **To switch parts**, press **Disconnect** in the header, then **Connect passkey** with the other account. The site stays connected as the last account.
2. **Testnet XRP.** Fund every account you use from GhostSig's testnet faucet. An unfunded account can't request admission. XRP only pays network fees and has no value.
3. **The signer lists.** These are the same six testnet addresses as the original Carbon Coin deployment:

| Key set | Seat | Address |
|---|---|---|
| Register | Depositary | `rN3PpXKqw8Lhc8FVQtQisYTN6B477ukSkG` |
| Register | Registrar | `rrsZ4r57pPrrnFfuqTvtVmTpGXb6RcBuZg` |
| Register | Administrator | `rByTJq8pGJJF14UghgaXDcsnV1QqCFEwQy` |
| Dealing Desk | Dealing | `rJQ47qx4EsKo1RuddSJQ9RnKsxvxi7P2r9` |
| Dealing Desk | Operations | `rBKbxwJVX2mgwNXLX4qKCxwNXcerCgtvxd` |
| Dealing Desk | Compliance | `r4XHkJA3iNbuL8Dk58nmYsbsmFgiSWrFNe` |

If you hold none of these, you can still browse everything and play the investor.

## How a 2-of-3 signature works (every ceremony)

1. The first keyholder fills in the form and presses **Sign … with passkey**. GhostSig asks for their passkey and signs first.
2. The page shows **Pass to the next keyholder**: a relay message, a **signing link** (Copy link) and a **QR code**. Send it to a second keyholder of the *same* key set.
3. The second keyholder opens the link and presses **Connect passkey**. **Co-sign** then decodes the transaction itself into plain language, e.g. "Admit rAb7Tq…Q7Kx to the register". They press **Co-sign with passkey**. A key from the other set is told it can't sign.
4. At 2 of 3, GhostSig submits it to the testnet. The result shows on the overview: Register ledger, tiles and the investor's card. **Reload the overview if it was already open**; it doesn't refresh by itself.

**One ceremony at a time per key set.** Each proposal takes that account's next sequence number and never expires. If two proposals are open, whichever lands first voids the other ("Didn't go through").

**GhostSig's own popup shows raw fields:** flags in hex, amounts as raw integers (1,000 = 1 HQUAY unit), and an "expires: never" warning. That warning is expected here. Read the app's Co-sign page for the plain-language version.

## Walkthrough (about 10 minutes, start to finish)

The live issuance is fresh: no units are in issue yet, and the Dealing Desk was admitted when the token was set up.

1. **Investor asks to join.** On **Overview**, press **Connect passkey** with the investor account, then **Request admission**. The card shows **Awaiting admission**.
2. **Register admits the investor.** A Register keyholder opens **Admit investor**, picks the waiting account (or pastes its address), ticks the KYC placeholder and presses **Sign admission with passkey**. A second Register key co-signs. The investor reloads the overview: their card now shows a holding of 0.000 units.
3. **Dealing day (Register).** On **Dealing day** the contract note is pre-filled: cleared cash ÷ NAV = units. Both figures are illustrative and come from config. Press **Sign with passkey and propose**, and a second Register key co-signs. The units are issued to the Dealing Desk. On the overview, that month's façade bay lights up and **Desk inventory** rises.
4. **Deliver units (Dealing Desk).** A Desk keyholder opens **Deliver units**, picks the admitted investor, enters the units and an order reference, and presses **Sign delivery with passkey**. A second Desk key co-signs. The investor's holding appears. **Desk inventory** returns to 0 once all of the day's units are delivered.
5. **Stop-transfer (Register).** In **Controls**, choose the holding, give a reason (e.g. "lost key") and press **Sign stop-transfer**. A second Register key co-signs. The investor's card shows **Stop-transfer in place**.

   Back on **Controls**, pick that holding again (now marked "stopped") to open its panel. From there, either:
   - **Release stop-transfer**, then **Sign release** (co-signed); or
   - go on to step 6.
6. **Lost-key replacement (Register).** The investor's new wallet (another funded GhostSig account) first does steps 1–2: request admission, get admitted. Then in **Controls**, pick the stopped holding and press **Start lost-key replacement**.
   - **Sign claw-back** takes the units back from the old wallet (co-signed). Until step 2 lands, those units are out of issue.
   - Step 2 opens by itself if Controls stayed open. Otherwise press **Continue to step 2** at the top of Controls. Pick the new wallet (listed as "Admitted") and press **Sign re-issue** (co-signed).

   Both steps share one `REPL-…` reference, and the ledger groups them. Once the re-issue lands, units in issue are back where they started.
7. **Redemption (optional).**
   - The investor opens **Transfer units** on their card, presses **Use the Dealing Desk's address**, enters the units and presses **Sign transfer with passkey**.
   - The Desk returns those units to the Register from **Deliver units**, entering:
     - the Register's address `rH9PYrGRAfLJ3kJCPFrdHLULXf6yQMiw4y` (also under **Technical details** on the overview);
     - the same units;
     - an order reference.
   - Co-sign shows "Return … to the Register for cancellation". The units are destroyed, and the ledger shows a REDEEM row.

## Pages

| Page | Who | What for |
|---|---|---|
| Overview `/` | everyone | Story, façade (lit bay = issued dealing day), live tiles, your account, the two key sets, Register ledger, technical details |
| Dealing day `/propose-mint` | Register keys | Issue a dealing day's units to the Desk |
| Admit investor `/admit` | Register keys | Put a requesting account on the register |
| Deliver units `/propose-disbursement` | Dealing Desk keys | Sell issued units to an admitted investor, or return units to the Register |
| Co-sign `/sign` | the second keyholder | Open a signing link and add the second signature |
| Controls `/controls` | Register keys | Stop-transfer, release, lost-key replacement |
| About `/about` | everyone | Redemption terms (quarterly, 90-day notice, 5% gate), how two-stage dealing works, dealing suspension |

## Warnings you may see

- **OFF-PROCEDURE:** the transaction is valid but skips the procedure. From this site's forms, that means units changed from the contract note, or a dealing day that was already issued. A hand-made link can also trigger it, e.g. an issue sent straight to an investor, an admission without a KYC reference, or a stop-transfer without a reason. You can still sign; check with the proposer first.
- **UNRECOGNISED: DO NOT SIGN:** the link matches no Harrowquay procedure. The sign button is hidden; decline it.
- **Not on the register:** the Desk can't deliver to an account the Register hasn't admitted. The ledger would reject it.
- **No admission request:** the account hasn't pressed Request admission yet, so the ledger would reject the admission.
- **Already issued:** shown on Dealing day when that day already has an issue on the ledger. Nothing stops a second one; the co-signer sees it as OFF-PROCEDURE.

## Good to know

- Testnet only. Ripple resets the testnet from time to time; the issuance would then need to be redone.
- The command-line `mint` / `redistribute` scripts won't run for this issuance: the signer keys live in GhostSig, not on a laptop. Use the site.
- NAV and cleared cash are illustrative config values. Cash never moves on-ledger here.
- A global "dealing suspension" is explained on the About page only; there's no button for it.
- This fork is a preview. The source of truth is the pull requests upstream.

---

# xrpl-token

A simple fungible token on the XRP Ledger, built on the native **MPToken**
standard (not classic trust-line Issued Currencies). A multisig-gated issuer
account mints new supply, one mint per labelled period, to a multisig-gated
governance account, which passes units on to holders.

The code doesn't fix a token identity. The name, ticker and issuer name come
from the `TOKEN_*` env vars at issuance and reach the web frontend through
`web/public/deployment.json`; the frontend's own copy and branding live under
`web/`.


## Aha DevX prototype

This branch uses [the aha SDK stack (#59 → #62)](https://github.com/theahaco/xrpl.js/issues/58),
version `5.3.0-aha.devx.1`,
pinned to the commit in [`prototype.json`](prototype.json). Run `npm run prototype:setup`
before installing this app. It creates an ignored `.prototype/xrpl.js` checkout and
builds all seven SDK packages; both the CLI and browser resolve that same build.
No npm release or developer-specific checkout path is needed. CI uses the same setup.
To update the SDK, change the commit pin, rerun setup, and refresh both lockfiles.

Local signing uses `client.withWallet(wallet).tx` on the existing connection.
Multisig uses `client.forAccount(address).tx` and throws unless the transaction
validates successfully. Ledger reads use the discoverable `client.command` API with inferred
response types. GhostSig still owns browser keys and the multi-person ceremony;
we never instantiate a local signing wallet for a GhostSig address.

See [the SDK stack cleanup](docs/aha-sdk-stack-cleanup.md) for the new before/after
examples, deleted helpers and verification. The [initial migration PR](https://github.com/theahaco/carbon-coin/pull/9)
records the findings that motivated this stack.

## Design summary

- **Token standard**: XRPL native MPToken (`MPTokenIssuanceCreate` /
  `MPTokenAuthorize` / `Payment`).
- **Supply**: open-ended (no `MaximumAmount`). Ledger amounts are integers;
  no floating-point conversion anywhere. `TOKEN_ASSET_SCALE` (default 0,
  whole units only) sets the issuance's `AssetScale`: with 3, one displayed
  unit is 1000 on the ledger, so amounts go down to 0.001.
- **Issuance flags**: transferable, lockable (freeze), clawback-able.
  `MPT_REQUIRE_AUTH` (default off) adds `tfMPTRequireAuth`. With it off, any
  account can hold the token once it self-authorizes. With it on, the issuer
  must also admit each holder (`MPTokenAuthorize` with `Holder`) before that
  holder can receive units. Flags and `AssetScale` are fixed at issuance.
- **Issuer account**: the MPT issuance itself is a single-sig bootstrap
  action, signed with the account's still-active throwaway master key. The
  account is then established as a 2-of-3 multisig and its master key is
  disabled, so from that point on minting, admission, lock/unlock and
  clawback are all multisig-only actions. With RequireAuth, the master key
  is disabled one step later (see [RequireAuth setup order](#requireauth-setup-order)).
- **Governance account** likewise self-authorizes to hold the MPT as a
  single-sig bootstrap action before its master key is disabled; from then
  on it's a 2-of-3 multisig with its own signer list. Keeping that list
  separate from the issuer's is a matter of configuration: nothing checks
  that the two lists don't share a signer.
- Both 2-of-3 signer sets are **placeholders** for local/Testnet development
  — replace them with real keys before any production use.

See `devnet/rippled.cfg` and `src/lib/` for implementation details and
inline rationale. All local-network tooling (starting/stopping the
stand-alone node, keeping its ledger advancing, the `devnet:up`/`devnet:down`
CLI) lives under `devnet/`, separate from the token/XRPL application logic
in `src/`.

## Prerequisites

- Node.js 22.12+ (required by Astro, used for the web frontend)
- Docker — only required for `XRPL_NETWORK=local` (this project was
  developed and tested against [colima](https://github.com/abiosoft/colima);
  Docker Desktop should also work). Skip it entirely by using
  `XRPL_NETWORK=testnet` instead; see [Networks](#networks) below.

## Setup

```sh
npm run prototype:setup   # builds the exact aha SDK commit in prototype.json
npm ci
npm --prefix web ci
cp .env.example .env
```

Edit `.env` to set your token's identity (`TOKEN_TICKER`, `TOKEN_NAME`,
etc.) and to select a network via `XRPL_NETWORK` (`local` or `testnet`).

Two optional settings shape the issuance. They're read once, by
`setup:issuer`, and can't be changed afterwards without a new issuance:

| Variable | Default | Effect |
|---|---|---|
| `MPT_REQUIRE_AUTH` | `false` | `true` sets `tfMPTRequireAuth`: holders need the issuer's admission before they can receive units. Also changes the [setup order](#requireauth-setup-order). |
| `TOKEN_ASSET_SCALE` | `0` | The issuance's `AssetScale`, a whole number from 0 to 18. One displayed unit is 10^scale on the ledger. |

## Networks

Switching networks is a single `.env` change:

- **`XRPL_NETWORK=local`** (default) — a disposable, local, stand-alone
  XRPL node running in Docker. No real money, no faucet rate limits, no
  reliance on Testnet being up. **Requires Docker.**
- **`XRPL_NETWORK=testnet`** — the public XRPL Testnet, funded via the
  public faucet. **No Docker required** — this is the escape hatch if you
  don't have (or don't want) a container runtime installed. Trade-offs:
  faucet rate limits, real (if slow, ~4s) ledger close times instead of
  instant on-demand ones, ledger state shared with the rest of the public
  Testnet, and periodic full resets by Ripple (see
  [Security notes](#security-notes)).

An optional `XRPL_WS_URL` overrides the WebSocket endpoint for either
network.

### Running the local network

```sh
npm run devnet:up    # starts a stand-alone rippled node + a background ledger-advance loop
npm run devnet:down  # stops both
```

Stand-alone mode never closes ledgers on its own, so `devnet:up` also spawns
a small detached background process that calls the admin `ledger_accept` RPC
every 500ms — without it, submitted transactions would never be confirmed.
Both the container and the background process are tracked in `.devnet.json`
(gitignored); `devnet:down` reads it to stop both and removes it. If you
forget to run `devnet:down` (e.g. after killing the terminal), both will
keep running until stopped manually.

The local node's genesis account (address and secret are XRPL's
well-known, publicly-documented stand-alone values — never use them for
anything beyond local development) holds all XRP and is used to fund
freshly-generated wallets directly, so no faucet is needed locally.

## Usage

With the local network running (`npm run devnet:up`) or `XRPL_NETWORK=testnet`
set:

```sh
npm run setup:issuer                    # funds + configures the issuer, creates the MPT
npm run setup:governance                # funds + configures governance, authorizes it to hold the MPT
npm run mint -- <amount> [period]       # multisig-signed mint to governance (period defaults to the current year)
npm run redistribute -- <address> <amount>  # multisig-signed Payment from governance to a recipient
npm run status                          # prints issuance, balances, admission and signer list configuration
```

`<amount>` is the ledger value: with `TOKEN_ASSET_SCALE=3`, `1000` is 1.000
displayed units.

All state (generated addresses, signer seeds, the MPT issuance ID, the
issuance's flags and `AssetScale` as read back from the ledger, and a record
of which periods have already been minted) is persisted to
`.deployment.json`, which is gitignored. Delete it (or specific fields
within it) to redo a step from scratch. Redoing the issuer means a new
issuance, so delete the `governance` field along with `issuer`,
`mptIssuanceId` and `issuance`: `setup:issuer` refuses to start while a
governance account from an earlier issuance is recorded.

Both setup scripts save progress after funding their accounts, and
`setup:issuer` also saves once it has created the issuance. Each step checks
the ledger before it acts. If a run stops half-way, run the same command
again to resume it.

### RequireAuth setup order

With `MPT_REQUIRE_AUTH=true`, the governance account can't receive its first
mint until the issuer admits it, and the issuer can only sign alone while its
master key is enabled. So the setup keeps that key until the admission is
done:

1. `setup:issuer` funds the issuer, creates the issuance single-sig, and sets
   the issuer's 2-of-3 signer list. It **leaves the issuer's master key
   enabled** and records `"masterKeyDisablePending": true` for the issuer in
   `.deployment.json`.
2. `setup:governance` funds the governance account, which self-authorizes
   single-sig. The issuer's master key then admits it (`MPTokenAuthorize`
   with `Holder` and a bootstrap memo) and is disabled. Last, the governance
   2-of-3 signer list is set and the governance master key is disabled.

Run the two steps back to back: until step 2 finishes, the issuer's master
key can still sign alone. `npm run status` shows RequireAuth and
`AssetScale`, whether the governance account is admitted, and whether both
master keys are disabled. Every holder admitted after setup needs an issuer
multisig `MPTokenAuthorize` with `Holder`.

With `MPT_REQUIRE_AUTH` unset or `false`, the order and transactions are the
same as before: each script disables its own account's master key.

`mint` refuses to mint twice for the same period unless you pass `--force`,
as a safety net against accidental double-issuance:

```sh
npm run mint -- 100000 2026          # first mint for 2026
npm run mint -- 100000 2026          # refused: already minted for 2026
npm run mint -- 100000 2026 --force  # explicit override, e.g. for a correction
```

## Testing

```sh
npm run test:integration
```

This runs the full Vitest suite, which spins up a fresh, disposable
stand-alone rippled container per test file (via `testcontainers`) and
exercises real transactions against it — no mocking of XRPL behavior. It
covers:

- MPT issuance creation (flags, whole-unit scale, no supply cap, metadata)
- A RequireAuth issuance with `AssetScale` 3: the bootstrap admission of the
  governance account before both master keys are disabled; holders that
  self-authorized but aren't admitted can't receive; issuer multisig
  admission with a memo; per-holder lock and unlock with reason memos; and a
  lost-key replacement (clawback from a locked holder, then re-issue to a new
  admitted wallet, with a shared memo)
- The setup scripts themselves, run as separate processes: the RequireAuth
  setup order, reruns that change nothing, resuming an interrupted issuer
  setup and a `setup:governance` run stopped after the admission, the error
  when the issuer's master key is disabled before the admission, refusing a
  governance account left from an earlier issuance, the unchanged order with
  RequireAuth off, and a rerun on a state file written before `issuance`
  was recorded
- Multisig-gated minting, including insufficient-signature, disabled-master-
  key, and unauthorized-destination failure cases
- Governance setup and multisig redistribution
- Issuer lock/unlock and clawback
- Network-selection logic for both `local` and `testnet`

```sh
npm run typecheck
```

## Web frontend

`web/` is a static, frontend-only Astro site that lets issuer/governance
multisig members run real, [GhostSig](https://ghostsig.dev)-signed minting
and redistribution ceremonies directly from a browser — no server, no
seeds held anywhere. General visitors can connect, self-authorize, view live
stats, and send units they already hold.

GhostSig only understands XRPL `testnet`/`devnet`/`mainnet`, so the web demo
always targets **XRPL Testnet**, regardless of the CLI's `XRPL_NETWORK`
setting. For "my address is a signer" to ever be true in the browser, the
issuer/governance signer lists need at least one real, externally-supplied
address (e.g. your own GhostSig address) — see `ISSUER_SIGNER_ADDRESSES` /
`GOVERNANCE_SIGNER_ADDRESSES` in `.env.example`.

```sh
npm run setup:issuer      # with XRPL_NETWORK=testnet and ISSUER_SIGNER_ADDRESSES set
npm run setup:governance  # likewise, with GOVERNANCE_SIGNER_ADDRESSES set
npm run web:sync-config   # regenerates web/public/deployment.json (addresses only, never seeds)
npm run web:dev           # or web:build / web:typecheck
```

`web/public/deployment.json` is a committed, regenerate-on-demand static
asset containing only non-secret fields (addresses, quorum, token identity,
and the issuance's `assetScale` and `flags`) — `sync-public-config.ts`
refuses to write anything containing a `seed` key.
See `web/src/lib/ghostsig.ts` for the vendored GHOSTSIG popup protocol client
(adapted from `ghostsig/sdk/popup.ts`) that the site signs everything through.

## Security notes

- All signer seeds (issuer and governance) are sensitive secrets. They're
  stored in `.deployment.json`, which is gitignored, but treat that file
  with the same care as any private key material.
- The issuer's and governance's 2-of-3 signer sets are **local/Testnet
  placeholders**. Real signer accounts/keys must replace them before any
  mainnet use. If a signer set is ever fully lost with no rotation path,
  that account becomes permanently locked out of its own powers/funds.
- Freeze and clawback are powerful, centralized controls, included
  deliberately for this token. Document them clearly for any future holders
  or auditors. A per-holder lock stops transfers between holders, but the
  locked holder can still send units back to the issuer.
- With RequireAuth, the issuer's master key stays enabled between
  `setup:issuer` and `setup:governance`. Don't leave a setup in that state.
- `SignerListSet` replaces an account's entire signer list; there's no
  incremental add/remove. Rotating signers requires meeting the *current*
  quorum to authorize the replacement list.
- Ripple periodically resets XRPL Testnet entirely. A reset invalidates
  `.deployment.json`; just rerun the setup scripts to redeploy.
- The local stand-alone network's genesis secret is publicly known by
  design (anyone can spin up their own local node) — never use it for
  anything beyond local development funding.
