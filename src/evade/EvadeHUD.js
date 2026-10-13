/**
 * EvadeHUD Module
 * Renders the Evade mode HUD:
 * - Top Objective tracker (Key clues & Escape prompt)
 * - Evil Santhomite Threat Level & Speed escalation banner
 * - Teammates Roster (HP, Downed / Escaped status)
 * - Revive hold progress bar
 * - Fullscreen 'YOU ESCAPED' victory display
 * - Fullscreen 'Not so vibrant, are you?' defeat display
 */
export class EvadeHUD {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'evade-hud';
    this.container.className = 'evade-hud hidden';
    document.body.appendChild(this.container);

    this.buildMarkup();
    this.reviveProgress = 0;

    // Dirty-check caching (Eliminates 60Hz innerHTML thrashing)
    this._lastObjective = '';
    this._lastThreatText = '';
    this._lastRosterSig = '';
    this._lastBleedoutPct = -1;
    this._lastReviveName = '';
    this._lastRevivePct = -1;
  }

  buildMarkup() {
    this.container.innerHTML = `
      <!-- Top Objective & Evil Santhomite Threat Bar -->
      <div class="evade-top-bar">
        <div id="evade-objective-badge" class="evade-objective-card">
          <span class="obj-icon">🔑</span>
          <span id="evade-objective-text">OBJECTIVE: SEARCH FOR INFIRMARY KEY</span>
        </div>
        <div id="evade-threat-badge" class="evade-threat-card">
          <span class="threat-icon">⚠️</span>
          <span id="evade-threat-text">EVIL SANTHOMITES: 1 ACTIVE | SPEED: 100%</span>
        </div>
      </div>

      <!-- Teammates Roster Card (Top Left) -->
      <div id="evade-roster-card" class="evade-roster-card">
        <div class="roster-title">SURVIVORS</div>
        <div id="evade-roster-list" class="roster-list"></div>
      </div>

      <!-- Downed Warning & Bleedout Timer (Center Screen) -->
      <div id="evade-downed-alert" class="evade-downed-alert hidden">
        <div class="downed-title">⚠️ YOU ARE DOWNED!</div>
        <div class="downed-subtitle">Wait for a teammate to revive you</div>
        <div id="evade-bleedout-bar-track">
          <div id="evade-bleedout-bar-fill"></div>
        </div>
      </div>

      <!-- Proximity Revive Hold Indicator -->
      <div id="evade-revive-prompt" class="evade-revive-prompt hidden">
        <div class="revive-label">HOLD [E] TO REVIVE</div>
        <div id="evade-revive-target-name" class="revive-target">Teammate</div>
        <div class="revive-progress-track">
          <div id="evade-revive-progress-fill"></div>
        </div>
      </div>

      <!-- Fullscreen Game Over: Not so vibrant, are you? -->
      <div id="evade-oofed-screen" class="evade-end-screen oofed-screen hidden">
        <div class="oofed-box">
          <h1 class="oofed-title">Not so vibrant, are you?</h1>
          <p class="oofed-desc">LMAO</p>
          <div class="oofed-buttons">
            <button id="btn-evade-retry" class="evade-btn retry-btn">🔄 TRY AGAIN</button>
            <button id="btn-evade-menu" class="evade-btn menu-btn">🏠 MAIN MENU</button>
          </div>
        </div>
      </div>

      <!-- Fullscreen Victory: YOU ESCAPED -->
      <div id="evade-escaped-screen" class="evade-end-screen escaped-screen hidden">
        <div class="escaped-box">
          <div class="escaped-badge">★ MISSION COMPLETE ★</div>
          <h1 class="escaped-title">YOU ESCAPED</h1>
          <p class="escaped-desc">You unlocked the Seminar Hall and outran the Evil Santhomites!</p>
          <div class="escaped-buttons">
            <button id="btn-evade-victory-replay" class="evade-btn victory-btn">★ PLAY AGAIN</button>
            <button id="btn-evade-victory-menu" class="evade-btn menu-btn">🏠 MAIN MENU</button>
          </div>
        </div>
      </div>
    `;

    // Elements
    this.objectiveTextEl = document.getElementById('evade-objective-text');
    this.threatTextEl = document.getElementById('evade-threat-text');
    this.rosterListEl = document.getElementById('evade-roster-list');
    this.downedAlertEl = document.getElementById('evade-downed-alert');
    this.bleedoutFillEl = document.getElementById('evade-bleedout-bar-fill');
    this.revivePromptEl = document.getElementById('evade-revive-prompt');
    this.reviveTargetEl = document.getElementById('evade-revive-target-name');
    this.reviveFillEl = document.getElementById('evade-revive-progress-fill');
    this.oofedScreenEl = document.getElementById('evade-oofed-screen');
    this.escapedScreenEl = document.getElementById('evade-escaped-screen');

    this.btnRetry = document.getElementById('btn-evade-retry');
    this.btnMenu = document.getElementById('btn-evade-menu');
    this.btnVictoryReplay = document.getElementById('btn-evade-victory-replay');
    this.btnVictoryMenu = document.getElementById('btn-evade-victory-menu');
  }

  show() {
    this.container.classList.remove('hidden');
    this.hideEndScreens();
  }

  hide() {
    this.container.classList.add('hidden');
    this.hideEndScreens();
  }

  hideEndScreens() {
    if (this.oofedScreenEl) this.oofedScreenEl.classList.add('hidden');
    if (this.escapedScreenEl) this.escapedScreenEl.classList.add('hidden');
    if (this.downedAlertEl) this.downedAlertEl.classList.add('hidden');
    if (this.revivePromptEl) this.revivePromptEl.classList.add('hidden');
  }

  setObjective(text) {
    if (this.objectiveTextEl && text !== this._lastObjective) {
      this._lastObjective = text;
      this.objectiveTextEl.textContent = text;
    }
  }

  setThreatLevel(botCount, speedMultiplier) {
    if (this.threatTextEl) {
      const pct = Math.round(speedMultiplier * 100);
      const msg = `EVIL SANTHOMITES: ${botCount} ACTIVE | SPEED: ${pct}%`;
      if (msg !== this._lastThreatText) {
        this._lastThreatText = msg;
        this.threatTextEl.textContent = msg;
      }
    }
  }

  updateRoster(playersList = []) {
    if (!this.rosterListEl) return;

    // Compute signature to skip DOM recreation when roster state is unchanged
    let sig = '';
    for (let i = 0; i < playersList.length; i++) {
      const p = playersList[i];
      sig += `${p.name || ''}:${Math.round(p.health || 0)}:${p.isDowned ? 1 : 0}:${p.isEscaped ? 1 : 0}|`;
    }
    if (sig === this._lastRosterSig) return;
    this._lastRosterSig = sig;

    this.rosterListEl.innerHTML = '';

    playersList.forEach((p) => {
      const item = document.createElement('div');
      item.className = 'roster-player-item';

      const statusBadge = p.isEscaped ? '★ ESCAPED' : (p.isDowned ? '⚠️ DOWNED' : `${Math.round(p.health || 100)}%`);
      const statusColor = p.isEscaped ? '#2ecc71' : (p.isDowned ? '#e74c3c' : '#f1c40f');

      item.innerHTML = `
        <span class="player-name">${p.isLocal ? '👤 You' : (p.name || 'Survivor')}</span>
        <span class="player-hp" style="color: ${statusColor}; font-weight: bold;">${statusBadge}</span>
      `;
      this.rosterListEl.appendChild(item);
    });
  }

  setDowned(isDowned, bleedoutPct = 1.0) {
    if (!this.downedAlertEl) return;
    if (isDowned) {
      this.downedAlertEl.classList.remove('hidden');
      if (this.bleedoutFillEl) {
        const rounded = Math.round(Math.max(0, Math.min(100, bleedoutPct * 100)));
        if (rounded !== this._lastBleedoutPct) {
          this._lastBleedoutPct = rounded;
          this.bleedoutFillEl.style.width = `${rounded}%`;
        }
      }
    } else {
      this.downedAlertEl.classList.add('hidden');
      this._lastBleedoutPct = -1;
    }
  }

  showRevivePrompt(targetName, progress = 0) {
    if (!this.revivePromptEl) return;
    this.revivePromptEl.classList.remove('hidden');
    if (this.reviveTargetEl && targetName !== this._lastReviveName) {
      this._lastReviveName = targetName;
      this.reviveTargetEl.textContent = targetName;
    }
    if (this.reviveFillEl) {
      const rounded = Math.round(Math.min(100, progress * 100));
      if (rounded !== this._lastRevivePct) {
        this._lastRevivePct = rounded;
        this.reviveFillEl.style.width = `${rounded}%`;
      }
    }
  }

  hideRevivePrompt() {
    if (this.revivePromptEl) {
      this.revivePromptEl.classList.add('hidden');
      this._lastReviveName = '';
      this._lastRevivePct = -1;
    }
  }

  showOofedScreen(onRetry, onMenu) {
    const container = document.getElementById('game-container') || document.body;
    if (container) {
      container.classList.remove('screen-shake');
      void container.offsetWidth;
      container.classList.add('screen-shake');
      setTimeout(() => container.classList.remove('screen-shake'), 500);
    }
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
    if (this.oofedScreenEl) {
      this.oofedScreenEl.classList.remove('hidden');
    }
    if (this.btnRetry) {
      this.btnRetry.onclick = () => onRetry && onRetry();
    }
    if (this.btnMenu) {
      this.btnMenu.onclick = () => onMenu && onMenu();
    }
  }

  showEscapedScreen(onReplay, onMenu) {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
    if (this.escapedScreenEl) {
      this.escapedScreenEl.classList.remove('hidden');
    }
    if (this.btnVictoryReplay) {
      this.btnVictoryReplay.onclick = () => onReplay && onReplay();
    }
    if (this.btnVictoryMenu) {
      this.btnVictoryMenu.onclick = () => onMenu && onMenu();
    }
  }
}

