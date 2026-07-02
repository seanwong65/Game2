import { loadLeaderboard, loadPlayer, saveGame } from "./api.js";
import { createTicTacToe } from "./games/tictactoe.js";
import { createReversi } from "./games/reversi.js";
import { createMinesweeper } from "./games/minesweeper.js";
import { createCraps } from "./games/craps.js";
import { createBattleship } from "./games/battleship.js";

const GAME_META = {
  ttt: {
    title: "Tic Tac Toe",
    subtitle: "Choose a mode and start playing",
    pvpLabels: { x: "Player X", o: "Player O", xPh: "Name for X", oPh: "Name for O" },
    pvcLabels: { x: "Your name", xPh: "Your name" },
    storageKey: "ttt_player_name",
    solo: false,
  },
  reversi: {
    title: "Reversi",
    subtitle: "Black moves first — choose a mode",
    pvpLabels: { x: "Black (●)", o: "White (○)", xPh: "Black player", oPh: "White player" },
    pvcLabels: { x: "Your name", xPh: "Your name" },
    storageKey: "reversi_player_name",
    solo: false,
  },
  minesweeper: {
    title: "Minesweeper",
    subtitle: "Choose a board size",
    pvcLabels: { x: "Your name", xPh: "Your name" },
    storageKey: "minesweeper_player_name",
    solo: true,
  },
  battleship: {
    title: "海戰棋",
    subtitle: "佈局艦隊，擊沉對手",
    pvpLabels: { x: "玩家 1", o: "玩家 2", xPh: "玩家 1 名字", oPh: "玩家 2 名字" },
    pvcLabels: { x: "你的名字", xPh: "你的名字" },
    storageKey: "battleship_player_name",
    solo: false,
  },
  craps: {
    title: "花旗骰",
    subtitle: "Pass Line, Don't Pass — roll the dice",
    pvcLabels: { x: "Your name", xPh: "Your name" },
    storageKey: "craps_player_name",
    solo: false,
    casino: true, // skip mode select, always vs house
  },
};

const gameSelect = document.getElementById("gameSelect");
const modeSelect = document.getElementById("modeSelect");
const difficultySelect = document.getElementById("difficultySelect");
const setupSection = document.getElementById("setupSection");
const setupForm = document.getElementById("setupForm");
const setupTitle = document.getElementById("setupTitle");
const playerXInput = document.getElementById("playerXInput");
const playerOInput = document.getElementById("playerOInput");
const playerOField = document.getElementById("playerOField");
const playerXLabel = document.getElementById("playerXLabel");
const setupBackBtn = document.getElementById("setupBackBtn");
const gameSelectBackBtn = document.getElementById("gameSelectBackBtn");
const difficultyBackBtn = document.getElementById("difficultyBackBtn");
const statsList = document.getElementById("statsList");
const statsEmpty = document.getElementById("statsEmpty");
const historyPanel = document.getElementById("historyPanel");
const historyTitle = document.getElementById("historyTitle");
const historyList = document.getElementById("historyList");
const gameSection = document.getElementById("gameSection");
const boardEl = document.getElementById("board");
const turnIndicator = document.getElementById("turnIndicator");
const modeBadge = document.getElementById("modeBadge");
const playersBar = document.getElementById("playersBar");
const scoreBar = document.getElementById("scoreBar");
const resultEl = document.getElementById("result");
const resultText = document.getElementById("resultText");
const resultStats = document.getElementById("resultStats");
const restartBtn = document.getElementById("restartBtn");
const changeModeBtn = document.getElementById("changeModeBtn");
const appTitle = document.getElementById("appTitle");
const appSubtitle = document.getElementById("appSubtitle");
const appRoot = document.getElementById("appRoot");

let selectedGame = null;
let pendingMode = null;
let pendingDifficulty = null;
let activeGame = null;

const gameContext = {
  boardEl,
  turnIndicator,
  modeBadge,
  playersBar,
  scoreBar,
  resultEl,
  resultText,
  resultStats,
  appRoot,
  escapeHtml,
  formatWinRate,
  persistGame,
  persistMinesweeper,
};

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function formatWinRate(player) {
  return `${player.winRate}% (${player.wins}W / ${player.losses}L / ${player.draws}D)`;
}

