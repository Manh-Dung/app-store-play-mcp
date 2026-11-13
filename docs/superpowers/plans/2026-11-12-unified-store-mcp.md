# Unified Store MCP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a robust, enterprise-grade unified MCP ecosystem for Google Play and Apple App Store in a single monorepo (`app-store-play-mcp`) with 3 isolated servers, combining all vetted capabilities from reference repositories: dynamic worker-scoped tool limiting, clean composite release lifecycles with atomic rollback, two-phase confirmation for destructive actions, cross-platform ASO audit with dry-run diffs, beta feedback summarization, GCS analytics with data coverage metadata, and automated Discovery/OpenAPI codegen.

**Architecture:** Clean overlay layer on top of upstream subtrees (`packages/play-operate`, `packages/appstore-operate`, `packages/play-analytics`), coordinated through `packages/shared`. Low-level tools are auto-generated from Apple OpenAPI and Google Discovery specs, while high-level composite workflows, safety guards, and formatters are cleanly encapsulated in `src/overlay/` and `src/composite/` with strict Zod types, transaction rollbacks, and zero unneeded context waste.

**Tech Stack:** TypeScript (Node.js 18+), Python 3.11+ (FastMCP, google-cloud-storage), Vitest, Zod, @modelcontextprotocol/sdk, googleapis.

**Spec:** `docs/ARCHITECTURE.md` and user-approved synthesis of `devinwang`, `OrellBuehler`, `antoniolg`, `zelentsov-dev`, `fil-technology`, and `desunit`.

## Global Constraints

- Never commit secrets, service account JSON files, `.p8` keys, or `.env` files.
- Upstream subtree code in `src/tools/` (play) and `src/tools/generated/` (appstore) must remain untouched; all enhancements live in `src/overlay/`, `src/composite/`, or `packages/shared/`.
- No raw JSON dumps for composite tools: output must be concise, structured Markdown or structured summaries.
- Zero `any` casting in new code; all parameters, responses, and errors must be explicitly typed with Zod or TypeScript interfaces.
- Zero decorative emojis anywhere (in code, comments, responses, tool outputs).

## Review Focus

1. **Transaction rollbacks on failure:** If bundle upload, track update, or validation fails halfway through `deploy_app`, `edits.delete` must execute in `finally`/`catch` to prevent leaking dangling edit sessions on Google Play Console.
2. **Context window overflow:** If an agent requests the server with no worker profile, tool count must not overwhelm client context limits (default cap at 50 most essential tools, or require explicit `--workers full`).
3. **Destructive confirmation security:** Confirmation tokens must be single-use, tied to exact payload parameters, and expire after 10 minutes.
4. **Timezone & reporting lag:** Analytics responses must declare `coverage` (`data_through`, `lag_days`, `missing_dates`) so agents do not misinterpret data freshness.
5. **Character limit overflow in ASO audit:** Must check platform-specific length constraints (Apple title <= 30, subtitle <= 30, keywords <= 100; Google title <= 30, short desc <= 80, full desc <= 4000).

---

### Task 1: Shared Core — Two-Phase Confirmation & Tool Budget Limiter

