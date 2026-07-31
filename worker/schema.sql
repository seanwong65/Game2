-- Run this once to initialise your D1 database:
--   npx wrangler d1 execute boardgames-db --remote --file=worker/schema.sql

CREATE TABLE IF NOT EXISTS players (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT    NOT NULL UNIQUE COLLATE NOCASE,
  wins       INTEGER NOT NULL DEFAULT 0,
  losses     INTEGER NOT NULL DEFAULT 0,
  draws      INTEGER NOT NULL DEFAULT 0,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS game_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  player_id     INTEGER NOT NULL,
  opponent_name TEXT    NOT NULL,
  game_type     TEXT    NOT NULL DEFAULT 'ttt',
  -- AI level (easy/normal/hard) or board size (8x8/15x15); NULL when the game
  -- has no difficulty setting, or for rows predating this column.
  difficulty    TEXT,
  mode          TEXT    NOT NULL CHECK (mode IN ('pvp', 'pvc')),
  result        TEXT    NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  played_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_game_history_player
  ON game_history(player_id, played_at DESC);

-- Supports the per-game / per-difficulty win-rate breakdowns.
CREATE INDEX IF NOT EXISTS idx_game_history_breakdown
  ON game_history(player_id, game_type, difficulty);

-- ── Migration for databases created before the difficulty column ──────────
-- Run once (skip if it errors with "duplicate column name"):
--   ALTER TABLE game_history ADD COLUMN difficulty TEXT;
-- Then backfill minesweeper, whose difficulty used to live in opponent_name:
--   UPDATE game_history SET difficulty = '15x15'
--     WHERE game_type = 'minesweeper' AND opponent_name LIKE '15%' AND difficulty IS NULL;
--   UPDATE game_history SET difficulty = '8x8'
--     WHERE game_type = 'minesweeper' AND opponent_name LIKE '8%' AND difficulty IS NULL;
