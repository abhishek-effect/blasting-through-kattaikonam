/**
 * EvadeHUD Module
 * Renders the Roblox Evade style HUD:
 * - Top Objective tracker (Key clues & Escape prompt)
 * - Nextbot Threat Level & Speed escalation banner
 * - Teammates Roster (HP, Downed / Escaped status)
 * - Revive hold progress bar
 * - Fullscreen 'YOU ESCAPED' victory display
 * - Fullscreen 'You oofed' defeat display
 */
export class EvadeHUD {
  constructor() {
    this.container = document.createElement('div');
    this.container.id = 'evade-hud';
    this.container.className = 'evade-hud hidden';
    document.body.appendChild(this.container);

    this.buildMarkup();
    this.reviveProgress = 0;
  }

  buildMarkup() {
    this.container.innerHTML = `
      <!-- Top Objective & Nextbot Threat Bar -->
      <div class="evade-top-bar">
        <div id="evade-objective-badge" class="evade-objective-card">
          <span class="obj-icon">🔑</span>
          <span id="evade-objective-text">OBJECTIVE: SEARCH FOR INFIRMARY KEY</span>
        </div>
        <div id="evade-threat-badge" class="evade-threat-card">
          <span class="threat-icon">⚠️</span>
          <span id="evade-threat-text">NEXTBOTS: 1 ACTIVE | SPEED: 100%</span>
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

      <!-- Fullscreen Game Over: You oofed -->
      <div id="evade-oofed-screen" class="evade-end-screen oofed-screen hidden">
        <div class="oofed-box">
          <h1 class="oofed-title">You oofed</h1>
          <p class="oofed-desc">Caught by the campus Nextbots.</p>
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
          <p class="escaped-desc">You unlocked the Seminar Hall and outran the Nextbots!</p>
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
    if (this.objectiveTextEl) {
      this.objectiveTextEl.textContent = text;
    }
  }

  setThreatLevel(botCount, speedMultiplier) {
    if (this.threatTextEl) {
      const pct = Math.round(speedMultiplier * 100);
      this.threatTextEl.textContent = `NEXTBOTS: ${botCount} ACTIVE | SPEED: ${pct}%`;
    }
  }

  updateRoster(playersList = []) {
    if (!this.rosterListEl) return;
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
        this.bleedoutFillEl.style.width = `${Math.max(0, Math.min(100, bleedoutPct * 100))}%`;
      }
    } else {
      this.downedAlertEl.classList.add('hidden');
    }
  }

  showRevivePrompt(targetName, progress = 0) {
    if (!this.revivePromptEl) return;
    this.revivePromptEl.classList.remove('hidden');
    if (this.reviveTargetEl) this.reviveTargetEl.textContent = targetName;
    if (this.reviveFillEl) {
      this.reviveFillEl.style.width = `${Math.min(100, Math.round(progress * 100))}%`;
    }
  }

  hideRevivePrompt() {
    if (this.revivePromptEl) {
      this.revivePromptEl.classList.add('hidden');
    }
  }

  showOofedScreen(onRetry, onMenu) {
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
