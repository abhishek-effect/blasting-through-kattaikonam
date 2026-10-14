/**
 * EvadeLobbyUI Module
 * Renders the PeerJS peer-to-peer multiplayer lobby modal:
 * - Enter Player Name
 * - Create Room (Host) with Shareable Room Code & Link
 * - Join Room (Client) with Available Matches real-time discovery
 * - Survive vs Escape Sub-Mode Voting
 * - Waiting room showing connected peers list
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
    this.initAvailableMatches();

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
          <h2 class="lobby-title">EVADE MULTIPLAYER</h2>
          <p class="lobby-subtitle">Survive, unlock campus doors, and escape the Evil Santhomites!</p>
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

            <!-- Mode Voting Section (Host) -->
            <div class="lobby-vote-section">
              <div class="vote-title">VOTE GAME SUB-MODE:</div>
              <div class="vote-buttons-row">
                <button id="host-vote-escape" class="lobby-vote-btn active" data-mode="escape">
                  <span>🏃 ESCAPE</span>
                  <span id="host-count-escape" class="vote-count">(1)</span>
                </button>
                <button id="host-vote-survive" class="lobby-vote-btn" data-mode="survive">
                  <span>⏱️ SURVIVE</span>
                  <span id="host-count-survive" class="vote-count">(0)</span>
                </button>
              </div>
              <div id="host-vote-desc" class="vote-desc">Escape: Progressively hunt keys to unlock Seminar Hall, get photocopy, and escape via elevator.</div>
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
          <div id="join-input-section">
            <p class="tab-desc">Enter your friend's 5-letter Room Code or select from available matches below.</p>
            <div class="lobby-field-row">
              <input type="text" id="join-room-code-input" class="lobby-input uppercase" maxlength="8" placeholder="ENTER ROOM CODE (e.g. K9X2A)" />
              <button id="btn-join-room" class="lobby-action-btn primary-btn" style="margin-top: 10px;">
                🔗 CONNECT TO HOST
              </button>
            </div>

            <!-- Available Matches Section -->
            <div class="available-matches-box">
              <div class="available-matches-header">
                <span class="matches-title">AVAILABLE MATCHES</span>
                <button id="btn-refresh-matches" class="lobby-small-btn">🔄 REFRESH</button>
              </div>
              <div id="available-matches-list" class="available-matches-list">
                <div style="font-size: 11px; color: #888; padding: 6px;">Searching for live matches...</div>
              </div>
            </div>
          </div>

          <div id="client-wait-box" class="client-wait-box hidden">
            <div class="connecting-spinner">⏳</div>
            <div id="client-wait-status" class="client-wait-status">Connecting to Host...</div>

            <!-- Mode Voting Section (Client) -->
            <div class="lobby-vote-section">
              <div class="vote-title">VOTE GAME SUB-MODE:</div>
              <div class="vote-buttons-row">
                <button id="client-vote-escape" class="lobby-vote-btn active" data-mode="escape">
                  <span>🏃 ESCAPE</span>
                  <span id="client-count-escape" class="vote-count">(1)</span>
                </button>
                <button id="client-vote-survive" class="lobby-vote-btn" data-mode="survive">
                  <span>⏱️ SURVIVE</span>
                  <span id="client-count-survive" class="vote-count">(0)</span>
                </button>
              </div>
              <div id="client-vote-desc" class="vote-desc">Escape: Progressively hunt keys to unlock Seminar Hall, get photocopy, and escape via elevator.</div>
            </div>

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

    // Vote buttons
    this.hostVoteEscape = document.getElementById('host-vote-escape');
    this.hostVoteSurvive = document.getElementById('host-vote-survive');
    this.hostCountEscape = document.getElementById('host-count-escape');
    this.hostCountSurvive = document.getElementById('host-count-survive');
    this.hostVoteDesc = document.getElementById('host-vote-desc');

    this.clientVoteEscape = document.getElementById('client-vote-escape');
    this.clientVoteSurvive = document.getElementById('client-vote-survive');
    this.clientCountEscape = document.getElementById('client-count-escape');
    this.clientCountSurvive = document.getElementById('client-count-survive');
    this.clientVoteDesc = document.getElementById('client-vote-desc');

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

    this.tabHost.addEventListener('click', () => this.switchTab('host'));
    this.tabJoin.addEventListener('click', () => {
      this.switchTab('join');
      this.refreshAvailableMatches();
    });

    if (this.btnRefreshMatches) {
      this.btnRefreshMatches.addEventListener('click', () => this.refreshAvailableMatches());
    }

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
        if (this.tabJoin) {
          this.tabJoin.disabled = true;
          this.tabJoin.style.opacity = '0.4';
          this.tabJoin.title = 'Leave current room to join another';
        }
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
      this.hide();
      this.networkManager.startMatch();
    });

    // Solo Practice Run
    this.btnStartSolo.addEventListener('click', () => {
      this.hide();
      this.networkManager.startMatch();
    });

    // Voting Buttons
    const handleVote = (mode) => {
      this.networkManager.sendVote(mode);
    };

    if (this.hostVoteEscape) this.hostVoteEscape.addEventListener('click', () => handleVote('escape'));
    if (this.hostVoteSurvive) this.hostVoteSurvive.addEventListener('click', () => handleVote('survive'));
    if (this.clientVoteEscape) this.clientVoteEscape.addEventListener('click', () => handleVote('escape'));
    if (this.clientVoteSurvive) this.clientVoteSurvive.addEventListener('click', () => handleVote('survive'));

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
        if (this.joinInputSection) {
          this.joinInputSection.classList.add('hidden');
        }
        if (this.tabHost) {
          this.tabHost.disabled = true;
          this.tabHost.style.opacity = '0.4';
          this.tabHost.title = 'Connected to room as client';
        }
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

    this.networkManager.onVoteUpdate = (votes) => {
      this.updateVotes(votes);
    };

    this.networkManager.onGameStart = (payload) => {
      this.hide();
      const isSolo = payload && !!payload.isSolo;
      const mode = (payload && payload.mode) ? payload.mode : 'escape';
      if (this.onStartMatch) this.onStartMatch(isSolo, mode);
    };
  }

  updateVotes(votes) {
    if (!votes) return;
    const isSurvive = votes.winner === 'survive';

    const updateSet = (btnEsc, btnSurv, countEsc, countSurv, desc) => {
      if (btnEsc && btnSurv) {
        btnEsc.classList.toggle('active', !isSurvive);
        btnSurv.classList.toggle('active', isSurvive);
        btnSurv.classList.toggle('survive', isSurvive);
      }
      if (countEsc) countEsc.textContent = `(${votes.escape || 0})`;
      if (countSurv) countSurv.textContent = `(${votes.survive || 0})`;
      if (desc) {
        desc.textContent = isSurvive
          ? 'Survive: All doors unlocked! Survive 2-3 mins against Evil Santhomites to win.'
          : 'Escape: Progressively hunt keys to unlock Seminar Hall, get photocopy, and escape via elevator.';
      }
    };

    updateSet(this.hostVoteEscape, this.hostVoteSurvive, this.hostCountEscape, this.hostCountSurvive, this.hostVoteDesc);
    updateSet(this.clientVoteEscape, this.clientVoteSurvive, this.clientCountEscape, this.clientCountSurvive, this.clientVoteDesc);
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
      if (!this.container.classList.contains('hidden') && !this.viewJoin.classList.contains('hidden')) {
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

  switchTab(tab) {
    if (tab === 'host') {
      if (this.tabHost.disabled) return;
      this.tabHost.classList.add('active');
      this.tabJoin.classList.remove('active');
      this.viewHost.classList.remove('hidden');
      this.viewJoin.classList.add('hidden');
    } else {
      if (this.tabJoin.disabled) return;
      this.tabJoin.classList.add('active');
      this.tabHost.classList.remove('active');
      this.viewJoin.classList.remove('hidden');
      this.viewHost.classList.add('hidden');
      this.refreshAvailableMatches();
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
      players.forEach((p) => {
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
    if (this.joinInputSection) this.joinInputSection.classList.remove('hidden');
    if (this.clientWaitBox) this.clientWaitBox.classList.add('hidden');
    if (this.tabHost) {
      this.tabHost.disabled = false;
      this.tabHost.style.opacity = '1';
      this.tabHost.title = '';
    }
    if (this.tabJoin) {
      this.tabJoin.disabled = false;
      this.tabJoin.style.opacity = '1';
      this.tabJoin.title = '';
    }
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
    this.updateVotes({ escape: 1, survive: 0, winner: 'escape' });
  }

  show() {
    this.container.classList.remove('hidden');
    this.refreshAvailableMatches();
  }

  hide() {
    this.container.classList.add('hidden');
  }
}
