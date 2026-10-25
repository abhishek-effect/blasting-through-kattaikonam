/**
 * BattleHUD Module
 * Renders in-game Battle Multiplayer HUD:
 * - 2-Minute Match Timer with pulsing <30s warning
 * - Live Team & Player Kills Scoreboard
 * - Kill Feed Banner (Killer 💥 Victim)
 * - Keys held tracker
 * - Elimination and Respawn Countdown Overlay
 * - Post-Match Victory / Defeat Results Screen
 */
export class BattleHUD {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'battle-hud';
    this.container.className = 'battle-hud hidden';
    document.body.appendChild(this.container);

    this.onReturnToLobby = null;
    this.onReturnToMenu = null;

    this.buildMarkup();
  }

  buildMarkup() {
    this.container.innerHTML = `
      <!-- Top Scoreboard & 2-Minute Countdown Bar -->
      <div class="battle-top-bar">
        <div class="battle-team-box red-team">
          <span class="team-dot red"></span>
          <span class="team-label">RED TEAM</span>
          <span id="battle-red-score" class="team-score">0</span>
        </div>

        <div class="battle-timer-box">
          <div class="timer-label">MATCH TIME</div>
          <div id="battle-timer-val" class="timer-val">02:00</div>
          <div id="battle-mode-label" class="mode-tag">1v1 DUEL</div>
        </div>

        <div class="battle-team-box blue-team">
          <span id="battle-blue-score" class="team-score">0</span>
          <span class="team-label">BLUE TEAM</span>
          <span class="team-dot blue"></span>
        </div>
      </div>

      <!-- Keys Held Badge & Objective Bar -->
      <div class="battle-objective-bar">
        <div id="battle-keys-badge" class="battle-keys-badge">
          🗝️ KEYS: <span id="battle-keys-count">0</span>
        </div>
        <div id="battle-notice" class="battle-notice hidden"></div>
      </div>

      <!-- Top-Right Kill Feed -->
      <div id="battle-kill-feed" class="battle-kill-feed"></div>

      <!-- Respawn Overlay -->
      <div id="battle-respawn-overlay" class="battle-respawn-overlay hidden">
        <div class="respawn-box">
          <div class="respawn-title">YOU WERE ELIMINATED</div>
          <div id="respawn-killer-text" class="respawn-killer">ELIMINATED BY OPERATIVE</div>
          <div id="respawn-countdown-num" class="respawn-num">3</div>
          <div class="respawn-sub">RESPAWNING SOON...</div>
        </div>
      </div>

      <!-- Match Results Modal -->
      <div id="battle-results-modal" class="battle-results-modal hidden">
        <div class="results-card">
          <div class="results-badge">MATCH CONCLUDED</div>
          <h2 id="battle-winner-title" class="results-title">RED TEAM VICTORIOUS!</h2>
          <p id="battle-winner-subtitle" class="results-sub">2 Minutes Expired</p>

          <div class="results-table-wrapper">
            <table class="battle-scoreboard-table">
              <thead>
                <tr>
                  <th>TEAM</th>
                  <th>OPERATIVE</th>
                  <th>CHARACTER</th>
                  <th>KILLS</th>
                  <th>DEATHS</th>
                  <th>SCORE</th>
                </tr>
              </thead>
              <tbody id="battle-results-tbody"></tbody>
            </table>
          </div>

          <div class="results-buttons-row">
            <button id="btn-battle-rematch" class="lobby-action-btn primary-btn">🔄 REMATCH / LOBBY</button>
            <button id="btn-battle-exit" class="lobby-action-btn secondary-btn">🏠 MAIN MENU</button>
          </div>
        </div>
      </div>
    `;

    // Elements
    this.redScoreEl = document.getElementById('battle-red-score');
    this.blueScoreEl = document.getElementById('battle-blue-score');
    this.timerValEl = document.getElementById('battle-timer-val');
    this.modeLabelEl = document.getElementById('battle-mode-label');
    this.keysCountEl = document.getElementById('battle-keys-count');
    this.noticeEl = document.getElementById('battle-notice');
    this.killFeedEl = document.getElementById('battle-kill-feed');

    this.respawnOverlay = document.getElementById('battle-respawn-overlay');
    this.respawnKillerText = document.getElementById('respawn-killer-text');
    this.respawnCountdownNum = document.getElementById('respawn-countdown-num');

    this.resultsModal = document.getElementById('battle-results-modal');
    this.winnerTitle = document.getElementById('battle-winner-title');
    this.winnerSubtitle = document.getElementById('battle-winner-subtitle');
    this.resultsTbody = document.getElementById('battle-results-tbody');
    this.btnRematch = document.getElementById('btn-battle-rematch');
    this.btnExit = document.getElementById('btn-battle-exit');

    this.initEvents();
  }

  initEvents() {
    if (this.btnRematch) {
      this.btnRematch.addEventListener('click', () => {
        if (this.onReturnToLobby) this.onReturnToLobby();
      });
    }
    if (this.btnExit) {
      this.btnExit.addEventListener('click', () => {
        if (this.onReturnToMenu) this.onReturnToMenu();
      });
    }
  }

  show() {
    this.container.classList.remove('hidden');
    this.hideResults();
    this.hideRespawn();
  }

  hide() {
    this.container.classList.add('hidden');
  }

  updateTimer(secondsRemaining) {
    const mins = Math.floor(Math.max(0, secondsRemaining) / 60);
    const secs = Math.floor(Math.max(0, secondsRemaining) % 60);
    const formatted = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;

    if (this.timerValEl) {
      this.timerValEl.textContent = formatted;
      if (secondsRemaining <= 30) {
        this.timerValEl.classList.add('urgent');
      } else {
        this.timerValEl.classList.remove('urgent');
      }
    }
  }

  updateScores(redKills, blueKills, matchMode = '1v1', players = []) {
    if (matchMode === '1v1') {
      const p1 = players[0];
      const p2 = players[1];
      if (this.redScoreEl) this.redScoreEl.textContent = p1 ? (p1.kills || 0) : redKills;
      if (this.blueScoreEl) this.blueScoreEl.textContent = p2 ? (p2.kills || 0) : blueKills;
    } else {
      if (this.redScoreEl) this.redScoreEl.textContent = redKills;
      if (this.blueScoreEl) this.blueScoreEl.textContent = blueKills;
    }
  }

  setMatchMode(mode) {
    if (this.modeLabelEl) {
      this.modeLabelEl.textContent = mode ? `${mode.toUpperCase()} DEATHMATCH` : 'DEATHMATCH';
    }
  }

  updateKeysHeld(count) {
    if (this.keysCountEl) {
      this.keysCountEl.textContent = count;
    }
  }

  showNotice(text, duration = 3.0) {
    if (!this.noticeEl) return;
    this.noticeEl.textContent = text;
    this.noticeEl.classList.remove('hidden');
    clearTimeout(this._noticeTimer);
    this._noticeTimer = setTimeout(() => {
      this.noticeEl.classList.add('hidden');
    }, duration * 1000);
  }

  addKillFeedItem(killerName, victimName, isLocalKiller = false, isLocalVictim = false) {
    if (!this.killFeedEl) return;

    const row = document.createElement('div');
    row.className = `kill-feed-item ${isLocalKiller ? 'local-kill' : ''} ${isLocalVictim ? 'local-death' : ''}`;
    row.innerHTML = `
      <span class="killer">${killerName}</span>
      <span class="icon">💥</span>
      <span class="victim">${victimName}</span>
    `;

    this.killFeedEl.prepend(row);
    setTimeout(() => {
      row.classList.add('fade-out');
      setTimeout(() => {
        if (row.parentNode) row.parentNode.removeChild(row);
      }, 500);
    }, 4000);
  }

  showRespawnCountdown(killerName, countdownNum = 3) {
    if (this.respawnOverlay) {
      this.respawnOverlay.classList.remove('hidden');
    }
    if (this.respawnKillerText) {
      this.respawnKillerText.textContent = killerName ? `ELIMINATED BY ${killerName.toUpperCase()}` : 'ELIMINATED';
    }
    if (this.respawnCountdownNum) {
      this.respawnCountdownNum.textContent = countdownNum;
    }
  }

  updateRespawnCountdown(num) {
    if (this.respawnCountdownNum) {
      this.respawnCountdownNum.textContent = num;
    }
  }

  hideRespawn() {
    if (this.respawnOverlay) {
      this.respawnOverlay.classList.add('hidden');
    }
  }

  showResults(winnerData = {}, players = []) {
    if (this.resultsModal) {
      this.resultsModal.classList.remove('hidden');
    }

    if (this.winnerTitle) {
      this.winnerTitle.textContent = winnerData.winnerTitle || 'MATCH OVER';
      if (winnerData.winnerTeam === 'red') {
        this.winnerTitle.style.color = '#e74c3c';
      } else if (winnerData.winnerTeam === 'blue') {
        this.winnerTitle.style.color = '#3498db';
      } else {
        this.winnerTitle.style.color = '#f1c40f';
      }
    }

    if (this.winnerSubtitle) {
      this.winnerSubtitle.textContent = winnerData.subtitle || '2 Minutes Expired';
    }

    if (this.resultsTbody) {
      this.resultsTbody.innerHTML = '';
      const sorted = [...players].sort((a, b) => (b.kills || 0) - (a.kills || 0));

      sorted.forEach((p) => {
        const tr = document.createElement('tr');
        const teamBadge = p.team === 'blue' ? '<span style="color:#3498db;">🔵 BLUE</span>' : '<span style="color:#e74c3c;">🔴 RED</span>';
        const charName = (p.characterId || 'Operative').replace(/[_-]/g, ' ').toUpperCase();

        tr.innerHTML = `
          <td>${teamBadge}</td>
          <td style="font-weight: bold; color: #fff;">${p.name || 'Operative'}</td>
          <td style="color: #aaa;">${charName}</td>
          <td style="color: #2ecc71; font-weight: bold;">${p.kills || 0}</td>
          <td style="color: #e74c3c;">${p.deaths || 0}</td>
          <td style="color: #f1c40f; font-weight: bold;">${p.score || 0}</td>
        `;
        this.resultsTbody.appendChild(tr);
      });
    }
  }

  hideResults() {
    if (this.resultsModal) {
      this.resultsModal.classList.add('hidden');
    }
  }
}
