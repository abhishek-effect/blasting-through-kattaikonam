/**
 * BattleLobbyUI Module
 * Renders the Battle Multiplayer lobby modal:
 * - Match mode selector: 1v1, 2v2, 3v3
 * - Side-by-side Host Match & Join Match
 * - Live Available Battles list with 1-click Join
 * - Unique character selector grid displaying all JPG and PNG characters
 * - Team selection (Red Team vs Blue Team)
 * - Waiting room with player ready list
 */
import { ASSET_PATHS, assetUrl } from '../config/assets.js';
import { MATCH_MODES } from './BattleNetworkManager.js';

export class BattleLobbyUI {
  constructor(networkManager) {
    this.network = networkManager;

    this.container = document.createElement('div');
    this.container.id = 'battle-lobby-modal';
    this.container.className = 'battle-lobby-modal hidden';
    document.body.appendChild(this.container);

    this.onStartMatch = null;
    this.onBackToMenu = null;

    this.savedName = localStorage.getItem('kattaikonam_player_name') || `Operative_${Math.floor(Math.random() * 899 + 100)}`;
    this.selectedCharId = localStorage.getItem('kattaikonam_battle_character') || 'aahil_confront';

    this.buildMarkup();
    this.initEvents();
    this.initAvailableMatches();
  }

