# Sanitation Owner Portal Web Release

Status recorded 2026-10-26: local integration on `sanitation/owner-web-combined` reached the seven-commit checkpoint `6275cd0a14d62789d25fa29fd6d2b9a7c6d0f13f`, including this runbook's documentation commit; fetched main base was `4391711995189651e1b25da8df2b9a4864506ff3`. The earlier six-commit implementation checkpoint was `d18980222fb6a8e1c54c232cc5f8bfd1c2c523a7`. A status-correction commit advances HEAD without changing these historical identities. At this checkpoint no branch push, PR, main merge or deployment had occurred. See [progress](../PROGRESS.md) and [audit](../PROJECT_AUDIT.md) for the seven commits and evidence boundaries.

## Purpose and prerequisites

The public [Flutter entry](../mobile/lib/main_sanitation_public.dart) uses the [dedicated Sanitation shell](../mobile/web_owner/index.html) and [manifest](../mobile/web_owner/manifest.json), with landing `/#/` and owner `/#/establishment-portal` routes. Staff/Tourism/session startup is excluded. Lookup is disabled unless explicitly configured for synthetic loopback testing. The general mobile README's other entry points/API options do not apply to this build.

Before an independently authorized build:

- Verify repository, branch, clean source state, intended source commit and freshly fetched main. If main advances, stop for baseline/impact review, including Tourism coordination; do not silently merge/rebase. The script checks source status stability, not initial cleanliness, so this release review must require a clean source checkout.
- Use the existing Windows SDK at `C:\src\flutter-3.44.0\flutter`: Flutter **3.44.0**, Dart **3.12.0**, framework **559ffa3f75e7402d65a8def9c28389a9b2e6fe42**. Historical parsing/safety verification used PowerShell **7.6.5** and Windows PowerShell **5.1.26100.9711**. Git and the SDK's locked dependencies must be available; do not install or upgrade as an implicit release step.
- Verify [build.ps1](../tools/owner-portal-web/build.ps1) SHA-256 `F90F079284618956D20C98F7D95115B5FE49586F3C04C458394E967E75DB9897` and [pubspec.lock](../mobile/pubspec.lock) SHA-256 `96B042C26D5A2B31C9ABD7185C9D8413A53ACC8A0BDC4C07D5B62B7250046C73` for this reviewed implementation. If checkout line endings affect a working-byte hash, reconcile the Git blob/checkout evidence separately; do not silently rewrite or relax the check.
- Inspect an existing, short, disposable build root outside every worktree, SDK and protected resource. Require absolute directly accessible paths without junction/symbolic-link components, a nonexistent direct output child, and no concurrent path manipulation. Supply all additional sensitive/retained paths through `AdditionalProtectedDirectory`; automatic protections include worktrees, SDK, Windows temp trees, PGDATA when set, and an existing PostgreSQL installation. Preserve all prior outputs, probe directories, AppContainer profiles and PostgreSQL resources.
- The script exclusively creates owned output/staging directories, checks their identity/ownership and refuses uncertain cleanup. It does not recursively delete the operator-supplied root. Preserve partial output or uncertain staging on failure and escalate; do not adopt, overwrite or force-clean it.

Locked resolution is `pub get --enforce-lockfile`, with source/staged lockfile hash equality before/after resolution and after build. Compilation uses `flutter build web --release --no-pub`, target `lib/main_sanitation_public.dart`, base href `/`, and `--no-web-resources-cdn`. Keep these checks and the dedicated shell unchanged. B2 browser verification separately pins `playwright-core@1.64.1` in its package/lockfile; historical Chrome was 155.0.8059.86, Node 24.19.0, npm 11.17.0 and Python 3.14.7. Those tools are not prerequisites for merely reviewing an artifact; browser execution requires separate authorization.

## Supported modes and invocation

| `LookupMode` | Compiled lookup mode | Compiled API base | Publication use |
| --- | --- | --- | --- |
| omitted or exact `disabled` | `disabled` | empty | Eligible only for manual candidate review |
| exact `local-fixture` | `local-fixture` | `http://127.0.0.1:8765/api/` | **NON-PRODUCTION ONLY; never publish to production** |

