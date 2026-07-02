const FACE = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];

export function createLiarsDice(ctx) {
  const {
    boardEl, turnIndicator, modeBadge, playersBar, scoreBar,
    resultEl, resultText, resultStats,
    escapeHtml, persistGame, formatWinRate,
  } = ctx;

  let mode, playerXName, playerOName;
  let diceCount = [5, 5];
  let dice = [[], []];
  let currentBid = null;
  let currentPlayer = 0;
  let gameOver = false;
  let bidCount = 1;
  let bidFace = 1;

  function pName(idx) {
    return idx === 0 ? playerXName : (mode === 'pvc' ? 'Computer' : playerOName);
  }

  function rollAll() {
    dice[0] = Array.from({ length: diceCount[0] }, () => Math.floor(Math.random() * 6) + 1);
    dice[1] = Array.from({ length: diceCount[1] }, () => Math.floor(Math.random() * 6) + 1);
  }

  function totalDice() { return diceCount[0] + diceCount[1]; }

  function isValidBid(count, face) {
    if (!currentBid) return count >= 1 && face >= 1 && face <= 6;
    const { count: c, face: f } = currentBid;
    return count > c || (count === c && face > f);
  }

  function updateHeader() {
    const p0 = escapeHtml(pName(0));
    const p1 = escapeHtml(pName(1));
    playersBar.innerHTML =
      `<span class="mark-x">${p0}</span>&nbsp;${'🎲'.repeat(diceCount[0])}` +
      `&nbsp;vs&nbsp;` +
      `<span class="mark-o">${p1}</span>&nbsp;${'🎲'.repeat(diceCount[1])}`;

    scoreBar.classList.remove('hidden');
    if (currentBid) {
      scoreBar.innerHTML = `Current bid: <strong>${currentBid.count} × ${FACE[currentBid.face]}</strong>`;
    } else {
      scoreBar.innerHTML = `<span style="opacity:.55">No bid yet — make the first bid</span>`;
    }
  }

  function renderBidPhase() {
    const myDice = dice[currentPlayer];
    const hasExistingBid = !!currentBid;
    const validBid = isValidBid(bidCount, bidFace);
    const max = totalDice();

    // Compute min valid count for each face to highlight invalid face buttons
    function minCountForFace(f) {
      if (!currentBid) return 1;
      if (f > currentBid.face) return 1;
      if (f === currentBid.face) return currentBid.count + 1;
      return currentBid.count + 1; // need higher count
    }

    boardEl.className = 'board board-liars-dice';
    boardEl.innerHTML = `
      <div class="ld-game">

        <div class="ld-section">
          <div class="ld-section-label">${escapeHtml(pName(currentPlayer))}'s dice</div>
          <div class="ld-dice-row">
            ${myDice.map(d => `<span class="ld-die">${FACE[d]}</span>`).join('')}
          </div>
        </div>

        ${hasExistingBid ? `
        <div class="ld-section ld-prev-bid-section">
          <div class="ld-section-label">Current bid to beat</div>
          <div class="ld-prev-bid">
            <span class="ld-prev-count">${currentBid.count}</span>
            <span class="ld-prev-times">×</span>
            <span class="ld-prev-face">${FACE[currentBid.face]}</span>
          </div>
        </div>` : ''}

        <div class="ld-section ld-builder-section">
          <div class="ld-section-label">Your bid</div>

          <div class="ld-face-grid">
            ${[1,2,3,4,5,6].map(f => {
              const minC = minCountForFace(f);
              const reachable = minC <= max;
              const selected = f === bidFace;
              return `<button class="ld-face-btn ${selected ? 'selected' : ''} ${!reachable ? 'unreachable' : ''}"
                data-face="${f}">${FACE[f]}</button>`;
            }).join('')}
          </div>

          <div class="ld-count-row">
            <button class="ld-cnt-btn" id="ldCntDn" ${bidCount <= 1 ? 'disabled' : ''}>−</button>
            <div class="ld-count-display">
              <span class="ld-count-num">${bidCount}</span>
              <span class="ld-count-label">dice</span>
            </div>
            <button class="ld-cnt-btn" id="ldCntUp" ${bidCount >= max ? 'disabled' : ''}>+</button>
          </div>

          <div class="ld-bid-preview ${validBid ? 'valid' : 'invalid'}">
            ${validBid
              ? `Bidding <strong>${bidCount} × ${FACE[bidFace]}</strong>`
              : `Need higher than ${currentBid ? `${currentBid.count} × ${FACE[currentBid.face]}` : '—'}`}
          </div>

          <div class="ld-actions">
            <button class="btn btn-primary ld-place-btn" id="ldPlaceBid" ${validBid ? '' : 'disabled'}>
              Place Bid
            </button>
            ${hasExistingBid ? `
            <button class="ld-challenge-btn" id="ldChallenge">
              🚨 Challenge!
            </button>` : ''}
          </div>
        </div>

      </div>
    `;

    const setFace = (f) => { bidFace = f; renderBidPhase(); };
    boardEl.querySelectorAll('.ld-face-btn').forEach(btn => {
      btn.onclick = () => setFace(Number(btn.dataset.face));
    });

    document.getElementById('ldCntDn').onclick = () => { bidCount = Math.max(1, bidCount - 1); renderBidPhase(); };
    document.getElementById('ldCntUp').onclick = () => { bidCount = Math.min(max, bidCount + 1); renderBidPhase(); };
    document.getElementById('ldPlaceBid').onclick = () => { if (isValidBid(bidCount, bidFace)) doPlaceBid(bidCount, bidFace); };
    document.getElementById('ldChallenge')?.addEventListener('click', doChallenge);

    turnIndicator.textContent = `${pName(currentPlayer)}'s turn`;
  }

  function renderPassScreen() {
    const nextName = pName(currentPlayer);
    boardEl.className = 'board board-liars-dice';
    boardEl.innerHTML = `
      <div class="ld-game ld-pass-screen">
        <div class="ld-pass-icon">🤝</div>
        <div class="ld-pass-text">Pass device to <strong>${escapeHtml(nextName)}</strong></div>
        <div class="ld-pass-hint">Tap below when ready to see your dice</div>
        <button class="btn btn-primary ld-pass-btn" id="ldPassReady">I'm ready →</button>
      </div>
    `;
    document.getElementById('ldPassReady').onclick = () => renderBidPhase();
    turnIndicator.textContent = `Passing to ${nextName}…`;
  }

  function renderThinking() {
    boardEl.className = 'board board-liars-dice';
    boardEl.innerHTML = `<div class="ld-game ld-thinking">Computer is thinking…</div>`;
    turnIndicator.textContent = 'Computer thinking…';
  }

  function renderReveal(challengerIdx, bidSucceeded, actualCount, isFinal = false) {
    const bidderIdx = 1 - challengerIdx;
    const loserIdx = bidSucceeded ? challengerIdx : bidderIdx;

    boardEl.className = 'board board-liars-dice';
    boardEl.innerHTML = `
      <div class="ld-game">
        <div class="ld-reveal">
          <div class="ld-reveal-row">
            <span class="mark-x ld-reveal-name">${escapeHtml(pName(0))}</span>
            <span class="ld-dice-row">
              ${dice[0].map(d => `<span class="ld-die ${d === currentBid.face ? 'ld-die-match' : ''}">${FACE[d]}</span>`).join('')}
            </span>
          </div>
          <div class="ld-reveal-row">
            <span class="mark-o ld-reveal-name">${escapeHtml(pName(1))}</span>
            <span class="ld-dice-row">
              ${dice[1].map(d => `<span class="ld-die ${d === currentBid.face ? 'ld-die-match' : ''}">${FACE[d]}</span>`).join('')}
            </span>
          </div>
          <div class="ld-reveal-summary">
            Bid: <strong>${currentBid.count} × ${FACE[currentBid.face]}</strong>
            &nbsp;·&nbsp; Actual: <strong>${actualCount} × ${FACE[currentBid.face]}</strong>
            &nbsp;·&nbsp;
            ${bidSucceeded
              ? `Bid valid! <strong>${escapeHtml(pName(challengerIdx))}</strong> loses a die.`
              : `LIAR! <strong>${escapeHtml(pName(bidderIdx))}</strong> loses a die.`}
          </div>
        </div>
        ${!isFinal ? `<button class="btn btn-primary" id="ldNextRound">Next Round →</button>` : ''}
      </div>
    `;

    turnIndicator.textContent = `${pName(loserIdx)} loses a die!`;
    updateHeader();

    if (!isFinal) {
      document.getElementById('ldNextRound').onclick = () => {
        currentBid = null;
        bidCount = 1;
        bidFace = 1;
        rollAll();
        updateHeader();
        if (mode === 'pvp') {
          renderPassScreen();
        } else {
          renderBidPhase();
          if (currentPlayer === 1) setTimeout(computerTurn, 800);
        }
      };
    }
  }

  function doPlaceBid(count, face) {
    currentBid = { count, face };

    // Pre-set sensible next bid controls
    if (count + 1 <= totalDice()) {
      bidCount = count + 1;
      bidFace = face;
    } else {
      bidCount = count;
      bidFace = Math.min(6, face + 1);
    }

    currentPlayer = 1 - currentPlayer;
    updateHeader();

    if (mode === 'pvc' && currentPlayer === 1) {
      renderThinking();
      setTimeout(computerTurn, 900);
    } else if (mode === 'pvp') {
      renderPassScreen();
    } else {
      renderBidPhase();
    }
  }

  function doChallenge() {
    const challengerIdx = currentPlayer;
    const bidderIdx = 1 - currentPlayer;
    const allDice = [...dice[0], ...dice[1]];
    const actualCount = allDice.filter(d => d === currentBid.face).length;
    const bidSucceeded = actualCount >= currentBid.count;
    const loserIdx = bidSucceeded ? challengerIdx : bidderIdx;

    diceCount[loserIdx]--;
    currentPlayer = loserIdx;

    if (diceCount[loserIdx] === 0) {
      renderReveal(challengerIdx, bidSucceeded, actualCount, true);
      setTimeout(() => endGame(1 - loserIdx), 1800);
    } else {
      renderReveal(challengerIdx, bidSucceeded, actualCount, false);
    }
  }

  function computerTurn() {
    if (gameOver) return;

    const aiDice = dice[1];
    const total = totalDice();

    if (!currentBid) {
      const counts = Array(7).fill(0);
      for (const d of aiDice) counts[d]++;
      let bestFace = 1, bestCount = 0;
      for (let f = 1; f <= 6; f++) {
        if (counts[f] > bestCount) { bestCount = counts[f]; bestFace = f; }
      }
      doPlaceBid(Math.max(1, bestCount), bestFace);
      return;
    }

    const { count: bidC, face: bidF } = currentBid;
    const aiHas = aiDice.filter(d => d === bidF).length;
    const expected = aiHas + diceCount[0] / 6;

    if (bidC > Math.ceil(expected) + 2) {
      doChallenge();
      return;
    }

    if (bidC + 1 <= total) {
      doPlaceBid(bidC + 1, bidF);
      return;
    }
    for (let f = bidF + 1; f <= 6; f++) {
      if (isValidBid(bidC, f)) {
        doPlaceBid(bidC, f);
        return;
      }
    }
    doChallenge();
  }

  async function endGame(winnerIdx) {
    gameOver = true;
    const winnerMark = winnerIdx === 0 ? 'X' : 'O';

    if (mode === 'pvp') {
      resultText.textContent = `${pName(winnerIdx)} wins!`;
    } else {
      resultText.textContent = winnerIdx === 0 ? 'You win! 🎉' : 'Computer wins!';
    }

    resultEl.classList.remove('hidden');
    updateHeader();

    const saved = await persistGame({ mode, playerXName, playerOName, winner: winnerMark });
    if (saved) {
      resultStats.classList.remove('hidden');
      if (mode === 'pvp') {
        resultStats.textContent = `${playerXName}: ${formatWinRate(saved.playerX)} · ${playerOName}: ${formatWinRate(saved.playerO)}`;
      } else if (saved.player) {
        resultStats.textContent = `${saved.player.name}: ${formatWinRate(saved.player)} win rate`;
      }
    }
  }

  function init() {
    diceCount = [5, 5];
    currentBid = null;
    currentPlayer = 0;
    gameOver = false;
    bidCount = 1;
    bidFace = 1;
    resultEl.classList.add('hidden');
    resultStats.classList.add('hidden');
    scoreBar.classList.remove('hidden');
    rollAll();
    updateHeader();
    if (mode === 'pvp') {
      renderPassScreen();
    } else {
      renderBidPhase();
    }
  }

  return {
    start({ mode: m, playerX, playerO }) {
      mode = m;
      playerXName = playerX;
      playerOName = playerO || 'Computer';
      modeBadge.textContent = mode === 'pvp' ? '花旗骰 · PvP' : '花旗骰 · vs CPU';
      init();
    },

    restart() {
      init();
    },
  };
}