function hideAllScreens() {
  gameSelect.classList.add("hidden");
  modeSelect.classList.add("hidden");
  difficultySelect.classList.add("hidden");
  setupSection.classList.add("hidden");
  gameSection.classList.add("hidden");
}

async function persistGame({ mode, playerXName, playerOName, winner }) {
  try {
    const payload = { gameType: selectedGame, mode, winner };
    if (mode === "pvp") {
      payload.playerX = playerXName;
      payload.playerO = playerOName;
      const data = await saveGame(payload);
      await refreshLeaderboard();
      return data;
    }
    payload.playerName = playerXName;
    const data = await saveGame(payload);
    await refreshLeaderboard();
    return data;
  } catch (err) {
    console.error("Failed to save game:", err);
    return null;
  }
}

async function persistMinesweeper({ playerName, difficulty, won }) {
  try {
    const data = await saveGame({
      gameType: "minesweeper",
      mode: "pvc",
      playerName,
      winner: won ? "X" : "O",
      difficulty,
    });
    await refreshLeaderboard();
    return data;
  } catch (err) {
    console.error("Failed to save game:", err);
    return null;
  }
}

function createGameController() {
  if (selectedGame === "reversi") return createReversi(gameContext);
  if (selectedGame === "minesweeper") return createMinesweeper(gameContext);
  if (selectedGame === "battleship") return createBattleship(gameContext);
  if (selectedGame === "craps") return createCraps(gameContext);
  return createTicTacToe(gameContext);
}

function showGameSelect() {
  selectedGame = null;
  pendingMode = null;
  pendingDifficulty = null;
  activeGame?.destroy?.();
  activeGame = null;
  hideAllScreens();
  gameSelect.classList.remove("hidden");
  scoreBar.classList.add("hidden");
  appRoot?.classList.remove("app-wide");
  appTitle.textContent = "Board Games";
  appSubtitle.textContent = "Choose a game to play";
  changeModeBtn.textContent = "Change Mode";
  refreshLeaderboard();
}

function showModeSelect(game) {
  selectedGame = game;
  activeGame?.destroy?.();
  activeGame = null;
  const meta = GAME_META[game];
  hideAllScreens();

  appTitle.textContent = meta.title;
  appSubtitle.textContent = meta.subtitle;

  if (meta.casino) {
    // Skip mode select — always vs house
    showSetup("pvc");
    changeModeBtn.textContent = "Change Game";
  } else if (meta.solo) {
    difficultySelect.classList.remove("hidden");
    changeModeBtn.textContent = "Change Difficulty";
  } else {
    modeSelect.classList.remove("hidden");
    changeModeBtn.textContent = "Change Mode";
  }
}

function showSetup(modeOrDifficulty) {
  const meta = GAME_META[selectedGame];

  if (meta.solo) {
    pendingDifficulty = modeOrDifficulty;
    pendingMode = "solo";
  } else {
    pendingMode = modeOrDifficulty;
  }

  hideAllScreens();
  setupSection.classList.remove("hidden");

  const isPvp = pendingMode === "pvp" && meta.pvpLabels;

  if (isPvp) {
    playerOField.classList.remove("hidden");
    playerOInput.required = true;
    setupTitle.textContent = "Enter player names";
    playerXLabel.textContent = meta.pvpLabels.x;
    playerXInput.placeholder = meta.pvpLabels.xPh;
    document.getElementById("playerOLabel").textContent = meta.pvpLabels.o;
    playerOInput.placeholder = meta.pvpLabels.oPh;
    playerOInput.value = "";
  } else {
    playerOField.classList.add("hidden");
    playerOInput.required = false;
    setupTitle.textContent = "Enter your name";
    playerXLabel.textContent = meta.pvcLabels.x;
    playerXInput.placeholder = meta.pvcLabels.xPh;
    playerOInput.value = "";
  }

  playerXInput.value = localStorage.getItem(meta.storageKey) || "";
}

