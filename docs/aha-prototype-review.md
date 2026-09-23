# Carbon Coin: aha prototype migration and DevX review

## Scope and baseline

The repository formerly named `xrpl-simple-token-test` is now
[`theahaco/carbon-coin`](https://github.com/theahaco/carbon-coin). This migration
starts from `b5ad70d`, after pulling main. There were no open Carbon Coin PRs.
The review includes the CLI, local ledger tooling, and the newly merged GhostSig
web frontend—not just the original issuer script.

The SDK is the exact commit in [`prototype.json`](../prototype.json), from
[xrpl.js #57](https://github.com/theahaco/xrpl.js/pull/57). It is an experimental
API, not a released npm version. All work stays on the aha forks.

Relevant merged app PRs were checked before changing code:

- [#1: GhostSig frontend](https://github.com/theahaco/carbon-coin/pull/1)
- [#4: browser memo encoding and session persistence](https://github.com/theahaco/carbon-coin/pull/4)
- [#5: explicit multisig Sequence](https://github.com/theahaco/carbon-coin/pull/5)
- [#6: handoff links must contain the signed blob](https://github.com/theahaco/carbon-coin/pull/6)
- [#7: regression tests for those failures](https://github.com/theahaco/carbon-coin/pull/7)
- [#8: warn before signing for an unauthorized destination](https://github.com/theahaco/carbon-coin/pull/8)

## What becomes simpler

### One account, one signing client

Previously, every setup operation assembled protocol fields, autofilled, signed,
submitted, then called `assertTesSuccess`. Creating an issuance also required a
metadata cast to recover its ID.

```ts
const issuanceTx = await client.autofill(buildMptIssuanceCreateTx(issuer.address, metadataHex))
const issuanceResult = await client.submitAndWait(issuer.sign(issuanceTx).tx_blob)
assertTesSuccess(issuanceResult, 'MPTokenIssuanceCreate')
const mptIssuanceId = (issuanceResult.result.meta as { mpt_issuance_id?: string }).mpt_issuance_id
```

The migrated [issuer setup](../src/scripts/setup-issuer.ts) uses a wallet-bound client:

```ts
const issued = await signing.tx.mpTokenIssuanceCreate({
  MPTokenMetadata: metadataHex,
  Flags: MPT_ISSUANCE_FLAGS,
}).signAndSubmit()
const id = issued.result.meta.mpt_issuance_id
```

Completion supplies the transaction types and fields. The client supplies the
account, transaction discriminator, autofill and signature. An unsuccessful
validated transaction throws. The optional issuance-ID check remains because it
is a real domain check, not a workaround for unparsed metadata.

The same pattern is used for local XRP funding, holder authorization, signer-list
configuration and disabling the master key. `withWalletClient` owns connection
cleanup; it opens a separate connection because #57 cannot yet bind another
wallet to an existing connection.

### Let the request determine the response

Before, reading an issuance or signer list meant inventing a local response type
with an assertion. Now, in [status](../src/scripts/status.ts):

```ts
const issuance = await client.command.ledgerEntry({ mpt_issuance: state.mptIssuanceId })
console.log(issuance.result.node.OutstandingAmount)

const lists = await client.command.accountObjects({ account: account.address, type: 'signer_list' })
const signerList = lists.result.account_objects[0]
```

The browser uses the same named commands and inferred ledger-entry types. Its
history read explicitly requests API v1 so the typed `tx.Amount` shape matches
what it consumes, instead of guessing between v1 and v2 with casts. Moving that
read to v2 needs the response-side Payment typing in
[xrpl.js #48](https://github.com/theahaco/xrpl.js/pull/48).

### Preserve errors instead of inventing ledger results

The old multisig wrapper parsed `Preliminary result: ...` out of an exception and
cast `{ result: { meta: ... } }` to a complete `TxResponse`. That fabricated
response had no transaction hash, validation status, or actual ledger metadata.

The wrapper and `txResult.ts` are removed. Normal multisig submission resolves
only on validated success. Negative tests use `trySubmitAndWait` or
`trySubmitMultisigned` and inspect the actual error. Validated failures retain
`TransactionFailedError.response`; preliminary rejection/expiry remains an SDK
error and is never represented as a validated transaction.

Local CLI signatures are collected immediately, so they now keep autofill's
bounded expiry rather than extending it by one million ledgers. The independent
GhostSig handoff flow keeps its existing ceremony policy.

## Fixes made while migrating

| Finding | Change |
| --- | --- |
| A network outage looked like an unfunded account or unauthorized holder | Only explicit `actNotFound` / `entryNotFound` responses mean absence. Other errors propagate. |
| Holding lookup scanned only the first `account_objects` page | Query the exact `(account, issuance)` ledger entry at a validated ledger. |
| An authorized zero balance could display as “not authorized” | Keep entry existence separate from the optional zero-balance field. |
| Destination warning ignored the holder's lock flag | Use the SDK flag decoder and warn when the holding is locked. |
| CLI signer selection depended on array order and could select an empty external seed | Select available local keys and explain when the GhostSig ceremony is required. |
| Fractional quorum / duplicate signer entries could reach account configuration | Reject both before submitting the signer list. |
| Redistribution checked only that an address began with `r` | Use the SDK's classic-address validator. |

## SDK helper opportunities

These are proposals, not APIs added by this PR. Existing related PRs are linked
so the audit does not sell already-proposed work as a new discovery.

| Priority | Evidence in this app | Proposed SDK capability / existing work |
| --- | --- | --- |
| High | `mpt.ts` still needs address-only transaction factories for GhostSig and multisig; `WalletClient.tx` requires a local Wallet | Discoverable drafts bound to an account independently of the signing provider. Extend the #57 builder design with an explicit external-signer interface. Do not create fake wallets to get completion. |
| High | `multisig.ts` and `web/src/lib/tx.ts` manually coordinate fee, Sequence, empty SigningPubKey, expiry and signatures | A typed prepare/co-sign/submit lifecycle. Make signature count distinct from weighted quorum, make expiry policy explicit, preserve one immutable prepared payload, and verify signatures refer to it. Existing autofill/signing work: [#40](https://github.com/theahaco/xrpl.js/pull/40), [#36](https://github.com/theahaco/xrpl.js/pull/36). Batch signing [#52](https://github.com/theahaco/xrpl.js/pull/52) is a separate concern. |
| High | Expiry errors in the pinned prototype still embed preliminary result codes in prose | Finish structured errors for expiry/rejection and transaction lookup before declaring expiry. [#45](https://github.com/theahaco/xrpl.js/pull/45) already proposes this. Negative integration tests currently match the message only for these two cases; normal app flows do not parse it. |
| High | `ledger.ts` must inspect `RippledError.data` and map one error code to absence | Typed RPC errors plus `fetchMPTokenOrUndefined`; [#54](https://github.com/theahaco/xrpl.js/pull/54) and [#38](https://github.com/theahaco/xrpl.js/pull/38) already address much of this. Remove the app wrapper when that API lands in the prototype. |
| High | PR #8 found a doomed ceremony only after multiple people had signed | An advisory payment-readiness result: ready, blocked with reasons, or unknown. Include account existence, holder/issuance locks, authorization requirements and reserve considerations. Return the ledger snapshot used, and explain that state can change before submission. The current app warning is deliberately narrower. |
| Medium | `gton.ts` contains exact decimal conversion and the form/CLI permit out-of-range amounts before signing | Reuse audited MPT conversion/range helpers from [#54](https://github.com/theahaco/xrpl.js/pull/54) and validators from [#47](https://github.com/theahaco/xrpl.js/pull/47). Preserve the distinction between this app's display unit (1 Gton = 10^9 raw units) and the issuance's AssetScale (zero). |
| Medium | Memo wrappers and UTF-8/hex encoding are repeated across Node and browser code | A documented memo encoder/decoder with browser-safe defaults, or a clear recipe using the existing `@xrplf/isomorphic/utils` entry point. Preserve the Buffer-free regression from app #4; deprecated root string helpers are not a useful new API to adopt. |
| Medium | A small consumer needs to build a seven-package monorepo just to try #57 | Publish a versioned prerelease with matching declarations/runtime dependencies. This PR makes the source pin reproducible but does not publish packages. |

## Further app findings

These are not hidden by the migration and deserve separate focused work:

- **Signing preview validation:** `sign.astro` accepts arbitrary decoded JSON and
  `describePaymentTx` assumes a Payment and the configured token. Validate the
  transaction kind, issuance, sender, amount and flags before describing it as
  Carbon Coin. Render untrusted memo/address/summary text with text nodes rather
  than inserting it into `innerHTML`. This belongs at the app's trust boundary;
  TypeScript alone cannot validate a pasted proposal.
- **Mint history completeness:** `getMintHistory` reads only 200 entries and
  identifies mints by a memo. Page through results and restrict to validated,
  successful outgoing Payments of the configured issuance before treating a
  period as minted. A typed pagination/outcome helper would reduce this burden.
- **Submission versus confirmation:** the GhostSig adapter has a `submitted`
  result, while the UI sometimes says “Authorized!” or “Quorum met—submitted!”
  without the app independently checking validated success. A typed external
  wallet outcome plus confirmation helper should distinguish signed, submitted,
  validated, failed and unknown.
- **Recoverable setup:** issuer/governance state is persisted after the entire
  bootstrap, including master-key disable. A later failure can leave an account
  configured without its generated signer state saved. Checkpoint setup and
  protect local secrets as a separate operational change.

## Boundaries retained

The current prototype cannot take over GhostSig signing or multisig drafting.
Those address-only factories remain in `mpt.ts` with explicit return models; they
are not passed through `WalletClient` with invented private keys. Local multisig
still autofills, signs and combines blobs in one small helper. The app's tests
continue to exercise that real path.

The merged sequence, fee, signed-blob handoff, browser memo, and session fixes are
preserved. This PR does not change the GhostSig protocol or deploy the site.

## Validation

- Build the SDK from the pinned source commit; install root and web from lockfiles.
- Root TypeScript and Astro checks; build all four static pages.
- Root unit tests for browser-safe memos, public-config filtering, explicit
  missing-entry handling, network errors and local signer selection.
- GhostSig regressions for Sequence/fee preparation, signed-blob handoff and URL
  encoding, plus browser ledger-read error classification.
- Real disposable standalone-ledger tests for issuance, signer lists, disabled
  master keys, multisig mint/redistribution, unauthorized recipients, lock/unlock
  and clawback. No public-network transactions or real GhostSig/passkey ceremony
  are part of this validation.

Exact results and CI status are recorded in the pull request.
