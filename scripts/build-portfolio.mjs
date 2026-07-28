// Builds data/apps.json for the portfolio landing page.
//
// For each app in apps.config.json it enriches the entry with the repo's
// GitHub description and last-push time (via the GitHub REST API), and passes
// through the freshness config the frontend uses to fetch each app's own data
// JSON client-side. Written dependency-free (Node built-ins only) and resilient:
// a single failed lookup never blanks the output file.

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const CONFIG_PATH = join(ROOT, "apps.config.json");
const OUT_PATH = join(ROOT, "data", "apps.json");

const GITHUB_TOKEN = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "";

async function githubRepo(owner, repo) {
  const headers = {
    "User-Agent": "alex-matulay-portfolio-builder",
    Accept: "application/vnd.github+json",
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
    headers,
  });
  if (!res.ok) throw new Error(`GitHub API ${res.status} for ${owner}/${repo}`);
  const json = await res.json();
  return {
    description: json.description || "",
    pushedAt: json.pushed_at || null,
    homepage: json.homepage || "",
    stars: json.stargazers_count ?? 0,
  };
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG_PATH, "utf8"));
  const owner = config.owner;

  const apps = [];
  for (const app of config.apps) {
    let meta = { description: "", pushedAt: null, stars: 0 };
    try {
      meta = await githubRepo(owner, app.repo);
      console.log(`ok   ${app.repo} (pushed ${meta.pushedAt})`);
    } catch (err) {
      console.warn(`warn ${app.repo}: ${err.message}`);
    }
    apps.push({
      name: app.name,
      repo: app.repo,
      url: app.url,
      links: app.links || null,
      tagline: app.tagline,
      emoji: app.emoji,
      accent: app.accent,
      cadence: app.cadence,
      // Frontend fetches this client-side for a real-time freshness badge.
      // Static apps have no data feed, so we bake in the repo push time instead.
      freshness: app.freshness || null,
      pushedAt: meta.pushedAt,
      description: meta.description,
      thumb: `assets/thumbs/${app.repo}.webp`,
    });
  }

  const out = {
    generated: new Date().toISOString(),
    owner,
    apps,
  };

  await mkdir(dirname(OUT_PATH), { recursive: true });
  await writeFile(OUT_PATH, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`\nWrote ${OUT_PATH} with ${apps.length} apps.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
