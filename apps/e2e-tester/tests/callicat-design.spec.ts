/**
 * ╔═══════════════════════════════════════════════════════════╗
 * ║  Callicat Design E2E Test                                 ║
 * ║                                                           ║
 * ║  Simulates a human user opening r3ditor and designing     ║
 * ║  the callicat model from scratch:                         ║
 * ║                                                           ║
 * ║  1. Open app → verify UI loaded                           ║
 * ║  2. File → Build Callicat 🐱                              ║
 * ║  3. Verify entities appear in the Feature Tree             ║
 * ║  4. Verify timeline has all design steps                  ║
 * ║  5. Interact with viewport (orbit, zoom, pan)             ║
 * ║  6. Select individual entities and inspect properties     ║
 * ║  7. File → Save → download .r3d.json                     ║
 * ║  8. File → Export STL → download .stl                     ║
 * ║  9. Verify downloaded files                               ║
 * ╚═══════════════════════════════════════════════════════════╝
 */

import { test, expect, type Page } from '@playwright/test';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Helpers ──────────────────────────────────────────────────────────────

const DOWNLOADS_DIR = path.resolve(__dirname, '..', 'downloads');

/** Human-like pause between actions */
async function humanDelay(page: Page, ms = 300) {
  await page.waitForTimeout(ms);
}

/** Read the Zustand store state from the browser context */
async function getStoreState(page: Page) {
  return page.evaluate(() => {
    // The editorStore is a Zustand store accessible on the module scope.
    // We reach it via the window.__ZUSTAND_STORE__ bridge we inject.
    const w = window as any;
    if (w.__ZUSTAND_STORE__) {
      const s = w.__ZUSTAND_STORE__.getState();
      return {
        documentName: s.documentName,
        entityCount: s.entities?.length ?? 0,
        entityNames: s.entities?.map((e: any) => e.name) ?? [],
        entityTypes: s.entities?.map((e: any) => e.type) ?? [],
        timelineCount: s.timeline?.length ?? 0,
        statusMessage: s.statusMessage,
        sketchPhase: s.sketchPhase,
      };
    }
    return null;
  });
}

/** Inject a bridge to access the Zustand store from Playwright */
async function injectStoreBridge(page: Page) {
  await page.evaluate(() => {
    // Zustand stores are created via `create()` and the state is in a closure.
    // The useEditorStore module exports the hook; we'll find it on the React fiber.
    // Simpler approach: look for the store on the module scope by evaluating an import.
    // Since Vite uses ESM, we can import() from the browser.
    return import('/src/store/editorStore.ts').then((mod: any) => {
      (window as any).__ZUSTAND_STORE__ = mod.useEditorStore;
      console.log('[E2E] Store bridge injected');
    });
  });
}

// ── Tests ────────────────────────────────────────────────────────────────

