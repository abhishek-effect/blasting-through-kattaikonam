/**
 * EvadeLobbyUI Module
 * Renders the PeerJS peer-to-peer multiplayer lobby modal:
 * - Enter Player Name
 * - Create Room (Host) with Shareable Room Code & Link
 * - Join Room (Client)
 * - Waiting room showing connected peers list (Minimum 2 players requirement)
 * - Solo Practice Run option for immediate testing
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

    // Check if URL has ?room=CODE
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam && this.joinCodeInput) {
      this.joinCodeInput.value = roomParam.trim().toUpperCase();
      this.switchTab('join');
    }
  }

  buildMarkup() {
    this.container.innerHTML = `
      <div class="lobby-backdrop"></div>
      <div class="lobby-card">
        <div class="lobby-header">
          <div class="lobby-badge">PEER-TO-PEER MULTIPLAYER</div>
          <h2 class="lobby-title">ROBLOX EVADE</h2>
          <p class="lobby-subtitle">Survive, unlock campus doors, and escape the Nextbots!</p>
        </div>

        <!-- Name Input -->
        <div class="lobby-field-row">
          <label for="lobby-player-name">YOUR SURVIVOR NAME:</label>
          <input type="text" id="lobby-player-name" class="lobby-input" maxlength="16" value="${this.savedName}" placeholder="Enter name..." />
        </div>

        <!-- Mode Tabs: Host or Join -->
        <div class="lobby-tabs">
          <button id="tab-host" class="lobby-tab-btn active">HOST GAME</button>
          <button id="tab-join" class="lobby-tab-btn">JOIN GAME</button>
        </div>

        <!-- Tab 1: Host Room View -->
        <div id="view-host-room" class="lobby-tab-view">
          <div id="host-pre-create" class="host-pre-create">
            <p class="tab-desc">Host a P2P server and invite friends using a 5-letter Room Code.</p>
            <button id="btn-create-room" class="lobby-action-btn primary-btn">★ CREATE ROOM</button>
          </div>

          <div id="host-room-info" class="host-room-info hidden">
            <div class="room-code-display">
              <span class="room-code-label">ROOM CODE:</span>
              <span id="display-room-code" class="room-code-val">-----</span>
              <button id="btn-copy-link" class="lobby-small-btn" title="Copy Invite Link">📋 COPY LINK</button>
            </div>
            
            <div class="players-counter-box">
              <span id="players-counter-text">Players in lobby: 1 (Min 2 required)</span>
            </div>

            <div class="players-list-box">
              <div class="list-title">CONNECTED SURVIVORS:</div>
              <div id="host-players-list" class="players-list"></div>
            </div>

            <div class="host-actions-row">
              <button id="btn-start-match" class="lobby-action-btn start-btn">
                ▶ START GAME NOW
              </button>
              <button id="btn-start-solo" class="lobby-action-btn solo-btn" title="Play solo practice without waiting">
                🕹️ SOLO PRACTICE RUN
              </button>
            </div>
            <button id="btn-host-leave" class="lobby-action-btn secondary-btn" style="margin-top: 10px; background: rgba(192, 57, 43, 0.7); border-color: #e74c3c;">
              🚪 LEAVE ROOM / MAIN MENU
            </button>
          </div>
        </div>

        <!-- Tab 2: Join Room View -->
        <div id="view-join-room" class="lobby-tab-view hidden">
          <p class="tab-desc">Enter your friend's 5-letter Room Code to connect directly via WebRTC.</p>
          <div class="lobby-field-row">
            <input type="text" id="join-room-code-input" class="lobby-input uppercase" maxlength="8" placeholder="ENTER ROOM CODE (e.g. K9X2A)" />
            <button id="btn-join-room" class="lobby-action-btn primary-btn" style="margin-top: 10px;">
              🔗 CONNECT TO HOST
            </button>
          </div>

          <div id="client-wait-box" class="client-wait-box hidden">
            <div class="connecting-spinner">⏳</div>
            <div id="client-wait-status" class="client-wait-status">Connecting to Host...</div>
            <div class="players-list-box" style="margin-top: 10px;">
              <div class="list-title">LOBBY PLAYERS:</div>
              <div id="client-players-list" class="players-list"></div>
            </div>
            <button id="btn-client-leave" class="lobby-action-btn secondary-btn" style="margin-top: 12px; background: rgba(192, 57, 43, 0.7); border-color: #e74c3c;">
              🚪 LEAVE ROOM / MAIN MENU
            </button>
          </div>
        </div>

        <!-- Footer / Cancel -->
        <div class="lobby-footer">
          <button id="btn-lobby-back" class="lobby-back-btn">◀ RETURN TO MAIN MENU</button>
        </div>
      </div>
    `;

    // Elements
    this.nameInput = document.getElementById('lobby-player-name');
    this.tabHost = document.getElementById('tab-host');
    this.tabJoin = document.getElementById('tab-join');
    this.viewHost = document.getElementById('view-host-room');
    this.viewJoin = document.getElementById('view-join-room');

    this.hostPreCreate = document.getElementById('host-pre-create');
    this.hostRoomInfo = document.getElementById('host-room-info');
    this.btnCreateRoom = document.getElementById('btn-create-room');
    this.displayRoomCode = document.getElementById('display-room-code');
    this.btnCopyLink = document.getElementById('btn-copy-link');
    this.playersCounterText = document.getElementById('players-counter-text');
    this.hostPlayersList = document.getElementById('host-players-list');
    this.btnStartMatch = document.getElementById('btn-start-match');
    this.btnStartSolo = document.getElementById('btn-start-solo');
    this.btnHostLeave = document.getElementById('btn-host-leave');

    this.joinCodeInput = document.getElementById('join-room-code-input');
    this.btnJoinRoom = document.getElementById('btn-join-room');
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

    this.tabHost.addEventListener('click', () => this.switchTab('host'));
    this.tabJoin.addEventListener('click', () => this.switchTab('join'));

    // Host Create Room
    this.btnCreateRoom.addEventListener('click', async () => {
      this.btnCreateRoom.disabled = true;
      this.btnCreateRoom.textContent = '⏳ CREATING ROOM...';
      try {
        const name = this.nameInput.value.trim() || 'Host';
        this.networkManager.localPlayerName = name;
        const res = await this.networkManager.createRoom();
        this.displayRoomCode.textContent = res.roomCode;
        this.hostPreCreate.classList.add('hidden');
        this.hostRoomInfo.classList.remove('hidden');
        this.updatePlayersList([{ id: this.networkManager.localId, name, isHost: true }], true);
      } catch (err) {
        alert('Failed to initialize Host room on PeerJS network: ' + (err.message || err));
        this.btnCreateRoom.disabled = false;
        this.btnCreateRoom.textContent = '★ CREATE ROOM';
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

    // Host Start Match
    this.btnStartMatch.addEventListener('click', () => {
      const isSolo = (this.networkManager.connections.size <= 1);
      this.networkManager.startMatch();
      this.hide();
      if (this.onStartMatch) this.onStartMatch(isSolo);
    });

    // Solo Practice Run
    this.btnStartSolo.addEventListener('click', () => {
      this.networkManager.startMatch();
      this.hide();
      if (this.onStartMatch) this.onStartMatch(true);
    });

    // Client Join Room
    this.btnJoinRoom.addEventListener('click', async () => {
      const code = this.joinCodeInput.value.trim().toUpperCase();
      if (!code) {
        alert('Please enter a room code');
        return;
      }

      this.btnJoinRoom.disabled = true;
      this.btnJoinRoom.textContent = '⏳ CONNECTING...';
      this.clientWaitBox.classList.remove('hidden');
      this.clientWaitStatus.textContent = `Connecting to Room [${code}]...`;

      try {
        const name = this.nameInput.value.trim() || 'Survivor';
        await this.networkManager.joinRoom(code, name, (statusMsg) => {
          this.clientWaitStatus.textContent = statusMsg;
        });
        this.clientWaitStatus.textContent = 'Connected! Waiting for Host to start match...';
        this.btnJoinRoom.textContent = '✅ CONNECTED';
      } catch (err) {
        this.clientWaitStatus.textContent = '❌ Connection failed: ' + (err.message || 'Room not found.');
        this.btnJoinRoom.disabled = false;
        this.btnJoinRoom.textContent = '🔄 RETRY CONNECTION';
      }
    });

    // Universal Leave To Main Menu handler
    const leaveToMainMenu = () => {
      this.hide();
      this.reset();
      this.networkManager.disconnect();
      if (this.onBackToMenu) this.onBackToMenu();
    };

    this.btnBack.addEventListener('click', leaveToMainMenu);
    if (this.btnHostLeave) this.btnHostLeave.addEventListener('click', leaveToMainMenu);
    if (this.btnClientLeave) this.btnClientLeave.addEventListener('click', leaveToMainMenu);

    // Hook NetworkManager events
    this.networkManager.onLobbyUpdate = (players, canStart) => {
      this.updatePlayersList(players, canStart);
    };

    this.networkManager.onGameStart = () => {
      this.hide();
      if (this.onStartMatch) this.onStartMatch(false);
    };
  }

  switchTab(tab) {
    if (tab === 'host') {
      this.tabHost.classList.add('active');
      this.tabJoin.classList.remove('active');
      this.viewHost.classList.remove('hidden');
      this.viewJoin.classList.add('hidden');
    } else {
      this.tabJoin.classList.add('active');
      this.tabHost.classList.remove('active');
      this.viewJoin.classList.remove('hidden');
      this.viewHost.classList.add('hidden');
    }
  }

  updatePlayersList(players = [], canStart = false) {
    const count = players.length;
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

    const renderList = (el) => {
      if (!el) return;
      el.innerHTML = '';
      players.forEach((p, idx) => {
        const item = document.createElement('div');
        item.className = 'lobby-player-row';
        item.innerHTML = `
          <span class="player-icon">${p.isHost ? '👑' : '👤'}</span>
          <span class="player-label">${p.name} ${p.id === this.networkManager.localId ? '(You)' : ''}</span>
          <span class="player-status ready">READY</span>
        `;
        el.appendChild(item);
      });
    };

    renderList(this.hostPlayersList);
    renderList(this.clientPlayersList);
  }

  reset() {
    if (this.hostPreCreate) this.hostPreCreate.classList.remove('hidden');
    if (this.hostRoomInfo) this.hostRoomInfo.classList.add('hidden');
    if (this.btnCreateRoom) {
      this.btnCreateRoom.disabled = false;
      this.btnCreateRoom.textContent = '★ CREATE ROOM';
    }
    if (this.displayRoomCode) this.displayRoomCode.textContent = '-----';
    if (this.joinCodeInput) this.joinCodeInput.value = '';
    if (this.btnJoinRoom) {
      this.btnJoinRoom.disabled = false;
      this.btnJoinRoom.textContent = '🔗 CONNECT TO HOST';
    }
    if (this.clientWaitBox) this.clientWaitBox.classList.add('hidden');
    if (this.hostPlayersList) this.hostPlayersList.innerHTML = '';
    if (this.clientPlayersList) this.clientPlayersList.innerHTML = '';
    if (this.playersCounterText) {
      this.playersCounterText.textContent = 'Players in lobby: 1';
    }
    if (this.btnStartMatch) {
      this.btnStartMatch.disabled = false;
      this.btnStartMatch.classList.remove('disabled');
      this.btnStartMatch.textContent = '▶ START GAME NOW';
    }
  }

  show() {
    this.container.classList.remove('hidden');
  }

  hide() {
    this.container.classList.add('hidden');
  }
}