Empty, padded, mixed-case and unknown modes are rejected before SDK execution or build-directory writes. There is no API URL or arbitrary Dart-define parameter. The underlying [resolver](../mobile/lib/sanitation_public/owner_lookup_configuration.dart) supports other valid loopback hosts/ports and HTTP/HTTPS; this build script deliberately fixes one fixture base. The compiled fixture endpoint is `http://127.0.0.1:8765/api/mobile/sanitation/establishment-status/`, paired with app origin `http://127.0.0.1:8764`. No remote or production lookup mode exists in this interface.

The following are invocation templates, not commands executed for this documentation step. Run from the integration repository root only after build authorization. First set `$ApprovedBuildRoot` to the reviewed existing disposable root and `$AdditionalProtectedDirectories` to the reviewed list of existing protected paths. The named child must not exist. The second example requires its own separately selected root; do not reuse historical artifacts or interpret both examples as one authorization.

```powershell
# Disabled default; -LookupMode disabled is equivalent.
& .\tools\owner-portal-web\build.ps1 `
  -BuildRoot $ApprovedBuildRoot `
  -OutputDirectory (Join-Path $ApprovedBuildRoot 'release') `
  -AdditionalProtectedDirectory $AdditionalProtectedDirectories
```

```powershell
# Separately authorized synthetic test build; never a production candidate.
& .\tools\owner-portal-web\build.ps1 `
  -BuildRoot $ApprovedBuildRoot `
  -OutputDirectory (Join-Path $ApprovedBuildRoot 'release') `
  -AdditionalProtectedDirectory $AdditionalProtectedDirectories `
  -LookupMode local-fixture
```

These examples use only the current script's four supported parameters. They do not authorize creation of roots, package installation, serving, browser tests or deployment.

## Fixture identification and historical artifacts

After successful fixture compilation and integrity checks, the script writes `NON_PRODUCTION_LOCAL_FIXTURE_ONLY.json`. It validates ownership, a nonempty regular `main.dart.js`, exact field names/types/values and its SHA-256, reads back freshly written bytes, then renames the pending file without overwrite before reporting artifact success. Failed generation may retain a pending file. A later staging-cleanup failure can still make the invocation fail, so marker presence does not replace checking the final exit code. The nine fields are:

| Field | Required meaning/value |
| --- | --- |
| `label` | `NON-PRODUCTION — LOCAL FIXTURE ONLY` |
| `productionPublishAllowed` | Boolean `false` |
| `lookupMode` | `local-fixture` |
| `apiBaseUrl` | `http://127.0.0.1:8765/api/` |
| `sourceHead` | Verified source HEAD at build time |
| `buildScriptSha256` | SHA-256 of the executing script bytes |
| `flutterFrameworkRevision` | `559ffa3f75e7402d65a8def9c28389a9b2e6fe42` |
| `pubspecLockSha256` | Verified source/staged dependency-lock SHA-256 |
| `compiledEntrypointSha256` | SHA-256 of the generated `main.dart.js` |

Disabled builds create no fixture marker. The marker is **advisory**, not an enforced upload or deployment barrier.

Retained historical builds (2026-10-26, both build exit 0):

| Mode | Retained artifact | Observed inventory | Provenance |
| --- | --- | --- | --- |
| disabled | `C:\owb-57714f2-20261026\release` | 63 files, 50,093,930 bytes | Source HEAD `57714f2d373289f54a966d4f9b70043c2700718f`; baseline C1 script SHA `D0F5832568DAD24D67A296195D79B75C34589BEC4D4EAC7B3CE955D3BFA20E89` |
| local-fixture | `C:\owf-57714f2-20261026\release` | 64 files, 50,094,555 bytes | Same source HEAD; then-uncommitted script SHA `F90F079284618956D20C98F7D95115B5FE49586F3C04C458394E967E75DB9897`, later committed unchanged as `d189802...` |

These file counts are observations, not permanent release requirements. Neither artifact was built at `d189802...`; do not relabel its provenance or infer repeat-build reproducibility. A successful build or historical integrity check does not authorize publication. The fixture artifact is always ineligible for production, even though its integration tests passed.

## Manual publication gate