  buildMarkup() {
    this.container.innerHTML = `
      <div class="lobby-backdrop"></div>
      <div class="lobby-card battle-card">
        <div class="lobby-header">
          <div class="lobby-badge battle-badge">⚔️ DEATHMATCH MULTIPLAYER</div>
          <h2 class="lobby-title" style="color: #ff4757;">BATTLE ARENA</h2>
          <p class="lobby-subtitle">2-Minute Combat Deathmatch | 1v1, 2v2 &amp; 3v3 | Locked Doors &amp; Key Scramble</p>
        </div>

        <!-- Operative Name Input -->
        <div class="lobby-field-row">
          <label for="battle-player-name">YOUR OPERATIVE CODENAME:</label>
          <input type="text" id="battle-player-name" class="lobby-input" maxlength="16" value="${this.savedName}" placeholder="Enter name..." />
        </div>

        <!-- Match Mode Picker (1v1, 2v2, 3v3) -->
        <div class="battle-mode-select-row">
          <span class="mode-select-label">MATCH FORMAT:</span>
          <div class="battle-mode-pills">
            <button class="mode-pill active" data-mode="1v1">1 vs 1 (DUEL)</button>
            <button class="mode-pill" data-mode="2v2">2 vs 2 (SQUAD)</button>
            <button class="mode-pill" data-mode="3v3">3 vs 3 (WAR)</button>
          </div>
        </div>

        <!-- Character Selection Grid (Unique per match) -->
        <div class="character-select-section">
          <div class="char-section-title">
            <span>🎭 CHOOSE YOUR CHARACTER (UNIQUE PER OPERATIVE):</span>
            <span id="char-selection-warning" class="char-warning-msg hidden">Character already claimed!</span>
          </div>
          <div id="battle-character-grid" class="battle-character-grid"></div>
        </div>

        <!-- Grouped 2-Column: HOST BATTLE (Left) & JOIN BATTLE (Right) -->
        <div id="battle-grouped-section" class="lobby-grouped-container">
          <!-- Column 1: HOST BATTLE -->
          <div id="battle-host-card" class="lobby-group-card host-group">
            <div class="group-header">
              <span class="group-icon">👑</span>
              <h3 class="group-title">HOST MATCH</h3>
            </div>
            <p class="group-desc">Create your own battle room with chosen format and invite opponents.</p>

            <div id="battle-host-unhosted">
              <button id="btn-battle-create" class="lobby-action-btn primary-btn" style="background: linear-gradient(135deg, #c0392b, #8e44ad); border-color: #e74c3c;">
                ★ HOST BATTLE ARENA
              </button>
            </div>

            <div id="battle-host-info" class="host-room-info hidden">
              <div class="room-code-display">
                <span class="room-code-label">ROOM CODE:</span>
                <span id="battle-display-code" class="room-code-val">-----</span>
                <button id="btn-battle-copy-link" class="lobby-small-btn" title="Copy Invite Link">📋 COPY LINK</button>
              </div>

              <!-- Team Switcher for Host in 2v2 / 3v3 -->
              <div id="battle-host-team-row" class="battle-team-switch-row hidden">
                <span>ASSIGNED TEAM:</span>
                <button id="btn-host-toggle-team" class="lobby-small-btn team-toggle-btn">🔴 RED TEAM (CLICK TO SWITCH)</button>
              </div>

              <div class="players-counter-box">
                <span id="battle-players-counter">Operatives in arena: 1</span>
              </div>

              <div class="players-list-box">
                <div class="list-title">CONNECTED OPERATIVES:</div>
                <div id="battle-host-players-list" class="players-list"></div>
              </div>

              <div class="host-actions-row">
                <button id="btn-battle-start" class="lobby-action-btn start-btn" style="background: linear-gradient(135deg, #27ae60, #2ecc71); border-color: #2ecc71;">
                  ▶ START 2-MIN DEATHMATCH
                </button>
                <button id="btn-battle-cancel" class="lobby-action-btn secondary-btn" style="margin-top: 6px; background: rgba(192, 57, 43, 0.7); border-color: #e74c3c;">
                  🚪 CANCEL HOSTING
                </button>
              </div>
            </div>
          </div>

          <!-- Column 2: JOIN BATTLE & LIVE MATCHES -->
          <div id="battle-join-card" class="lobby-group-card join-group">
            <div class="group-header">
              <span class="group-icon">🔗</span>
              <h3 class="group-title">JOIN MATCH</h3>
            </div>
            <p class="group-desc">Enter a Room Code or click a live match below to enter the battle.</p>

            <div id="battle-join-input-box">
              <div class="lobby-field-row">
                <input type="text" id="battle-join-code-input" class="lobby-input uppercase" maxlength="8" placeholder="ENTER CODE (e.g. K9X2A)" />
                <button id="btn-battle-join-code" class="lobby-action-btn primary-btn" style="margin-top: 6px;">
                  🔗 ENTER ARENA
                </button>
              </div>

              <div class="available-matches-box" style="margin-top: 14px;">
                <div class="available-matches-header">
                  <span class="matches-title">LIVE BATTLE MATCHES</span>
                  <button id="btn-battle-refresh-matches" class="lobby-small-btn">🔄 REFRESH</button>
                </div>
                <div id="battle-available-matches-list" class="available-matches-list">
                  <div style="font-size: 11px; color: #888; padding: 6px; text-align: center;">Searching for battle arenas...</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Dedicated Client Waiting Box -->
        <div id="battle-client-wait-box" class="client-wait-box hidden">
          <div class="connecting-spinner">⚔️</div>
          <div id="battle-client-status" class="client-wait-status">Connecting to Host Arena...</div>

          <div id="battle-client-team-row" class="battle-team-switch-row" style="margin-top: 8px;">
            <span>YOUR TEAM:</span>
            <button id="btn-client-toggle-team" class="lobby-small-btn team-toggle-btn">🔵 BLUE TEAM (CLICK TO SWITCH)</button>
          </div>

          <div class="players-list-box" style="margin-top: 8px;">
            <div class="list-title">ARENA ROSTER:</div>
            <div id="battle-client-players-list" class="players-list"></div>
          </div>

          <button id="btn-battle-client-leave" class="lobby-action-btn secondary-btn" style="margin-top: 8px; background: rgba(192, 57, 43, 0.7); border-color: #e74c3c;">
            🚪 LEAVE ARENA
          </button>
        </div>

        <!-- Footer -->
        <div class="lobby-footer">
          <button id="btn-battle-back" class="lobby-back-btn">◀ RETURN TO MAIN MENU</button>
        </div>
      </div>
    `;

    // Elements
    this.nameInput = document.getElementById('battle-player-name');
    this.characterGrid = document.getElementById('battle-character-grid');
    this.charWarningMsg = document.getElementById('char-selection-warning');
    this.modePills = this.container.querySelectorAll('.mode-pill');

    this.groupedSection = document.getElementById('battle-grouped-section');
    this.hostCard = document.getElementById('battle-host-card');
    this.joinCard = document.getElementById('battle-join-card');

    this.hostUnhosted = document.getElementById('battle-host-unhosted');
    this.hostInfo = document.getElementById('battle-host-info');
    this.btnCreate = document.getElementById('btn-battle-create');
    this.displayCode = document.getElementById('battle-display-code');
    this.btnCopyLink = document.getElementById('btn-battle-copy-link');
    this.playersCounter = document.getElementById('battle-players-counter');
    this.hostPlayersList = document.getElementById('battle-host-players-list');
    this.hostTeamRow = document.getElementById('battle-host-team-row');
    this.btnHostToggleTeam = document.getElementById('btn-host-toggle-team');
    this.btnStartMatch = document.getElementById('btn-battle-start');
    this.btnCancelHost = document.getElementById('btn-battle-cancel');

    this.joinCodeInput = document.getElementById('battle-join-code-input');
    this.btnJoin = document.getElementById('btn-battle-join-code');
    this.availableMatchesList = document.getElementById('battle-available-matches-list');
    this.btnRefreshMatches = document.getElementById('btn-battle-refresh-matches');

    this.clientWaitBox = document.getElementById('battle-client-wait-box');
    this.clientStatus = document.getElementById('battle-client-status');
    this.clientTeamRow = document.getElementById('battle-client-team-row');
    this.btnClientToggleTeam = document.getElementById('btn-client-toggle-team');
    this.clientPlayersList = document.getElementById('battle-client-players-list');
    this.btnClientLeave = document.getElementById('btn-battle-client-leave');

    this.btnBack = document.getElementById('btn-battle-back');

    this.renderCharacterGrid();
  }

