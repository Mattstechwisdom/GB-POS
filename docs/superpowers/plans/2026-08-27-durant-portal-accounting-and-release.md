# Durant Portal, Accounting, and Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver selected-item historical purchase dates, per-line discounts, ticket diagnostics, reliable password printing, a secure approval-gated Durant portal, installable responsive web access, corrected print headers, and a verified patch release.

**Architecture:** Pure accounting helpers define the shared financial rules used by work orders, sales, carts, reports, and printouts. Durant writes isolated proposal rows protected by Supabase RLS; a server-side approval RPC atomically merges approved financial data. The existing React desktop/mobile shells remain intact, while role-aware routing adds a focused Durant PWA shell.

**Tech Stack:** React 18, TypeScript, Electron, Vite, Supabase Auth/Postgres/RLS/Edge Functions, GitHub Pages, Node regression scripts.

**Spec:** `docs/superpowers/specs/2026-08-27-durant-portal-accounting-and-print-design.md`

## Global Constraints

- GadgetBoy edits save immediately; Durant edits stay isolated until GadgetBoy approval.
- Historical order dates apply only through selected-item checkout; bottom checkout always uses today.
- Estimated delivery dates never derive from or overwrite order dates.
- Durant authorization uses server-controlled role data and RLS.
- No service-role key, permanent bootstrap PIN, or unrelated client data reaches browser code.
- Existing non-Durant QR behavior and unrelated POS styling remain unchanged.
- Every production behavior starts with a failing test and completes with focused and regression verification.

---

### Task 1: Shared line-discount and diagnostic accounting

**Files:**
- Create: `src/lib/ticketAccounting.ts`
- Create: `tools/test-ticket-accounting.cjs`
- Modify: `package.json`
- Modify: `src/lib/types.ts`

**Interfaces:**
- Produces: `LineDiscount`, `DiagnosticSelection`, `lineDiscountAmount()`, `discountedLineTotal()`, `ticketLaborCharge()`.
- Consumed by Tasks 2, 4, 5, and 7.

- [ ] **Step 1: Write failing behavior tests**

```js
assert.equal(lineDiscountAmount({ units: 2, unitPrice: 50, discountType: 'percent', discountValue: 10 }), 10);
assert.equal(discountedLineTotal({ units: 1, unitPrice: 40, discountType: 'amount', discountValue: 50 }), 0);
assert.equal(ticketLaborCharge([{ labor: 100 }], { amount: 50 }), 100);
assert.equal(ticketLaborCharge([], { amount: 50 }), 50);
```

- [ ] **Step 2: Run RED**

Run: `node tools/test-ticket-accounting.cjs`
Expected: FAIL because `src/lib/ticketAccounting.ts` does not exist.

- [ ] **Step 3: Implement minimal pure accounting contracts**

```ts
export type LineDiscount = { discountType?: 'percent' | 'amount'; discountValue?: number };
export type DiagnosticSelection = { catalogId: string | number; label: string; amount: number };
export function lineDiscountAmount(input: { units: number; unitPrice: number } & LineDiscount): number;
export function discountedLineTotal(input: { units: number; unitPrice: number } & LineDiscount): number;
export function ticketLaborCharge(items: Array<{ labor?: number }>, diagnostic?: Pick<DiagnosticSelection, 'amount'> | null): number;
```

Clamp percentages to `0..100`, amounts to the undiscounted line total, and all currency outputs to two decimals.

- [ ] **Step 4: Run GREEN and typecheck**

Run: `node tools/test-ticket-accounting.cjs && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/ticketAccounting.ts src/lib/types.ts tools/test-ticket-accounting.cjs package.json
git commit -m "feat: add shared ticket accounting rules"
```

### Task 2: Per-line discounts in work orders and sales

