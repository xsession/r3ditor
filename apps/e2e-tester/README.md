# r3ditor E2E Tester

External Playwright-based end-to-end tester that launches r3ditor in a real browser and simulates a human user designing a **Callicat** model.

## What it does

The tester runs 10 sequential steps, each simulating a real user interaction:

| Step | Action | Verifies |
|------|--------|----------|
| 1 | Open r3ditor | UI loads, canvas renders, store is empty |
| 2 | File → Build Callicat 🐱 | 5 entities in store (Body, Head, Ears, Tail) |
| 3 | Check Feature Tree | All entity names visible in left panel |
| 4 | Check Timeline | ≥15 timeline entries, feature buttons visible |
| 5 | Select entities | Click tree items → store selection updates |
| 6 | Script Console | Type `entities` and `status` commands |
| 7 | File → Save | Downloads `.r3d.json` with 5 entities |
| 8 | File → Export STL | Downloads `.stl` with >100 triangles |
| 9 | Verify 3D Viewport | Scene has children, canvas renders |
| 10 | Full Workflow | Build → Inspect → Save → Export → Screenshot |

## Prerequisites

- Node.js 18+
- The `apps/desktop` project must be available (Vite dev server)

## Setup

```bash
cd apps/e2e-tester
npm install
npx playwright install chromium
```

## Running Tests

```bash
# Headless (CI)
npm test

# Headed — watch the browser
npm run test:headed

# Debug — step through with Playwright Inspector
npm run test:debug

# Playwright UI mode
npm run test:ui

# Just the callicat design test
npm run callicat
```

The Playwright config automatically starts the Vite dev server on `localhost:5173` before running tests.

## Output

After a successful run, the `downloads/` directory contains:

| File | Description |
|------|-------------|
| `Callicat v1.0.r3d.json` | Saved project file (JSON, ~11 KB) |
| `callicat.stl` | Exported STL binary (~56 KB, 1124 triangles) |
| `callicat-viewport.png` | Screenshot of the 3D viewport |
| `callicat-final.png` | Screenshot after full workflow |
| `callicat-full-workflow.r3d.json` | JSON from full workflow test |
| `callicat-full-workflow.stl` | STL from full workflow test |

## Architecture

```
apps/e2e-tester/
├── package.json              # Playwright + TypeScript deps
├── playwright.config.ts      # Browser, viewport, webServer config
├── tsconfig.json
├── tests/
│   └── callicat-design.spec.ts   # 10-step human simulation
├── downloads/                # Test outputs (gitignored)
├── test-results/             # Playwright artifacts (gitignored)
└── playwright-report/        # HTML report (gitignored)
```

### Store Bridge

Tests inject a bridge into the browser to read Zustand store state:

```ts
await page.evaluate(() => {
  return import('/src/store/editorStore.ts').then((mod) => {
    window.__ZUSTAND_STORE__ = mod.useEditorStore;
  });
});
```

This uses Vite's ESM module system to dynamically import the store at runtime.

### WebServer Auto-Start

Playwright automatically starts the Vite dev server from `../desktop` before tests run. If a server is already running on port 5173, it reuses it (unless `CI=true`).
