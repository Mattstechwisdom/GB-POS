# Repair Tutorials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add synchronized repair tutorial URLs and safe, responsive video playback on desktop and mobile.

**Architecture:** A pure URL classifier normalizes YouTube, direct-video, and webpage links. Repair persistence carries tutorial metadata through Electron, mobile, and Supabase; a shared player surface renders inside a desktop child window or mobile route with an external-browser fallback.

**Tech Stack:** React 18, TypeScript, Electron 29, Capacitor 8, Supabase/Postgres, YouTube iframe API, HTML5 video.

**Spec:** `docs/superpowers/specs/2026-09-03-repair-tutorial-automatic-email-price-review-design.md`

## Global Constraints

- Store URLs and metadata only; never upload, download, or copy tutorial media.
- Permit only `https:` URLs, with a development-only allowance for `http://localhost`.
- External content never receives Electron preload or Node privileges.
- Desktop and mobile must expose the same saved tutorial.

---

### Task 1: Tutorial URL classification

**Files:**
- Create: `src/lib/repairTutorial.ts`
- Create: `tools/test-repair-tutorial.cjs`
- Modify: `package.json`

**Interfaces:**
- Produces: `classifyRepairTutorialUrl(value): { normalizedUrl: string; mediaType: 'youtube'|'direct-video'|'webpage'; youtubeId?: string } | null`

- [ ] **Step 1: Write the failing test**

```js
assert.deepEqual(classifyRepairTutorialUrl('https://youtu.be/dQw4w9WgXcQ'), {
  normalizedUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', mediaType: 'youtube', youtubeId: 'dQw4w9WgXcQ'
});
assert.equal(classifyRepairTutorialUrl('https://cdn.example.com/guide.mp4').mediaType, 'direct-video');
assert.equal(classifyRepairTutorialUrl('javascript:alert(1)'), null);
```

- [ ] **Step 2: Run `node tools/test-repair-tutorial.cjs` and verify it fails because the module is absent.**
- [ ] **Step 3: Implement URL parsing with `URL`, YouTube host/path variants, direct-media extensions, and scheme validation.**
- [ ] **Step 4: Add `"test:repair-tutorial": "node tools/test-repair-tutorial.cjs"`; run it and `npm run typecheck:renderer`.**
- [ ] **Step 5: Commit with `git commit -m "feat: classify repair tutorial links"`.**

### Task 2: Persist tutorial metadata everywhere

**Files:**
- Modify: `src/lib/repairModels.ts`
- Modify: `src/lib/types.ts`
- Modify: `src/repairs/RepairItemForm.tsx`
- Modify: `app/electron/electron-main.ts`
- Modify: `src/mobile/mobile-api.ts`
- Create: CLI-generated migration under `supabase/migrations/`
- Create: `tools/test-repair-tutorial-sync.cjs`

**Interfaces:**
- Consumes: `classifyRepairTutorialUrl`
- Adds: `tutorialUrl?: string`, `tutorialMediaType?: string`, `tutorialUpdatedAt?: string`

- [ ] **Step 1: Generate the migration with `supabase migration new repair_tutorial_urls`; do not invent its timestamp.**
- [ ] **Step 2: Write a failing contract test asserting `tutorial_url`, `tutorial_media_type`, and `tutorial_updated_at` exist and both adapters map them in both directions.**
- [ ] **Step 3: Run the test and verify the missing-column/mapping failure.**
- [ ] **Step 4: Add nullable columns, URL-length/type constraints, existing RLS-compatible access, indexes only if query plans require them, and adapter/type mappings.**
- [ ] **Step 5: Run `npm run test:repair-tutorial`, the sync test, `npm run test:repair-service-hierarchy`, and `npm run typecheck`.**
- [ ] **Step 6: Commit with `git commit -m "feat: sync repair tutorial links"`.**

### Task 3: Repair editor button behavior

**Files:**
- Modify: `src/repairs/RepairItemForm.tsx`
- Modify: `src/repairs/RepairItemList.tsx`
- Modify: `src/components/RepairItemList.tsx`
- Create: `tools/test-repair-tutorial-ui.cjs`

**Interfaces:**
- Produces: `onOpenTutorial(tutorialUrl)` from list/editor actions.

- [ ] **Step 1: Write assertions that an empty repair renders `Tutorial URL`, a populated repair renders `Repair Tutorial`, and edit mode exposes Change/Remove controls.**
- [ ] **Step 2: Run the UI test and verify RED.**
- [ ] **Step 3: Add accessible controls, inline validation, normalized save behavior, and non-blocking tutorial actions in catalog pickers.**
- [ ] **Step 4: Run the UI test plus `npm run test:ticket-catalog-pickers` and renderer typecheck.**
- [ ] **Step 5: Commit with `git commit -m "feat: add repair tutorial actions"`.**

### Task 4: Desktop and mobile players

**Files:**
- Create: `src/repairs/RepairTutorialPlayer.tsx`
- Create: `src/repairs/RepairTutorialWindow.tsx`
- Modify: `src/main.tsx`
- Modify: `src/mobile/MobileApp.tsx`
- Modify: `app/electron/electron-main.ts`
- Modify: `app/electron/preload.ts`
- Modify: `src/global.d.ts`
- Create: `tools/test-repair-tutorial-player.cjs`

**Interfaces:**
- Produces: `window.api.openRepairTutorial(payload)` and shared player props `{ url, mediaType, youtubeId?, onClose }`.

- [ ] **Step 1: Write failing tests for a sandboxed desktop child window, mobile route, HTML5 and YouTube modes, ±10 seconds, play/pause, seeking, speed, volume, fullscreen, external fallback, and close/back.**
- [ ] **Step 2: Run and verify RED.**
- [ ] **Step 3: Implement the shared controller and platform shells; disable Node integration and preload for remote content.**
- [ ] **Step 4: Run tutorial tests, desktop/mobile navigation tests, full typecheck, desktop build, and mobile build.**
- [ ] **Step 5: Commit with `git commit -m "feat: play repair tutorials on desktop and mobile"`.**