**The current repository does not enforce this gate automatically.** This is a required human review procedure, not a new deployment tool or evidence that hosting settings have been verified.

1. **Identify the candidate.** Record its immutable source commit, build-script hash, SDK/framework revision, source/staged dependency-lock hashes, complete build command/mode, successful exit and retained logs. Require the approved disabled configuration (empty API base). Review any difference from the tested source/base. Stop on ambiguity, an unreviewed dirty source or main drift. Candidate eligibility permits review only.
2. **Reject fixture content.** Inspect the full candidate tree, including hidden files. Reject any candidate containing `NON_PRODUCTION_LOCAL_FIXTURE_ONLY.json`, including nested copies, or fixture/pending build metadata. Do not delete a marker to convert fixture output into a candidate. The known `C:\owf-57714f2-20261026\release` fails this step immediately.
3. **Require a separately approved disabled-artifact inventory.** Marker absence alone is insufficient. The reviewer must have an independently approved manifest bound to the disabled build's provenance, listing every relative file path, byte size and cryptographic SHA-256. Do not generate a manifest from an arbitrary candidate and treat its self-consistency as approval. Historical local inventory files below are evidence, not automatic release approvals.
4. **Compare the entire candidate.** Enumerate every file, including hidden files, and verify path set, sizes and SHA-256 against that approved inventory. Reject extra, missing or mismatched files, duplicate/ambiguous paths, reparse points or unresolved provenance. Keep the approval manifest/logs outside the served candidate unless explicitly included in the approved inventory. Static string scanning and file counts cannot replace full comparison. No secrets, real tracking codes, enabled fixture/production lookup or unapproved content may enter the candidate.
5. **Review hosting configuration explicitly.** Verify the actual service/site and production destination, repository/ref, build command if any, selected artifact/publish directory, automatic deployment triggers, and route/base-path/asset behavior for this root-hosted hash-route shell. Ensure the configuration cannot publish the fixture directory or rebuild from different source/settings. If hosting will rebuild rather than upload exact files, stop and define a separate approval/integrity check for that resulting artifact. Current hosting configuration remains unverified; do not infer it from local files or prior application hosting.
6. **Record the gate decision.** A candidate has passed this manual gate only when the named reviewer records provenance, approved inventory identity, successful complete comparison and hosting review. This still does not authorize deployment. Recheck integrity before upload; any artifact/configuration change invalidates the decision and requires review again.
7. **Obtain explicit human authorization.** Before any upload, publication, merge or Render deployment, obtain authorization for that exact action, artifact/source and destination. Passing a build, having or lacking a marker, and passing this checklist do not themselves authorize those actions. Do not push, merge or deploy as a side effect of documentation review.

Production owner-code POSTs are prohibited until backend lookup and activation are separately authorized. Deploying an approved disabled shell does not authorize enabling lookup. Current source provides no production lookup mode.

After separately authorized deployment, perform only approved read-only checks: deployment revision/provenance, selected artifact, landing/deep-link/Back behavior, public asset responses, Sanitation branding and disabled lookup. Do not submit owner codes or infer deployment health from a build log. On unexpected content, lookup activation, asset failure or configuration mismatch, stop, retain evidence and notify the release owner. Use only a separately authorized rollback to a known approved artifact/configuration; preserve both artifacts and logs, and never substitute the fixture build as a fallback.

## Retained evidence and limits

The following are **historical local results**, not newly executed tests. Evidence is outside Git at:

```text
C:\Users\THINKPAD T480S\Documents\Codex\2026-10-25\capstone-plan-integration-of-parallel-owner-2
```

Paths below are relative to that evidence root; preserve these files and companion screenshots/logs. They are machine-local receipts, not repository test automation or production approvals.

