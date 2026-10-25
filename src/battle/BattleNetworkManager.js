/**
 * BattleNetworkManager Module
 * Handles WebRTC Peer-to-Peer networking using PeerJS for Battle Multiplayer mode:
 * - 1v1, 2v2, 3v3 match modes
 * - Red Team vs Blue Team assignments
 * - Unique character selection per match (JPGs and PNGs)
 * - Low-latency 20Hz transform synchronization
 * - Hit registration, elimination notifications, and match countdown sync
 * - Local match beacon discovery via BroadcastChannel and localStorage
 */
import { Peer } from 'peerjs';

export const BATTLE_MSG = {
  LOBBY_UPDATE: 'LOBBY_UPDATE',
  CHARACTER_SELECT: 'CHARACTER_SELECT',
  TEAM_SELECT: 'TEAM_SELECT',
  MATCH_MODE_SELECT: 'MATCH_MODE_SELECT',
  START_MATCH: 'START_MATCH',
  PLAYER_UPDATE: 'PLAYER_UPDATE',
  PLAYER_FIRE: 'PLAYER_FIRE',
  PLAYER_HIT: 'PLAYER_HIT',
  PLAYER_ELIMINATED: 'PLAYER_ELIMINATED',
  PLAYER_RESPAWN: 'PLAYER_RESPAWN',
  KEY_COLLECTED: 'KEY_COLLECTED',
  DOOR_UNLOCKED: 'DOOR_UNLOCKED',
  MATCH_OVER: 'MATCH_OVER',
  PLAYER_LEFT: 'PLAYER_LEFT'
};

export const MATCH_MODES = {
  '1v1': { id: '1v1', name: '1 vs 1 DUEL', maxPlayers: 2, teamSize: 1 },
  '2v2': { id: '2v2', name: '2 vs 2 SQUAD', maxPlayers: 4, teamSize: 2 },
  '3v3': { id: '3v3', name: '3 vs 3 WAR', maxPlayers: 6, teamSize: 3 }
};

