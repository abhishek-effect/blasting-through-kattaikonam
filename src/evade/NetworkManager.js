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

const ICE_SERVERS = [
  // Google Public STUN
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
  { urls: 'stun:stun2.l.google.com:19302' },
  { urls: 'stun:stun3.l.google.com:19302' },
  { urls: 'stun:stun4.l.google.com:19302' },
  // Cloudflare STUN
  { urls: 'stun:stun.cloudflare.com:3478' },
  // Open Relay Project (Metered.ca free tier STUN + TURN for Symmetric NAT & cellular traversal)
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
  },
  {
    urls: 'turn:openrelay.metered.ca:443?transport=tcp',
    username: 'openrelayproject',
    credential: 'openrelayproject'
  }
];

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
    // Clean up existing peer if any FIRST
    this.disconnect();
    this.isHost = true;
    this.roomCode = (customCode || this.generateRoomCode()).toUpperCase();
    const fullPeerId = `btk-evade-${this.roomCode.toLowerCase()}`;

    return new Promise((resolve, reject) => {
      let isResolved = false;

      const timeoutId = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          this.disconnect();
          reject(new Error('Creating room timed out on PeerJS network. Please try again.'));
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
            console.warn('[NetworkManager] ID taken, generating new room code...');
            if (this.peer) {
              try { this.peer.destroy(); } catch (e) {}
              this.peer = null;
            }
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              // Retry with fresh random code
              resolve(this.createRoom(this.generateRoomCode()));
            }
          } else {
            console.error('[NetworkManager] Host PeerJS error:', err);
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              reject(err);
            }
          }
        });
      } catch (err) {
        if (!isResolved) {
          isResolved = true;
          clearTimeout(timeoutId);
          reject(err);
        }
      }
    });
  }

  /**
   * Initializes Peer and connects to an existing Host room
   */
  async joinRoom(roomCode, playerName = 'Survivor', onStatusUpdate = null) {
    // Clean up existing peer if any FIRST
    this.disconnect();
    this.isHost = false;
    this.roomCode = roomCode.trim().toUpperCase();
    this.localPlayerName = playerName;
    const targetPeerId = `btk-evade-${this.roomCode.toLowerCase()}`;

    return new Promise((resolve, reject) => {
      let isResolved = false;
      let handshakeInterval = null;
      let attemptTimer = null;
      let retryCount = 0;
      const MAX_RETRIES = 3;

      const cleanup = () => {
        if (handshakeInterval) {
          clearInterval(handshakeInterval);
          handshakeInterval = null;
        }
        if (attemptTimer) {
          clearTimeout(attemptTimer);
          attemptTimer = null;
        }
      };

      const timeoutId = setTimeout(() => {
        cleanup();
        if (!isResolved) {
          isResolved = true;
          this.disconnect();
          reject(new Error(`Connection timed out after 25s. Ensure Host created room [${this.roomCode}] and is waiting in the lobby.`));
        }
      }, 25000);

      try {
        this.peer = new Peer(null, {
          debug: 1,
          config: {
            iceServers: ICE_SERVERS,
            iceCandidatePoolSize: 10
          }
        });

        const tryConnect = () => {
          if (isResolved || !this.peer || this.peer.destroyed) return;

          if (onStatusUpdate) {
            onStatusUpdate(`Negotiating WebRTC connection to [${this.roomCode}]... (Attempt ${retryCount + 1}/${MAX_RETRIES})`);
          }

          if (this.hostConn) {
            try { this.hostConn.close(); } catch (e) {}
            this.hostConn = null;
          }

          const conn = this.peer.connect(targetPeerId, {
            reliable: true,
            serialization: 'json',
            metadata: {
              name: this.localPlayerName,
              id: this.localId
            }
          });

          this.hostConn = conn;

          // Attach listeners IMMEDIATELY to prevent dropped packets
          this.setupClientListeners(conn);

          const sendJoin = () => {
            if (conn.open) {
              try {
                conn.send({
                  type: MSG_TYPES.JOIN_REQUEST,
                  id: this.localId,
                  name: this.localPlayerName
                });
              } catch (e) {}
            }
          };

          const onConnOpen = () => {
            cleanup();
            this.isConnected = true;
            sendJoin();

            // Periodic heartbeat handshake retry until lobby received
            if (!handshakeInterval) {
              handshakeInterval = setInterval(() => {
                if (this.isConnected && conn.open) {
                  sendJoin();
                } else {
                  cleanup();
                }
              }, 1200);
            }

            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              resolve({ roomCode: this.roomCode, hostPeerId: targetPeerId });
            }
          };

          if (conn.open) {
            onConnOpen();
          } else {
            conn.on('open', onConnOpen);
          }

          conn.on('error', (err) => {
            console.warn('[NetworkManager] DataConnection attempt error:', err);
          });

          // If connection doesn't open within 5.5s, retry
          attemptTimer = setTimeout(() => {
            if (!isResolved && retryCount < MAX_RETRIES - 1) {
              retryCount++;
              console.log(`[NetworkManager] Retrying connection to ${targetPeerId} (attempt ${retryCount + 1})...`);
              tryConnect();
            }
          }, 5500);
        };

        this.peer.on('open', (myId) => {
          this.peerId = myId;
          tryConnect();
        });

        this.peer.on('error', (err) => {
          console.error('[NetworkManager] Client Peer error:', err);
          if (err.type === 'peer-unavailable') {
            if (retryCount < MAX_RETRIES - 1) {
              retryCount++;
              if (onStatusUpdate) {
                onStatusUpdate(`Room [${this.roomCode}] initializing on network, retrying in 2s...`);
              }
              setTimeout(() => {
                if (!isResolved) tryConnect();
              }, 2000);
              return;
            }
            cleanup();
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              reject(new Error(`Room [${this.roomCode}] not found. Ensure Host has created the room.`));
            }
          } else {
            cleanup();
            if (!isResolved) {
              isResolved = true;
              clearTimeout(timeoutId);
              reject(new Error(err.message || 'Peer network connection error.'));
            }
          }
        });
      } catch (err) {
        cleanup();
        clearTimeout(timeoutId);
        reject(err);
      }
    });
  }

  setupHostListeners() {
    this.peer.on('connection', (conn) => {
      const remotePeerId = conn.peer;
      const clientName = (conn.metadata && conn.metadata.name) || 'Survivor';
      const clientId = (conn.metadata && conn.metadata.id) || `p_${remotePeerId.substring(0, 6)}`;

      const registerClient = () => {
        const clientInfo = {
          id: clientId,
          peerId: remotePeerId,
          name: clientName,
          conn: conn,
          isHost: false,
          isReady: true
        };
        this.connections.set(clientId, clientInfo);

        // Send accept immediately
        try {
          conn.send({
            type: MSG_TYPES.JOIN_ACCEPTED,
            localId: clientId,
            roomCode: this.roomCode,
            isGameRunning: this.isGameRunning
          });
        } catch (e) {}

        this.broadcastLobbyUpdate();
      };

      // Listen for data IMMEDIATELY
      conn.on('data', (data) => {
        this.handleHostReceivedData(conn, data);
      });

      conn.on('close', () => {
        this.handlePeerDisconnected(remotePeerId);
      });

      conn.on('error', (err) => {
        console.warn('[NetworkManager] Connection error with peer:', remotePeerId, err);
        this.handlePeerDisconnected(remotePeerId);
      });

      if (conn.open) {
        registerClient();
      } else {
        conn.on('open', registerClient);
      }
    });
  }

  handleHostReceivedData(conn, data) {
    if (!data || !data.type) return;

    switch (data.type) {
      case MSG_TYPES.JOIN_REQUEST: {
        const clientId = data.id || (conn.metadata && conn.metadata.id) || conn.peer;
        const clientName = data.name || (conn.metadata && conn.metadata.name) || 'Survivor';
        const clientInfo = {
          id: clientId,
          peerId: conn.peer,
          name: clientName,
          conn: conn,
          isHost: false,
          isReady: true
        };
        this.connections.set(clientId, clientInfo);

        // Acknowledge join
        try {
          conn.send({
            type: MSG_TYPES.JOIN_ACCEPTED,
            localId: clientId,
            roomCode: this.roomCode,
            isGameRunning: this.isGameRunning
          });
        } catch (e) {}

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
    this.isGameRunning = true;

    const payload = {
      type: MSG_TYPES.GAME_START,
      timestamp: Date.now()
    };

    if (this.isHost) {
      this.broadcast(payload);
    }
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
        try {
          player.conn.send(data);
        } catch (e) {}
      }
    }
  }

  disconnect() {
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch (e) {}
      this.peer = null;
    }
    for (const player of this.connections.values()) {
      if (player.conn) {
        try { player.conn.close(); } catch (e) {}
      }
    }
    this.connections.clear();
    if (this.hostConn) {
      try { this.hostConn.close(); } catch (e) {}
      this.hostConn = null;
    }
    this.isConnected = false;
    this.isGameRunning = false;
    this.isHost = false;
  }
}