  renderCharacterGrid() {
    if (!this.characterGrid) return;
    this.characterGrid.innerHTML = '';

    const roster = ASSET_PATHS.enemies.types;
    const keys = Object.keys(roster).filter((k) => !k.toLowerCase().includes('photocopy'));

    const takenChars = new Map(); // charId -> playerName
    this.network.players.forEach((p) => {
      if (p.id !== this.network.localId && p.characterId) {
        takenChars.set(p.characterId, p.name);
      }
    });

    keys.forEach((key) => {
      const item = roster[key];
      const isSelected = (this.selectedCharId === key);
      const isTaken = takenChars.has(key);
      const takenBy = takenChars.get(key);

      const card = document.createElement('div');
      card.className = `battle-char-card ${isSelected ? 'selected' : ''} ${isTaken ? 'claimed' : ''}`;
      card.dataset.charId = key;

      card.innerHTML = `
        <div class="char-card-thumb">
          <img src="${item.sprite}" alt="${item.name}" onerror="this.style.display='none'" />
        </div>
        <div class="char-card-name">${item.name}</div>
        <div class="char-card-badge">${isSelected ? '✓ CHOSEN' : (isTaken ? `🔒 BY ${takenBy.slice(0, 8)}` : 'READY')}</div>
      `;

      if (!isTaken) {
        card.addEventListener('click', () => {
          this.selectedCharId = key;
          localStorage.setItem('kattaikonam_battle_character', key);
          this.network.selectCharacter(key);
          this.renderCharacterGrid();
        });
      }

      this.characterGrid.appendChild(card);
    });
  }

