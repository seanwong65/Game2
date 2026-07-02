const GRID = 10;
const SHIPS_DEF = [
  { id: 'carrier',    name: '航母',   size: 5 },
  { id: 'battleship', name: '戰艦',   size: 4 },
  { id: 'cruiser',    name: '巡洋艦', size: 3 },
  { id: 'submarine',  name: '潛艇',   size: 3 },
  { id: 'destroyer',  name: '驅逐艦', size: 2 },
];
const ROW_LBL = ['A','B','C','D','E','F','G','H','I','J'];

export function createBattleship(ctx) {
  const {
    boardEl, turnIndicator, modeBadge, playersBar, scoreBar,
    resultEl, resultText, resultStats,
    escapeHtml, persistGame, formatWinRate, appRoot,
  } = ctx;

  let gameMode = 'pvc';
  let playerNames = ['', '電腦'];
  let placeAC = null; // AbortController for placement event listeners

  // phase: difficulty | placement | pvp-place-cover | battle | game-over
  let phase = 'placement';
  let aiDifficulty = 'hard';
  let placingPlayer = 0;
  let placingHoriz = true;
  let selectedShipIdx = 0;
  let hoverR = -1, hoverC = -1;
  let isDragging = false;
  let touchDragActive = false;
  let movingShipIdx = -1; // ship picked up for repositioning (-1 = none)
  let noAdj = true; // when true, auto-place keeps a 1-cell buffer between ships
  let borderLimit = null; // null = unlimited; number = max border cells across all ships
  let activePlayer = 0;
  let message = '';
  let messageType = 'neutral';

  // [idx]: 10x10 of shipId|null (ship positions)
  let grids = [null, null];
  // [idx]: 10x10 of 'hit'|'miss'|'sunk'|null (shots FIRED BY idx)
  let fired = [null, null];
  // [idx]: array of ship objects
  let ships = [null, null];


  // ── helpers ──────────────────────────────────────────────────────────

  function makeGrid() {
    return Array.from({ length: GRID }, () => Array(GRID).fill(null));
  }

  function initPlayer(idx) {
    grids[idx] = makeGrid();
    fired[idx] = makeGrid();
    ships[idx] = SHIPS_DEF.map(s => ({ ...s, cells: [], sunk: false }));
  }

  function shipCells(size, r, c, horiz) {
    const cells = [];
    for (let i = 0; i < size; i++) {
      const nr = horiz ? r : r + i;
      const nc = horiz ? c + i : c;
      if (nr >= GRID || nc >= GRID) return null;
      cells.push([nr, nc]);
    }
    return cells;
  }

  function unplaceShip(pIdx, shipIdx) {
    const ship = ships[pIdx][shipIdx];
    ship.cells.forEach(({ r, c }) => { grids[pIdx][r][c] = null; });
    ship.cells = [];
    ship.sunk = false;
  }

  function rotateShipInPlace(pIdx, shipIdx) {
    const ship = ships[pIdx][shipIdx];
    if (!ship.cells.length) { placingHoriz = !placingHoriz; return; }
    const anchor = ship.cells[0];
    const curHoriz = ship.cells.every(({ r }) => r === anchor.r);
    const newHoriz = !curHoriz;
    const saved = ship.cells.map(({ r, c }) => ({ r, c }));
    unplaceShip(pIdx, shipIdx);
    if (!tryPlace(pIdx, shipIdx, anchor.r, anchor.c, newHoriz)) {
      // rotation out of bounds — restore original position
      saved.forEach(({ r, c }) => { grids[pIdx][r][c] = ship.id; });
      ship.cells = saved;
    }
    placingHoriz = newHoriz;
  }

  function tryPlace(pIdx, shipIdx, r, c, horiz) {
    const ship = ships[pIdx][shipIdx];
    const cells = shipCells(ship.size, r, c, horiz);
    if (!cells) return false;
    if (!cells.every(([cr, cc]) => grids[pIdx][cr][cc] === null)) return false;
    cells.forEach(([cr, cc]) => { grids[pIdx][cr][cc] = ship.id; });
    ship.cells = cells.map(([cr, cc]) => ({ r: cr, c: cc }));
    return true;
  }

  function tryPlaceNoAdj(pIdx, shipIdx, r, c, horiz) {
    const ship = ships[pIdx][shipIdx];
    const cells = shipCells(ship.size, r, c, horiz);
    if (!cells) return false;
    if (!cells.every(([cr, cc]) => grids[pIdx][cr][cc] === null)) return false;
    // Check 8-direction neighbours are empty
    for (const [cr, cc] of cells)
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = cr + dr, nc = cc + dc;
          if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID && grids[pIdx][nr][nc] !== null) return false;
        }
    cells.forEach(([cr, cc]) => { grids[pIdx][cr][cc] = ship.id; });
    ship.cells = cells.map(([cr, cc]) => ({ r: cr, c: cc }));
    return true;
  }

  function isBorderCell(r, c) {
    return r === 0 || r === GRID - 1 || c === 0 || c === GRID - 1;
  }

  function autoPlace(pIdx) {
    initPlayer(pIdx);
    const place = (pIdx === 0 && noAdj) ? tryPlaceNoAdj : tryPlace;
    let borderUsed = 0;
    SHIPS_DEF.forEach((_, shipIdx) => {
      let ok = false;
      for (let t = 0; !ok && t < 5000; t++) {
        const r = Math.floor(Math.random() * GRID);
        const c = Math.floor(Math.random() * GRID);
        const horiz = Math.random() < 0.5;
        // Check border limit before attempting placement
        if (pIdx === 0 && borderLimit !== null) {
          const cells = shipCells(ships[pIdx][shipIdx].size, r, c, horiz);
          if (!cells) continue;
          const borderCount = cells.filter(([cr, cc]) => isBorderCell(cr, cc)).length;
          if (borderUsed + borderCount > borderLimit) continue;
        }
        ok = place(pIdx, shipIdx, r, c, horiz);
        if (ok && pIdx === 0 && borderLimit !== null) {
          borderUsed += ships[pIdx][shipIdx].cells.filter(({ r: sr, c: sc }) => isBorderCell(sr, sc)).length;
        }
      }
    });
  }

  function shoot(shooterIdx, r, c) {
    if (fired[shooterIdx][r][c] !== null) return false;
    const oppIdx = 1 - shooterIdx;
    const shipId = grids[oppIdx][r][c];
    if (shipId) {
      fired[shooterIdx][r][c] = 'hit';
      const ship = ships[oppIdx].find(s => s.id === shipId);
      if (ship.cells.every(({ r: sr, c: sc }) => fired[shooterIdx][sr][sc] === 'hit')) {
        ship.sunk = true;
        ship.cells.forEach(({ r: sr, c: sc }) => { fired[shooterIdx][sr][sc] = 'sunk'; });
        return { hit: true, sunk: ship };
      }
      return { hit: true, sunk: null };
    }
    fired[shooterIdx][r][c] = 'miss';
    return { hit: false, sunk: null };
  }

  function allSunk(playerIdx) {
    return ships[playerIdx].every(s => s.sunk);
  }

  // ── AI ───────────────────────────────────────────────────────────────

  function aiPickEasy() {
    // Simple: adjacent to any hit, else checkerboard
    const candidates = [];
    for (let i = 0; i < GRID; i++)
      for (let j = 0; j < GRID; j++)
        if (fired[1][i][j] === 'hit')
          [[i-1,j],[i+1,j],[i,j-1],[i,j+1]].forEach(([nr, nc]) => {
            if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID &&
                fired[1][nr][nc] === null &&
                !candidates.some(([ar, ac]) => ar === nr && ac === nc))
              candidates.push([nr, nc]);
          });
    if (candidates.length) return candidates[Math.floor(Math.random() * candidates.length)];
    const hunt = [];
    for (let i = 0; i < GRID; i++)
      for (let j = 0; j < GRID; j++)
        if (fired[1][i][j] === null && (i + j) % 2 === 0) hunt.push([i, j]);
    if (!hunt.length)
      for (let i = 0; i < GRID; i++)
        for (let j = 0; j < GRID; j++)
          if (fired[1][i][j] === null) hunt.push([i, j]);
    return hunt[Math.floor(Math.random() * hunt.length)];
  }

  function aiPickTarget() {
    // Collect all unsunk hit cells
    const hits = [];
    for (let i = 0; i < GRID; i++)
      for (let j = 0; j < GRID; j++)
        if (fired[1][i][j] === 'hit') hits.push({ r: i, c: j });

    if (hits.length === 0) {
      // Hunt phase: checkerboard pattern
      const avail = [];
      for (let i = 0; i < GRID; i++)
        for (let j = 0; j < GRID; j++)
          if (fired[1][i][j] === null && (i + j) % 2 === 0) avail.push([i, j]);
      if (!avail.length)
        for (let i = 0; i < GRID; i++)
          for (let j = 0; j < GRID; j++)
            if (fired[1][i][j] === null) avail.push([i, j]);
      return avail[Math.floor(Math.random() * avail.length)];
    }

    // Target phase: group hits by row and column to detect direction
    const rowGroups = {}, colGroups = {};
    hits.forEach(({ r, c }) => {
      (rowGroups[r] = rowGroups[r] || []).push(c);
      (colGroups[c] = colGroups[c] || []).push(r);
    });

    const directional = [];

    // Extend row lines (2+ hits in same row → go left/right)
    Object.entries(rowGroups).forEach(([row, cols]) => {
      if (cols.length < 2) return;
      const r = Number(row);
      const sorted = [...cols].sort((a, b) => a - b);
      const lo = sorted[0], hi = sorted[sorted.length - 1];
      if (hi + 1 < GRID && fired[1][r][hi + 1] === null) directional.push([r, hi + 1]);
      if (lo - 1 >= 0   && fired[1][r][lo - 1] === null) directional.push([r, lo - 1]);
    });

    // Extend col lines (2+ hits in same col → go up/down)
    Object.entries(colGroups).forEach(([col, rows]) => {
      if (rows.length < 2) return;
      const c = Number(col);
      const sorted = [...rows].sort((a, b) => a - b);
      const lo = sorted[0], hi = sorted[sorted.length - 1];
      if (hi + 1 < GRID && fired[1][hi + 1][c] === null) directional.push([hi + 1, c]);
      if (lo - 1 >= 0   && fired[1][lo - 1][c] === null) directional.push([lo - 1, c]);
    });

    if (directional.length > 0)
      return directional[Math.floor(Math.random() * directional.length)];

    // No direction yet — try all 4 neighbours of every hit cell
    const adj = [];
    hits.forEach(({ r, c }) => {
      [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].forEach(([nr, nc]) => {
        if (nr >= 0 && nr < GRID && nc >= 0 && nc < GRID &&
            fired[1][nr][nc] === null &&
            !adj.some(([ar, ac]) => ar === nr && ac === nc))
          adj.push([nr, nc]);
      });
    });
    return adj[Math.floor(Math.random() * adj.length)];
  }

  function aiMove() {
    const [r, c] = aiDifficulty === 'hard' ? aiPickTarget() : aiPickEasy();
    const result = shoot(1, r, c);
    return { r, c, result };
  }

  // ── Game logic ───────────────────────────────────────────────────────

  function handleShot(r, c) {
    const shooter = activePlayer;
    const target = 1 - shooter;
    const result = shoot(shooter, r, c);
    if (!result) return;

    if (result.sunk) {
      message = `💥 擊沉 ${playerNames[target]} 的${result.sunk.name}！`;
      messageType = 'win';
    } else if (result.hit) {
      message = '🔥 命中！';
      messageType = 'win';
    } else {
      message = '💧 落水！';
      messageType = 'neutral';
    }

    if (allSunk(target)) {
      phase = 'game-over';
      message = `🎉 ${playerNames[shooter]} 勝利！擊沉全部艦隊！`;
      messageType = 'win';
      render();
      endGame(shooter);
      return;
    }

    if (gameMode === 'pvp') {
      activePlayer = target;
      showBattleCover(target);
    } else {
      activePlayer = 1;
      render();
      setTimeout(() => {
        const { r: ar, c: ac, result: ar2 } = aiMove();
        if (ar2 && ar2.sunk) {
          message = `電腦擊沉你的${ar2.sunk.name}！`;
          messageType = 'lose';
        } else if (ar2 && ar2.hit) {
          message = `電腦射擊 ${ROW_LBL[ar]}${ac+1}：命中！`;
          messageType = 'lose';
        } else {
          message = `電腦射擊 ${ROW_LBL[ar]}${ac+1}：落水。`;
          messageType = 'neutral';
        }
        if (allSunk(0)) {
          phase = 'game-over';
          message = '💀 電腦擊沉你的全部艦隊！';
          messageType = 'lose';
          render();
          endGame(1);
          return;
        }
        activePlayer = 0;
        render();
      }, 600);
    }
  }

  // ── Cover screen ─────────────────────────────────────────────────────

  function showBattleCover(nextIdx) {
    boardEl.className = 'board board-bs-outer';
    boardEl.innerHTML = `
      <div class="bs-cover">
        <div class="bs-cover-eyebrow">請將裝置交給</div>
        <div class="bs-cover-name">${escapeHtml(playerNames[nextIdx])}</div>
        ${message ? `<div class="bs-cover-prev">${message}</div>` : ''}
        <button class="btn btn-primary" id="bsCoverReady">我準備好了 →</button>
      </div>
    `;
    document.getElementById('bsCoverReady')?.addEventListener('click', () => {
      message = '';
      render();
    });
  }

  // ── Render helpers ────────────────────────────────────────────────────

  function headerRow() {
    return `<div class="bs-row"><div class="bs-corner"></div>${
      Array.from({length: GRID}, (_, i) => `<div class="bs-col-lbl">${i+1}</div>`).join('')
    }</div>`;
  }

  function gridHtml(gridData, shotData, opts = {}) {
    const { clickable = false, showShips = false } = opts;
    return `
      <div class="bs-grid-wrap">
        ${headerRow()}
        ${Array.from({length: GRID}, (_, r) => `
          <div class="bs-row">
            <div class="bs-lbl">${ROW_LBL[r]}</div>
            ${Array.from({length: GRID}, (_, c) => {
              const shipId = gridData ? gridData[r][c] : null;
              const shot = shotData ? shotData[r][c] : null;
              let cls = 'bs-cell';
              let inner = '';
              if (shot === 'sunk')       { cls += ' bs-cell-sunk'; inner = '💥'; }
              else if (shot === 'hit')   { cls += ' bs-cell-hit'; inner = '🔥'; }
              else if (shot === 'miss')  { cls += ' bs-cell-miss'; inner = '❌'; }
              else if (shipId && showShips) { cls += ' bs-cell-ship'; }
              else if (clickable && !shot) { cls += ' bs-cell-target'; }
              const da = clickable && !shot ? `data-r="${r}" data-c="${c}"` : '';
              return `<div class="${cls}" ${da}>${inner}</div>`;
            }).join('')}
          </div>
        `).join('')}
      </div>
    `;
  }

  // ── Drag preview helpers (no re-render during drag) ───────────────────

  function clearDragPreview() {
    boardEl.querySelectorAll('.bs-cell-preview,.bs-cell-preview-bad')
      .forEach(el => el.classList.remove('bs-cell-preview', 'bs-cell-preview-bad'));
  }

  function updateDragPreview(pIdx, r, c) {
    clearDragPreview();
    const cur = ships[pIdx][selectedShipIdx];
    if (!cur || cur.cells.length > 0) return;
    const cells = shipCells(cur.size, r, c, placingHoriz);
    if (!cells) return;
    const ok = cells.every(([cr, cc]) => grids[pIdx][cr][cc] === null);
    cells.forEach(([cr, cc]) => {
      const el = boardEl.querySelector(`[data-r="${cr}"][data-c="${cc}"]`);
      if (el) el.classList.add(ok ? 'bs-cell-preview' : 'bs-cell-preview-bad');
    });
  }

  // ── Render placement ──────────────────────────────────────────────────

  function renderPlacement() {
    const pIdx = placingPlayer;
    const allPlaced = ships[pIdx].every(s => s.cells.length > 0);

    // Clamp selectedShipIdx
    if (selectedShipIdx >= ships[pIdx].length) selectedShipIdx = 0;
    const cur = ships[pIdx][selectedShipIdx];
    const isMoving = movingShipIdx === selectedShipIdx && cur.cells.length > 0;
    const canPlace = cur.cells.length === 0 || isMoving;

    // Moving ship's current cells (shown as ghost while repositioning)
    const movingCells = new Set(
      isMoving ? cur.cells.map(({ r, c }) => `${r},${c}`) : []
    );

    // Preview — when moving, treat the ship's own cells as free
    const preview = new Set();
    let previewOk = false;
    if (canPlace && hoverR >= 0) {
      const cells = shipCells(cur.size, hoverR, hoverC, placingHoriz);
      if (cells) {
        previewOk = cells.every(([r, c]) =>
          grids[pIdx][r][c] === null || movingCells.has(`${r},${c}`)
        );
        cells.forEach(([r, c]) => preview.add(`${r},${c}`));
      }
    }

    // Highlight cells of the selected ship (if placed and NOT moving)
    const selectedCells = new Set(
      (!canPlace ? cur.cells : []).map(({ r, c }) => `${r},${c}`)
    );

    const isLastPlayer = gameMode !== 'pvp' || placingPlayer === 1;
    const playerLabel = gameMode === 'pvp' ? `${escapeHtml(playerNames[pIdx])} — ` : '';

    boardEl.className = 'board board-bs-outer';
    boardEl.innerHTML = `
      <div class="bs-placement">
        <div class="bs-place-header">
          <span class="bs-place-title">${playerLabel}佈局艦隊</span>
          <span class="bs-place-ship">
            ${canPlace ? '放置' : '已選'}：<b>${cur.name}</b>（${cur.size}格）
            <button class="bs-rotate-btn" id="bsRotate">🔄 轉向</button>
            ${!canPlace ? `<button class="bs-remove-btn" id="bsRemove">✕ 移除</button>` : ''}
          </span>
        </div>

        <div class="bs-grid-wrap">
          ${headerRow()}
          ${Array.from({length: GRID}, (_, r) => `
            <div class="bs-row">
              <div class="bs-lbl">${ROW_LBL[r]}</div>
              ${Array.from({length: GRID}, (_, c) => {
                const key = `${r},${c}`;
                const shipId = grids[pIdx][r][c];
                let cls = 'bs-cell';
                if (preview.has(key))            cls += previewOk ? ' bs-cell-preview' : ' bs-cell-preview-bad';
                else if (movingCells.has(key))   cls += ' bs-cell-moving';
                else if (selectedCells.has(key)) cls += ' bs-cell-ship bs-cell-selected';
                else if (shipId)                 cls += ' bs-cell-ship';
                if (canPlace && !shipId && !movingCells.has(key)) cls += ' bs-cell-placeable';
                return `<div class="${cls}" data-r="${r}" data-c="${c}"></div>`;
              }).join('')}
            </div>
          `).join('')}
        </div>

        <div class="bs-place-footer">
          <button class="btn btn-secondary" id="bsAuto">🎲 自動排列</button>
          <button class="btn btn-secondary bs-noadj-btn ${noAdj ? 'bs-noadj-on' : ''}" id="bsNoAdj">
            ${noAdj ? '🚫 不相鄰：開' : '↔️ 不相鄰：關'}
          </button>
          <div class="bs-border-limit">
            <span class="bs-border-label">邊框上限</span>
            <button class="bs-stepper-btn" id="bsBorderDec">−</button>
            <span class="bs-border-val">${borderLimit === null ? '∞' : borderLimit}</span>
            <button class="bs-stepper-btn" id="bsBorderInc">+</button>
          </div>
          ${allPlaced ? `<button class="btn btn-primary" id="bsConfirm">
            ${isLastPlayer ? '⚔️ 開始戰鬥！' : '確認 → 換玩家 2 佈局'}
          </button>` : ''}
        </div>

        <div class="bs-checklist">
          ${ships[pIdx].map((s, i) => `
            <button class="bs-badge ${s.cells.length > 0 ? 'bs-badge-done' : ''} ${i === selectedShipIdx ? 'bs-badge-selected' : ''}"
                    data-ship="${i}" draggable="true">
              ${s.cells.length > 0 ? '✓' : '○'} ${s.name}（${s.size}）
            </button>
          `).join('')}
        </div>
      </div>
    `;

    // Delegated listeners on boardEl — AbortController prevents accumulation
    placeAC?.abort();
    placeAC = new AbortController();
    const { signal } = placeAC;

    boardEl.addEventListener('mousemove', (e) => {
      const cell = e.target.closest('.bs-cell-placeable');
      if (!cell) return; // don't clear hover mid-board — mouseleave handles that
      const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
      if (r !== hoverR || c !== hoverC) {
        hoverR = r; hoverC = c;
        render();
      }
    }, { signal });

    boardEl.addEventListener('mouseleave', () => {
      if (isDragging) return;
      if (hoverR >= 0) { hoverR = -1; hoverC = -1; render(); }
    }, { signal });

    // ── Drag-and-drop ─────────────────────────────────────────────────
    boardEl.addEventListener('dragstart', (e) => {
      const badge = e.target.closest('.bs-badge[data-ship]');
      if (!badge) { e.preventDefault(); return; }
      selectedShipIdx = Number(badge.dataset.ship);
      isDragging = true;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', badge.dataset.ship);
      // Do NOT call render() here — replacing innerHTML cancels the drag immediately
      // Update badge selection visually by toggling classes directly
      boardEl.querySelectorAll('.bs-badge').forEach(b => b.classList.remove('bs-badge-selected'));
      badge.classList.add('bs-badge-selected');
    }, { signal });

    boardEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      const cell = e.target.closest('.bs-cell-placeable');
      if (!cell) { clearDragPreview(); hoverR = -1; hoverC = -1; return; }
      const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
      if (r !== hoverR || c !== hoverC) {
        hoverR = r; hoverC = c;
        updateDragPreview(pIdx, r, c);
      }
    }, { signal });

    boardEl.addEventListener('drop', (e) => {
      e.preventDefault();
      const cell = e.target.closest('.bs-cell-placeable');
      if (!cell) return;
      const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
      const cur = ships[pIdx][selectedShipIdx];
      if (cur && cur.cells.length === 0 && tryPlace(pIdx, selectedShipIdx, r, c, placingHoriz)) {
        const nextIdx = ships[pIdx].findIndex((s, i) => i !== selectedShipIdx && s.cells.length === 0);
        if (nextIdx >= 0) selectedShipIdx = nextIdx;
      }
      isDragging = false; hoverR = -1; hoverC = -1; render();
    }, { signal });

    boardEl.addEventListener('dragend', () => {
      isDragging = false; clearDragPreview(); hoverR = -1; hoverC = -1; render();
    }, { signal });

    // ── Touch drag (mobile) ───────────────────────────────────────────
    boardEl.addEventListener('touchstart', (e) => {
      const badge = e.target.closest('.bs-badge[data-ship]');
      if (!badge) return;
      touchDragActive = true;
      isDragging = true;
      selectedShipIdx = Number(badge.dataset.ship);
      boardEl.querySelectorAll('.bs-badge').forEach(b => b.classList.remove('bs-badge-selected'));
      badge.classList.add('bs-badge-selected');
      e.preventDefault();
    }, { signal, passive: false });

    // touchmove on document so scroll is blocked even when finger leaves boardEl
    const onTouchMove = (e) => {
      if (!touchDragActive) return;
      e.preventDefault();
      const touch = e.touches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cell = el?.closest('.bs-cell-placeable');
      if (!cell) { clearDragPreview(); hoverR = -1; hoverC = -1; return; }
      const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
      if (r !== hoverR || c !== hoverC) { hoverR = r; hoverC = c; updateDragPreview(pIdx, r, c); }
    };
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    signal.addEventListener('abort', () => document.removeEventListener('touchmove', onTouchMove));

    boardEl.addEventListener('touchend', (e) => {
      if (!touchDragActive) return;
      touchDragActive = false; isDragging = false;
      const touch = e.changedTouches[0];
      const el = document.elementFromPoint(touch.clientX, touch.clientY);
      const cell = el?.closest('.bs-cell-placeable');
      clearDragPreview();
      if (cell) {
        const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
        const cur = ships[pIdx][selectedShipIdx];
        if (cur && cur.cells.length === 0 && tryPlace(pIdx, selectedShipIdx, r, c, placingHoriz)) {
          const nextIdx = ships[pIdx].findIndex((s, i) => i !== selectedShipIdx && s.cells.length === 0);
          if (nextIdx >= 0) selectedShipIdx = nextIdx;
        }
      }
      hoverR = -1; hoverC = -1; render();
    }, { signal });

    boardEl.addEventListener('click', (e) => {
      if (e.target.closest('#bsRotate')) {
        rotateShipInPlace(pIdx, selectedShipIdx);
        render(); return;
      }
      if (e.target.closest('#bsRemove')) {
        unplaceShip(pIdx, selectedShipIdx); movingShipIdx = -1; hoverR = -1; hoverC = -1; render(); return;
      }
      if (e.target.closest('#bsNoAdj')) {
        noAdj = !noAdj; render(); return;
      }
      if (e.target.closest('#bsBorderDec')) {
        if (borderLimit === null) borderLimit = 36;
        else if (borderLimit > 0) borderLimit--;
        render(); return;
      }
      if (e.target.closest('#bsBorderInc')) {
        if (borderLimit !== null) {
          borderLimit++;
          if (borderLimit > 36) borderLimit = null;
        }
        render(); return;
      }
      if (e.target.closest('#bsAuto')) {
        autoPlace(pIdx); selectedShipIdx = 0; movingShipIdx = -1; hoverR = -1; hoverC = -1; render(); return;
      }
      if (e.target.closest('#bsConfirm')) {
        if (gameMode === 'pvp' && placingPlayer === 0) {
          placingPlayer = 1; initPlayer(1); selectedShipIdx = 0;
          placingHoriz = true; hoverR = -1; hoverC = -1;
          phase = 'pvp-place-cover'; render();
        } else {
          if (gameMode === 'pvc') { autoPlace(1); }
          phase = 'battle'; activePlayer = 0;
          if (gameMode === 'pvp') showBattleCover(0); else render();
        }
        return;
      }
      const badge = e.target.closest('.bs-badge[data-ship]');
      if (badge) {
        selectedShipIdx = Number(badge.dataset.ship); movingShipIdx = -1; hoverR = -1; hoverC = -1; render(); return;
      }
      // Click a placed ship cell → enter moving mode (ghost stays, pick new spot)
      const shipCell = e.target.closest('.bs-cell-ship, .bs-cell-moving');
      if (shipCell) {
        const r = Number(shipCell.dataset.r), c = Number(shipCell.dataset.c);
        const shipId = grids[pIdx][r][c];
        const idx = ships[pIdx].findIndex(s => s.id === shipId);
        if (idx >= 0) {
          if (movingShipIdx === idx) {
            movingShipIdx = -1; // click same ship again → cancel move
          } else {
            selectedShipIdx = idx; movingShipIdx = idx;
          }
          hoverR = -1; hoverC = -1; render();
        }
        return;
      }
      const cell = e.target.closest('.bs-cell-placeable');
      if (!cell || !canPlace) return;
      const r = Number(cell.dataset.r), c = Number(cell.dataset.c);
      if (isMoving) {
        // Pre-check placement treating moving ship's cells as free
        const ship = ships[pIdx][selectedShipIdx];
        const newCells = shipCells(ship.size, r, c, placingHoriz);
        if (!newCells) return;
        const canPlaceHere = newCells.every(([cr, cc]) =>
          grids[pIdx][cr][cc] === null || movingCells.has(`${cr},${cc}`)
        );
        if (canPlaceHere) {
          unplaceShip(pIdx, selectedShipIdx);
          tryPlace(pIdx, selectedShipIdx, r, c, placingHoriz);
          movingShipIdx = -1;
          hoverR = -1; hoverC = -1; render();
        }
      } else if (tryPlace(pIdx, selectedShipIdx, r, c, placingHoriz)) {
        const nextIdx = ships[pIdx].findIndex((s, i) => i !== selectedShipIdx && s.cells.length === 0);
        if (nextIdx >= 0) selectedShipIdx = nextIdx;
        hoverR = -1; hoverC = -1; render();
      }
    }, { signal });
  }

  // ── Render difficulty select ──────────────────────────────────────────

  function renderDifficulty() {
    boardEl.className = 'board board-bs-outer';
    boardEl.innerHTML = `
      <div class="bs-cover">
        <div class="bs-cover-eyebrow">選擇電腦難度</div>
        <button class="btn btn-secondary bs-diff-btn" id="bsDiffEasy">
          😊 簡單<span class="bs-diff-desc">隨機鄰格射擊</span>
        </button>
        <button class="btn btn-primary bs-diff-btn" id="bsDiffHard">
          🧠 困難<span class="bs-diff-desc">智能方向追蹤</span>
        </button>
      </div>
    `;
    document.getElementById('bsDiffEasy').addEventListener('click', () => {
      aiDifficulty = 'easy'; phase = 'placement'; render();
    });
    document.getElementById('bsDiffHard').addEventListener('click', () => {
      aiDifficulty = 'hard'; phase = 'placement'; render();
    });
  }

  // ── Render pvp placement cover ────────────────────────────────────────

  function renderPlaceCover() {
    boardEl.className = 'board board-bs-outer';
    boardEl.innerHTML = `
      <div class="bs-cover">
        <div class="bs-cover-eyebrow">請將裝置交給</div>
        <div class="bs-cover-name">${escapeHtml(playerNames[1])}</div>
        <div class="bs-cover-sub">請勿讓對方看到畫面</div>
        <button class="btn btn-primary" id="bsCoverReady">我準備好了 →</button>
      </div>
    `;
    document.getElementById('bsCoverReady')?.addEventListener('click', () => {
      phase = 'placement';
      render();
    });
  }

  // ── Render battle ─────────────────────────────────────────────────────

  function renderBattle() {
    // In PvC always show from player 0's POV — don't swap during AI turn
    const myIdx = gameMode === 'pvp' ? activePlayer : 0;
    const oppIdx = 1 - myIdx;
    const isOver = phase === 'game-over';
    const canShoot = !isOver && (gameMode === 'pvp' || myIdx === 0);

    boardEl.className = 'board board-bs-outer';
    boardEl.innerHTML = `
      <div class="bs-battle">
        ${message
          ? `<div class="bs-msg bs-msg-${messageType}">${message}</div>`
          : '<div class="bs-msg-spacer"></div>'}

        <div class="bs-fleet-bar">
          <span class="bs-fleet-lbl">對方艦隊：</span>
          ${ships[oppIdx].map(s =>
            `<span class="bs-fleet-ship ${s.sunk ? 'bs-ship-sunk' : ''}">${s.sunk ? '💀' : '🚢'} ${s.name}（${s.size}格）</span>`
          ).join('')}
        </div>

        <div class="bs-grids">
          <div class="bs-grid-sec">
            <div class="bs-grid-title">🎯 攻擊 — ${escapeHtml(playerNames[oppIdx])}</div>
            ${gridHtml(grids[oppIdx], fired[myIdx], { clickable: canShoot, showShips: isOver })}
          </div>
          <div class="bs-grid-sec">
            <div class="bs-grid-title">🛡 我的艦隊 — ${escapeHtml(playerNames[myIdx])}</div>
            ${gridHtml(grids[myIdx], fired[oppIdx], { showShips: true })}
          </div>
        </div>
      </div>
    `;

    boardEl.querySelectorAll('.bs-cell-target').forEach(el => {
      el.addEventListener('click', () => handleShot(Number(el.dataset.r), Number(el.dataset.c)));
    });
  }

  // ── Main render ───────────────────────────────────────────────────────

  function render() {
    if (phase === 'difficulty') renderDifficulty();
    else if (phase === 'placement') renderPlacement();
    else if (phase === 'pvp-place-cover') renderPlaceCover();
    else renderBattle();

    modeBadge.textContent = gameMode === 'pvp' ? '海戰棋 PvP' : '海戰棋 vs 電腦';
    playersBar.innerHTML = gameMode === 'pvp'
      ? `<span class="mark-x">${escapeHtml(playerNames[0])}</span><span class="vs"> vs </span><span class="mark-o">${escapeHtml(playerNames[1])}</span>`
      : `<span class="mark-x">${escapeHtml(playerNames[0])}</span>`;

    if (phase === 'battle' || phase === 'game-over') {
      turnIndicator.textContent = phase === 'game-over'
        ? '遊戲結束'
        : gameMode === 'pvp'
          ? `${playerNames[activePlayer]} 的回合`
          : activePlayer === 0 ? '你的回合' : '電腦思考中…';
    } else {
      turnIndicator.textContent = '';
    }

    scoreBar.classList.add('hidden');
  }

  // ── End game ──────────────────────────────────────────────────────────

  async function endGame(winnerIdx) {
    resultEl.classList.remove('hidden');
    resultText.textContent = message;
    try {
      if (gameMode === 'pvc') {
        const saved = await persistGame({ mode: 'pvc', playerXName: playerNames[0], playerOName: '電腦', winner: winnerIdx === 0 ? 'X' : 'O' });
        if (saved?.player) { resultStats.classList.remove('hidden'); resultStats.textContent = `${saved.player.name}: 勝率 ${formatWinRate(saved.player)}`; }
      } else {
        const saved = await persistGame({ mode: 'pvp', playerXName: playerNames[0], playerOName: playerNames[1], winner: winnerIdx === 0 ? 'X' : 'O' });
        if (saved?.playerX) { resultStats.classList.remove('hidden'); resultStats.textContent = `${saved.playerX.name}: ${formatWinRate(saved.playerX)} | ${saved.playerO.name}: ${formatWinRate(saved.playerO)}`; }
      }
    } catch (e) { console.error(e); }
  }

  // ── Init ──────────────────────────────────────────────────────────────

  function init(mode, names, skipDifficulty = false) {
    gameMode = mode;
    playerNames = names;
    phase = (gameMode === 'pvc' && !skipDifficulty) ? 'difficulty' : 'placement';
    placingPlayer = 0;
    placingHoriz = true;
    selectedShipIdx = 0;
    hoverR = -1; hoverC = -1;
    movingShipIdx = -1;
    activePlayer = 0;
    message = '';
    messageType = 'neutral';
    initPlayer(0);
    initPlayer(1);
    resultEl.classList.add('hidden');
    resultStats.classList.add('hidden');
    appRoot?.classList.add('app-battleship');
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  return {
    start({ mode, playerX, playerO }) { init(mode, [playerX, mode === 'pvp' ? playerO : '電腦']); },
    restart() { init(gameMode, playerNames, true); },
    destroy() { placeAC?.abort(); placeAC = null; appRoot?.classList.remove('app-battleship'); },
  };
}
