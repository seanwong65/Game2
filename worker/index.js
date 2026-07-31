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

// Craps is a bankroll game against the house — a win rate is meaningless for
// it, so it is kept out of every stats total and breakdown.
const NO_WIN_RATE_GAMES = ["craps"];

function calcWinRate(wins, losses, draws) {
  const total = wins + losses + draws;
  if (total === 0) return 0.0;
  return Math.round((wins / total) * 1000) / 10;
}

function statsFromCounts({ wins = 0, losses = 0, draws = 0 }) {
  return {
    wins,
    losses,
    draws,
    gamesPlayed: wins + losses + draws,
    winRate: calcWinRate(wins, losses, draws),
  };
}

// Per-game and per-game-and-difficulty win rates, derived from game_history
// (the source of truth for individual results).
async function getPlayerBreakdown(db, playerId) {
  const placeholders = NO_WIN_RATE_GAMES.map(() => "?").join(", ");
  const { results } = await db
    .prepare(
      `SELECT game_type AS gameType, difficulty, result, COUNT(*) AS n
       FROM game_history
       WHERE player_id = ? AND game_type NOT IN (${placeholders})
       GROUP BY game_type, difficulty, result`
    )
    .bind(playerId, ...NO_WIN_RATE_GAMES)
    .all();

  const byGame = {};
  for (const row of results) {
    const game = (byGame[row.gameType] ||= { wins: 0, losses: 0, draws: 0, byDifficulty: {} });
    const key = { win: "wins", loss: "losses", draw: "draws" }[row.result];
    game[key] += row.n;

    // Rows written before difficulty was tracked, and games with no difficulty
    // setting, are grouped under a single bucket rather than dropped.
    const diff = row.difficulty || "none";
    const bucket = (game.byDifficulty[diff] ||= { wins: 0, losses: 0, draws: 0 });
    bucket[key] += row.n;
  }

  const out = {};
  for (const [gameType, g] of Object.entries(byGame)) {
    out[gameType] = {
      ...statsFromCounts(g),
      byDifficulty: Object.fromEntries(
        Object.entries(g.byDifficulty).map(([d, counts]) => [d, statsFromCounts(counts)])
      ),
    };
  }
  return out;
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
              difficulty, mode, result, played_at AS playedAt
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

async function insertHistory(db, playerId, opponentName, gameType, mode, result, difficulty = null) {
  await db
    .prepare(
      `INSERT INTO game_history (player_id, opponent_name, game_type, difficulty, mode, result)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .bind(playerId, opponentName, gameType, difficulty, mode, result)
    .run();
}

async function getPlayerByName(db, name) {
  const row = await db
    .prepare("SELECT * FROM players WHERE name = ? COLLATE NOCASE")
    .bind(name.trim())
    .first();
  if (!row) return null;
  const history = await getPlayerHistory(db, row.id);
  const player = formatPlayer(row, history);
  player.byGame = await getPlayerBreakdown(db, row.id);
  return player;
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

async function recordPvpGame(db, playerXName, playerOName, winnerMark, gameType, difficulty = null) {
  const playerX = await getOrCreatePlayer(db, playerXName);
  const playerO = await getOrCreatePlayer(db, playerOName);
  const countsToTotals = !NO_WIN_RATE_GAMES.includes(gameType);

  // Records the history row always, but only rolls the result into the
  // player's overall totals for games that have a meaningful win rate.
  const record = async (pid, opp, result) => {
    await insertHistory(db, pid, opp, gameType, "pvp", result, difficulty);
    if (countsToTotals) await applyResult(db, pid, result);
  };

  if (winnerMark === null) {
    await record(playerX.id, playerO.name, "draw");
    await record(playerO.id, playerX.name, "draw");
  } else if (winnerMark === "X") {
    await record(playerX.id, playerO.name, "win");
    await record(playerO.id, playerX.name, "loss");
  } else {
    await record(playerO.id, playerX.name, "win");
    await record(playerX.id, playerO.name, "loss");
  }

  return {
    playerX: await getPlayerByName(db, playerX.name),
    playerO: await getPlayerByName(db, playerO.name),
  };
}

async function recordPvcGame(db, playerName, winnerMark, gameType, opponent = "Computer", difficulty = null) {
  const result = winnerMark === null ? "draw" : winnerMark === "X" ? "win" : "loss";
  const player = await getOrCreatePlayer(db, playerName);
  await insertHistory(db, player.id, opponent, gameType, "pvc", result, difficulty);
  if (!NO_WIN_RATE_GAMES.includes(gameType)) {
    await applyResult(db, player.id, result);
  }
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

        if (!["ttt", "reversi", "minesweeper", "craps", "battleship", "connectfour", "gomoku"].includes(gameType)) {
          return json(400, { error: "Invalid game type" });
        }

        // AI level or board size, kept short and stored as-is for grouping.
        const rawDifficulty = typeof body.difficulty === "string" ? body.difficulty.trim() : "";
        const difficulty = rawDifficulty.slice(0, 20) || null;

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

          const result = await recordPvpGame(db, playerX, playerO, winner, gameType, difficulty);
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
            const diff = difficulty || "8x8";
            const labels = { "8x8": "8×8 grid", "15x15": "15×15 grid" };
            opponent = labels[diff] || diff;
          }

          const player = await recordPvcGame(db, playerName, winner, gameType, opponent, difficulty);
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