**Files:**
- Modify: `src/workorders/ItemsTable.tsx`
- Modify: `src/workorders/CustomBuildItemsTable.tsx`
- Modify: `src/sales/SaleItemsTable.tsx`
- Modify: `src/workorders/NewWorkOrderWindow.tsx`
- Modify: `src/sales/SaleWindow.tsx`
- Modify: `src/workorders/receiptPrint.ts`
- Modify: `src/workorders/releasePrint.ts`
- Modify: `src/sales/salePrint.ts`
- Create: `tools/test-line-item-discounts.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes Task 1 helpers.
- Produces persisted item fields `discountType`, `discountValue`, and derived display amount.

- [ ] **Step 1: Write failing integration fixtures**

Use literal fixtures proving a $100 taxable line with 10% off contributes $90 taxable value, an amount discount cannot exceed a line, work-order and sale totals match, and print builders render the discount and net line total.

- [ ] **Step 2: Run RED**

Run: `node tools/test-line-item-discounts.cjs`
Expected: FAIL because item totals ignore discount metadata.

- [ ] **Step 3: Add context-menu action and accessible editor**

Add `Add Discount…`/`Edit Discount…` before destructive menu actions. Use one compact dialog supporting Amount and Percentage, validation messages, Apply, Remove Discount, and Cancel. Desktop right-click and mobile long-press use the same action.

- [ ] **Step 4: Route every total and print line through shared helpers**

Ticket-level discounts apply after summed net lines. Tax derives from net taxable item value. Printed rows show gross value, discount, and net total without exposing internal supplier cost.

- [ ] **Step 5: Run GREEN plus existing accounting suites**

Run: `node tools/test-line-item-discounts.cjs && npm run test:order-accounting && npm run test:reporting-accounting && npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/workorders src/sales tools/test-line-item-discounts.cjs package.json
git commit -m "feat: add per-line ticket discounts"
```

### Task 3: Selected-item historical distributor checkout date

**Files:**
- Modify: `src/components/EODWindow.tsx`
- Modify: `src/lib/orderAccounting.ts`
- Modify: `src/workorders/ClientUpdatePanel.tsx`
- Modify: `supabase/functions/client-updates/index.ts`
- Modify: `tools/test-order-accounting.cjs`
- Modify: `tools/test-cart-client-updates.cjs`

**Interfaces:**
- Produces: `selectedCheckoutDate: YYYY-MM-DD | null`, passed only to selected checkout.
- Preserves: `estimatedDelivery` independently for every row.

- [ ] **Step 1: Add failing tests**

Fixtures must prove selected A/B use `2026-08-20`, unselected C remains open, bottom checkout uses injected today `2026-08-27`, purchase/report timestamps fall on the chosen local date, item `orderDate` matches, estimated delivery is unchanged, and client-update copy names August 20.

- [ ] **Step 2: Run RED**

Run: `npm run test:order-accounting && npm run test:cart-client-updates`
Expected: FAIL on historical-date expectations.

- [ ] **Step 3: Add selected checkout control**

Add an `Ordered on Different Day` checkbox and date input to the selected checkout confirmation. Validate selection, valid ISO local date, and date not after today. Reset override after completion/cancel.

- [ ] **Step 4: Apply selected date at all authoritative boundaries**

Create a noon-local ISO timestamp for purchase `checkedOutAt`, store `orderDate` on only successful selected items, preserve delivery dates, and pass `orderedDate` into client-update request/template data.

- [ ] **Step 5: Keep bottom checkout current-day only**

Do not expose, retain, or pass historical state through the standard bottom Checkout handler.

- [ ] **Step 6: Run GREEN and commit**

Run: `npm run test:order-accounting && npm run test:cart-client-updates && npm run test:purchase-budget && npm run typecheck`

```bash
git add src/components/EODWindow.tsx src/lib/orderAccounting.ts src/workorders/ClientUpdatePanel.tsx supabase/functions/client-updates/index.ts tools
git commit -m "feat: date selected distributor purchases"
```

### Task 4: Optional ticket-level diagnostics

**Files:**
- Modify: `src/workorders/NewWorkOrderWindow.tsx`
- Modify: `src/workorders/WorkOrderForm.tsx`
- Modify: `src/workorders/PaymentPanel.tsx`
- Modify: `src/lib/types.ts`
- Modify: `app/electron/electron-main.ts`
- Modify: `src/mobile/mobile-api.ts`
- Modify: `tools/import-backup-to-supabase.cjs`
- Create: `tools/test-workorder-diagnostics.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes `DiagnosticSelection` and `ticketLaborCharge()` from Task 1.
- Produces authoritative `diagnosticSelection` snapshot on every work-order type.

- [ ] **Step 1: Write failing tests**

Test no diagnostic, $50-only diagnostic, $50 diagnostic plus $100 labor, $50 payment leaving $50 due, catalog deletion preserving snapshot, local/cloud/backup round trips, and every work-order type accepting the field.

- [ ] **Step 2: Run RED**

Run: `node tools/test-workorder-diagnostics.cjs`
Expected: FAIL because diagnostic metadata and minimum-labor math are absent.

- [ ] **Step 3: Implement Add Diagnostic UI**

