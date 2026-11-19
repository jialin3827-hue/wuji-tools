---
description: "Task list for feature implementation"
---

# Tasks: 修復 GoatCounter 自訂點擊事件

**Input**: Design documents from `/specs/001-fix-goatcounter-events/`
**Prerequisites**: plan.md (required), spec.md (required), research.md, data-model.md, contracts/, quickstart.md

**Tests**: Tests are included here because `specs/001-fix-goatcounter-events/contracts/test-harness.md` and quickstart.md require a repeatable headless verification suite (`tests/`).

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (e.g., US1, US2, US3)
- Include exact file paths in descriptions

## Path Conventions

- Static site files at repository root and subdirectories (e.g. `taisui2027/`, `market/`, `quota/`)
- Verification tooling only in `tests/` (not referenced by any site page)

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Prepare repository hygiene and test workspace scaffolding referenced by the plan.

- [X] T001 Add `tests/node_modules/` to `.gitignore` in `/workspace/wuji-tools/.gitignore`
- [X] T002 Create `tests/` directory structure for verification assets in `/workspace/wuji-tools/tests/` (prepare for `package.json`, `package-lock.json`, `static-server.mjs`, `helpers.mjs`, `run.mjs`, optional `fixtures/`)
- [X] T003 [P] Initialize Node test workspace manifest (`"type": "module"`, devDependency `playwright-core`, `test` script) in `/workspace/wuji-tools/tests/package.json`
- [X] T004 [P] Generate and commit-lock dependencies by creating `/workspace/wuji-tools/tests/package-lock.json` after installing `playwright-core` in `/workspace/wuji-tools/tests/`

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core tracking infrastructure that MUST exist before user story behaviors are validated end-to-end.

**⚠️ CRITICAL**: No user story work can be considered complete until this phase is done.

- [X] T005 Create shared tracking helper `wuji-util.js` at `/workspace/wuji-tools/wuji-util.js` implementing `window.wujiTrack` contract from `specs/001-fix-goatcounter-events/contracts/tracking-api.md` (normalize names to `event/...`, enforce `data-model.md` `TrackingEvent.name` pattern `^event/[a-z0-9]+(?:-[a-z0-9]+)*$`, swallow all errors, no navigation blocking)
- [X] T006 Add single-flight pending queue + retry/flush behavior to `/workspace/wuji-tools/wuji-util.js` (bounded deadline, `pagehide`/`visibilitychange` flush via `navigator.sendBeacon` or `fetch(..., { keepalive: true })` using endpoint from `script[data-goatcounter]`, then drop) per `specs/001-fix-goatcounter-events/contracts/tracking-api.md` and `data-model.md` (`PendingEventQueue`)
- [X] T007 Implement store-link delegation in `/workspace/wuji-tools/wuji-util.js` (click delegation on `document`, match Payhip/Portaly hostnames precisely including `www.*`, honor existing `data-goatcounter-click`/`data-goatcounter-title` verbatim, otherwise generate `event/cta-{platform}-{page}-{section}-{purpose}` following `specs/001-fix-goatcounter-events/contracts/tracking-api.md` and `data-model.md` `StoreLink`/`TrackingEvent` constraints; never call `preventDefault()`)
- [X] T008 Load shared helper synchronously before other scripts on all 11 site pages (root: `wuji-util.js`, subdirectories: `../wuji-util.js`, no `/wuji-util.js`) in `/workspace/wuji-tools/index.html`, `/workspace/wuji-tools/taisui2027/index.html`, `/workspace/wuji-tools/market/index.html`, `/workspace/wuji-tools/market/crypto.html`, `/workspace/wuji-tools/market/backtest.html`, `/workspace/wuji-tools/budget/index.html`, `/workspace/wuji-tools/budget/privacy.html`, `/workspace/wuji-tools/food100/index.html`, `/workspace/wuji-tools/quota/index.html`, `/workspace/wuji-tools/salary-split/index.html`, `/workspace/wuji-tools/warehouse/index.html`
- [X] T009 Ensure `quota/index.html` keeps conditional `count.js` injection behavior while adding `wuji-util.js` load order correctly in `/workspace/wuji-tools/quota/index.html`

**Checkpoint**: Foundation ready — user story implementation can begin.

---

## Phase 3: User Story 1 - 購買 CTA 點擊被可靠記錄 (Priority: P1) 🎯 MVP

**Goal**: Ensure the three existing Payhip CTAs on `taisui2027` reliably emit events (including `target="_blank"`), with queued send when `count.js` is late/blocked and no user-visible errors.

**Independent Test**: Verify in the headless harness that clicking the three CTAs produces exactly `event/cta-payhip-taisui-result`, `event/cta-payhip-tiangan`, `event/cta-payhip-taisui-tg` with one event per action (see `tests/` scenarios S1–S6 in `specs/001-fix-goatcounter-events/contracts/test-harness.md`).