  initEvents() {
    this.nameInput.addEventListener('change', (e) => {
      this.savedName = (e.target.value.trim() || 'Operative');
      localStorage.setItem('kattaikonam_player_name', this.savedName);
      this.network.localPlayerName = this.savedName;
    });

    // Format selection pills (1v1, 2v2, 3v3)
    this.modePills.forEach((pill) => {
      pill.addEventListener('click', () => {
        this.modePills.forEach((p) => p.classList.remove('active'));
        pill.classList.add('active');
        const mode = pill.dataset.mode;
        this.network.setMatchMode(mode);
        this.updateTeamRowVisibility(mode);
      });
    });

    // Host Create Room
    this.btnCreate.addEventListener('click', async () => {
      this.btnCreate.disabled = true;
      this.btnCreate.textContent = '⏳ CREATING ARENA...';
      try {
        const activePill = this.container.querySelector('.mode-pill.active');
        const mode = activePill ? activePill.dataset.mode : '1v1';
        const res = await this.network.createRoom(null, mode);

        this.hostUnhosted.classList.add('hidden');
        this.hostInfo.classList.remove('hidden');
        this.displayCode.textContent = res.roomCode;

        if (this.joinCard) {
          this.joinCard.style.opacity = '0.4';
          this.joinCard.style.pointerEvents = 'none';
        }

        this.updateTeamRowVisibility(mode);
        this.updatePlayersList(Array.from(this.network.players.values()), true, mode);
      } catch (err) {
        console.error('Host creation failed:', err);
        alert('Failed to initialize Battle room: ' + (err.message || err));
        this.btnCreate.disabled = false;
        this.btnCreate.textContent = '★ HOST BATTLE ARENA';
      }
    });

    // Copy Invite Link
    this.btnCopyLink.addEventListener('click', () => {
      if (!this.network.roomCode) return;
      const url = new URL(window.location.href);
      url.searchParams.set('battle_room', this.network.roomCode);
      navigator.clipboard.writeText(url.toString()).then(() => {
        const oldText = this.btnCopyLink.textContent;
        this.btnCopyLink.textContent = '✓ COPIED!';
        setTimeout(() => { this.btnCopyLink.textContent = oldText; }, 2000);
      }).catch(() => {
        prompt('Copy room code:', this.network.roomCode);
      });
    });

    // Team toggle buttons
    if (this.btnHostToggleTeam) {
      this.btnHostToggleTeam.addEventListener('click', () => {
        const newTeam = this.network.localTeam === 'red' ? 'blue' : 'red';
        this.network.selectTeam(newTeam);
        this.btnHostToggleTeam.textContent = newTeam === 'red'
          ? '🔴 RED TEAM (CLICK TO SWITCH)'
          : '🔵 BLUE TEAM (CLICK TO SWITCH)';
      });
    }

    if (this.btnClientToggleTeam) {
      this.btnClientToggleTeam.addEventListener('click', () => {
        const newTeam = this.network.localTeam === 'red' ? 'blue' : 'red';
        this.network.selectTeam(newTeam);
        this.btnClientToggleTeam.textContent = newTeam === 'red'
          ? '🔴 RED TEAM (CLICK TO SWITCH)'
          : '🔵 BLUE TEAM (CLICK TO SWITCH)';
      });
    }

    // Host Start Match
    this.btnStartMatch.addEventListener('click', () => {
      if (this.onStartMatch) {
        this.onStartMatch();
      }
    });

    // Host Cancel
    this.btnCancelHost.addEventListener('click', () => {
      this.network.disconnect();
      this.hostInfo.classList.add('hidden');
      this.hostUnhosted.classList.remove('hidden');
      this.btnCreate.disabled = false;
      this.btnCreate.textContent = '★ HOST BATTLE ARENA';
      if (this.joinCard) {
        this.joinCard.style.opacity = '1';
        this.joinCard.style.pointerEvents = 'auto';
      }
      this.refreshAvailableMatches();
    });

    // Join with Code
    this.btnJoin.addEventListener('click', async () => {
      const code = (this.joinCodeInput ? this.joinCodeInput.value : '').trim().toUpperCase();
      if (!code) {
        alert('Please enter a 5-letter Battle Room Code.');
        return;
      }

      this.btnJoin.disabled = true;
      this.btnJoin.textContent = '⏳ CONNECTING...';
      this.groupedSection.classList.add('hidden');
      this.clientWaitBox.classList.remove('hidden');
      this.clientStatus.textContent = `Connecting to Battle Arena ${code}...`;

      try {
        await this.network.joinRoom(code);
        this.clientStatus.textContent = 'Connected! Waiting for Host to start match...';
      } catch (err) {
        console.error('Join match failed:', err);
        alert(err.message || 'Could not connect to Battle room.');
        this.clientWaitBox.classList.add('hidden');
        this.groupedSection.classList.remove('hidden');
        this.btnJoin.disabled = false;
        this.btnJoin.textContent = '🔗 ENTER ARENA';
      }
    });

    // Client Leave
    this.btnClientLeave.addEventListener('click', () => {
      this.network.disconnect();
      this.clientWaitBox.classList.add('hidden');
      this.groupedSection.classList.remove('hidden');
      this.btnJoin.disabled = false;
      this.btnJoin.textContent = '🔗 ENTER ARENA';
      this.refreshAvailableMatches();
    });

    if (this.btnRefreshMatches) {
      this.btnRefreshMatches.addEventListener('click', () => this.refreshAvailableMatches());
    }

    // Back to Menu
    this.btnBack.addEventListener('click', () => {
      this.hide();
      this.reset();
      this.network.disconnect();
      if (this.onBackToMenu) this.onBackToMenu();
    });

    // Hook network updates
    this.network.onLobbyUpdate = (players, canStart, matchMode) => {
      this.updatePlayersList(players, canStart, matchMode);
      this.renderCharacterGrid();
    };
  }

  updateTeamRowVisibility(mode) {
    const isMultiTeam = mode === '2v2' || mode === '3v3';
    if (this.hostTeamRow) {
      if (isMultiTeam) this.hostTeamRow.classList.remove('hidden');
      else this.hostTeamRow.classList.add('hidden');
    }
    if (this.clientTeamRow) {
      if (isMultiTeam) this.clientTeamRow.classList.remove('hidden');
      else this.clientTeamRow.classList.add('hidden');
    }
  }