Place the button above the item list for standard, custom build, drone, and Durant Report. Load active repair items, filter title/repair title case-insensitively to `Diagnostic`, support search/select/remove, and display the selected snapshot beside totals rather than in the item table.

- [ ] **Step 4: Persist and calculate consistently**

Map the JSON snapshot through desktop/mobile Supabase payloads and backup import. Calculate labor as `max(sum(item labor), diagnostic amount)` while retaining existing payments.

- [ ] **Step 5: Run GREEN and commit**

Run: `node tools/test-workorder-diagnostics.cjs && npm run test:reporting-accounting && npm run typecheck`

```bash
git add src/workorders src/lib/types.ts app/electron/electron-main.ts src/mobile/mobile-api.ts tools package.json
git commit -m "feat: add work order diagnostics"
```

### Task 5: Password persistence and print-header/Durant print fixes

**Files:**
- Modify: `src/workorders/WorkOrderForm.tsx`
- Modify: `src/workorders/NewWorkOrderWindow.tsx`
- Modify: `src/workorders/WorkOrderSidebar.tsx`
- Modify: `src/workorders/receiptPrint.ts`
- Modify: `src/workorders/releasePrint.ts`
- Modify: `src/workorders/CustomerReceiptWindow.tsx`
- Create: `tools/test-workorder-print-persistence.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `flushPendingPassword(): string` or equivalent committed input contract before save/print.
- Adds authoritative `durantFullTransfer?: boolean` and Durant print marker fields.

- [ ] **Step 1: Reproduce password loss with a failing test**

Simulate typing without blur followed immediately by receipt/release printing. Assert both generated payloads contain the typed password and persisted private-credential mapping receives it.

- [ ] **Step 2: Run RED and document root cause in the test name**

Run: `node tools/test-workorder-print-persistence.cjs`
Expected: FAIL because the local input commits only on blur.

- [ ] **Step 3: Fix the first dropping boundary**

Commit password input on change or expose a synchronous flush used before save and all print actions. Preserve private-table mapping and never place passwords in public work-order columns.

- [ ] **Step 4: Add Full Transfer and restructure print headers**

Persist the checkbox on Durant Report tickets. Replace flex-shrinking brand headers with a three-column grid (`minmax(0,1fr) auto minmax(15rem,auto)`), fixed QR width, protected right column, and nowrap date/time. Render bold Durant Report and Full Transfer markers above client info.

- [ ] **Step 5: Run GREEN and visual print regression**

Run: `node tools/test-workorder-print-persistence.cjs && npm run test:main-record-types && npm run typecheck`
Render representative print HTML/PDF with long client details and verify one-page fit and unsplit AM/PM.

- [ ] **Step 6: Commit**

```bash
git add src/workorders tools/test-workorder-print-persistence.cjs package.json
git commit -m "fix: persist passwords and stabilize work order prints"
```

### Task 6: Supabase Durant role, proposal schema, bootstrap, and RLS

**Files:**
- Create via `supabase migration new durant_partner_access`: the exact migration path emitted by the CLI
- Create: `supabase/functions/durant-bootstrap/index.ts`
- Create: `supabase/functions/durant-password-complete/index.ts`
- Create: `tools/test-durant-rls.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces tables `durant_proposals`, `durant_shared_notes`, `durant_history`, `durant_bootstrap_credentials`; enum role `durant`; RPC `approve_durant_proposal(uuid)`.
- Produces Edge Function contracts `{ username, pin } -> { tokenHash, type }` and authenticated password-complete response.
- Consumed by Tasks 7 and 8.

- [ ] **Step 1: Use `supabase --help`, verify CLI version, and create migration with `supabase migration new durant_partner_access`**

- [ ] **Step 2: Write failing RLS/integration tests**

Use real local authenticated identities to prove Durant can read only Durant tickets, attached clients/private password, minimal diagnostic catalog, own proposals, shared notes, and sanitized collaboration history; cannot read GadgetBoy internal notes, enumerate or mutate unrelated/authoritative rows; admin can review; approval merges allowed fields and status atomically.

- [ ] **Step 3: Run RED**

Run: `node tools/test-durant-rls.cjs`
Expected: FAIL because role/schema/functions/policies are missing.

- [ ] **Step 4: Implement schema and policies**

Add role safely to the existing enum, proposal/audit/bootstrap tables with RLS, explicit grants for authenticated access, `USING` plus `WITH CHECK` policies, and a narrowly granted approval RPC that validates `auth.uid()` as active admin/manager and locks proposal/work-order rows in one transaction.

