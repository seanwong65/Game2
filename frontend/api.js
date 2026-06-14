const API_BASE = "https://boardgames-worker.johnwong777.workers.dev";

async function fetchJson(url, options = {}) {
  const res = await fetch(`${API_BASE}${url}`, {
    headers: { "Content-Type": "application/json", ...options.headers },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export async function loadLeaderboard() {
  return fetchJson("/api/players");
}

export async function loadPlayer(name) {
  return fetchJson(`/api/players/${encodeURIComponent(name)}`);
}

export async function saveGame(payload) {
  return fetchJson("/api/games", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
