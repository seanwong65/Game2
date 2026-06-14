const SIZE = 8;
const BLACK = "B";
const WHITE = "W";
const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];

function opponent(p) {
  return p === BLACK ? WHITE : BLACK;
}

function initialBoard() {
  const b = Array(64).fill(null);
  b[27] = WHITE;
  b[28] = BLACK;
  b[35] = BLACK;
  b[36] = WHITE;
  return b;
}

function idx(row, col) {
  return row * SIZE + col;
}

function getFlips(board, row, col, player) {
  if (board[idx(row, col)] !== null) return [];
  const flips = [];
  for (const [dr, dc] of DIRS) {
    const line = [];
    let r = row + dr;
    let c = col + dc;
    while (r >= 0 && r < SIZE && c >= 0 && c < SIZE) {
      const i = idx(r, c);
      if (board[i] === opponent(player)) {
        line.push(i);
        r += dr;
        c += dc;
      } else if (board[i] === player) {
        flips.push(...line);
        break;
      } else {
        break;
      }
    }
  }
  return flips;
}

function getValidMoves(board, player) {
  const moves = [];
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const flips = getFlips(board, r, c, player);
      if (flips.length) moves.push({ index: idx(r, c), flips });
    }
  }
  return moves;
}

function countDiscs(board) {
  let black = 0;
  let white = 0;
  for (const cell of board) {
    if (cell === BLACK) black++;
    else if (cell === WHITE) white++;
  }
  return { black, white };
}

function applyMove(board, move, player) {
  const next = board.slice();
  next[move.index] = player;
  for (const i of move.flips) next[i] = player;
  return next;
}

function evaluate(board, ai, human) {
  const { black, white } = countDiscs(board);
  const aiCount = ai === BLACK ? black : white;
  const humanCount = ai === BLACK ? white : black;
  const corners = [0, 7, 56, 63];
  let cornerBonus = 0;
  for (const c of corners) {
    if (board[c] === ai) cornerBonus += 25;
    else if (board[c] === human) cornerBonus -= 25;
  }
  const aiMoves = getValidMoves(board, ai).length;
  const humanMoves = getValidMoves(board, human).length;
  return (aiCount - humanCount) * 10 + cornerBonus + (aiMoves - humanMoves) * 3;
}

function minimax(board, depth, alpha, beta, isMax, ai, human) {
  const aiMoves = getValidMoves(board, ai);
  const humanMoves = getValidMoves(board, human);

  if (depth === 0 || (!aiMoves.length && !humanMoves.length)) {
    return evaluate(board, ai, human);
  }

  if (isMax) {
    if (!aiMoves.length) return minimax(board, depth - 1, alpha, beta, false, ai, human);
    let best = -Infinity;
    for (const move of aiMoves) {
      const next = applyMove(board, move, ai);
      best = Math.max(best, minimax(next, depth - 1, alpha, beta, false, ai, human));
      alpha = Math.max(alpha, best);
      if (beta <= alpha) break;
    }
    return best;
  }

  if (!humanMoves.length) return minimax(board, depth - 1, alpha, beta, true, ai, human);
  let best = Infinity;
  for (const move of humanMoves) {
    const next = applyMove(board, move, human);
    best = Math.min(best, minimax(next, depth - 1, alpha, beta, true, ai, human));
    beta = Math.min(beta, best);
    if (beta <= alpha) break;
  }
  return best;
}

function findBestMove(board, ai, human) {
  const moves = getValidMoves(board, ai);
  if (!moves.length) return null;
  let bestMove = moves[0];
  let bestScore = -Infinity;
  for (const move of moves) {
    const next = applyMove(board, move, ai);
    const score = minimax(next, 4, -Infinity, Infinity, false, ai, human);
    if (score > bestScore) {
      bestScore = score;
      bestMove = move;
    }
  }
  return bestMove;
}

