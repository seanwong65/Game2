const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

function calcWinRate(wins, losses, draws) {
  const total = wins + losses + draws;
  if (total === 0) return 0.0;
  return Math.round((wins / total) * 1000) / 10;
}

function formatPlayer(row, history = null) {
  const { id, name, wins, losses, draws, created_at } = row;
  const player = {
    id,
    name,
    wins,
    losses,
    draws,
    gamesPlayed: wins + losses + draws,
    winRate: calcWinRate(wins, losses, draws),
    createdAt: created_at,
  };
  if (history !== null) player.history = history;
  return player;
}

async function getOrCreatePlayer(db, name) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Player name is required");

  let row = await db
    .prepare("SELECT * FROM players WHERE name = ? COLLATE NOCASE")
    .bind(trimmed)
    .first();

  if (row) return row;

  await db.prepare("INSERT INTO players (name) VALUES (?)").bind(trimmed).run();
  row = await db
    .prepare("SELECT * FROM players WHERE name = ? COLLATE NOCASE")
    .bind(trimmed)
    .first();
  return row;
}

async function getPlayerHistory(db, playerId, limit = 20) {
  const { results } = await db
    .prepare(
      `SELECT opponent_name AS opponentName, game_type AS gameType,
              mode, result, played_at AS playedAt
       FROM game_history
       WHERE player_id = ?
       ORDER BY played_at DESC
       LIMIT ?`
    )
    .bind(playerId, limit)
    .all();
  return results;
}

async function applyResult(db, playerId, result) {
  const col = { win: "wins", loss: "losses", draw: "draws" }[result];
  await db
    .prepare(`UPDATE players SET ${col} = ${col} + 1 WHERE id = ?`)
    .bind(playerId)
    .run();
}

async function insertHistory(db, playerId, opponentName, gameType, mode, result) {
  await db
    .prepare(
      `INSERT INTO game_history (player_id, opponent_name, game_type, mode, result)
       VALUES (?, ?, ?, ?, ?)`
    )
    .bind(playerId, opponentName, gameType, mode, result)
    .run();
}

async function getPlayerByName(db, name) {
  const row = await db
    .prepare("SELECT * FROM players WHERE name = ? COLLATE NOCASE")
    .bind(name.trim())
    .first();
  if (!row) return null;
  const history = await getPlayerHistory(db, row.id);
  return formatPlayer(row, history);
}

async function getAllPlayers(db) {
  const { results } = await db
    .prepare(
      `SELECT * FROM players
       ORDER BY wins DESC, (wins + losses + draws) DESC, name ASC`
    )
    .all();
  return results.map((r) => formatPlayer(r));
}

async function recordPvpGame(db, playerXName, playerOName, winnerMark, gameType) {
  const playerX = await getOrCreatePlayer(db, playerXName);
  const playerO = await getOrCreatePlayer(db, playerOName);

  if (winnerMark === null) {
    for (const [pid, opp] of [
      [playerX.id, playerO.name],
      [playerO.id, playerX.name],
    ]) {
      await insertHistory(db, pid, opp, gameType, "pvp", "draw");
      await applyResult(db, pid, "draw");
    }
  } else if (winnerMark === "X") {
    await insertHistory(db, playerX.id, playerO.name, gameType, "pvp", "win");
    await insertHistory(db, playerO.id, playerX.name, gameType, "pvp", "loss");
    await applyResult(db, playerX.id, "win");
    await applyResult(db, playerO.id, "loss");
  } else {
    await insertHistory(db, playerO.id, playerX.name, gameType, "pvp", "win");
    await insertHistory(db, playerX.id, playerO.name, gameType, "pvp", "loss");
    await applyResult(db, playerO.id, "win");
    await applyResult(db, playerX.id, "loss");
  }

  return {
    playerX: await getPlayerByName(db, playerX.name),
    playerO: await getPlayerByName(db, playerO.name),
  };
}

async function recordPvcGame(db, playerName, winnerMark, gameType, opponent = "Computer") {
  const result = winnerMark === null ? "draw" : winnerMark === "X" ? "win" : "loss";
  const player = await getOrCreatePlayer(db, playerName);
  await insertHistory(db, player.id, opponent, gameType, "pvc", result);
  await applyResult(db, player.id, result);
  return getPlayerByName(db, player.name);
}

// ── Router ──────────────────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // CORS preflight
    if (method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const db = env.DB;

    try {
      // GET /api/players
      if (method === "GET" && pathname === "/api/players") {
        const players = await getAllPlayers(db);
        return json(200, { players });
      }

      // GET /api/players/:name
      if (method === "GET" && pathname.startsWith("/api/players/")) {
        const name = decodeURIComponent(pathname.slice("/api/players/".length));
        const player = await getPlayerByName(db, name);
        if (!player) return json(404, { error: "Player not found" });
        return json(200, { player });
      }

      // POST /api/games
      if (method === "POST" && pathname === "/api/games") {
        const body = await request.json().catch(() => ({}));
        const mode = body.mode;
        const gameType = body.gameType || "ttt";

        if (!["ttt", "reversi", "minesweeper"].includes(gameType)) {
          return json(400, { error: "Invalid game type" });
        }

        if (mode === "pvp") {
          const playerX = (body.playerX || "").trim();
          const playerO = (body.playerO || "").trim();
          const winner = body.winner ?? null;

          if (!playerX || !playerO)
            return json(400, { error: "Both player names are required for PvP" });
          if (playerX.toLowerCase() === playerO.toLowerCase())
            return json(400, { error: "Players must have different names" });
          if (!["X", "O", null].includes(winner))
            return json(400, { error: "Invalid winner value" });

          const result = await recordPvpGame(db, playerX, playerO, winner, gameType);
          return json(200, { ok: true, ...result });
        }

        if (mode === "pvc") {
          const playerName = (body.playerName || "").trim();
          const winner = body.winner ?? null;

          if (!playerName) return json(400, { error: "Player name is required" });
          if (!["X", "O", null].includes(winner))
            return json(400, { error: "Invalid winner value" });

          let opponent = "Computer";
          if (gameType === "minesweeper") {
            const diff = body.difficulty || "8x8";
            const labels = { "8x8": "8×8 grid", "15x15": "15×15 grid" };
            opponent = labels[diff] || diff;
          }

          const player = await recordPvcGame(db, playerName, winner, gameType, opponent);
          return json(200, { ok: true, player });
        }

        return json(400, { error: "Invalid mode" });
      }

      return json(404, { error: "Not found" });
    } catch (err) {
      if (err.message === "Player name is required") {
        return json(400, { error: err.message });
      }
      console.error(err);
      return json(500, { error: "Internal server error" });
    }
  },
};
