// Captures a thumbnail of each live app and writes a compressed WebP to
// assets/thumbs/<repo>.webp. Runs in CI only (Playwright + sharp are devDeps);
// the served site just ships the static images. Resilient: one page that fails
// to load leaves its previous thumbnail in place rather than aborting the run.

import { chromium } from "playwright";
import sharp from "sharp";
import { readFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONFIG_PATH = join(ROOT, "apps.config.json");
const OUT_DIR = join(ROOT, "assets", "thumbs");

const VIEWPORT = { width: 1200, height: 750 };
const THUMB_WIDTH = 640; // final WebP width; height scales to keep 16:10

async function shoot(browser, app) {
  const page = await browser.newPage({ viewport: VIEWPORT, deviceScaleFactor: 1 });
  try {
    await page.goto(app.url, { waitUntil: "networkidle", timeout: 45000 });
    // Give client-side data fetches (news, weather, catalogs) a moment to paint.
    await page.waitForTimeout(2500);
    const png = await page.screenshot({ type: "png" });
    const out = join(OUT_DIR, `${app.repo}.webp`);
    await sharp(png)
      .resize({ width: THUMB_WIDTH })
      .webp({ quality: 78 })
      .toFile(out);
    console.log(`ok   ${app.repo} -> ${out}`);
    return true;
  } catch (err) {
    console.warn(`warn ${app.repo}: ${err.message} (keeping existing thumbnail)`);
    return false;
  } finally {
    await page.close();
  }
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  await mkdir(OUT_DIR, { recursive: true });

  const browser = await chromium.launch();
  try {
    for (const app of config.apps) {
      await shoot(browser, app);
    }
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
