// Portfolio landing page. Reads data/apps.json (built in CI), renders a card per
// app, and computes a live "freshness" badge. For apps with a data feed it fetches
// that feed client-side (same-origin under alex-matulay.github.io) so the badge is
// accurate at page-load time rather than only as fresh as the last portfolio rebuild.

const GRID = document.getElementById("grid");

// Per-cadence thresholds (ms). Below `fresh` → green, below `late` → amber, else red.
// Chosen to match each app's real schedule; intraday/weekly tolerate weekends & gaps.
const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const THRESHOLDS = {
  hourly:   { fresh: 3 * HOUR,  late: 24 * HOUR },
  intraday: { fresh: 12 * HOUR, late: 4 * DAY },
  weekly:   { fresh: 8 * DAY,   late: 16 * DAY },
};

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]
  ));
}

// Accepts ISO strings, "YYYY-MM-DD", or epoch milliseconds; returns ms or null.
function toMillis(value) {
  if (value == null) return null;
  if (typeof value === "number") return value;
  const n = Number(value);
  if (!Number.isNaN(n) && String(value).trim() !== "" && /^\d+$/.test(String(value).trim())) {
    return n; // epoch ms as a numeric string
  }
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : t;
}

function relativeTime(ms) {
  const diff = Date.now() - ms;
  if (diff < 0) return "just now";
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.round(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.round(months / 12)}y ago`;
}

function badgeState(cadence, updatedMs) {
  if (cadence === "static" || !updatedMs) return "static";
  const t = THRESHOLDS[cadence];
  if (!t) return "static";
  const age = Date.now() - updatedMs;
  if (age <= t.fresh) return "fresh";
  if (age <= t.late) return "late";
  return "stale";
}

// Pull the timestamp out of an app's own data feed (client-side, best-effort).
async function fetchFreshness(app) {
  if (!app.freshness || !app.freshness.url) return null;
  try {
    const res = await fetch(app.freshness.url, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return toMillis(data[app.freshness.field]);
  } catch {
    return null; // offline / CORS / feed down — fall back to pushedAt
  }
}

function renderCard(app, updatedMs) {
  const links = app.links && app.links.length
    ? app.links
    : [{ label: "Open", url: app.url }];

  const state = badgeState(app.cadence, updatedMs);
  const stamp = updatedMs || toMillis(app.pushedAt);
  const label = state === "static"
    ? (stamp ? `updated ${relativeTime(stamp)}` : "live")
    : (stamp ? relativeTime(stamp) : "unknown");

  const linksHtml = links.map((l, i) =>
    `<a class="card-link${i > 0 ? " secondary" : ""}" href="${escapeHtml(l.url)}" target="_blank" rel="noopener">${escapeHtml(l.label)}</a>`
  ).join("");

  const thumbInner = app.thumbAvailable
    ? `<img src="${escapeHtml(app.thumb)}" alt="Screenshot of ${escapeHtml(app.name)}" loading="lazy">`
    : `<span aria-hidden="true">${escapeHtml(app.emoji || "🔗")}</span>`;

  const card = document.createElement("a");
  card.className = "card";
  card.href = app.url;
  card.target = "_blank";
  card.rel = "noopener";
  card.style.setProperty("--card-accent", app.accent || "#8c1c2c");
  card.innerHTML = `
    <div class="thumb" style="background: linear-gradient(135deg, ${escapeHtml(app.accent || "#8c1c2c")} 0%, rgba(0,0,0,0.28) 140%);">
      <span class="badge ${state}" title="${escapeHtml(app.cadence)} cadence">${escapeHtml(label)}</span>
      ${thumbInner}
    </div>
    <div class="card-body">
      <div class="card-title"><span aria-hidden="true">${escapeHtml(app.emoji || "")}</span>${escapeHtml(app.name)}</div>
      <p class="card-tagline">${escapeHtml(app.tagline || app.description || "")}</p>
      <div class="card-links">${linksHtml}</div>
    </div>`;
  // Inner links shouldn't also trigger the card's own navigation.
  card.querySelectorAll(".card-link").forEach((a) =>
    a.addEventListener("click", (e) => e.stopPropagation())
  );
  return card;
}

async function main() {
  let payload;
  try {
    const res = await fetch("data/apps.json", { cache: "no-store" });
    payload = await res.json();
  } catch (err) {
    GRID.innerHTML = `<p class="loading">Couldn't load projects. Please try again later.</p>`;
    return;
  }

  const apps = payload.apps || [];

  // Probe each thumbnail once so we can fall back to an emoji tile if it's missing.
  await Promise.all(apps.map((app) => new Promise((resolve) => {
    if (!app.thumb) { app.thumbAvailable = false; return resolve(); }
    const img = new Image();
    img.onload = () => { app.thumbAvailable = true; resolve(); };
    img.onerror = () => { app.thumbAvailable = false; resolve(); };
    img.src = app.thumb;
  })));

  // Fetch freshness for all apps in parallel, then render.
  const freshness = await Promise.all(apps.map(fetchFreshness));

  GRID.innerHTML = "";
  apps.forEach((app, i) => GRID.appendChild(renderCard(app, freshness[i])));
}

main();