function startGame() {
  const playerX = playerXInput.value.trim();
  localStorage.setItem(GAME_META[selectedGame].storageKey, playerX);

  activeGame = createGameController();
  hideAllScreens();
  gameSection.classList.remove("hidden");

  if (selectedGame === "minesweeper") {
    activeGame.start({ difficulty: pendingDifficulty, playerX });
  } else if (GAME_META[selectedGame].casino) {
    activeGame.start({ playerX });
  } else {
    const mode = pendingMode;
    const playerO = mode === "pvp" ? playerOInput.value.trim() : "Computer";
    activeGame.start({ mode, playerX, playerO });
  }
}

function backFromSetup() {
  setupSection.classList.add("hidden");
  showModeSelect(selectedGame);
}

function backToGameSelect() {
  showGameSelect();
}

function resultLabel(result) {
  return { win: "Won", loss: "Lost", draw: "Draw" }[result] || result;
}

function gameTypeLabel(type) {
  return { ttt: "Tic Tac Toe", reversi: "Reversi", minesweeper: "Minesweeper" }[type] || type;
}

async function showPlayerHistory(name) {
  try {
    const { player } = await loadPlayer(name);
    historyTitle.textContent = `${player.name} — ${player.winRate}% win rate`;
    historyList.innerHTML = "";

    if (!player.history?.length) {
      const li = document.createElement("li");
      li.className = "history-item";
      li.textContent = "No games yet.";
      historyList.appendChild(li);
    } else {
      player.history.forEach((game) => {
        const li = document.createElement("li");
        li.className = `history-item history-${game.result}`;
        const modeLabel =
          game.gameType === "minesweeper"
            ? game.opponentName
            : game.mode === "pvp"
              ? "PvP"
              : "vs CPU";
        const typeLabel = gameTypeLabel(game.gameType || "ttt");
        li.textContent = `${resultLabel(game.result)} · ${typeLabel} (${modeLabel}) · ${game.playedAt}`;
        historyList.appendChild(li);
      });
    }

    historyPanel.classList.remove("hidden");
  } catch {
    historyPanel.classList.add("hidden");
  }
}

function renderLeaderboard(players) {
  statsList.innerHTML = "";
  historyPanel.classList.add("hidden");

  if (!players.length) {
    statsEmpty.classList.remove("hidden");
    return;
  }

  statsEmpty.classList.add("hidden");

  players.forEach((player) => {
    const li = document.createElement("li");
    li.className = "stats-item";
    li.innerHTML = `
      <div class="stats-item-header">
        <strong>${escapeHtml(player.name)}</strong>
        <span class="stats-rate">${player.winRate}%</span>
      </div>
      <div class="stats-item-meta">${player.wins}W · ${player.losses}L · ${player.draws}D · ${player.gamesPlayed} games</div>
    `;
    li.addEventListener("click", () => showPlayerHistory(player.name));
    statsList.appendChild(li);
  });
}

async function refreshLeaderboard() {
  try {
    const { players } = await loadLeaderboard();
    renderLeaderboard(players);
  } catch {
    statsEmpty.textContent = "Start the server to view stats.";
    statsEmpty.classList.remove("hidden");
    statsList.innerHTML = "";
  }
}

gameSelect.querySelectorAll(".game-btn").forEach((btn) => {
  btn.addEventListener("click", () => showModeSelect(btn.dataset.game));
});

modeSelect.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => showSetup(btn.dataset.mode));
});

difficultySelect.querySelectorAll(".mode-btn").forEach((btn) => {
  btn.addEventListener("click", () => showSetup(btn.dataset.difficulty));
});

setupForm.addEventListener("submit", (e) => {
  e.preventDefault();
  startGame();
});

setupBackBtn.addEventListener("click", backFromSetup);
gameSelectBackBtn.addEventListener("click", showGameSelect);
difficultyBackBtn.addEventListener("click", showGameSelect);
changeModeBtn.addEventListener("click", () => {
  if (selectedGame) showModeSelect(selectedGame);
  else showGameSelect();
});
restartBtn.addEventListener("click", () => activeGame?.restart());

refreshLeaderboard();
