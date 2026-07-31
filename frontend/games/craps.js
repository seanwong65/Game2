const PIPS = ['', '⚀', '⚁', '⚂', '⚃', '⚄', '⚅'];
const CHIP_VALUES = [5, 10, 25, 50, 100];
const CHIP_CLS = { 5: 'red', 10: 'blue', 25: 'green', 50: 'black', 100: 'purple' };
const PLACE_NUMS = [4, 5, 6, 8, 9, 10];

function dominantChip(amount) {
  for (const d of [100, 50, 25, 10, 5]) {
    if (amount >= d) return d;
  }
  return 5;
}

function zoneChip(amount) {
  if (!amount) return '';
  const cls = CHIP_CLS[dominantChip(amount)];
  return `<div class="craps-zone-chip chip-${cls}">$${amount}</div>`;
}

function cpnChip(amount) {
  if (!amount) return '';
  const cls = CHIP_CLS[dominantChip(amount)];
  return `<div class="cpn-chip chip-${cls}">$${amount}</div>`;
}

function placePayout(n) {
  if (n === 4 || n === 10) return 9 / 5;
  if (n === 5 || n === 9)  return 7 / 5;
  return 7 / 6; // 6 or 8
}

function placePayoutLabel(n) {
  if (n === 4 || n === 10) return '9:5';
  if (n === 5 || n === 9)  return '7:5';
  return '7:6';
}

function placeLabel(n) {
  return String(n);
}