| Evidence | Retained files | Scope/result |
| --- | --- | --- |
| Metadata/safety | `outputs/step8c-ps7.json`, `outputs/step8c-ps51.json`, `outputs/step8d-ps7.json`, `outputs/step8d-ps51.json` | 42/42 metadata cases and 37/37 filesystem safety cases per PowerShell version; zero parse errors |
| Disabled build/UI | `outputs/combined-release-20261026.process.json`, `outputs/combined-release-20261026.inventory.json`, `outputs/disabled-ui-20261026.evidence.json` | Exit 0; 63-file historical inventory; ten UI acceptance cases including zero owner POSTs |
| Fixture build | `outputs/fixture-release-20261026.process.json`, `outputs/fixture-release-20261026.artifact.json`, `outputs/fixture-release-20261026.inventory.json` | Exit 0; 64-file historical inventory; fixed mode/base and nine-field marker |
| Success/not-found/input/layout | `outputs/step9a-evidence.json`, `outputs/step9b-evidence.json` | 9A blocked on input automation after success/not-found; 9B completed the remaining input/mobile cases. Neither alone proves all later failure cases |
| HTTP 503 | `outputs/step10b-evidence.json` | Three POSTs: success, 503, recovery; safe feedback and stale details cleared |
| Malformed/invalid JSON | `outputs/step10c-evidence.json` | Five POSTs with recovery after each unreadable response |
| Loading and actual timeout | `outputs/step10d1-assessment.json`, `outputs/step10d2-evidence.json`, `outputs/step10d2-process.json` | Corrected control-specific harness; Fetch canceled at ~90.005 seconds, safe UI/recovery; late server write at ~100.003 seconds failed, recovered UI unchanged |
| Abrupt connection failure | `outputs/step10e-evidence.json`, `outputs/step10e-process.json`, `outputs/step10e-integrity.json` | Three POSTs; `net::ERR_EMPTY_RESPONSE` without HTTP status; safe error and recovery |
| Chrome transport unit tests | `work/a2-minimal-canvaskit-workaround.summary.json`, `work/a2-transport-canvaskit-workaround.summary.json` | Configuration 71/71 and transport 4/4, exit 0, using temporary test-runner renderer workaround |

B2's retained prior integration receipt records two real-Chrome tests: allowed OPTIONS=1/POST=1 and denied OPTIONS=1/POST=0, exit 0. Its source is [browser_cors.test.mjs](../tools/owner-portal-browser/browser_cors.test.mjs), using [B1](../tools/owner-portal-browser/fixture_server.py). It is a separate Fetch harness, not denied-origin compiled-UI acceptance. The original receipt is in the local Codex session log `C:\Users\THINKPAD T480S\.codex\sessions\2026\10\25\rollout-2026-10-25T15-19-38-01a171ed-d25f-7fa0-b988-211dd08bcaef.jsonl` (tool receipt at 2026-10-25 14:38:48 UTC); keep this historical attribution distinct from rerunning the suite.

Limits to retain in release decisions:

- Trusted-local safety assumes no malicious concurrent filesystem substitution. Direct symbolic-link rejection is **NOT RUN**; passing junction cases does not prove it. Retained diagnostic resources must not be cleaned up as part of release preparation.
- Repeat-build byte reproducibility is unverified. Seventeen inherited Tourism assets remain bundled, although Tourism startup is absent.
- Screen-reader, Safari, installed-PWA and Android-device acceptance are not claimed. Static artifact review is not browser acceptance.
- Flutter's Chrome test runner had CanvasKit 404s; historical unit-test proof temporarily supplied the two pinned SDK renderer files only at the exact test origin. Release UI acceptance served its own bundled CanvasKit without that interception. This does not justify API interception or production workarounds.
- Loading disables the input and removes the submit button's role/tappable semantics. Its generic wrapper may remain focusable and report enabled; use exact control identity, visible loading state and actual POST counts. The old positional selector could match Back. Mobile resizing exposed stale accessibility hitboxes. These automation observations do not establish screen-reader correctness.
- Timeout evidence proves canceled Fetch, safe recovery and an unsuccessful late server write without UI overwrite; it does not prove receipt of a successful late response. Denied-origin compiled-UI acceptance remains unclaimed.

One integration documentation owner maintains this runbook with the progress/audit entries. The original documentation commit is `6275cd0a14d62789d25fa29fd6d2b9a7c6d0f13f`. Documentation status corrections require separate review and local commit authorization. Before a branch push, perform a fresh Git/main publication preflight. Branch push, PR review/merge and production release each require separate authorization; no authorization follows automatically from this document.