const ICE_SERVERS = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun.cloudflare.com:3478' },
  { urls: 'stun:openrelay.metered.ca:80' },
  {
    urls: 'turn:openrelay.metered.ca:80',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  },
  {
    urls: 'turn:openrelay.metered.ca:443',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

export class BattleNetworkManager {
  constructor() {
    this.peer = null;
    this.peerId = null;
    this.roomCode = null;
    this.isHost = false;
    this.isConnected = false;

    this.localId = `p_${Math.random().toString(36).substring(2, 8)}`;
    this.localPlayerName = localStorage.getItem('kattaikonam_player_name') || `Operative_${Math.floor(Math.random() * 899 + 100)}`;
    this.localTeam = 'red';
    this.localCharacterId = localStorage.getItem('kattaikonam_battle_character') || 'aahil_confront';

    this.matchMode = '1v1';
    this.matchDuration = 120; // 2 minutes

    // Map of connected players: Map<playerId, PlayerData>
    this.players = new Map();

    // Map of active peer data connections: Map<peerId, DataConnection>
    this.connections = new Map();

    // Host broadcast interval
    this.beaconInterval = null;

    // Callbacks
    this.onLobbyUpdate = null;
    this.onMatchStart = null;
    this.onPlayerUpdate = null;
    this.onPlayerFire = null;
    this.onPlayerHit = null;
    this.onPlayerEliminated = null;
    this.onPlayerRespawn = null;
    this.onKeyCollected = null;
    this.onDoorUnlocked = null;
    this.onMatchOver = null;
    this.onPlayerDisconnect = null;
  }

  generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  }

  /**
   * Initializes Peer as Host for Battle Mode
   */
  async createRoom(customCode = null, matchMode = '1v1') {
    this.disconnect();
    this.isHost = true;
    this.matchMode = matchMode;
    this.localTeam = 'red';
    this.roomCode = (customCode || this.generateRoomCode()).toUpperCase();
    const fullPeerId = `btk-battle-${this.roomCode.toLowerCase()}`;

    return new Promise((resolve, reject) => {
      let isResolved = false;

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this.disconnect();
          reject(new Error('Creating Battle room timed out on PeerJS network. Please try again.'));
        }
      }, 15000);

      try {
        this.peer = new Peer(fullPeerId, {
          debug: 1,
          config: {
            iceServers: ICE_SERVERS,
            iceCandidatePoolSize: 10
          }
        });

        this.peer.on('open', (id) => {
          if (isResolved) return;
          isResolved = true;
          clearTimeout(timeoutId);

          this.peerId = id;
          this.isConnected = true;
          this.players.clear();
          this.connections.clear();

          // Add Host to players list
          this.players.set(this.localId, {
            id: this.localId,
            peerId: this.peerId,
            name: this.localPlayerName,
            team: 'red',
            characterId: this.localCharacterId,
            isHost: true,
            isReady: true,
            kills: 0,
            deaths: 0,
            score: 0
          });

          this.setupHostListeners();
          this.startLobbyBeacon();
          resolve({ roomCode: this.roomCode, peerId: id });
        });

        this.peer.on('error', (err) => {
          console.warn('[BattleNetwork] Host peer error:', err);
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutId);
            this.disconnect();
            reject(new Error(err.message || 'Host peer error on PeerJS network.'));
          }
        });
      } catch (err) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          this.disconnect();
          reject(err);
        }
      }
    });
  }

  /**
   * Initializes Peer and connects to an existing Host Battle room
   */
  async joinRoom(roomCode) {
    this.disconnect();
    this.isHost = false;
    this.roomCode = (roomCode || '').trim().toUpperCase();
    const targetPeerId = `btk-battle-${this.roomCode.toLowerCase()}`;

    return new Promise((resolve, reject) => {
      let isResolved = false;

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this.disconnect();
          reject(new Error(`Connecting to Battle room ${this.roomCode} timed out. Ensure host is active.`));
        }
      }, 15000);

      try {
        this.peer = new Peer(null, {
          debug: 1,
          config: {
            iceServers: ICE_SERVERS,
            iceCandidatePoolSize: 10
          }
        });

        this.peer.on('open', (myId) => {
          this.peerId = myId;
          this.isConnected = true;

          const conn = this.peer.connect(targetPeerId, {
            reliable: true,
            metadata: {
              id: this.localId,
              name: this.localPlayerName,
              characterId: this.localCharacterId
            }
          });

          this.connections.set('host', conn);

          conn.on('open', () => {
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              this.setupClientListeners(conn);
              resolve({ roomCode: this.roomCode, hostPeerId: targetPeerId });
            }
          });

          conn.on('error', (err) => {
            console.warn('[BattleNetwork] Client connection error:', err);
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              this.disconnect();
              reject(new Error('Could not connect to host. Room may be closed or full.'));
            }
          });
        });

        this.peer.on('error', (err) => {
          console.warn('[BattleNetwork] Client peer error:', err);
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutId);
            this.disconnect();
            reject(new Error(err.message || 'PeerJS network error.'));
          }
        });
      } catch (err) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          this.disconnect();
          reject(err);
        }
      }
    });
  }

  setupHostListeners() {
    this.peer.on('connection', (conn) => {
      const maxAllowed = MATCH_MODES[this.matchMode]?.maxPlayers || 2;
      if (this.players.size >= maxAllowed) {
        conn.close();
        return;
      }

      conn.on('open', () => {
        const meta = conn.metadata || {};
        const clientId = meta.id || `p_${conn.peer.substring(0, 6)}`;
        const clientName = meta.name || 'Operative';

        // Assign balanced team
        const redCount = Array.from(this.players.values()).filter((p) => p.team === 'red').length;
        const blueCount = Array.from(this.players.values()).filter((p) => p.team === 'blue').length;
        const assignedTeam = redCount <= blueCount ? 'red' : 'blue';

        // Assign unique character
        let chosenChar = meta.characterId || 'aahil_confront';
        const usedChars = new Set(Array.from(this.players.values()).map((p) => p.characterId));
        if (usedChars.has(chosenChar)) {
          // Fallback to unused character
          const defaultPool = ['joewyn_confront', 'mahadev_confront', 'ryan_confront', 'ab', 'aswin', 'dipu', 'aadesh', 'boss_2'];
          chosenChar = defaultPool.find((c) => !usedChars.has(c)) || `char_${Math.random().toString(36).substring(2, 6)}`;
        }

        this.connections.set(conn.peer, conn);
        this.players.set(clientId, {
          id: clientId,
          peerId: conn.peer,
          name: clientName,
          team: assignedTeam,
          characterId: chosenChar,
          isHost: false,
          isReady: true,
          kills: 0,
          deaths: 0,
          score: 0
        });

        this.broadcastLobbyUpdate();
      });

      conn.on('data', (data) => {
        this.handleHostIncomingData(data, conn);
      });

      conn.on('close', () => {
        this.handlePeerDisconnected(conn.peer);
      });

      conn.on('error', (err) => {
        console.warn('[BattleNetwork] Peer conn error:', err);
        this.handlePeerDisconnected(conn.peer);
      });
    });
  }

  setupClientListeners(conn) {
    conn.on('data', (data) => {
      this.handleClientIncomingData(data);
    });

    conn.on('close', () => {
      console.warn('[BattleNetwork] Host closed connection.');
      this.disconnect();
      if (this.onPlayerDisconnect) this.onPlayerDisconnect('Host disconnected or closed room.');
    });
  }

  handleHostIncomingData(data, conn) {
    if (!data || !data.type) return;

    switch (data.type) {
      case BATTLE_MSG.CHARACTER_SELECT: {
        const player = this.players.get(data.playerId);
        if (player) {
          // Check uniqueness among OTHER players
          const isTaken = Array.from(this.players.values()).some((p) => p.id !== data.playerId && p.characterId === data.characterId);
          if (!isTaken) {
            player.characterId = data.characterId;
            this.broadcastLobbyUpdate();
          }
        }
        break;
      }

      case BATTLE_MSG.TEAM_SELECT: {
        const player = this.players.get(data.playerId);
        if (player && (data.team === 'red' || data.team === 'blue')) {
          player.team = data.team;
          this.broadcastLobbyUpdate();
        }
        break;
      }

      case BATTLE_MSG.PLAYER_UPDATE: {
        // Relay player transform update to all other connected peers
        this.broadcast(data, conn.peer);
        if (this.onPlayerUpdate) {
          this.onPlayerUpdate(data);
        }
        break;
      }

      case BATTLE_MSG.PLAYER_FIRE: {
        this.broadcast(data, conn.peer);
        if (this.onPlayerFire) {
          this.onPlayerFire(data);
        }
        break;
      }

      case BATTLE_MSG.PLAYER_HIT: {
        // Relay hit event
        this.broadcast(data, conn.peer);
        if (this.onPlayerHit) {
          this.onPlayerHit(data);
        }
        break;
      }

      case BATTLE_MSG.PLAYER_ELIMINATED: {
        // Update scores
        const killer = this.players.get(data.attackerId);
        const victim = this.players.get(data.victimId);
        if (killer) {
          killer.kills = (killer.kills || 0) + 1;
          killer.score = (killer.score || 0) + 100;
        }
        if (victim) {
          victim.deaths = (victim.deaths || 0) + 1;
        }

        data.players = Array.from(this.players.values());
        this.broadcast(data);
        if (this.onPlayerEliminated) {
          this.onPlayerEliminated(data);
        }
        break;
      }

      case BATTLE_MSG.KEY_COLLECTED:
      case BATTLE_MSG.DOOR_UNLOCKED:
      case BATTLE_MSG.PLAYER_RESPAWN: {
        this.broadcast(data, conn.peer);
        if (data.type === BATTLE_MSG.KEY_COLLECTED && this.onKeyCollected) this.onKeyCollected(data);
        if (data.type === BATTLE_MSG.DOOR_UNLOCKED && this.onDoorUnlocked) this.onDoorUnlocked(data);
        if (data.type === BATTLE_MSG.PLAYER_RESPAWN && this.onPlayerRespawn) this.onPlayerRespawn(data);
        break;
      }

      default:
        this.broadcast(data, conn.peer);
        break;
    }
  }

  handleClientIncomingData(data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case BATTLE_MSG.LOBBY_UPDATE: {
        this.matchMode = data.matchMode || this.matchMode;
        this.players.clear();
        (data.players || []).forEach((p) => {
          this.players.set(p.id, p);
          if (p.id === this.localId) {
            this.localTeam = p.team;
            this.localCharacterId = p.characterId;
          }
        });
        if (this.onLobbyUpdate) {
          this.onLobbyUpdate(Array.from(this.players.values()), data.canStart, this.matchMode);
        }
        break;
      }

      case BATTLE_MSG.START_MATCH: {
        if (this.onMatchStart) {
          this.onMatchStart(data);
        }
        break;
      }

      case BATTLE_MSG.PLAYER_UPDATE: {
        if (this.onPlayerUpdate) {
          this.onPlayerUpdate(data);
        }
        break;
      }

      case BATTLE_MSG.PLAYER_FIRE: {
        if (this.onPlayerFire) {
          this.onPlayerFire(data);
        }
        break;
      }

      case BATTLE_MSG.PLAYER_HIT: {
        if (this.onPlayerHit) {
          this.onPlayerHit(data);
        }
        break;
      }

      case BATTLE_MSG.PLAYER_ELIMINATED: {
        if (data.players) {
          data.players.forEach((p) => {
            const existing = this.players.get(p.id);
            if (existing) {
              existing.kills = p.kills;
              existing.deaths = p.deaths;
              existing.score = p.score;
            }
          });
        }
        if (this.onPlayerEliminated) {
          this.onPlayerEliminated(data);
        }
        break;
      }

      case BATTLE_MSG.PLAYER_RESPAWN: {
        if (this.onPlayerRespawn) {
          this.onPlayerRespawn(data);
        }
        break;
      }

      case BATTLE_MSG.KEY_COLLECTED: {
        if (this.onKeyCollected) {
          this.onKeyCollected(data);
        }
        break;
      }

      case BATTLE_MSG.DOOR_UNLOCKED: {
        if (this.onDoorUnlocked) {
          this.onDoorUnlocked(data);
        }
        break;
      }

      case BATTLE_MSG.MATCH_OVER: {
        if (this.onMatchOver) {
          this.onMatchOver(data);
        }
        break;
      }

      case BATTLE_MSG.PLAYER_LEFT: {
        this.players.delete(data.playerId);
        if (this.onPlayerDisconnect) {
          this.onPlayerDisconnect(data.name ? `${data.name} left the match.` : 'A player left.');
        }
        break;
      }
    }
  }

  handlePeerDisconnected(peerId) {
    let disconnectedId = null;
    let disconnectedName = null;

    for (let [id, p] of this.players.entries()) {
      if (p.peerId === peerId) {
        disconnectedId = id;
        disconnectedName = p.name;
        this.players.delete(id);
        break;
      }
    }

    this.connections.delete(peerId);

    if (disconnectedId) {
      this.broadcast({
        type: BATTLE_MSG.PLAYER_LEFT,
        playerId: disconnectedId,
        name: disconnectedName
      });
      this.broadcastLobbyUpdate();
      if (this.onPlayerDisconnect) {
        this.onPlayerDisconnect(`${disconnectedName || 'A player'} disconnected.`);
      }
    }
  }

  setMatchMode(mode) {
    if (!this.isHost || !MATCH_MODES[mode]) return;
    this.matchMode = mode;
    this.broadcastLobbyUpdate();
  }

  selectCharacter(characterId) {
    this.localCharacterId = characterId;
    localStorage.setItem('kattaikonam_battle_character', characterId);

    if (this.isHost) {
      const local = this.players.get(this.localId);
      if (local) {
        local.characterId = characterId;
        this.broadcastLobbyUpdate();
      }
    } else {
      const hostConn = this.connections.get('host');
      if (hostConn && hostConn.open) {
        hostConn.send({
          type: BATTLE_MSG.CHARACTER_SELECT,
          playerId: this.localId,
          characterId
        });
      }
    }
  }

  selectTeam(team) {
    if (team !== 'red' && team !== 'blue') return;
    this.localTeam = team;

    if (this.isHost) {
      const local = this.players.get(this.localId);
      if (local) {
        local.team = team;
        this.broadcastLobbyUpdate();
      }
    } else {
      const hostConn = this.connections.get('host');
      if (hostConn && hostConn.open) {
        hostConn.send({
          type: BATTLE_MSG.TEAM_SELECT,
          playerId: this.localId,
          team
        });
      }
    }
  }

  broadcastLobbyUpdate() {
    if (!this.isHost) return;
    const playerList = Array.from(this.players.values());
    const minRequired = MATCH_MODES[this.matchMode]?.maxPlayers || 2;
    const canStart = playerList.length >= 1; // Can start with 1+ for testing, or full room

    const msg = {
      type: BATTLE_MSG.LOBBY_UPDATE,
      matchMode: this.matchMode,
      players: playerList,
      canStart
    };

    this.broadcast(msg);
    if (this.onLobbyUpdate) {
      this.onLobbyUpdate(playerList, canStart, this.matchMode);
    }
  }

  startMatch(matchConfig = {}) {
    if (!this.isHost) return;

    // Stop lobby discovery beacon once match starts
    this.stopLobbyBeacon();

    const data = {
      type: BATTLE_MSG.START_MATCH,
      matchMode: this.matchMode,
      duration: this.matchDuration || 120,
      lockedDoors: matchConfig.lockedDoors || [],
      keySpawns: matchConfig.keySpawns || [],
      players: Array.from(this.players.values())
    };

    this.broadcast(data);
    if (this.onMatchStart) {
      this.onMatchStart(data);
    }
  }

  sendPlayerUpdate(updateData) {
    const data = {
      type: BATTLE_MSG.PLAYER_UPDATE,
      id: this.localId,
      ...updateData
    };

    if (this.isHost) {
      this.broadcast(data);
    } else {
      const hostConn = this.connections.get('host');
      if (hostConn && hostConn.open) {
        hostConn.send(data);
      }
    }
  }

  sendPlayerFire(fireData) {
    const data = {
      type: BATTLE_MSG.PLAYER_FIRE,
      playerId: this.localId,
      ...fireData
    };
    if (this.isHost) {
      this.broadcast(data);
    } else {
      const hostConn = this.connections.get('host');
      if (hostConn && hostConn.open) {
        hostConn.send(data);
      }
    }
  }

  sendPlayerHit(hitData) {
    const data = {
      type: BATTLE_MSG.PLAYER_HIT,
      attackerId: this.localId,
      ...hitData
    };
    if (this.isHost) {
      this.broadcast(data);
      if (this.onPlayerHit) this.onPlayerHit(data);
    } else {
      const hostConn = this.connections.get('host');
      if (hostConn && hostConn.open) {
        hostConn.send(data);
      }
    }
  }

  sendPlayerEliminated(victimId, attackerId) {
    const data = {
      type: BATTLE_MSG.PLAYER_ELIMINATED,
      victimId,
      attackerId
    };
    if (this.isHost) {
      this.handleHostIncomingData(data, null);
    } else {
      const hostConn = this.connections.get('host');
      if (hostConn && hostConn.open) {
        hostConn.send(data);
      }
    }
  }

  sendKeyCollected(keyId) {
    const data = {
      type: BATTLE_MSG.KEY_COLLECTED,
      keyId,
      playerId: this.localId
    };
    if (this.isHost) {
      this.broadcast(data);
      if (this.onKeyCollected) this.onKeyCollected(data);
    } else {
      const hostConn = this.connections.get('host');
      if (hostConn && hostConn.open) {
        hostConn.send(data);
      }
    }
  }

  sendDoorUnlocked(doorId) {
    const data = {
      type: BATTLE_MSG.DOOR_UNLOCKED,
      doorId,
      playerId: this.localId
    };
    if (this.isHost) {
      this.broadcast(data);
      if (this.onDoorUnlocked) this.onDoorUnlocked(data);
    } else {
      const hostConn = this.connections.get('host');
      if (hostConn && hostConn.open) {
        hostConn.send(data);
      }
    }
  }

  sendMatchOver(winnerData) {
    if (!this.isHost) return;
    const data = {
      type: BATTLE_MSG.MATCH_OVER,
      ...winnerData
    };
    this.broadcast(data);
    if (this.onMatchOver) {
      this.onMatchOver(data);
    }
  }

  broadcast(data, excludePeerId = null) {
    this.connections.forEach((conn, peerId) => {
      if (conn && conn.open && peerId !== excludePeerId) {
        try {
          conn.send(data);
        } catch (e) {
          console.warn('[BattleNetwork] Broadcast send error:', e);
        }
      }
    });
  }

  startLobbyBeacon() {
    this.stopLobbyBeacon();
    const broadcastBeacon = () => {
      if (!this.isConnected || !this.isHost || !this.roomCode) return;
      const count = this.players.size;
      const maxAllowed = MATCH_MODES[this.matchMode]?.maxPlayers || 2;
      const roomInfo = {
        roomCode: this.roomCode,
        hostName: this.localPlayerName,
        matchMode: this.matchMode,
        playerCount: count,
        maxPlayers: maxAllowed,
        timestamp: Date.now()
      };

      try {
        let rooms = JSON.parse(localStorage.getItem('btk_battle_active_rooms') || '{}');
        rooms[this.roomCode] = roomInfo;
        localStorage.setItem('btk_battle_active_rooms', JSON.stringify(rooms));
      } catch (e) {}

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('btk_battle_network');
          bc.postMessage({ type: 'BATTLE_LOBBY_HEARTBEAT', room: roomInfo });
          bc.close();
        } catch (e) {}
      }
    };

    broadcastBeacon();
    this.beaconInterval = setInterval(broadcastBeacon, 2000);
  }

  stopLobbyBeacon() {
    if (this.beaconInterval) {
      clearInterval(this.beaconInterval);
      this.beaconInterval = null;
    }
    if (this.roomCode) {
      try {
        let rooms = JSON.parse(localStorage.getItem('btk_battle_active_rooms') || '{}');
        delete rooms[this.roomCode];
        localStorage.setItem('btk_battle_active_rooms', JSON.stringify(rooms));
      } catch (e) {}

      if (typeof BroadcastChannel !== 'undefined') {
        try {
          const bc = new BroadcastChannel('btk_battle_network');
          bc.postMessage({ type: 'BATTLE_LOBBY_CLOSED', roomCode: this.roomCode });
          bc.close();
        } catch (e) {}
      }
    }
  }

  disconnect() {
    this.stopLobbyBeacon();
    this.connections.forEach((conn) => {
      try { conn.close(); } catch (e) {}
    });
    this.connections.clear();
    this.players.clear();

    if (this.peer) {
      try { this.peer.destroy(); } catch (e) {}
      this.peer = null;
    }

    this.peerId = null;
    this.roomCode = null;
    this.isConnected = false;
    this.isHost = false;
  }
}