export function createCraps(ctx) {
  const {
    boardEl, turnIndicator, modeBadge, playersBar, scoreBar,
    resultEl, resultText, resultStats,
    escapeHtml, persistGame, appRoot,
  } = ctx;

  let playerName = '';
  let bankroll = 500;
  let chipValue = 10;

  let passLineBet = 0;
  let dontPassBet = 0;
  let fieldBet = 0;
  let placeBets = { 4: 0, 5: 0, 6: 0, 8: 0, 9: 0, 10: 0 };

  let phase = 'come-out';
  let point = null;
  let lastDice = null;
  let message = '';
  let messageType = '';
  let gameOver = false;
  let rolling = false;

  function totalActive() {
    return passLineBet + dontPassBet + fieldBet +
      PLACE_NUMS.reduce((s, n) => s + placeBets[n], 0);
  }

  function addBet(type, num = null) {
    if (bankroll < chipValue || gameOver) return;
    bankroll -= chipValue;
    if (type === 'pass')  passLineBet += chipValue;
    else if (type === 'dont')  dontPassBet += chipValue;
    else if (type === 'field') fieldBet += chipValue;
    else if (type === 'place' && num) placeBets[num] += chipValue;
    render();
  }

  function clearBet(type, num = null) {
    if (type === 'pass' && phase !== 'point')  { bankroll += passLineBet; passLineBet = 0; }
    else if (type === 'dont' && phase !== 'point') { bankroll += dontPassBet; dontPassBet = 0; }
    else if (type === 'field')  { bankroll += fieldBet; fieldBet = 0; }
    else if (type === 'place' && num) { bankroll += placeBets[num]; placeBets[num] = 0; }
    render();
  }

  function resolveField(s) {
    if (!fieldBet) return null;
    const wins = [2, 3, 4, 9, 10, 11, 12];
    let msg = null;
    if (wins.includes(s)) {
      const mult = (s === 2 || s === 12) ? 2 : 1;
      const win = fieldBet * mult;
      bankroll += fieldBet + win;
      msg = `骰面注贏 $${win}`;
    } else {
      msg = `骰面注輸 $${fieldBet}`;
    }
    fieldBet = 0;
    return msg;
  }

  // Place bets are OFF during come-out (standard rules).
  // They activate once a point is set and resolve on every subsequent roll.
  function resolvePlaceBets(s) {
    const parts = [];
    if (s === 7) {
      // Seven-out: all place bets lose (stake already deducted)
      const lost = PLACE_NUMS.reduce((sum, n) => sum + placeBets[n], 0);
      PLACE_NUMS.forEach(n => { placeBets[n] = 0; });
      if (lost > 0) parts.push(`落注全輸 $${lost}`);
    } else if (PLACE_NUMS.includes(s) && placeBets[s] > 0) {
      // Win — bet stays on table for next roll
      const win = Math.floor(placeBets[s] * placePayout(s));
      bankroll += win;
      parts.push(`${placeLabel(s)}號落注贏 $${win}！`);
    }
    return parts.join('　') || null;
  }

  function processRoll(s) {
    const wasPoint = phase === 'point';
    const msgs = [];

    if (!wasPoint) {
      // Come-out
      if (s === 7 || s === 11) {
        bankroll += passLineBet * 2;
        passLineBet = 0; dontPassBet = 0;
        msgs.push(s === 7 ? '🎉 七點！順注贏！' : '🎉 十一點！順注贏！');
        messageType = 'win';
      } else if (s === 2 || s === 3) {
        bankroll += dontPassBet * 2;
        passLineBet = 0; dontPassBet = 0;
        msgs.push(s === 2 ? '🐍 么么！Craps！反注贏！' : '🎲 三點！Craps！反注贏！');
        messageType = 'lose';
      } else if (s === 12) {
        bankroll += dontPassBet;
        passLineBet = 0; dontPassBet = 0;
        msgs.push('🎲 十二點！順注輸，反注和局。');
        messageType = 'neutral';
      } else {
        point = s;
        phase = 'point';
        msgs.push(`📍 定點為 ${s}！落注開始生效。擲出 ${s} 贏，擲出 7 輸。`);
        messageType = 'neutral';
      }
    } else {
      // Point phase
      if (s === point) {
        bankroll += passLineBet * 2;
        passLineBet = 0; dontPassBet = 0;
        msgs.push(`🎉 ${s}！定點達成！順注贏！`);
        messageType = 'win';
        phase = 'come-out';
        point = null;
      } else if (s === 7) {
        bankroll += dontPassBet * 2;
        passLineBet = 0; dontPassBet = 0;
        msgs.push('💥 七出！順注輸，反注贏！');
        messageType = 'lose';
        phase = 'come-out';
        point = null;
      } else {
        msgs.push(`${s} 點 — 繼續擲骰…`);
        messageType = 'neutral';
      }
    }

    // Field resolves every roll
    const fieldMsg = resolveField(s);
    if (fieldMsg) msgs.push(fieldMsg);

    // Place bets only active during point phase (off on come-out)
    if (wasPoint) {
      const placeMsg = resolvePlaceBets(s);
      if (placeMsg) msgs.push(placeMsg);
    }

    message = msgs.join('　');
  }

  function doRoll() {
    if (rolling || gameOver) return;
    if (totalActive() === 0) return;
    rolling = true;
    render();
    setTimeout(() => {
      lastDice = [
        Math.floor(Math.random() * 6) + 1,
        Math.floor(Math.random() * 6) + 1,
      ];
      processRoll(lastDice[0] + lastDice[1]);
      rolling = false;
      if (bankroll === 0 && totalActive() === 0) gameOver = true;
      render();
      if (gameOver) endGame();
    }, 300);
  }

  function render() {
    const inPoint = phase === 'point';
    const canRoll = !rolling && !gameOver && totalActive() > 0;
    const canBetPassDont = !inPoint;

    boardEl.className = 'board board-craps-outer';
    boardEl.innerHTML = `
      <div class="craps-layout">

        <!-- ── 主遊戲區 ── -->
        <div class="craps-main">

          <!-- 骰子 + 狀態 -->
          <div class="craps-top-bar">
            <div class="craps-dice-display">
              ${lastDice
                ? `<span class="craps-die ${rolling ? 'rolling' : ''}">${PIPS[lastDice[0]]}</span>
                   <span class="craps-die ${rolling ? 'rolling' : ''}">${PIPS[lastDice[1]]}</span>
                   <span class="craps-roll-total">${lastDice[0] + lastDice[1]}</span>`
                : `<span class="craps-die-placeholder">🎲</span>
                   <span class="craps-die-placeholder">🎲</span>`}
            </div>
            <div class="craps-puck-area">
              <div class="craps-puck ${inPoint ? 'puck-on' : 'puck-off'}">
                ${inPoint ? point : 'OFF'}
              </div>
              <div class="craps-puck-label">${inPoint ? `定點 ${point}` : '開局'}</div>
            </div>
          </div>

          ${message
            ? `<div class="craps-msg craps-msg-${messageType}">${message}</div>`
            : '<div class="craps-msg-spacer"></div>'}

          <!-- 籌碼選擇 -->
          <div class="craps-chip-selector">
            <span class="craps-chip-label">選籌碼</span>
            <div class="craps-chip-btns">
              ${CHIP_VALUES.map(v => `
                <button class="craps-chip-btn chip-${CHIP_CLS[v]}
                  ${v === chipValue ? 'chip-selected' : ''}
                  ${bankroll < v ? 'chip-broke' : ''}"
                  data-chip="${v}">$${v}</button>
              `).join('')}
            </div>
          </div>

          <!-- 賭枱 -->
          <div class="craps-felt-table">

            <!-- Place Bet 落注區 -->
            <div class="craps-place-nums">
              ${PLACE_NUMS.map(n => `
                <div class="cpn ${placeBets[n] > 0 ? 'cpn-active' : ''} ${(n===6||n===8)?'cpn-hi':''}"
                     data-place="${n}">
                  <div class="cpn-label">${placeLabel(n)}</div>
                  <div class="cpn-payout">${placePayoutLabel(n)}</div>
                  ${cpnChip(placeBets[n])}
                </div>
              `).join('')}
            </div>

            <!-- 骰面注 Field -->
            <div class="craps-zone craps-zone-field ${fieldBet > 0 ? 'zone-active' : ''}" id="zoneField">
              <div class="zone-labels">
                <span class="zone-cn">骰面注</span>
                <span class="zone-en">FIELD</span>
              </div>
              <div class="zone-field-nums">2 · 3 · 4 · 9 · 10 · 11 · 12</div>
              <div class="zone-field-note">2 / 12 賠 2:1 &nbsp;·&nbsp; 其餘 1:1 &nbsp;·&nbsp; 一擲結算</div>
              ${zoneChip(fieldBet)}
            </div>

            <!-- Come (裝飾) -->
            <div class="craps-zone craps-zone-come">
              <span class="zone-cn">開牌區</span>
              <span class="zone-en">COME</span>
            </div>

            <!-- 順注 Pass Line -->
            <div class="craps-zone craps-zone-pass ${passLineBet > 0 ? 'zone-active' : ''} ${inPoint ? 'zone-locked' : ''}" id="zonePass">
              <div class="zone-labels">
                <span class="zone-cn">順注</span>
                <span class="zone-en">PASS LINE</span>
              </div>
              ${inPoint ? '<span class="zone-lock-msg">🔒 定點後鎖定</span>' : ''}
              ${zoneChip(passLineBet)}
            </div>

            <!-- 反注 Don't Pass -->
            <div class="craps-zone craps-zone-dontpass ${dontPassBet > 0 ? 'zone-active' : ''} ${inPoint ? 'zone-locked' : ''}" id="zoneDontPass">
              <div class="zone-labels">
                <span class="zone-cn">反注</span>
                <span class="zone-en">DON'T PASS BAR</span>
              </div>
              ${inPoint ? '<span class="zone-lock-msg">🔒</span>' : ''}
              ${zoneChip(dontPassBet)}
            </div>

          </div>

          <!-- 清注 -->
          <div class="craps-clear-row">
            ${passLineBet > 0 && !inPoint ? `<button class="craps-clear-btn" data-clear="pass">順注 ✕ $${passLineBet}</button>` : ''}
            ${dontPassBet > 0 && !inPoint ? `<button class="craps-clear-btn" data-clear="dont">反注 ✕ $${dontPassBet}</button>` : ''}
            ${fieldBet > 0 ? `<button class="craps-clear-btn" data-clear="field">骰面注 ✕ $${fieldBet}</button>` : ''}
            ${PLACE_NUMS.filter(n => placeBets[n] > 0).map(n =>
              `<button class="craps-clear-btn" data-clear="place" data-num="${n}">${placeLabel(n)}號 ✕ $${placeBets[n]}</button>`
            ).join('')}
          </div>

          <!-- 擲骰 -->
          <button class="btn btn-primary craps-roll-btn" id="crapsRoll" ${canRoll ? '' : 'disabled'}>
            ${rolling ? '擲骰中…' : '🎲 擲骰！'}
          </button>

        </div>

        <!-- ── 說明欄 ── -->
        <div class="craps-sidebar">
          <div class="sidebar-title">玩法說明</div>

          <div class="rule-block">
            <div class="rule-head">🎲 開局擲骰</div>
            <p class="rule-sub">首次擲骰決定勝負或定點。</p>
          </div>

          <div class="rule-block">
            <div class="rule-head rule-pass-head">順注 Pass Line</div>
            <ul class="rule-list">
              <li><span class="tag win">贏</span> 擲出 <b>7</b> 或 <b>11</b></li>
              <li><span class="tag lose">輸</span> 擲出 <b>2、3、12</b></li>
              <li><span class="tag neutral">定點</span> 其他數字→定點</li>
              <li><span class="tag win">贏</span> 再擲出定點</li>
              <li><span class="tag lose">輸</span> 先擲出 <b>7</b></li>
            </ul>
          </div>

          <div class="rule-block">
            <div class="rule-head rule-dont-head">反注 Don't Pass</div>
            <ul class="rule-list">
              <li><span class="tag lose">輸</span> 擲出 <b>7</b> 或 <b>11</b></li>
              <li><span class="tag win">贏</span> 擲出 <b>2</b> 或 <b>3</b></li>
              <li><span class="tag neutral">和局</span> 擲出 <b>12</b>（退注）</li>
              <li><span class="tag win">贏</span> 定點後先出 <b>7</b></li>
              <li><span class="tag lose">輸</span> 先擲出定點</li>
            </ul>
          </div>

          <div class="rule-block">
            <div class="rule-head rule-place-head">落注 Place Bet</div>
            <ul class="rule-list">
              <li>點擊上方數字落注</li>
              <li><span class="tag win">贏</span> 定點後先出該數字</li>
              <li><span class="tag lose">輸</span> 先擲出 <b>7</b>（七出）</li>
              <li>贏後注碼留枱繼續</li>
              <li class="rule-note">4/10 賠 9:5 · 5/9 賠 7:5<br>6/8 賠 7:6</li>
              <li class="rule-note">開局期間落注不生效</li>
            </ul>
          </div>

          <div class="rule-block">
            <div class="rule-head rule-field-head">骰面注 Field</div>
            <ul class="rule-list">
              <li><span class="tag win2x">2倍</span> 擲出 <b>2</b> 或 <b>12</b></li>
              <li><span class="tag win">1倍</span> 3、4、9、10、11</li>
              <li><span class="tag lose">輸</span> 5、6、7、8</li>
              <li class="rule-note">每次擲骰後自動結算</li>
            </ul>
          </div>

          <div class="rule-tip">
            💡 定點確立後，順注及反注均不能撤注或加注。
          </div>
        </div>

      </div>
    `;

    playersBar.innerHTML = `<span class="mark-x">${escapeHtml(playerName)}</span>`;
    scoreBar.classList.remove('hidden');
    scoreBar.innerHTML = `籌碼：<strong>$${bankroll}</strong>`;
    turnIndicator.textContent = inPoint ? `定點 ${point}` : '開局擲骰';

    // Chip select
    boardEl.querySelectorAll('.craps-chip-btn').forEach(btn => {
      const v = Number(btn.dataset.chip);
      btn.addEventListener('click', () => { if (bankroll >= v) { chipValue = v; render(); } });
    });

    // Place bet clicks
    if (!gameOver) {
      boardEl.querySelectorAll('.cpn[data-place]').forEach(el => {
        el.addEventListener('click', () => addBet('place', Number(el.dataset.place)));
      });
      document.getElementById('zoneField')?.addEventListener('click', () => addBet('field'));
      if (!inPoint) {
        document.getElementById('zonePass')?.addEventListener('click', () => addBet('pass'));
        document.getElementById('zoneDontPass')?.addEventListener('click', () => addBet('dont'));
      }
    }

    // Clear bets
    boardEl.querySelectorAll('.craps-clear-btn').forEach(btn => {
      const type = btn.dataset.clear;
      const num = btn.dataset.num ? Number(btn.dataset.num) : null;
      btn.addEventListener('click', () => clearBet(type, num));
    });

    document.getElementById('crapsRoll')?.addEventListener('click', doRoll);
  }

  async function endGame() {
    const net = bankroll - 500;
    resultText.textContent = net >= 0 ? `盈利 $${net}！好彩！` : `輸咗 $${Math.abs(net)}，籌碼用完！`;
    resultEl.classList.remove('hidden');
    // Recorded so the session still appears in history, but craps is a
    // bankroll game against the house — a win rate is meaningless, so none is
    // shown and the worker keeps it out of the player's totals.
    await persistGame({
      mode: 'pvc', playerXName: playerName, playerOName: '莊家',
      winner: net >= 0 ? 'X' : 'O',
    });
  }

  function init() {
    bankroll = 500; chipValue = 10;
    passLineBet = 0; dontPassBet = 0; fieldBet = 0;
    placeBets = { 4: 0, 5: 0, 6: 0, 8: 0, 9: 0, 10: 0 };
    phase = 'come-out'; point = null;
    lastDice = null; message = ''; messageType = '';
    gameOver = false; rolling = false;
    resultEl.classList.add('hidden');
    resultStats.classList.add('hidden');
    appRoot?.classList.add('app-craps');
    render();
  }

  return {
    start({ playerX }) { playerName = playerX; modeBadge.textContent = '花旗骰 Craps'; init(); },
    restart() { init(); },
    destroy() { appRoot?.classList.remove('app-craps'); },
  };
}