- [ ] **Step 5: Implement one-time bootstrap functions**

Verify a rate-limited server-side PIN hash, consume it once, generate a one-time sign-in link for the configured Durant identity, deny ticket access until secure password completion, and never return service credentials.

- [ ] **Step 6: Run GREEN, advisors, and migration verification**

Run: `node tools/test-durant-rls.cjs`, then current supported Supabase advisor and migration-list commands discovered through `--help`.
Expected: policy tests pass with no security-advisor errors introduced.

- [ ] **Step 7: Commit**

```bash
git add supabase tools/test-durant-rls.cjs package.json
git commit -m "feat: secure Durant proposal access"
```

### Task 7: GadgetBoy proposal review and approved downstream effects

**Files:**
- Create: `src/lib/durantProposals.ts`
- Create: `src/workorders/DurantProposalReview.tsx`
- Modify: `src/workorders/NewWorkOrderWindow.tsx`
- Modify: `app/electron/electron-main.ts`
- Modify: `src/mobile/mobile-api.ts`
- Create: `tools/test-durant-approval.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces `loadDurantProposal()`, `submitDurantProposal()`, `approveDurantProposal()`, `returnDurantProposal(note)`, `listDurantHistory()`, and `addDurantSharedNote(text)`.
- Consumes Task 6 schema/RPC and Tasks 1/4 accounting.

- [ ] **Step 1: Write failing proposal isolation tests**

Prove draft and ready proposals do not change authoritative totals/cart/reporting; return requires a note; approval merges exactly once; shared notes and sanitized history are ordered by timestamp; internal notes never appear; post-commit client/calendar delivery can retry without duplicate financial rows.

- [ ] **Step 2: Run RED**

Run: `node tools/test-durant-approval.cjs`
Expected: FAIL because proposal repository/review UI do not exist.

- [ ] **Step 3: Implement proposal repository and review panel**

Show status and field-by-field current/proposed values inside normal Durant Report tickets. Add atomic Approve and Return for Changes actions with busy/error/success states.

- [ ] **Step 4: Trigger downstream work only after committed approval**

Refresh authoritative work order, then reuse idempotent cart/calendar/client-update/reporting synchronization. Use proposal id as the idempotency source key.

- [ ] **Step 5: Run GREEN and commit**

Run: `node tools/test-durant-approval.cjs && npm run test:order-accounting && npm run test:cart-client-updates && npm run typecheck`

```bash
git add src/lib/durantProposals.ts src/workorders/DurantProposalReview.tsx src/workorders/NewWorkOrderWindow.tsx app/electron/electron-main.ts src/mobile/mobile-api.ts tools package.json
git commit -m "feat: review Durant ticket proposals"
```

### Task 8: Restricted responsive Durant browser workspace

**Files:**
- Create: `src/durant/DurantApp.tsx`
- Create: `src/durant/DurantTicketEditor.tsx`
- Create: `src/durant/durant.css`
- Modify: `src/auth/LoginScreen.tsx`
- Modify: `src/mobile/MobileApp.tsx`
- Modify: `src/App.tsx`
- Modify: `src/mobile.tsx`
- Create: `tools/test-durant-web-routing.cjs`
- Modify: `package.json`

**Interfaces:**
- Consumes Task 6 auth/role and Task 7 proposal APIs.
- Produces role-aware route `/?durantTicket=<legacy-id>` and responsive Durant shell.

- [ ] **Step 1: Write failing routing/permission tests**

Prove login appears before data; temporary bootstrap routes only to password setup; Durant deep link restores after login; Durant shell exposes only allowed actions; GadgetBoy routes remain unchanged; unrelated/missing ticket returns safe not-found.

- [ ] **Step 2: Run RED**

Run: `node tools/test-durant-web-routing.cjs`
Expected: FAIL because role-aware shell and deep-link state are absent.

- [ ] **Step 3: Implement stylized login and forced password setup**

Support friendly username, normal secure password, one-time bootstrap PIN, accessible validation, and responsive layout. Resolve server profile before rendering protected app.

- [ ] **Step 4: Implement Durant shell/editor/receipt**

List only visible Durant tickets; show the attached client and approved work-order status; render a chronological shared history and author-labeled shared notes; edit staged findings/items/pricing/markup/invoice links/labor/Full Transfer; scan supplier URLs with manual fallback; print approved or clearly watermarked draft receipt; submit review/accept transfer. Keep GadgetBoy internal notes out of every Durant query and component.

- [ ] **Step 5: Run GREEN and responsive browser checks**

Run: `node tools/test-durant-web-routing.cjs && npm run typecheck && npm run build:mobile`
Inspect desktop, iPhone, and iPad viewports including login, list, editor, proposal states, and print preview.

- [ ] **Step 6: Commit**

```bash
git add src/durant src/auth/LoginScreen.tsx src/mobile/MobileApp.tsx src/App.tsx src/mobile.tsx tools package.json
git commit -m "feat: add Durant web workspace"
```

### Task 9: PWA, QR deep links, and persistent release URL documentation

**Files:**
- Create: `public/manifest.webmanifest`
- Create from existing logo: `public/icons/icon-192.png`, `public/icons/icon-512.png`, `public/icons/apple-touch-icon.png`
- Modify: `src/mobile.html`
- Modify: `vite.mobile.config.ts`
- Modify: `src/workorders/releasePrint.ts`
- Create: `docs/WEB-INTERFACE.txt`
- Modify: `.github/workflows/release.yml`
- Modify: `tools/merge-web-builds.cjs`
- Create: `tools/test-web-pwa-release.cjs`
- Modify: `package.json`

**Interfaces:**
- Canonical URL: `https://mattstechwisdom.github.io/GB-POS`.
- Durant QR: `${VITE_PUBLIC_APP_URL}/?durantTicket=<legacy-id>`.

