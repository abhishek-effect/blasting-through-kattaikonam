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
    this._lastTrackerAngle = -999;
    this._lastTrackerDist = -999;
    this._lastSurviveSeconds = -1;
    this._lastRearview = false;
    this._lastPhotocopy = false;
  }

  buildMarkup() {
    this.container.innerHTML = `
      <!-- Top Objective & Evil Santhomite Threat Bar -->
      <div class="evade-top-bar">
        <div id="evade-objective-badge" class="evade-objective-card">
          <span class="obj-icon">🔑</span>
          <span id="evade-objective-text">OBJECTIVE: Unlock seminar hall by obtaining its key!</span>
        </div>
        <div id="evade-threat-badge" class="evade-threat-card">
          <span class="threat-icon">⚠️</span>
          <span id="evade-threat-text">EVIL SANTHOMITES: 2 ACTIVE | SPEED: 100%</span>
        </div>
      </div>

      <!-- Survival Mode Timer Banner (Shown in Survive Mode) -->
      <div id="evade-survive-timer-badge" class="evade-survive-timer-card hidden">
        <span class="timer-icon">⏱️</span>
        <span id="evade-survive-timer-text">SURVIVE: 02:00</span>
      </div>

      <!-- Persistent Evil Santhomite Directional Location Tracker -->
      <div id="evade-threat-tracker" class="evade-threat-tracker">
        <div class="tracker-card">
          <div class="tracker-pointer-frame">
            <img id="evade-tracker-arrow" src="./images/evade-location-indicator.png" alt="Threat Tracker" class="tracker-arrow" />
          </div>
          <div class="tracker-info">
            <div id="evade-tracker-dist" class="tracker-dist">-- m</div>
            <div id="evade-tracker-label" class="tracker-sub">NEAREST SANTHOMITE</div>
          </div>
        </div>
      </div>

      <!-- Rear View Active Banner -->
      <div id="evade-rearview-banner" class="evade-rearview-banner hidden">
        <span>👀 REAR VIEW ACTIVE [V]</span>
      </div>

      <!-- Photocopy Acquired In-Hand Status -->
      <div id="evade-photocopy-badge" class="evade-photocopy-badge hidden">
        <img src="./images/photocopy.jpg" alt="Photocopy" class="photocopy-badge-img" />
        <span class="photocopy-badge-text">PHOTOCOPY IN HAND - HEAD TO ELEVATOR!</span>
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

      <!-- Fullscreen Victory: YOU ESCAPED / YOU SURVIVED -->
      <div id="evade-escaped-screen" class="evade-end-screen escaped-screen hidden">
        <div class="escaped-box">
          <div id="evade-victory-badge" class="escaped-badge">★ MISSION COMPLETE ★</div>
          <h1 id="evade-victory-title" class="escaped-title">YOU ESCAPED</h1>
          <p id="evade-victory-desc" class="escaped-desc">You unlocked the Seminar Hall, obtained the photocopy, and took the elevator!</p>
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
    this.surviveBadgeEl = document.getElementById('evade-survive-timer-badge');
    this.surviveTimerTextEl = document.getElementById('evade-survive-timer-text');
    this.threatTrackerEl = document.getElementById('evade-threat-tracker');
    this.trackerArrowEl = document.getElementById('evade-tracker-arrow');
    this.trackerDistEl = document.getElementById('evade-tracker-dist');
    this.trackerLabelEl = document.getElementById('evade-tracker-label');
    this.rearviewBannerEl = document.getElementById('evade-rearview-banner');
    this.photocopyBadgeEl = document.getElementById('evade-photocopy-badge');

    this.rosterListEl = document.getElementById('evade-roster-list');
    this.downedAlertEl = document.getElementById('evade-downed-alert');
    this.bleedoutFillEl = document.getElementById('evade-bleedout-bar-fill');
    this.revivePromptEl = document.getElementById('evade-revive-prompt');
    this.reviveTargetEl = document.getElementById('evade-revive-target-name');
    this.reviveFillEl = document.getElementById('evade-revive-progress-fill');
    this.oofedScreenEl = document.getElementById('evade-oofed-screen');
    this.escapedScreenEl = document.getElementById('evade-escaped-screen');
    this.victoryBadgeEl = document.getElementById('evade-victory-badge');
    this.victoryTitleEl = document.getElementById('evade-victory-title');
    this.victoryDescEl = document.getElementById('evade-victory-desc');

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

  /**
   * Updates the persistent on-screen directional Evil Santhomite tracker
   * @param {number} angleDeg Relative angle in degrees to rotate arrow towards nearest threat
   * @param {number} distance Distance in meters
   * @param {string} threatName Name of closest threat
   */
  updateThreatTracker(angleDeg, distance, threatName = 'Evil Santhomite') {
    if (!this.threatTrackerEl || !this.trackerArrowEl || !this.trackerDistEl) return;

    const roundedAngle = Math.round(angleDeg);
    const roundedDist = Math.round(distance * 10) / 10;

    if (roundedAngle !== this._lastTrackerAngle) {
      this._lastTrackerAngle = roundedAngle;
      this.trackerArrowEl.style.transform = `rotate(${roundedAngle}deg)`;
    }

    if (roundedDist !== this._lastTrackerDist) {
      this._lastTrackerDist = roundedDist;
      this.trackerDistEl.textContent = `${roundedDist.toFixed(1)}m`;

      // Color coding & danger pulse based on proximity
      let col = '#2ecc71';
      if (roundedDist < 12) {
        col = '#ff3838';
        this.threatTrackerEl.classList.add('imminent-danger');
      } else if (roundedDist < 25) {
        col = '#ff9f1a';
        this.threatTrackerEl.classList.remove('imminent-danger');
      } else {
        this.threatTrackerEl.classList.remove('imminent-danger');
      }
      this.trackerDistEl.style.color = col;
    }

    if (this.trackerLabelEl && threatName) {
      this.trackerLabelEl.textContent = threatName.toUpperCase();
    }
  }

  setSurvivalTimer(secondsRemaining) {
    if (!this.surviveBadgeEl || !this.surviveTimerTextEl) return;

    if (secondsRemaining <= 0) {
      this.surviveTimerTextEl.textContent = 'SURVIVE: 00:00';
      return;
    }

    this.surviveBadgeEl.classList.remove('hidden');

    const roundedSec = Math.ceil(secondsRemaining);
    if (roundedSec !== this._lastSurviveSeconds) {
      this._lastSurviveSeconds = roundedSec;
      const mins = Math.floor(roundedSec / 60);
      const secs = roundedSec % 60;
      const formatted = `SURVIVE: ${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
      this.surviveTimerTextEl.textContent = formatted;

      if (roundedSec <= 30) {
        this.surviveBadgeEl.classList.add('timer-critical');
      } else {
        this.surviveBadgeEl.classList.remove('timer-critical');
      }
    }
  }

  hideSurvivalTimer() {
    if (this.surviveBadgeEl) {
      this.surviveBadgeEl.classList.add('hidden');
      this.surviveBadgeEl.classList.remove('timer-critical');
    }
    this._lastSurviveSeconds = -1;
  }

  setRearView(isActive) {
    if (!this.rearviewBannerEl) return;
    if (isActive !== this._lastRearview) {
      this._lastRearview = isActive;
      if (isActive) {
        this.rearviewBannerEl.classList.remove('hidden');
      } else {
        this.rearviewBannerEl.classList.add('hidden');
      }
    }
  }

  setPhotocopyStatus(hasPhotocopy) {
    if (!this.photocopyBadgeEl) return;
    if (hasPhotocopy !== this._lastPhotocopy) {
      this._lastPhotocopy = hasPhotocopy;
      if (hasPhotocopy) {
        this.photocopyBadgeEl.classList.remove('hidden');
      } else {
        this.photocopyBadgeEl.classList.add('hidden');
      }
    }
  }

  showEscapedScreen(onReplay, onMenu, isSurviveMode = false) {
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
    if (this.escapedScreenEl) {
      this.escapedScreenEl.classList.remove('hidden');
    }
    if (this.victoryBadgeEl && this.victoryTitleEl && this.victoryDescEl) {
      if (isSurviveMode) {
        this.victoryBadgeEl.textContent = '★ SURVIVAL COMPLETE ★';
        this.victoryTitleEl.textContent = 'YOU SURVIVED!';
        this.victoryDescEl.textContent = 'You outlasted the Evil Santhomites and survived campus lockdown!';
      } else {
        this.victoryBadgeEl.textContent = '★ MISSION COMPLETE ★';
        this.victoryTitleEl.textContent = 'YOU ESCAPED';
        this.victoryDescEl.textContent = 'You unlocked the Seminar Hall, obtained the photocopy, and took the elevator!';
      }
    }
    if (this.btnVictoryReplay) {
      this.btnVictoryReplay.onclick = () => onReplay && onReplay();
    }
    if (this.btnVictoryMenu) {
      this.btnVictoryMenu.onclick = () => onMenu && onMenu();
    }
  }
}