export function createReversi(ctx) {
  const { boardEl, turnIndicator, modeBadge, playersBar, scoreBar, resultEl, resultText, resultStats, escapeHtml, persistGame, formatWinRate } = ctx;

  let mode = null;
  let board = initialBoard();
  let current = BLACK;
  let gameOver = false;
  let humanColor = BLACK;
  let computerColor = WHITE;
  let playerBlackName = "";
  let playerWhiteName = "";
  let validIndices = new Set();

  function updateScore() {
    const { black, white } = countDiscs(board);
    scoreBar.innerHTML = `<span class="mark-black">● ${black}</span> · <span class="mark-white">○ ${white}</span>`;
  }

  function refreshValidMoves() {
    const moves = getValidMoves(board, current);
    validIndices = new Set(moves.map((m) => m.index));
  }

  function initBoard() {
    boardEl.className = "board board-reversi";
    boardEl.innerHTML = "";
    for (let i = 0; i < 64; i++) {
      const cell = document.createElement("button");
      cell.className = "cell cell-reversi";
      cell.dataset.index = i;
      cell.addEventListener("click", () => handleCellClick(i));
      boardEl.appendChild(cell);
    }
  }

  function renderCells() {
    const cells = boardEl.querySelectorAll(".cell");
    cells.forEach((cell, i) => {
      const v = board[i];
      cell.textContent = "";
      cell.classList.remove("disc-black", "disc-white", "valid-move");
      if (v === BLACK) {
        cell.classList.add("disc-black");
      } else if (v === WHITE) {
        cell.classList.add("disc-white");
      } else if (!gameOver && validIndices.has(i)) {
        cell.classList.add("valid-move");
      }
      cell.disabled = gameOver || v !== null || !validIndices.has(i);
    });
    updateScore();
  }

  function updateUI() {
    renderCells();
    if (gameOver) return;

    const name = current === BLACK ? playerBlackName : playerWhiteName;
    const markClass = current === BLACK ? "mark-black" : "mark-white";
    const disc = current === BLACK ? "●" : "○";

    if (mode === "pvp") {
      turnIndicator.innerHTML = `${escapeHtml(name)}'s turn (<span class="${markClass}">${disc}</span>)`;
    } else {
      const isHuman = current === humanColor;
      turnIndicator.textContent = isHuman ? "Your turn" : "Computer thinking…";
      boardEl.classList.toggle("thinking", !isHuman);
      if (!isHuman) {
        boardEl.querySelectorAll(".cell").forEach((c) => (c.disabled = true));
      }
    }
  }

  function resolveWinnerMark() {
    const { black, white } = countDiscs(board);
    if (black > white) return "X";
    if (white > black) return "O";
    return null;
  }

  async function endGame() {
    gameOver = true;
    const { black, white } = countDiscs(board);
    const winnerMark = resolveWinnerMark();

    if (winnerMark === null) {
      resultText.textContent = `Draw! ${black} – ${white}`;
    } else if (mode === "pvp") {
      const name = winnerMark === "X" ? playerBlackName : playerWhiteName;
      resultText.textContent = `${name} wins! (${black} – ${white})`;
    } else if (winnerMark === "X") {
      resultText.textContent = `You win! (${black} – ${white})`;
    } else {
      resultText.textContent = `Computer wins! (${black} – ${white})`;
    }

    resultEl.classList.remove("hidden");
    updateUI();

    const saved = await persistGame({
      mode,
      playerXName: playerBlackName,
      playerOName: playerWhiteName,
      winner: winnerMark,
    });

    if (saved) {
      resultStats.classList.remove("hidden");
      if (mode === "pvp") {
        resultStats.textContent = `${playerBlackName}: ${formatWinRate(saved.playerX)} · ${playerWhiteName}: ${formatWinRate(saved.playerO)}`;
      } else if (saved.player) {
        resultStats.textContent = `${saved.player.name}: ${formatWinRate(saved.player)} win rate`;
      }
    }
  }

  function advanceTurn() {
    const next = opponent(current);
    const nextMoves = getValidMoves(board, next);
    if (nextMoves.length) {
      current = next;
      refreshValidMoves();
      updateUI();
      if (mode === "pvc" && current === computerColor) {
        setTimeout(computerMove, 500);
      }
      return;
    }

    const curMoves = getValidMoves(board, current);
    if (curMoves.length) {
      refreshValidMoves();
      turnIndicator.textContent = `${opponent(current === BLACK ? playerBlackName : playerWhiteName)} must pass`;
      updateUI();
      if (mode === "pvc" && current === computerColor) {
        setTimeout(computerMove, 500);
      }
      return;
    }

    endGame();
  }

  function playMove(move) {
    board = applyMove(board, move, current);
    advanceTurn();
  }

  function handleCellClick(index) {
    if (gameOver || !validIndices.has(index)) return;
    if (mode === "pvc" && current !== humanColor) return;

    const row = Math.floor(index / SIZE);
    const col = index % SIZE;
    const flips = getFlips(board, row, col, current);
    if (!flips.length) return;

    playMove({ index, flips });
  }

  function computerMove() {
    if (gameOver) return;
    const move = findBestMove(board, computerColor, humanColor);
    if (move) {
      playMove(move);
    } else {
      advanceTurn();
    }
  }

  return {
    start({ mode: m, playerX, playerO }) {
      mode = m;
      playerBlackName = playerX;
      playerWhiteName = playerO;
      board = initialBoard();
      current = BLACK;
      gameOver = false;
      humanColor = BLACK;
      computerColor = WHITE;

      scoreBar.classList.remove("hidden");
      modeBadge.textContent = mode === "pvp" ? "Reversi · PvP" : "Reversi · vs CPU";
      playersBar.innerHTML =
        mode === "pvp"
          ? `<span class="mark-black">${escapeHtml(playerBlackName)}</span> (●) vs <span class="mark-white">${escapeHtml(playerWhiteName)}</span> (○)`
          : `<span class="mark-black">${escapeHtml(playerBlackName)}</span> (you) vs <span class="mark-white">Computer</span>`;

      resultEl.classList.add("hidden");
      resultStats.classList.add("hidden");
      boardEl.classList.remove("thinking");
      initBoard();
      refreshValidMoves();
      updateUI();
    },

    restart() {
      board = initialBoard();
      current = BLACK;
      gameOver = false;
      resultEl.classList.add("hidden");
      resultStats.classList.add("hidden");
      boardEl.classList.remove("thinking");
      refreshValidMoves();
      updateUI();
    },
  };
}