### Implementation for User Story 1

- [X] T010 [US1] Preserve existing CTA attributes and semantics (do not rename `data-goatcounter-click`/`data-goatcounter-title`) while ensuring delegated tracking fires for Payhip links in `/workspace/wuji-tools/taisui2027/index.html` (align with `specs/001-fix-goatcounter-events/contracts/tracking-api.md` §3)
- [X] T011 [US1] Add per-action dedupe for CTA clicks in `/workspace/wuji-tools/wuji-util.js` so rapid repeated clicks yield multiple intercepted requests only when user performed multiple actions (respect `data-model.md` `TrackingEvent.dedupeKey` rules)
- [X] T012 [US1] Document/implement late-load-safe behavior for CTA clicks in `/workspace/wuji-tools/wuji-util.js` (queue when `window.goatcounter.count` missing; flush on readiness/unload paths) so clicks before `count.js` ready are not lost (FR-003/FR-005 context)

**Checkpoint**: US1 independently verifiable via S1–S6 once `tests/` exists (see Phase 5/6 tasks).

---

## Phase 4: User Story 2 - 天干查詢事件可靠記錄 (Priority: P2)

**Goal**: Emit `event/tiangan-lookup` only on successful effective lookups (button submit and valid share-link load), never on invalid input or toggling the night option alone.

**Independent Test**: Headless scenarios S7–S9 in `specs/001-fix-goatcounter-events/contracts/test-harness.md` confirm one event for valid flows and zero for invalid/toggle-only flows.

### Implementation for User Story 2

- [X] T013 [US2] Replace `trackTiangan()` implementation to call `wujiTrack('tiangan-lookup')` (keep exact event name `event/tiangan-lookup`) in `/workspace/wuji-tools/taisui2027/index.html`
- [X] T014 [US2] Ensure `trackTiangan()` is invoked only from successful effective lookup paths (`renderTiangan(true)` after valid date/result) and not from `renderTiangan(false)` or non-lookup actions in `/workspace/wuji-tools/taisui2027/index.html` (per `specs/001-fix-goatcounter-events/research.md` R5 and spec US2)
- [X] T015 [US2] Add dedupe guard for `tiangan-lookup` to avoid double sends on re-render/edge flows in `/workspace/wuji-tools/wuji-util.js` or via caller discipline in `/workspace/wuji-tools/taisui2027/index.html` consistent with `data-model.md` (`TrackingEvent.dedupeKey`, `state`)

**Checkpoint**: US2 independently verifiable via S7–S9.

---

## Phase 5: User Story 3 - 全站商店外連一致追蹤 (Priority: P3)

**Goal**: Track all Payhip/Portaly outbound links site-wide with consistent naming; preserve legacy names; non-store links unchanged.

**Independent Test**: Headless scenarios S10–S12 in `specs/001-fix-goatcounter-events/contracts/test-harness.md` validate no events for non-store links and correct auto-named events for injected store links in different sections.

### Implementation for User Story 3

- [X] T016 [US3] Implement hostname-precise detection for `payhip.com`/`www.payhip.com`/`portaly.cc`/`www.portaly.cc` in delegation handler in `/workspace/wuji-tools/wuji-util.js` (reject lookalikes like `notpayhip.com`) per `data-model.md` `StoreLink.hostname`
- [X] T017 [US3] Generate auto event names `event/cta-{platform}-{page}-{section}-{purpose}` with lowercase hyphen rules and never empty after `event/` in `/workspace/wuji-tools/wuji-util.js`, honoring `data-goatcounter-click` override when present (per `specs/001-fix-goatcounter-events/contracts/tracking-api.md` §3)
- [X] T018 [US3] Migrate legacy `window._gcq`/`window._gcqT` queue usage in market to `wujiTrack` in `/workspace/wuji-tools/market/store.js` (preserve behavior, remove duplicate retry queue logic)
- [X] T019 [P] [US3] Audit all HTML pages for Payhip/Portaly links and ensure no regressions to legacy named CTAs in `/workspace/wuji-tools/taisui2027/index.html` and related pages listed in plan.md Project Structure (verify only naming rules applied where no override exists)

**Checkpoint**: US3 independently verifiable via S10–S12.

---

## Phase 6: User Story 4 - 可重複執行的雙視埠自動化驗證 (Priority: P4)

**Goal**: Provide a repeatable headless test harness that intercepts `*.goatcounter.com` requests (no real data written), verifies events and layout at 390px/1280px, and yields consistent results across repeats.

**Independent Test**: Run `npm test` and `npm test -- --repeat 3` in `/workspace/wuji-tools/tests/` per `specs/001-fix-goatcounter-events/contracts/test-harness.md` and `specs/001-fix-goatcounter-events/quickstart.md`; all pass with zero goatcounter requests allowed through.

