/**
 * NetworkManager Module
 * Manages WebRTC Peer-to-Peer multiplayer networking using PeerJS.
 * Host authoritative for Nextbots, active keys, and door unlocks.
 * Synchronizes player positions, rotations, animations, health, revive, and escape states.
 */
import { Peer } from 'peerjs';

export const MSG_TYPES = {
  // Lobby Handshake
  JOIN_REQUEST: 'JOIN_REQUEST',
  JOIN_ACCEPTED: 'JOIN_ACCEPTED',
  LOBBY_UPDATE: 'LOBBY_UPDATE',
  GAME_START: 'GAME_START',

  // Real-time State Sync
  CLIENT_UPDATE: 'CLIENT_UPDATE',
  HOST_STATE_SYNC: 'HOST_STATE_SYNC',

  // Gameplay Events
  KEY_PICKUP: 'KEY_PICKUP',
  DOOR_UNLOCKED: 'DOOR_UNLOCKED',
  PLAYER_DOWNED: 'PLAYER_DOWNED',
  PLAYER_REVIVED: 'PLAYER_REVIVED',
  PLAYER_ESCAPED: 'PLAYER_ESCAPED',
  PLAYER_OOFED: 'PLAYER_OOFED'
};

export class NetworkManager {
  constructor(localPlayerName = 'Survivor') {
    this.localPlayerName = localPlayerName;
    this.peer = null;
    this.peerId = null;
    this.roomCode = null;
    this.isHost = false;
    this.isConnected = false;
    this.isGameRunning = false;

    // Connected peers: Map<peerId, { conn, name, isReady, lastSeen }>
    this.connections = new Map();
    this.hostConn = null; // Client's connection to host

    // Local player ID
    this.localId = `p_${Math.random().toString(36).substring(2, 8)}`;

    // Callbacks
    this.onLobbyUpdate = null;
    this.onGameStart = null;
    this.onRemotePlayerUpdate = null;
    this.onHostStateSync = null;
    this.onGameplayEvent = null;
    this.onPlayerDisconnected = null;
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
   * Initializes Peer as Host
   */
  async createRoom(customCode = null) {
    this.isHost = true;
    this.roomCode = (customCode || this.generateRoomCode()).toUpperCase();
    const fullPeerId = `btk-evade-${this.roomCode.toLowerCase()}`;

    return new Promise((resolve, reject) => {
      try {
        this.peer = new Peer(fullPeerId, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' },
              { urls: 'stun:stun2.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', (id) => {
          this.peerId = id;
          this.isConnected = true;
          this.connections.clear();

          // Add Host to connections list as local
          this.connections.set(this.localId, {
            id: this.localId,
            peerId: this.peerId,
            name: this.localPlayerName,
            isHost: true,
            isReady: true,
            isLocal: true
          });

          this.setupHostListeners();
          resolve({ roomCode: this.roomCode, peerId: id });
        });

        this.peer.on('error', (err) => {
          if (err.type === 'unavailable-id') {
            // Room code already taken, retry with random code
            this.peer.destroy();
            resolve(this.createRoom(this.generateRoomCode() + Math.floor(Math.random() * 9)));
          } else {
            console.error('[NetworkManager] Host PeerJS error:', err);
            reject(err);
          }
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Initializes Peer and connects to an existing Host room
   */
  async joinRoom(roomCode, playerName = 'Survivor') {
    this.isHost = false;
    this.roomCode = roomCode.trim().toUpperCase();
    this.localPlayerName = playerName;
    const targetPeerId = `btk-evade-${this.roomCode.toLowerCase()}`;

    return new Promise((resolve, reject) => {
      try {
        // Create an ephemeral client peer
        this.peer = new Peer(null, {
          debug: 1,
          config: {
            iceServers: [
              { urls: 'stun:stun.l.google.com:19302' },
              { urls: 'stun:stun1.l.google.com:19302' }
            ]
          }
        });

        this.peer.on('open', (myId) => {
          this.peerId = myId;
          const conn = this.peer.connect(targetPeerId, {
            reliable: true,
            metadata: {
              name: this.localPlayerName,
              id: this.localId
            }
          });

          this.hostConn = conn;

          conn.on('open', () => {
            this.isConnected = true;
            this.setupClientListeners(conn);

            // Send Join handshake
            conn.send({
              type: MSG_TYPES.JOIN_REQUEST,
              id: this.localId,
              name: this.localPlayerName
            });

            resolve({ roomCode: this.roomCode, hostPeerId: targetPeerId });
          });

          conn.on('error', (err) => {
            console.error('[NetworkManager] Connection to host failed:', err);
            reject(new Error('Could not connect to room. Please check the code.'));
          });
        });

        this.peer.on('error', (err) => {
          console.error('[NetworkManager] Client Peer error:', err);
          reject(err);
        });
      } catch (err) {
        reject(err);
      }
    });
  }

  setupHostListeners() {
    this.peer.on('connection', (conn) => {
      conn.on('open', () => {
        const remotePeerId = conn.peer;

        conn.on('data', (data) => {
          this.handleHostReceivedData(conn, data);
        });

        conn.on('close', () => {
          this.handlePeerDisconnected(remotePeerId);
        });
      });
    });
  }

  handleHostReceivedData(conn, data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case MSG_TYPES.JOIN_REQUEST: {
        const clientInfo = {
          id: data.id || conn.peer,
          peerId: conn.peer,
          name: data.name || 'Survivor',
          conn: conn,
          isHost: false,
          isReady: true
        };
        this.connections.set(clientInfo.id, clientInfo);

        // Acknowledge join
        conn.send({
          type: MSG_TYPES.JOIN_ACCEPTED,
          localId: clientInfo.id,
          roomCode: this.roomCode,
          isGameRunning: this.isGameRunning
        });

        // Broadcast updated lobby
        this.broadcastLobbyUpdate();
        break;
      }

      case MSG_TYPES.CLIENT_UPDATE: {
        if (this.onRemotePlayerUpdate) {
          this.onRemotePlayerUpdate(data);
        }
        break;
      }

      case MSG_TYPES.KEY_PICKUP:
      case MSG_TYPES.DOOR_UNLOCKED:
      case MSG_TYPES.PLAYER_DOWNED:
      case MSG_TYPES.PLAYER_REVIVED:
      case MSG_TYPES.PLAYER_ESCAPED:
      case MSG_TYPES.PLAYER_OOFED: {
        // Forward event to local host and broadcast to all peers
        if (this.onGameplayEvent) {
          this.onGameplayEvent(data);
        }
        this.broadcast(data, conn.peer);
        break;
      }
    }
  }

  setupClientListeners(conn) {
    conn.on('data', (data) => {
      if (!data || !data.type) return;

      switch (data.type) {
        case MSG_TYPES.JOIN_ACCEPTED:
          this.isGameRunning = data.isGameRunning;
          break;

        case MSG_TYPES.LOBBY_UPDATE:
          if (this.onLobbyUpdate) {
            this.onLobbyUpdate(data.players, data.canStart);
          }
          break;

        case MSG_TYPES.GAME_START:
          this.isGameRunning = true;
          if (this.onGameStart) {
            this.onGameStart(data);
          }
          break;

        case MSG_TYPES.HOST_STATE_SYNC:
          if (this.onHostStateSync) {
            this.onHostStateSync(data);
          }
          break;

        case MSG_TYPES.KEY_PICKUP:
        case MSG_TYPES.DOOR_UNLOCKED:
        case MSG_TYPES.PLAYER_DOWNED:
        case MSG_TYPES.PLAYER_REVIVED:
        case MSG_TYPES.PLAYER_ESCAPED:
        case MSG_TYPES.PLAYER_OOFED:
          if (this.onGameplayEvent) {
            this.onGameplayEvent(data);
          }
          break;
      }
    });

    conn.on('close', () => {
      console.warn('[NetworkManager] Lost connection to host.');
      this.isConnected = false;
      if (this.onPlayerDisconnected) {
        this.onPlayerDisconnected('Host');
      }
    });
  }

  handlePeerDisconnected(peerId) {
    let disconnectedPlayer = null;
    for (const [id, player] of this.connections.entries()) {
      if (player.peerId === peerId) {
        disconnectedPlayer = player;
        this.connections.delete(id);
        break;
      }
    }

    if (disconnectedPlayer) {
      this.broadcastLobbyUpdate();
      if (this.onPlayerDisconnected) {
        this.onPlayerDisconnected(disconnectedPlayer.id, disconnectedPlayer.name);
      }
    }
  }

  broadcastLobbyUpdate() {
    if (!this.isHost) return;

    const playersList = Array.from(this.connections.values()).map((p) => ({
      id: p.id,
      name: p.name,
      isHost: !!p.isHost
    }));

    const canStart = playersList.length >= 2;

    const payload = {
      type: MSG_TYPES.LOBBY_UPDATE,
      players: playersList,
      canStart
    };

    if (this.onLobbyUpdate) {
      this.onLobbyUpdate(playersList, canStart);
    }

    this.broadcast(payload);
  }

  /**
   * Host starts the match for all connected peers
   */
  startMatch() {
    if (!this.isHost) return;
    this.isGameRunning = true;

    const payload = {
      type: MSG_TYPES.GAME_START,
      timestamp: Date.now()
    };

    this.broadcast(payload);
    if (this.onGameStart) {
      this.onGameStart(payload);
    }
  }

  /**
   * Client sends its local position, rotation, health, and posture
   */
  sendClientUpdate(playerData) {
    const payload = {
      type: MSG_TYPES.CLIENT_UPDATE,
      id: this.localId,
      name: this.localPlayerName,
      ...playerData
    };

    if (this.isHost) {
      // Local host player
      if (this.onRemotePlayerUpdate) {
        this.onRemotePlayerUpdate(payload);
      }
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(payload);
    }
  }

  /**
   * Host broadcasts world state (all players, Nextbots, keys, doors)
   */
  broadcastWorldState(worldData) {
    if (!this.isHost) return;

    const payload = {
      type: MSG_TYPES.HOST_STATE_SYNC,
      timestamp: Date.now(),
      ...worldData
    };

    this.broadcast(payload);
  }

  /**
   * Sends an action or gameplay event across peers
   */
  sendEvent(eventType, eventData) {
    const payload = {
      type: eventType,
      senderId: this.localId,
      senderName: this.localPlayerName,
      ...eventData
    };

    if (this.isHost) {
      if (this.onGameplayEvent) {
        this.onGameplayEvent(payload);
      }
      this.broadcast(payload);
    } else if (this.hostConn && this.hostConn.open) {
      this.hostConn.send(payload);
    }
  }

  broadcast(data, excludePeerId = null) {
    for (const player of this.connections.values()) {
      if (player.conn && player.conn.open && player.peerId !== excludePeerId) {
        player.conn.send(data);
      }
    }
  }

  disconnect() {
    if (this.peer) {
      this.peer.destroy();
      this.peer = null;
    }
    this.connections.clear();
    this.hostConn = null;
    this.isConnected = false;
    this.isGameRunning = false;
  }
}