**Files:**
- Create: `packages/shared/src/confirmation.ts`
- Create: `packages/shared/src/tool-budget.ts`
- Create: `packages/shared/src/types.ts`
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/test/confirmation.test.ts`
- Test: `packages/shared/test/tool-budget.test.ts`

**Interfaces:**
- Consumes: `@modelcontextprotocol/sdk/types.js`, `node:crypto`
- Produces:
  ```typescript
  export interface ConfirmationToken {
    id: string;
    action: string;
    target: string;
    paramsHash: string;
    expiresAt: number;
  }
  export function createConfirmationToken(action: string, target: string, params: unknown): { confirmationId: string; expiresAt: string; prompt: string };
  export function verifyConfirmationToken(id: string, action: string, target: string, params: unknown): boolean;
  export function limitToolsByBudget<T extends { name: string; description?: string }>(tools: T[], options: { maxTools?: number; workers?: string[]; search?: string }): T[];
  ```

- [ ] **Step 1: Write failing tests for confirmation token generation and verification**
- [ ] **Step 2: Run test to verify it fails (`npm test --prefix packages/shared`)**
- [ ] **Step 3: Implement `packages/shared/src/confirmation.ts` with 10-minute TTL and single-use invalidation**
- [ ] **Step 4: Write failing tests for tool budget limiter and dynamic search**
- [ ] **Step 5: Implement `packages/shared/src/tool-budget.ts` capping output tools to prevent client context overflow**
- [ ] **Step 6: Export from `packages/shared/src/index.ts` and verify all shared tests pass**

---

### Task 2: Play Store — Composite 1-Shot `deploy_app` & Release Lifecycle

**Files:**
- Create: `packages/play-operate/src/composite/deploy.ts`
- Create: `packages/play-operate/src/composite/release-lifecycle.ts`
- Create: `packages/play-operate/src/composite/formatters.ts`
- Modify: `packages/play-operate/src/overlay/server.ts`
- Modify: `packages/play-operate/src/profiles.ts`
- Test: `packages/play-operate/test/composite-deploy.test.ts`

**Interfaces:**
- Consumes: `packages/shared`, `googleapis`, `packages/play-operate/src/auth/client-factory.js`
- Produces:
  - Tool `deploy_app`: Single-shot upload of bundle/APK, assigning track, release notes, user fraction rollout, and commit.
  - Tool `create_release`: Open edit, stage release on track, optional `validate_only`.
  - Tool `promote_release`: Promote version from track A (e.g. beta) to track B (e.g. production) with optional fraction.
  - Tool `halt_rollout`: Halt an active staged rollout immediately with safety confirmation.
  - Auto-rollback: Every operation wraps in `try { ... } catch (err) { await edits.delete(); throw err; }`.

- [ ] **Step 1: Write failing tests for `deploy_app` and `promote_release` with mocked Google Publisher API**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `packages/play-operate/src/composite/formatters.ts` for clean Markdown responses**
- [ ] **Step 4: Implement `packages/play-operate/src/composite/deploy.ts` with strict Zod types and safe transaction rollback**
- [ ] **Step 5: Implement `packages/play-operate/src/composite/release-lifecycle.ts` (`create_release`, `promote_release`, `update_rollout`, `halt_rollout`)**
- [ ] **Step 6: Register composite tools in `packages/play-operate/src/overlay/server.ts` under profile `release`**
- [ ] **Step 7: Run vitest to verify all composite release tests pass**

---

### Task 3: App Store — TestFlight Beta Feedback & Crash Intelligence

**Files:**
- Create: `packages/appstore-operate/src/composite/beta-feedback.ts`
- Create: `packages/appstore-operate/src/composite/formatters.ts`
- Modify: `packages/appstore-operate/src/overlay/server.ts`
- Modify: `packages/appstore-operate/src/profiles.ts`
- Test: `packages/appstore-operate/test/beta-feedback.test.ts`

**Interfaces:**
- Consumes: `packages/shared`, `packages/appstore-operate/src/auth/client.js`
- Produces:
  - Tool `testflight_feedback_summary`: Input `appId`, `buildId` (optional `limit`). Fetches screenshot feedback, tester text comments, crash logs, and Xcode Cloud build status, outputting clean categorized Markdown.
  - Tool `testflight_crash_reports`: Input `buildId`, returns symbolized stack traces and device distributions.

- [ ] **Step 1: Write failing tests for `testflight_feedback_summary` with mocked App Store Connect API responses**
- [ ] **Step 2: Run test to verify failure**
- [ ] **Step 3: Implement `packages/appstore-operate/src/composite/beta-feedback.ts` combining feedback endpoints**
- [ ] **Step 4: Format output into Markdown tables and priority groups (Blocker / Bug / Usability)**
- [ ] **Step 5: Register in `packages/appstore-operate/src/overlay/server.ts` under worker profile `testflight`**
- [ ] **Step 6: Verify tests pass**

---

### Task 4: Cross-Platform ASO Portfolio Audit & Dry-Run Diff

**Files:**
- Create: `packages/shared/src/aso-rules.ts`
- Create: `packages/appstore-operate/src/composite/aso-audit.ts`
- Create: `packages/play-operate/src/composite/aso-audit.ts`
- Modify: `packages/appstore-operate/src/overlay/server.ts`
- Modify: `packages/play-operate/src/overlay/server.ts`
- Test: `packages/shared/test/aso-rules.test.ts`
- Test: `packages/appstore-operate/test/aso-audit.test.ts`
- Test: `packages/play-operate/test/aso-audit.test.ts`

**Interfaces:**
- Consumes: `packages/shared`
- Produces:
  - `auditAsoMetadata(store: 'apple' | 'google', metadata: AppMetadata): AsoAuditReport`
  - Tool `aso_audit_portfolio`: Inspects all localized versions of all apps; flags missing subtitles, empty keywords, missing screenshot display types, untranslated locales.
  - Tool `metadata_dry_run_preview`: Diffs current vs proposed metadata, verifying character limits and highlighting diff lines.

- [ ] **Step 1: Write failing tests for shared ASO rule validator (`packages/shared/test/aso-rules.test.ts`)**
- [ ] **Step 2: Implement `packages/shared/src/aso-rules.ts` with Apple and Google character limits and mandatory assets rules**
- [ ] **Step 3: Implement `aso_audit_portfolio` in `packages/appstore-operate/src/composite/aso-audit.ts`**
- [ ] **Step 4: Implement `aso_audit_portfolio` in `packages/play-operate/src/composite/aso-audit.ts`**
- [ ] **Step 5: Register tools in both servers under worker profile `aso-audit` and `marketing`**
- [ ] **Step 6: Run tests to verify PASS**

---

### Task 5: Play Analytics — GCS Coverage Block & Cache Revalidation

**Files:**
- Modify: `packages/play-analytics/server.py`
- Modify: `packages/play-analytics/gp_client.py`
- Test: `packages/play-analytics/test_analytics.py`

**Interfaces:**
- Consumes: `google-cloud-storage`, `fastmcp`
- Produces:
  - Standardized JSON responses containing a top-level `coverage` dictionary:
    ```json
    {
      "coverage": {
        "data_through": "2026-11-10",
        "lag_days": 2,
        "missing_dates": []
      },
      "results": [...]
    }
    ```
  - HTTP ETag and `updated` blob metadata check before reading local cached CSVs.

- [ ] **Step 1: Write failing test in `packages/play-analytics/test_analytics.py` asserting presence of `coverage` block**
- [ ] **Step 2: Implement coverage metadata computation in `gp_client.py`**
- [ ] **Step 3: Implement cache revalidation against GCS blob `updated` timestamp**
- [ ] **Step 4: Run `pytest packages/play-analytics/test_analytics.py` to verify PASS**

---

### Task 6: Google Play Codegen Engine

**Files:**
- Create: `packages/play-operate/scripts/codegen.ts`
- Create: `packages/play-operate/scripts/download-discovery.ts`
- Modify: `packages/play-operate/package.json`
- Test: `packages/play-operate/test/codegen.test.ts`

**Interfaces:**
- Consumes: Google API Discovery JSON (`https://androidpublisher.googleapis.com/$discovery/rest?version=v3`)
- Produces: Automated generator generating typed low-level tools with Zod schemas into `packages/play-operate/src/tools/generated/`, mirroring the App Store codegen setup.