### Implementation for User Story 4

- [X] T020 [US4] Implement static server with Node built-in `http` serving repo root and HTML rewrite to inject `data-goatcounter-allow-local` on `count.js` tags in `/workspace/wuji-tools/tests/static-server.mjs`
- [X] T021 [P] [US4] Implement browser resolution, route registration before navigation, request recording + `route.abort()` for `**/*goatcounter.com/**`, and layout checks (scrollWidth, CTA visibility/clickability, text clipping, overlap) in `/workspace/wuji-tools/tests/helpers.mjs` per `specs/001-fix-goatcounter-events/contracts/test-harness.md`
- [X] T022 [US4] Implement CLI entrypoint with `--repeat`, `--viewport`, `--browser`, `--offline` and JSON line output + digest + exit codes in `/workspace/wuji-tools/tests/run.mjs`
- [X] T023 [US4] Add optional offline fixture path support for `gc.zgo.at/count.js` in `/workspace/wuji-tools/tests/run.mjs` and/or `/workspace/wuji-tools/tests/helpers.mjs` when `--offline` is set (still abort all `*.goatcounter.com` hits)
- [X] T024 [US4] Implement test scenarios S1–S12 (including late-load delay, blocked requests, rapid clicks, share URL load, invalid input, injected links) in `/workspace/wuji-tools/tests/run.mjs` aligned with `specs/001-fix-goatcounter-events/contracts/test-harness.md`

**Checkpoint**: US4 deliverable is the passing `tests/` suite in both viewports and `--repeat 3` consistency.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Final validation, cleanup, and documentation alignment.

- [X] T025 [P] Update validation notes and manual checklist steps if needed in `/workspace/wuji-tools/specs/001-fix-goatcounter-events/quickstart.md` to match final `tests/` commands and behaviors
- [X] T026 Run full verification per `specs/001-fix-goatcounter-events/quickstart.md` (install in `tests/`, `npm test`, `npm test -- --repeat 3`) and record outcomes in commit/PR notes (do not commit secrets)
- [X] T027 Perform final sweep: confirm only GoatCounter remains, no new site runtime dependencies, and all modified pages keep `lang="zh-Hant-TW"` across `/workspace/wuji-tools/index.html` and subdirectory pages touched

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — can start immediately
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories
- **User Stories (Phase 3–6)**: All depend on Foundational phase completion
  - US1 (P1) first for MVP, then US2, US3, US4 (US4 can be built in parallel in parts once contracts are stable, but scenarios depend on implemented behaviors)
- **Polish (Phase 7)**: Depends on desired user stories being complete

### User Story Dependencies

- **US1 (P1)**: After Phase 2 only — no dependency on US2/US3/US4 implementation beyond shared `wuji-util.js`
- **US2 (P2)**: After Phase 2; integrates with `taisui2027/index.html` changes but should be testable independently (S7–S9)
- **US3 (P3)**: After Phase 2; may touch `market/store.js` and audit pages but remains independently testable (S10–S12)
- **US4 (P4)**: After Phase 2; test implementation should target final behaviors from US1–US3 (execute after those code changes land)

### Within Each User Story

- Implement helper/page changes before relying on harness scenarios for that story
- Keep changes minimal and aligned to `contracts/tracking-api.md`
- Stop at each checkpoint to validate independently

### Parallel Opportunities

- T003 and T004 can proceed as marked [P] in Setup (after T002 context is clear)
- T019 is [P] audit work once core logic is in place
- T021 is [P] relative to some test wiring tasks but shares files in practice; prefer sequential edits in `tests/helpers.mjs` then `tests/run.mjs`
- Different user stories can be parallelized by different people after Phase 2, with care around shared files (`wuji-util.js`, `taisui2027/index.html`)

---

## Parallel Example: User Story 1

```bash
# After Phase 2, work can be split (coordinate on wuji-util.js):
Task: "T010 [US1] Preserve CTA attributes and delegated tracking in taisui2027/index.html"
Task: "T011 [US1] Add per-action dedupe for CTA clicks in wuji-util.js"
Task: "T012 [US1] Document/implement late-load-safe behavior in wuji-util.js"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL)
3. Complete Phase 3: User Story 1
4. Validate US1 via S1–S6 in `tests/` (after Phase 6 tasks exist) or manual checks per quickstart

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. Add US1 → validate independently → demo (MVP)
3. Add US2 → validate (S7–S9)
4. Add US3 → validate (S10–S12)
5. Add US4 harness completion → `npm test --repeat 3` green

### Notes

- [P] tasks = different files or clearly independent work; avoid editing the same file concurrently
- `[USn]` labels map tasks to user stories for traceability
- Every task includes an exact file path
- Commit after each task or logical group; do not create a new git branch (stay on `speckit-trial`) 