- [ ] **Step 1: Write failing PWA/release tests**

Build the web artifact and assert manifest/icon availability, standalone display, correct GitHub Pages start scope, Apple touch metadata, safe-area CSS, Durant deep link, and generated release notes containing the exact Web Interface line.

- [ ] **Step 2: Run RED**

Run: `node tools/test-web-pwa-release.cjs`
Expected: FAIL because manifest/icons/release-note injection are absent.

- [ ] **Step 3: Generate icon assets and add PWA metadata**

Use the existing GadgetBoy logo, preserve aspect ratio with branded background padding, add standard/maskable entries, Apple metadata, theme/background, and standalone start URL.

- [ ] **Step 4: Add Durant QR and release documentation**

Change only Durant Report QR destinations. Add `docs/WEB-INTERFACE.txt`. Update release-note generation so every tag description contains exactly `Web Interface: https://mattstechwisdom.github.io/GB-POS`.

- [ ] **Step 5: Run GREEN and commit**

Run: `node tools/test-web-pwa-release.cjs && npm run build:web`

```bash
git add public src/mobile.html vite.mobile.config.ts src/workorders/releasePrint.ts docs/WEB-INTERFACE.txt .github/workflows/release.yml tools package.json
git commit -m "feat: publish installable POS web interface"
```

### Task 10: Full verification, visual QA, version, and release

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `package.json`
- Modify: `package-lock.json`

**Interfaces:**
- Produces release `v0.6.27`, after confirming immediately before tagging that the name remains unused locally and on `origin`.
- Publishes GitHub release and GitHub Pages deployment.

- [ ] **Step 1: Run focused and complete verification**

Run all new tests plus `npm run typecheck`, existing order/reporting/customer/notification/record/sync tests, `npm run build`, `npm run build:mobile`, and `npm run build:web`. Run Supabase RLS tests/advisors against the intended environment without exposing secrets.

- [ ] **Step 2: Perform visual QA**

Capture and inspect desktop, iPhone, and iPad screenshots for login, GadgetBoy shell, Durant list/editor/review, discount dialog, selected historical checkout, diagnostic totals, receipts, and standard/Durant print headers. Fix every clipping, wrapping, inaccessible control, or data leak and rerun affected tests.

- [ ] **Step 3: Determine and apply next patch version**

Inspect remote/local tags immediately before bump. Update package/lock/changelog using the established convention and include the Web Interface line.

- [ ] **Step 4: Run final clean verification after version bump**

Repeat typechecks, all focused tests, production builds, `git diff --check`, and clean-worktree review. Confirm no generated build directories or secrets are staged.

- [ ] **Step 5: Commit, tag, and push**

```bash
git add CHANGELOG.md package.json package-lock.json <verified feature files>
git commit -m "release: publish Durant web workflow"
git tag -a v0.6.27 -m "GadgetBoy POS v0.6.27"
git push -u origin codex/calendar-requests-v0.6.26
git push origin v0.6.27
```

- [ ] **Step 6: Confirm release and web destination**

Verify GitHub Actions succeeds, required Windows/Android assets exist, release description includes the Web Interface line, GitHub Pages returns the new build, manifest/icons load, and the canonical login page is reachable.