- [ ] **Step 1: Write failing test verifying parser extracts methods and parameter schemas from sample Discovery JSON**
- [ ] **Step 2: Implement `download-discovery.ts` to fetch and store `spec/androidpublisher-v3-discovery.json`**
- [ ] **Step 3: Implement `codegen.ts` emitting `defineTool` files with Zod parameter validation**
- [ ] **Step 4: Add script entries `"spec:download"` and `"codegen"` to `packages/play-operate/package.json`**
- [ ] **Step 5: Run test to verify codegen output integrity**

---

### Task 7: End-to-End Verification & Documentation

**Files:**
- Create: `docs/WORKERS.md` (Detailed profile guide, token weights, and MCP client setup)
- Create: `docs/QUOTAS.md` (Google Play & Apple rate limits, review policies, reply rules)
- Modify: `README.md`
- Test: Run full monorepo test suite across all 4 packages (`shared`, `play-operate`, `appstore-operate`, `play-analytics`)

- [ ] **Step 1: Execute all unit and composite tests across the entire repository**
- [ ] **Step 2: Document worker profile token budgeting and client config in `docs/WORKERS.md`**
- [ ] **Step 3: Document API quotas and store limitations in `docs/QUOTAS.md`**
- [ ] **Step 4: Update `README.md` with complete feature table and execution examples**

