const WIN_LINES = [
  [0, 1, 2], [3, 4, 5], [6, 7, 8],
  [0, 3, 6], [1, 4, 7], [2, 5, 8],
  [0, 4, 8], [2, 4, 6],
];

export function createTicTacToe(ctx) {
  const { boardEl, turnIndicator, modeBadge, playersBar, resultEl, resultText, resultStats, escapeHtml, persistGame, formatGameWinRate } = ctx;

  let mode = null;
  let board = Array(9).fill(null);
  let currentPlayer = "X";
  let gameOver = false;
  let humanMark = "X";
  let computerMark = "O";
  let playerXName = "";
  let playerOName = "";

  function initBoard() {
    boardEl.className = "board board-ttt";
    boardEl.innerHTML = "";
    for (let i = 0; i < 9; i++) {
      const cell = document.createElement("button");
      cell.className = "cell";
      cell.dataset.index = i;
      cell.setAttribute("aria-label", `Cell ${i + 1}`);
      cell.addEventListener("click", () => handleCellClick(i));
      boardEl.appendChild(cell);
    }
  }

  function getWinner(b) {
    for (const [a, c, d] of WIN_LINES) {
      if (b[a] && b[a] === b[c] && b[a] === b[d]) {
        return { winner: b[a], line: [a, c, d] };
      }
    }
    if (b.every((cell) => cell !== null)) {
      return { winner: null, line: null };
    }
    return null;
  }

  function updateUI() {
    const cells = boardEl.querySelectorAll(".cell");
    cells.forEach((cell, i) => {
      cell.textContent = board[i] || "";
      cell.classList.toggle("mark-x", board[i] === "X");
      cell.classList.toggle("mark-o", board[i] === "O");
      cell.classList.toggle("taken", board[i] !== null);
      cell.disabled = gameOver || board[i] !== null;
      cell.classList.remove("winning");
    });

    if (gameOver) return;

    if (mode === "pvp") {
      const name = currentPlayer === "X" ? playerXName : playerOName;
      turnIndicator.innerHTML = `${escapeHtml(name)}'s turn (<span class="mark-${currentPlayer.toLowerCase()}">${currentPlayer}</span>)`;
    } else {
      const isHumanTurn = currentPlayer === humanMark;
      turnIndicator.textContent = isHumanTurn ? "Your turn" : "Computer thinking…";
      boardEl.classList.toggle("thinking", !isHumanTurn);
      cells.forEach((cell) => {
        if (!isHumanTurn) cell.disabled = true;
      });
    }
  }

  async function endGame(winner, line) {
    gameOver = true;
    if (line) {
      line.forEach((i) => boardEl.children[i].classList.add("winning"));
    }

    if (winner === null) {
      resultText.textContent = "It's a draw!";
    } else if (mode === "pvp") {
      resultText.textContent = `${winner === "X" ? playerXName : playerOName} wins!`;
    } else if (winner === humanMark) {
      resultText.textContent = "You win!";
    } else {
      resultText.textContent = "Computer wins!";
    }

    resultEl.classList.remove("hidden");
    updateUI();

    const saved = await persistGame({ mode, playerXName, playerOName, winner });
    if (saved) {
      resultStats.classList.remove("hidden");
      if (mode === "pvp") {
        resultStats.textContent = `${playerXName}: ${formatGameWinRate(saved.playerX, null)} · ${playerOName}: ${formatGameWinRate(saved.playerO, null)}`;
      } else if (saved.player) {
        resultStats.textContent = `${saved.player.name}: ${formatGameWinRate(saved.player, null)}`;
      }
    }
  }

  function handleCellClick(index) {
    if (gameOver || board[index] !== null) return;
    if (mode === "pvc" && currentPlayer !== humanMark) return;

    board[index] = currentPlayer;
    currentPlayer = currentPlayer === "X" ? "O" : "X";
    updateUI();

    const outcome = getWinner(board);
    if (outcome) {
      endGame(outcome.winner, outcome.line);
      return;
    }

    if (mode === "pvc" && currentPlayer === computerMark) {
      setTimeout(computerMove, 400);
    }
  }

  function computerMove() {
    if (gameOver) return;
    const index = findBestMove(board, computerMark, humanMark);
    board[index] = computerMark;
    currentPlayer = humanMark;
    updateUI();
    const outcome = getWinner(board);
    if (outcome) endGame(outcome.winner, outcome.line);
  }

  function findBestMove(b, ai, human) {
    let bestScore = -Infinity;
    let bestMove = -1;
    for (let i = 0; i < 9; i++) {
      if (b[i] === null) {
        b[i] = ai;
        const score = minimax(b, 0, false, ai, human);
        b[i] = null;
        if (score > bestScore) {
          bestScore = score;
          bestMove = i;
        }
      }
    }
    return bestMove;
  }

  function minimax(b, depth, isMaximizing, ai, human) {
    const outcome = getWinner(b);
    if (outcome) {
      if (outcome.winner === ai) return 10 - depth;
      if (outcome.winner === human) return depth - 10;
      return 0;
    }
    if (isMaximizing) {
      let best = -Infinity;
      for (let i = 0; i < 9; i++) {
        if (b[i] === null) {
          b[i] = ai;
          best = Math.max(best, minimax(b, depth + 1, false, ai, human));
          b[i] = null;
        }
      }
      return best;
    }
    let best = Infinity;
    for (let i = 0; i < 9; i++) {
      if (b[i] === null) {
        b[i] = human;
        best = Math.min(best, minimax(b, depth + 1, true, ai, human));
        b[i] = null;
      }
    }
    return best;
  }

  return {
    start({ mode: m, playerX, playerO }) {
      mode = m;
      playerXName = playerX;
      playerOName = playerO;
      board = Array(9).fill(null);
      currentPlayer = "X";
      gameOver = false;
      humanMark = "X";
      computerMark = "O";

      modeBadge.textContent = mode === "pvp" ? "Tic Tac Toe · PvP" : "Tic Tac Toe · vs CPU";
      playersBar.innerHTML =
        mode === "pvp"
          ? `<span class="mark-x">${escapeHtml(playerXName)}</span> (X) vs <span class="mark-o">${escapeHtml(playerOName)}</span> (O)`
          : `<span class="mark-x">${escapeHtml(playerXName)}</span> (you) vs <span class="mark-o">Computer</span>`;

      resultEl.classList.add("hidden");
      resultStats.classList.add("hidden");
      boardEl.classList.remove("thinking");
      initBoard();
      updateUI();
    },

    restart() {
      board = Array(9).fill(null);
      currentPlayer = "X";
      gameOver = false;
      resultEl.classList.add("hidden");
      resultStats.classList.add("hidden");
      boardEl.classList.remove("thinking");
      initBoard();
      updateUI();
    },
  };
}