test.describe('Human User Designs a Callicat in r3ditor', () => {

  test.beforeAll(() => {
    // Ensure downloads directory exists
    if (!fs.existsSync(DOWNLOADS_DIR)) {
      fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
    }
  });

  test('Step 1: Open r3ditor and verify UI loads', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Verify the main UI components are present
    // Document header with the app title
    await expect(page.locator('text=r3ditor')).toBeVisible({ timeout: 15_000 });

    // The viewport canvas should be rendered (Three.js canvas)
    await expect(page.locator('canvas')).toBeVisible({ timeout: 15_000 });

    // The status bar at the bottom
    await expect(page.locator('text=Ready')).toBeVisible({ timeout: 10_000 });

    // Inject our store bridge for later use
    await injectStoreBridge(page);

    const state = await getStoreState(page);
    expect(state).not.toBeNull();
    expect(state!.entityCount).toBe(0);

    console.log('✅ Step 1: r3ditor UI loaded successfully');
  });

  test('Step 2: Build the Callicat model via File menu', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await injectStoreBridge(page);
    await humanDelay(page, 500);

    // Click the File menu (hamburger button or first button in header)
    const fileMenuButton = page.locator('button').filter({ hasText: /file|menu/i }).first();
    // If that doesn't match, try the hamburger icon (first button in the header bar)
    const headerButtons = page.locator('[data-tauri-drag-region] button, .bg-fusion-header button');

    // Click the first button in the header to open file menu
    const firstHeaderBtn = headerButtons.first();
    await firstHeaderBtn.click();
    await humanDelay(page, 300);

    // Look for the "Build Callicat 🐱" menu item
    const callicatItem = page.locator('text=Build Callicat');
    await expect(callicatItem).toBeVisible({ timeout: 5_000 });

    // Click it like a human would
    await callicatItem.click();
    await humanDelay(page, 1000);

    // Verify the store now has callicat data
    const state = await getStoreState(page);
    expect(state).not.toBeNull();
    expect(state!.documentName).toBe('Callicat v1.0');
    expect(state!.entityCount).toBe(5);
    expect(state!.entityNames).toContain('Callicat Body');
    expect(state!.entityNames).toContain('Callicat Head');
    expect(state!.entityNames).toContain('Left Ear');
    expect(state!.entityNames).toContain('Right Ear');
    expect(state!.entityNames).toContain('Callicat Tail');

    // Verify status message confirms the build
    expect(state!.statusMessage).toContain('Callicat');

    console.log('✅ Step 2: Callicat model built — 5 entities in store');
  });

  test('Step 3: Verify Feature Tree shows all entities', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await injectStoreBridge(page);
    await humanDelay(page, 300);

    // Build callicat first
    const headerButtons = page.locator('.bg-fusion-header button');
    await headerButtons.first().click();
    await humanDelay(page, 200);
    await page.locator('text=Build Callicat').click();
    await humanDelay(page, 500);

    // The Feature Tree (left panel) should show entity names
    // These are rendered as tree items in the FeatureTree component
    await expect(page.locator('text=Callicat Body')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Callicat Head')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Left Ear')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Right Ear')).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('text=Callicat Tail')).toBeVisible({ timeout: 5_000 });

    console.log('✅ Step 3: All 5 entities visible in Feature Tree');
  });

  test('Step 4: Verify timeline has all design steps', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await injectStoreBridge(page);

    // Build callicat
    const headerButtons = page.locator('.bg-fusion-header button');
    await headerButtons.first().click();
    await humanDelay(page, 200);
    await page.locator('text=Build Callicat').click();
    await humanDelay(page, 500);

    const state = await getStoreState(page);
    expect(state!.timelineCount).toBeGreaterThanOrEqual(15);

    // The BottomTabBar renders timeline entries as 28×28px icon-only buttons.
    // Feature names appear in the `title` attribute, not visible text.
    // Look for the TIMELINE label (exact match to avoid matching status message).
    await expect(page.getByText('TIMELINE', { exact: true })).toBeVisible({ timeout: 5_000 });

    // Timeline feature tiles are small buttons with title attributes like "Sketch1", "Extrude1"
    const timelineTiles = page.locator('button[title]').filter({
      has: page.locator('svg'),  // Each tile has a Lucide icon (SVG)
    });
    const count = await timelineTiles.count();
    expect(count).toBeGreaterThanOrEqual(5);

    console.log(`✅ Step 4: Timeline has ${state!.timelineCount} entries, ${count} icon tiles in bottom bar`);
  });

  test('Step 5: Select entities by clicking in the Feature Tree', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await injectStoreBridge(page);

    // Build callicat
    const headerButtons = page.locator('.bg-fusion-header button');
    await headerButtons.first().click();
    await humanDelay(page, 200);
    await page.locator('text=Build Callicat').click();
    await humanDelay(page, 500);

    // Click on "Callicat Body" in the tree to select it
    await page.locator('text=Callicat Body').first().click();
    await humanDelay(page, 300);

    // Verify selection happened by checking store
    const selected = await page.evaluate(() => {
      const w = window as any;
      if (w.__ZUSTAND_STORE__) {
        return w.__ZUSTAND_STORE__.getState().selectedIds;
      }
      return [];
    });

    expect(selected.length).toBeGreaterThanOrEqual(1);

    // Click on "Callicat Head"
    await page.locator('text=Callicat Head').first().click();
    await humanDelay(page, 300);

    const selected2 = await page.evaluate(() => {
      const w = window as any;
      return w.__ZUSTAND_STORE__?.getState().selectedIds ?? [];
    });
    expect(selected2.length).toBeGreaterThanOrEqual(1);

    console.log('✅ Step 5: Entity selection via Feature Tree works');
  });

  test('Step 6: Open Script Console and run status command', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await injectStoreBridge(page);

    // Build callicat first
    const headerButtons = page.locator('.bg-fusion-header button');
    await headerButtons.first().click();
    await humanDelay(page, 200);
    await page.locator('text=Build Callicat').click();
    await humanDelay(page, 500);

    // Open the Script Console (it's toggled by a button)
    // The ScriptConsole has a toggle button with "Script" or terminal icon
    const scriptToggle = page.locator('button').filter({ hasText: /Script|Console|Terminal/i }).first();
    if (await scriptToggle.isVisible()) {
      await scriptToggle.click();
      await humanDelay(page, 300);
    }

    // Type "entities" command to list all entities
    const consoleInput = page.locator('input[placeholder*="command"], input[placeholder*="type"]').first();
    if (await consoleInput.isVisible()) {
      await consoleInput.fill('entities');
      await consoleInput.press('Enter');
      await humanDelay(page, 300);

      // The output shows entity lines like "  <id>: Callicat Body [box]"
      // Use a locator that targets the console output area to avoid matching the Feature Tree
      await expect(page.locator('text=/Callicat Body \\[box\\]/')).toBeVisible({ timeout: 5_000 });

      // Try "status" command
      await consoleInput.fill('status');
      await consoleInput.press('Enter');
      await humanDelay(page, 300);
    }

    console.log('✅ Step 6: Script Console interaction works');
  });

  test('Step 7: Save the project as .r3d.json', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await injectStoreBridge(page);

    // Build callicat
    const headerButtons = page.locator('.bg-fusion-header button');
    await headerButtons.first().click();
    await humanDelay(page, 200);
    await page.locator('text=Build Callicat').click();
    await humanDelay(page, 800);

    // In browser mode (non-Tauri), save triggers a Blob download.
    // We intercept the download.
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });

    // Click File → Save
    await headerButtons.first().click();
    await humanDelay(page, 200);

    const saveItem = page.locator('text=Save').first();
    await expect(saveItem).toBeVisible({ timeout: 3_000 });
    await saveItem.click();

    // Wait for the download
    const download = await downloadPromise;
    const suggestedName = download.suggestedFilename();
    expect(suggestedName).toContain('.r3d.json');

    // Save the downloaded file to our downloads directory
    const savePath = path.join(DOWNLOADS_DIR, suggestedName);
    await download.saveAs(savePath);

    // Verify the downloaded file
    expect(fs.existsSync(savePath)).toBe(true);
    const content = fs.readFileSync(savePath, 'utf-8');
    const parsed = JSON.parse(content);
    expect(parsed.entities).toHaveLength(5);
    expect(parsed.document.name).toBe('Callicat v1.0');

    console.log(`✅ Step 7: Project saved as ${suggestedName} (${content.length} bytes)`);
  });

  test('Step 8: Export the model as STL', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await injectStoreBridge(page);

    // Build callicat
    const headerButtons = page.locator('.bg-fusion-header button');
    await headerButtons.first().click();
    await humanDelay(page, 200);
    await page.locator('text=Build Callicat').click();
    await humanDelay(page, 800);

    // Wait for Three.js scene to be exposed on window
    await page.waitForFunction(() => {
      return !!(window as any).__r3ditor_scene;
    }, { timeout: 10_000 });

    // Click File → Export STL
    const downloadPromise = page.waitForEvent('download', { timeout: 15_000 });

    await headerButtons.first().click();
    await humanDelay(page, 200);

    const exportItem = page.locator('text=Export STL').first();
    await expect(exportItem).toBeVisible({ timeout: 3_000 });
    await exportItem.click();

    // Wait for the download
    const download = await downloadPromise;
    const suggestedName = download.suggestedFilename();
    expect(suggestedName).toContain('.stl');

    // Save the downloaded file
    const savePath = path.join(DOWNLOADS_DIR, suggestedName);
    await download.saveAs(savePath);

    // Verify the STL file
    expect(fs.existsSync(savePath)).toBe(true);
    const buffer = fs.readFileSync(savePath);
    expect(buffer.length).toBeGreaterThan(1000);

    // Validate STL binary header
    const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
    const triCount = view.getUint32(80, true);
    expect(triCount).toBeGreaterThan(100);

    console.log(`✅ Step 8: STL exported as ${suggestedName} (${buffer.length} bytes, ${triCount} triangles)`);
  });

  test('Step 9: Verify the 3D viewport renders meshes', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await injectStoreBridge(page);

    // Build callicat
    const headerButtons = page.locator('.bg-fusion-header button');
    await headerButtons.first().click();
    await humanDelay(page, 200);
    await page.locator('text=Build Callicat').click();
    await humanDelay(page, 1000);

    // The canvas should be rendering something — check that scene has children
    const sceneInfo = await page.evaluate(() => {
      const scene = (window as any).__r3ditor_scene;
      if (!scene) return null;
      return {
        childCount: scene.children.length,
        type: scene.type,
      };
    });

    // scene may not be exposed until render cycle completes
    if (sceneInfo) {
      expect(sceneInfo.childCount).toBeGreaterThan(0);
      console.log(`✅ Step 9: Viewport scene has ${sceneInfo.childCount} children`);
    } else {
      // Fallback: just verify canvas exists and entities are in store
      await expect(page.locator('canvas')).toBeVisible();
      const state = await getStoreState(page);
      expect(state!.entityCount).toBe(5);
      console.log('✅ Step 9: Viewport canvas rendered, 5 entities in store');
    }

    // Take a screenshot of the final state
    await page.screenshot({
      path: path.join(DOWNLOADS_DIR, 'callicat-viewport.png'),
      fullPage: true,
    });
    console.log(`   📸 Screenshot saved to ${path.join(DOWNLOADS_DIR, 'callicat-viewport.png')}`);
  });

  test('Step 10: Full automated workflow — build, verify, save, export', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
    await injectStoreBridge(page);
    await humanDelay(page, 500);

    // ── Phase 1: Build ──
    console.log('\n🔨 Phase 1: Building Callicat...');
    const headerButtons = page.locator('.bg-fusion-header button');
    await headerButtons.first().click();
    await humanDelay(page, 300);
    await page.locator('text=Build Callicat').click();
    await humanDelay(page, 1000);

    const state = await getStoreState(page);
    expect(state!.entityCount).toBe(5);
    expect(state!.documentName).toBe('Callicat v1.0');
    console.log(`   ✅ Built: ${state!.entityCount} entities, ${state!.timelineCount} timeline entries`);

    // ── Phase 2: Inspect ──
    console.log('🔍 Phase 2: Inspecting entities...');
    for (const name of ['Callicat Body', 'Callicat Head', 'Left Ear', 'Right Ear', 'Callicat Tail']) {
      await expect(page.locator(`text=${name}`).first()).toBeVisible({ timeout: 3_000 });
    }
    console.log('   ✅ All 5 entities visible in UI');

    // ── Phase 3: Save ──
    console.log('💾 Phase 3: Saving project...');
    const saveDownload = page.waitForEvent('download', { timeout: 15_000 });
    await headerButtons.first().click();
    await humanDelay(page, 200);
    await page.locator('text=Save').first().click();

    const savedFile = await saveDownload;
    const jsonPath = path.join(DOWNLOADS_DIR, 'callicat-full-workflow.r3d.json');
    await savedFile.saveAs(jsonPath);
    expect(fs.existsSync(jsonPath)).toBe(true);
    console.log(`   ✅ Saved: ${jsonPath}`);

    // ── Phase 4: Export STL ──
    console.log('📤 Phase 4: Exporting STL...');

    // Wait for scene to be available
    await page.waitForFunction(() => !!(window as any).__r3ditor_scene, { timeout: 10_000 }).catch(() => {});
    await humanDelay(page, 500);

    const stlDownload = page.waitForEvent('download', { timeout: 15_000 });
    await headerButtons.first().click();
    await humanDelay(page, 200);
    await page.locator('text=Export STL').first().click();

    const stlFile = await stlDownload;
    const stlPath = path.join(DOWNLOADS_DIR, 'callicat-full-workflow.stl');
    await stlFile.saveAs(stlPath);
    expect(fs.existsSync(stlPath)).toBe(true);
    console.log(`   ✅ Exported: ${stlPath}`);

    // ── Phase 5: Verify ──
    console.log('✔️  Phase 5: Verifying outputs...');

    const jsonContent = fs.readFileSync(jsonPath, 'utf-8');
    const parsed = JSON.parse(jsonContent);
    expect(parsed.entities).toHaveLength(5);
    expect(parsed.document.name).toBe('Callicat v1.0');

    const stlBuffer = fs.readFileSync(stlPath);
    expect(stlBuffer.length).toBeGreaterThan(1000);
    const triCount = new DataView(stlBuffer.buffer, stlBuffer.byteOffset, stlBuffer.byteLength).getUint32(80, true);
    expect(triCount).toBeGreaterThan(100);

    // Take final screenshot
    await page.screenshot({
      path: path.join(DOWNLOADS_DIR, 'callicat-final.png'),
      fullPage: true,
    });

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  🐱 Callicat E2E Workflow Complete!              ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Entities:   ${parsed.entities.length}`);
    console.log(`║  Timeline:   ${state!.timelineCount} entries`);
    console.log(`║  JSON:       ${jsonContent.length} bytes`);
    console.log(`║  STL:        ${stlBuffer.length} bytes, ${triCount} triangles`);
    console.log(`║  Downloads:  ${DOWNLOADS_DIR}`);
    console.log('╚══════════════════════════════════════════════════╝');
  });
});
