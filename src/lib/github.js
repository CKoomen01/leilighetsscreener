// Starter datainnhenting på GitHub («Oppdater data nå») og viser status for siste kjøring.
import { settingsStore } from "./store.js";

// På GitHub Pages: <eier>.github.io/<repo>/
function repo() {
  const host = location.hostname;
  if (host.endsWith(".github.io")) {
    const owner = host.split(".")[0];
    const name = location.pathname.split("/").filter(Boolean)[0] || "leilighetsscreener";
    return `${owner}/${name}`;
  }
  return "CKoomen01/leilighetsscreener";
}

export const REPO = repo();
export const WORKFLOW = "update.yml";
export const ACTIONS_URL = `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`;

/** Siste kjøring (offentlig repo – ingen innlogging nødvendig) */
export async function lastRun() {
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/runs?per_page=1`);
  if (!r.ok) return null;
  const run = (await r.json()).workflow_runs?.[0];
  return run ? { status: run.status, conclusion: run.conclusion, started: run.run_started_at, url: run.html_url } : null;
}

/** Krever et GitHub-token med «Actions: Read and write» for dette repoet (lagres kun i nettleseren). */
export async function triggerUpdate() {
  const { ghToken } = settingsStore.get();
  if (!ghToken) return { ok: false, needToken: true, url: ACTIONS_URL };
  const r = await fetch(`https://api.github.com/repos/${REPO}/actions/workflows/${WORKFLOW}/dispatches`, {
    method: "POST",
    headers: { Authorization: `Bearer ${ghToken}`, Accept: "application/vnd.github+json" },
    body: JSON.stringify({ ref: "main" }),
  });
  if (r.status === 204) return { ok: true, url: ACTIONS_URL };
  return { ok: false, status: r.status, url: ACTIONS_URL, error: r.status === 401 || r.status === 403 ? "GitHub-tokenet mangler tilgang." : `GitHub svarte ${r.status}.` };
}
