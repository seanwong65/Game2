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
  mode          TEXT    NOT NULL CHECK (mode IN ('pvp', 'pvc')),
  result        TEXT    NOT NULL CHECK (result IN ('win', 'loss', 'draw')),
  played_at     TEXT    NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (player_id) REFERENCES players(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_game_history_player
  ON game_history(player_id, played_at DESC);
