/**
 * EvadeLobbyUI Module
 * Renders the PeerJS peer-to-peer multiplayer lobby modal:
 * - Enter Player Name
 * - Grouped Side-by-Side: Host Game (Left) & Join Game with Available Matches (Right)
 * - Host gets shareable Room Code, Copy Link, and Start Match button
 * - Clients joining see dedicated waiting room with leave option (NO start button)
 * - Available matches list shown right next to Host Game with 1-click Join
 */
export class EvadeLobbyUI {
  constructor(networkManager) {
    this.networkManager = networkManager;

    this.container = document.createElement('div');
    this.container.id = 'evade-lobby-modal';
    this.container.className = 'evade-lobby-modal hidden';
    document.body.appendChild(this.container);

    this.onStartMatch = null;
    this.onBackToMenu = null;

    this.savedName = localStorage.getItem('kattaikonam_player_name') || `Survivor_${Math.floor(Math.random() * 899 + 100)}`;
    this.buildMarkup();
    this.initEvents();
    this.initAvailableMatches();

    // Check if URL has ?room=CODE
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam && this.joinCodeInput) {
      this.joinCodeInput.value = roomParam.trim().toUpperCase();
      setTimeout(() => {
        if (this.btnJoinRoom) this.btnJoinRoom.click();
      }, 300);
    }
  }

  buildMarkup() {
    this.container.innerHTML = `
      <div class="lobby-backdrop"></div>
      <div class="lobby-card">
        <div class="lobby-header">
          <div class="lobby-badge">PEER-TO-PEER MULTIPLAYER</div>
          <h2 class="lobby-title">EVADE MULTIPLAYER</h2>
          <p class="lobby-subtitle">Survive, unlock campus doors, and escape the Evil Santhomites!</p>
        </div>

        <!-- Survivor Name Input -->
        <div class="lobby-field-row">
          <label for="lobby-player-name">YOUR SURVIVOR NAME:</label>
          <input type="text" id="lobby-player-name" class="lobby-input" maxlength="16" value="${this.savedName}" placeholder="Enter name..." />
        </div>

        <!-- Grouped 2-Column Section: HOST GAME (Left) & JOIN GAME (Right) -->
        <div id="lobby-grouped-section" class="lobby-grouped-container">
          <!-- Column 1: HOST GAME -->
          <div id="lobby-host-card" class="lobby-group-card host-group">
            <div class="group-header">
              <span class="group-icon">👑</span>
              <h3 class="group-title">HOST GAME</h3>
            </div>
            <p class="group-desc">Host your own game room and invite friends using a 5-letter Room Code.</p>

            <div id="host-unhosted-section">
              <button id="btn-create-room" class="lobby-action-btn primary-btn">★ HOST A NEW GAME</button>
              <button id="btn-start-solo-unhosted" class="lobby-action-btn solo-btn" style="margin-top: 10px; background: linear-gradient(135deg, #27ae60, #2ecc71); border-color: #2ecc71; font-weight: bold; letter-spacing: 1px;">
                🕹️ SOLO PRACTICE RUN
              </button>
            </div>

            <div id="host-room-info" class="host-room-info hidden">
              <div class="room-code-display">
                <span class="room-code-label">ROOM CODE:</span>
                <span id="display-room-code" class="room-code-val">-----</span>
                <button id="btn-copy-link" class="lobby-small-btn" title="Copy Invite Link">📋 COPY LINK</button>
              </div>

              <div class="players-counter-box">
                <span id="players-counter-text">Players in lobby: 1</span>
              </div>

              <div class="players-list-box">
                <div class="list-title">CONNECTED SURVIVORS:</div>
                <div id="host-players-list" class="players-list"></div>
              </div>

              <div class="host-actions-row">
                <button id="btn-start-match" class="lobby-action-btn start-btn">
                  ▶ START MULTIPLAYER MATCH
                </button>
                <button id="btn-start-solo" class="lobby-action-btn solo-btn" title="Play solo practice without waiting">
                  🕹️ SOLO PRACTICE RUN
                </button>
                <button id="btn-host-leave" class="lobby-action-btn secondary-btn" style="margin-top: 6px; background: rgba(192, 57, 43, 0.7); border-color: #e74c3c;">
                  🚪 CANCEL HOSTING
                </button>
              </div>
            </div>
          </div>

          <!-- Column 2: JOIN GAME (Right next to Host Game!) -->
          <div id="lobby-join-card" class="lobby-group-card join-group">
            <div class="group-header">
              <span class="group-icon">🔗</span>
              <h3 class="group-title">JOIN GAME</h3>
            </div>
            <p class="group-desc">Connect with a friend's Room Code or join an available match below.</p>

            <div id="join-input-section">
              <div class="lobby-field-row">
                <input type="text" id="join-room-code-input" class="lobby-input uppercase" maxlength="8" placeholder="ENTER CODE (e.g. K9X2A)" />
                <button id="btn-join-room" class="lobby-action-btn primary-btn" style="margin-top: 6px;">
                  🔗 CONNECT TO HOST
                </button>
              </div>

              <!-- Available Matches Section right next to host game -->
              <div class="available-matches-box" style="margin-top: 14px;">
                <div class="available-matches-header">
                  <span class="matches-title">AVAILABLE MATCHES</span>
                  <button id="btn-refresh-matches" class="lobby-small-btn">🔄 REFRESH</button>
                </div>
                <div id="available-matches-list" class="available-matches-list">
                  <div style="font-size: 11px; color: #888; padding: 6px; text-align: center;">Searching for live matches...</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- Dedicated Client Waiting Box (Shown when client connects to a room) -->
        <div id="client-wait-box" class="client-wait-box hidden">
          <div class="connecting-spinner">⏳</div>
          <div id="client-wait-status" class="client-wait-status">Connecting to Host...</div>
          <div class="players-list-box" style="margin-top: 8px;">
            <div class="list-title">LOBBY PLAYERS:</div>
            <div id="client-players-list" class="players-list"></div>
          </div>
          <button id="btn-client-leave" class="lobby-action-btn secondary-btn" style="margin-top: 8px; background: rgba(192, 57, 43, 0.7); border-color: #e74c3c;">
            🚪 LEAVE ROOM
          </button>
        </div>

        <!-- Footer / Cancel -->
        <div class="lobby-footer">
          <button id="btn-lobby-back" class="lobby-back-btn">◀ RETURN TO MAIN MENU</button>
        </div>
      </div>
    `;

    // Elements
    this.nameInput = document.getElementById('lobby-player-name');
    this.groupedSection = document.getElementById('lobby-grouped-section');
    this.hostCard = document.getElementById('lobby-host-card');
    this.joinCard = document.getElementById('lobby-join-card');

    this.hostUnhostedSection = document.getElementById('host-unhosted-section');
    this.hostRoomInfo = document.getElementById('host-room-info');
    this.btnCreateRoom = document.getElementById('btn-create-room');
    this.displayRoomCode = document.getElementById('display-room-code');
    this.btnCopyLink = document.getElementById('btn-copy-link');
    this.playersCounterText = document.getElementById('players-counter-text');
    this.hostPlayersList = document.getElementById('host-players-list');
    this.btnStartMatch = document.getElementById('btn-start-match');
    this.btnStartSolo = document.getElementById('btn-start-solo');
    this.btnStartSoloUnhosted = document.getElementById('btn-start-solo-unhosted');
    this.btnHostLeave = document.getElementById('btn-host-leave');

    this.joinInputSection = document.getElementById('join-input-section');
    this.joinCodeInput = document.getElementById('join-room-code-input');
    this.btnJoinRoom = document.getElementById('btn-join-room');
    this.availableMatchesList = document.getElementById('available-matches-list');
    this.btnRefreshMatches = document.getElementById('btn-refresh-matches');

    this.clientWaitBox = document.getElementById('client-wait-box');
    this.clientWaitStatus = document.getElementById('client-wait-status');
    this.clientPlayersList = document.getElementById('client-players-list');
    this.btnClientLeave = document.getElementById('btn-client-leave');

    this.btnBack = document.getElementById('btn-lobby-back');
  }

  initEvents() {
    this.nameInput.addEventListener('change', (e) => {
      this.savedName = (e.target.value.trim() || 'Survivor');
      localStorage.setItem('kattaikonam_player_name', this.savedName);
      if (this.networkManager) {
        this.networkManager.localPlayerName = this.savedName;
      }
    });

    if (this.btnRefreshMatches) {
      this.btnRefreshMatches.addEventListener('click', () => this.refreshAvailableMatches());
    }

    // Host Create / Start Hosting Room
    this.btnCreateRoom.addEventListener('click', async () => {
      this.btnCreateRoom.disabled = true;
      this.btnCreateRoom.textContent = '⏳ INITIALIZING HOST...';
      try {
        const name = this.nameInput.value.trim() || 'Host';
        this.networkManager.localPlayerName = name;
        const res = await this.networkManager.createRoom();
        this.displayRoomCode.textContent = res.roomCode;
        this.hostUnhostedSection.classList.add('hidden');
        this.hostRoomInfo.classList.remove('hidden');

        // Dim Join Card while actively hosting
        if (this.joinCard) {
          this.joinCard.style.opacity = '0.35';
          this.joinCard.style.pointerEvents = 'none';
        }

        this.updatePlayersList([{ id: this.networkManager.localId, name, isHost: true }], true);
      } catch (err) {
        alert('Failed to initialize Host room on PeerJS network: ' + (err.message || err));
        this.btnCreateRoom.disabled = false;
        this.btnCreateRoom.textContent = '★ HOST A NEW GAME';
      }
    });

    // Copy Invite Link
    this.btnCopyLink.addEventListener('click', () => {
      const code = this.displayRoomCode.textContent;
      const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
      navigator.clipboard.writeText(url).then(() => {
        this.btnCopyLink.textContent = '✅ COPIED!';
        setTimeout(() => { this.btnCopyLink.textContent = '📋 COPY LINK'; }, 2000);
      }).catch(() => {
        prompt('Copy room URL:', url);
      });
    });

    // Host Start Match -> Triggers 10-Second In-Game Voting Phase across network
    this.btnStartMatch.addEventListener('click', () => {
      this.hide();
      this.networkManager.startVotingPhase(false);
    });

    // Solo Practice Run
    const triggerSolo = () => {
      const name = this.nameInput.value.trim() || 'Survivor';
      this.savedName = name;
      localStorage.setItem('kattaikonam_player_name', this.savedName);
      if (this.networkManager) {
        this.networkManager.localPlayerName = name;
        this.networkManager.isHost = true;
      }
      this.hide();
      this.networkManager.startVotingPhase(true);
    };

    if (this.btnStartSoloUnhosted) {
      this.btnStartSoloUnhosted.addEventListener('click', triggerSolo);
    }
    if (this.btnStartSolo) {
      this.btnStartSolo.addEventListener('click', triggerSolo);
    }

    // Client Join Room
    this.btnJoinRoom.addEventListener('click', async () => {
      const code = this.joinCodeInput.value.trim().toUpperCase();
      if (!code) {
        alert('Please enter a room code');
        return;
      }

      this.btnJoinRoom.disabled = true;
      this.btnJoinRoom.textContent = '⏳ CONNECTING...';

      // Switch to client waiting screen (Grouped options hide)
      if (this.groupedSection) this.groupedSection.classList.add('hidden');
      this.clientWaitBox.classList.remove('hidden');
      this.clientWaitStatus.textContent = `Connecting to Room [${code}]...`;

      try {
        const name = this.nameInput.value.trim() || 'Survivor';
        await this.networkManager.joinRoom(code, name, (statusMsg) => {
          this.clientWaitStatus.textContent = statusMsg;
        });
        this.clientWaitStatus.textContent = `Connected to Room [${code}]! Waiting for Host to start match...`;
      } catch (err) {
        this.clientWaitStatus.textContent = '❌ Connection failed: ' + (err.message || 'Room not found.');
        this.btnJoinRoom.disabled = false;
        this.btnJoinRoom.textContent = '🔗 CONNECT TO HOST';
      }
    });

    // Client Leave Room -> Returns back to lobby options (Host or Join)
    this.btnClientLeave.addEventListener('click', () => {
      this.networkManager.disconnect();
      this.clientWaitBox.classList.add('hidden');
      if (this.groupedSection) this.groupedSection.classList.remove('hidden');
      this.btnJoinRoom.disabled = false;
      this.btnJoinRoom.textContent = '🔗 CONNECT TO HOST';
      this.refreshAvailableMatches();
    });

    // Host Cancel Hosting -> Returns host section back to unhosted
    this.btnHostLeave.addEventListener('click', () => {
      this.networkManager.disconnect();
      this.hostRoomInfo.classList.add('hidden');
      this.hostUnhostedSection.classList.remove('hidden');
      this.btnCreateRoom.disabled = false;
      this.btnCreateRoom.textContent = '★ HOST A NEW GAME';
      if (this.joinCard) {
        this.joinCard.style.opacity = '1';
        this.joinCard.style.pointerEvents = 'auto';
      }
      this.refreshAvailableMatches();
    });

    // Return To Main Menu Button
    this.btnBack.addEventListener('click', () => {
      this.hide();
      this.reset();
      this.networkManager.disconnect();
      if (this.onBackToMenu) this.onBackToMenu();
    });

    // Hook NetworkManager events
    this.networkManager.onLobbyUpdate = (players, canStart) => {
      this.updatePlayersList(players, canStart);
    };
  }

  initAvailableMatches() {
    this.refreshAvailableMatches();

    if (typeof BroadcastChannel !== 'undefined') {
      try {
        const bc = new BroadcastChannel('btk_evade_network');
        bc.onmessage = (e) => {
          if (e.data && (e.data.type === 'LOBBY_HEARTBEAT' || e.data.type === 'LOBBY_CLOSED')) {
            this.refreshAvailableMatches();
          }
        };
      } catch (e) {}
    }

    setInterval(() => {
      if (!this.container.classList.contains('hidden')) {
        this.refreshAvailableMatches();
      }
    }, 2000);
  }

  refreshAvailableMatches() {
    if (!this.availableMatchesList) return;

    let activeRooms = {};
    try {
      activeRooms = JSON.parse(localStorage.getItem('btk_active_rooms') || '{}');
    } catch (e) {}

    const now = Date.now();
    const rooms = Object.values(activeRooms).filter((r) => r && r.roomCode && (now - r.timestamp < 5500));

    // Exclude own hosted room
    const filtered = rooms.filter((r) => r.roomCode !== this.networkManager.roomCode);

    if (filtered.length === 0) {
      this.availableMatchesList.innerHTML = `
        <div style="font-size: 11px; color: #888; padding: 6px; text-align: center;">
          No active matches found. Host a game or enter a code above!
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
          <div class="match-item-code">${r.roomCode}</div>
          <div class="match-item-host">Host: ${r.hostName || 'Survivor'}</div>
        </div>
        <div>
          <div class="match-item-count">${r.playerCount || 1} Players</div>
        </div>
        <button class="btn-quick-join" data-code="${r.roomCode}">🔗 JOIN</button>
      `;
      const btn = item.querySelector('.btn-quick-join');
      btn.addEventListener('click', () => {
        this.joinCodeInput.value = r.roomCode;
        this.btnJoinRoom.click();
      });
      this.availableMatchesList.appendChild(item);
    });
  }

  updatePlayersList(players = [], canStart = false) {
    const count = players.length;

    // Only update and show start controls if local player is Host
    if (this.networkManager.isHost) {
      if (this.playersCounterText) {
        this.playersCounterText.textContent = count > 1
          ? `Players in lobby: ${count} (Ready for Multiplayer!)`
          : `Players in lobby: ${count} (Waiting for friends or start now)`;
      }

      if (this.btnStartMatch) {
        this.btnStartMatch.classList.remove('disabled');
        this.btnStartMatch.disabled = false;
        if (count > 1) {
          this.btnStartMatch.textContent = `▶ START MULTIPLAYER MATCH (${count} PLAYERS)`;
        } else {
          this.btnStartMatch.textContent = `▶ START GAME NOW (${count} PLAYER)`;
        }
      }
    } else {
      // Client waiting screen updates
      if (this.clientWaitStatus) {
        this.clientWaitStatus.textContent = `Connected! (${count} Players in lobby). Waiting for Host to start match...`;
      }
    }

    const renderList = (el) => {
      if (!el) return;
      el.innerHTML = '';
      players.forEach((p) => {
        const item = document.createElement('div');
        item.className = 'lobby-player-row';
        item.innerHTML = `
          <span class="player-icon">${p.isHost ? '👑' : '👤'}</span>
          <span class="player-label">${p.name} ${p.id === this.networkManager.localId ? '(You)' : ''}</span>
          <span class="player-status ready">${p.isHost ? 'HOST' : 'READY'}</span>
        `;
        el.appendChild(item);
      });
    };

    renderList(this.hostPlayersList);
    renderList(this.clientPlayersList);
  }

  reset() {
    if (this.hostUnhostedSection) this.hostUnhostedSection.classList.remove('hidden');
    if (this.hostRoomInfo) this.hostRoomInfo.classList.add('hidden');
    if (this.btnCreateRoom) {
      this.btnCreateRoom.disabled = false;
      this.btnCreateRoom.textContent = '★ HOST A NEW GAME';
    }
    if (this.btnStartSoloUnhosted) {
      this.btnStartSoloUnhosted.disabled = false;
    }
    if (this.displayRoomCode) this.displayRoomCode.textContent = '-----';
    if (this.joinCodeInput) this.joinCodeInput.value = '';
    if (this.btnJoinRoom) {
      this.btnJoinRoom.disabled = false;
      this.btnJoinRoom.textContent = '🔗 CONNECT TO HOST';
    }
    if (this.groupedSection) this.groupedSection.classList.remove('hidden');
    if (this.clientWaitBox) this.clientWaitBox.classList.add('hidden');

    if (this.joinCard) {
      this.joinCard.style.opacity = '1';
      this.joinCard.style.pointerEvents = 'auto';
    }

    if (this.hostPlayersList) this.hostPlayersList.innerHTML = '';
    if (this.clientPlayersList) this.clientPlayersList.innerHTML = '';
    if (this.playersCounterText) {
      this.playersCounterText.textContent = 'Players in lobby: 1';
    }
  }

  show() {
    this.container.classList.remove('hidden');
    this.refreshAvailableMatches();
  }

  hide() {
    this.container.classList.add('hidden');
  }
}