  initAvailableMatches() {
    this.refreshAvailableMatches();

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('btk_battle_network');
        bc.onmessage = (e) => {
          if (e.data && (e.data.type === 'BATTLE_LOBBY_HEARTBEAT' || e.data.type === 'BATTLE_LOBBY_CLOSED')) {
            this.refreshAvailableMatches();
          }
        };
      } catch (e) {}
    }

    setInterval(() => {
      if (!this.container.classList.contains('hidden')) {
        this.refreshAvailableMatches();
      }
    }, 2500);
  }

  refreshAvailableMatches() {
    if (!this.availableMatchesList) return;

    let activeRooms = {};
    try {
      activeRooms = JSON.parse(localStorage.getItem('btk_battle_active_rooms') || '{}');
    } catch (e) {}

    const now = Date.now();
    const rooms = Object.values(activeRooms).filter((r) => r && r.roomCode && (now - r.timestamp < 6000));
    const filtered = rooms.filter((r) => r.roomCode !== this.network.roomCode);

    if (filtered.length === 0) {
      this.availableMatchesList.innerHTML = `
        <div style="font-size: 11px; color: #888; padding: 6px; text-align: center;">
          No active battle matches found. Host an arena or enter code above!
        </div>
      `;
      return;
    }

    this.availableMatchesList.innerHTML = '';
    filtered.forEach((r) => {
      const item = document.createElement('div');
      item.className = 'available-match-item';
      item.innerHTML = `
        <div>
          <div class="match-item-code">${r.roomCode} <span style="font-size:10px; color:#ff4757;">[${r.matchMode || '1v1'}]</span></div>
          <div class="match-item-host">Host: ${r.hostName || 'Operative'}</div>
        </div>
        <div>
          <div class="match-item-count">${r.playerCount || 1}/${r.maxPlayers || 2} Players</div>
        </div>
        <button class="btn-quick-join" data-code="${r.roomCode}">⚔️ JOIN</button>
      `;

      const btn = item.querySelector('.btn-quick-join');
      btn.addEventListener('click', () => {
        if (this.joinCodeInput) {
          this.joinCodeInput.value = r.roomCode;
          this.btnJoin.click();
        }
      });

      this.availableMatchesList.appendChild(item);
    });
  }

  updatePlayersList(players = [], canStart = false, matchMode = '1v1') {
    const count = players.length;
    const maxPlayers = MATCH_MODES[matchMode]?.maxPlayers || 2;

    if (this.network.isHost) {
      if (this.playersCounter) {
        this.playersCounter.textContent = `Operatives in arena: ${count}/${maxPlayers} ${canStart ? '(Ready to launch!)' : '(Waiting for players)'}`;
      }
      if (this.btnStartMatch) {
        this.btnStartMatch.disabled = false;
        this.btnStartMatch.textContent = `▶ START 2-MIN DEATHMATCH (${count} PLAYERS)`;
      }
    } else {
      if (this.clientStatus) {
        this.clientStatus.textContent = `Connected! (${count}/${maxPlayers} Operatives). Waiting for Host to start match...`;
      }
    }

    const renderList = (el) => {
      if (!el) return;
      el.innerHTML = '';
      players.forEach((p) => {
        const row = document.createElement('div');
        row.className = 'lobby-player-row';
        const teamBadge = p.team === 'blue' ? '<span style="color:#3498db;">🔵 BLUE</span>' : '<span style="color:#e74c3c;">🔴 RED</span>';
        const charName = ASSET_PATHS.enemies.types[p.characterId]?.name || 'Operative';

        row.innerHTML = `
          <span class="player-icon">${p.isHost ? '👑' : '👤'}</span>
          <span class="player-label">${p.name} ${p.id === this.network.localId ? '(You)' : ''} [${charName}]</span>
          <span class="player-status">${teamBadge}</span>
        `;
        el.appendChild(row);
      });
    };

    renderList(this.hostPlayersList);
    renderList(this.clientPlayersList);
  }

  reset() {
    if (this.hostUnhosted) this.hostUnhosted.classList.remove('hidden');
    if (this.hostInfo) this.hostInfo.classList.add('hidden');
    if (this.btnCreate) {
      this.btnCreate.disabled = false;
      this.btnCreate.textContent = '★ HOST BATTLE ARENA';
    }
    if (this.joinCodeInput) this.joinCodeInput.value = '';
    if (this.btnJoin) {
      this.btnJoin.disabled = false;
      this.btnJoin.textContent = '🔗 ENTER ARENA';
    }
    if (this.groupedSection) this.groupedSection.classList.remove('hidden');
    if (this.clientWaitBox) this.clientWaitBox.classList.add('hidden');
    if (this.joinCard) {
      this.joinCard.style.opacity = '1';
      this.joinCard.style.pointerEvents = 'auto';
    }
  }

  show() {
    this.container.classList.remove('hidden');
    if (document.exitPointerLock) {
      try { document.exitPointerLock(); } catch (e) {}
    }
    this.renderCharacterGrid();
    this.refreshAvailableMatches();
  }

  hide() {
    this.container.classList.add('hidden');
  }
}
