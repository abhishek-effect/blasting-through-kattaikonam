/**
 * BattleGame Module
 * Master controller for Battle (Multiplayer) mode:
 * - 1v1, 2v2, 3v3 deathmatch game loop
 * - 2-minute match countdown
 * - Randomly locked doors and scattered keys
 * - 3D player.fbx model and unique JPG/PNG character integration
 * - Raycast hit detection, damage registration, respawn loop, and scoreboard
 */
import * as THREE from 'three';
import { BattleNetworkManager, BATTLE_MSG } from './BattleNetworkManager.js';
import { BattleRemotePlayer } from './BattleRemotePlayer.js';
import { BattleKeyManager } from './BattleKeyManager.js';
import { BattleHUD } from './BattleHUD.js';
import { BattleLobbyUI } from './BattleLobbyUI.js';
import { STATES, GAME_MODES } from '../core/GameState.js';

export class BattleGame {
  constructor(scene, camera, level, player, input, audio, gameState) {
    this.scene = scene;
    this.camera = camera;
    this.level = level;
    this.player = player;
    this.input = input;
    this.audio = audio;
    this.gameState = gameState;

    this.isActive = false;
    this.isMatchRunning = false;
    this.matchTime = 120.0;
    this.isLocalDead = false;
    this.respawnTimer = 0;

    // Submodules
    this.network = new BattleNetworkManager();
    this.keys = new BattleKeyManager(this.scene, this.level, this.audio);
    this.hud = new BattleHUD();
    this.lobby = new BattleLobbyUI(this.network);

    // Connected remote players: Map<id, BattleRemotePlayer>
    this.remotePlayers = new Map();

    // Guaranteed open corridor / atrium spawn points (STRICTLY outside all locked rooms & Seminar Hall)
    // Red Base: South Hallway & South Central open corridor
    this.redSpawns = [
      new THREE.Vector3(34, 0, 88),
      new THREE.Vector3(28, 0, 88),
      new THREE.Vector3(40, 0, 88),
      new THREE.Vector3(34, 0, 72)
    ];

    // Blue Base: North Hallway & North Central open corridor
    this.blueSpawns = [
      new THREE.Vector3(34, 0, 22),
      new THREE.Vector3(28, 0, 22),
      new THREE.Vector3(40, 0, 22),
      new THREE.Vector3(34, 0, 34)
    ];

    this.netSyncTimer = 0;
    this.initCallbacks();
  }

  isInsideRestrictedArea(x, z) {
    // 1. Check if Seminar Hall is locked (Gate at x: 55, z: 45.5)
    const isSeminarLocked = this.keys.lockedDoorIds.has('door_seminar_gate') ||
      (this.level && this.level.seminarGate && !this.level.seminarGate.isUnlocked);
    if (isSeminarLocked && x >= 54.0 && z >= 26.0 && z <= 67.0) {
      return true;
    }

    // 2. Check if inside any room whose door is currently locked
    const ROOM_BOUNDS = {
      door_infirmary: { minX: 0, maxX: 15, minZ: 15, maxZ: 29 },
      door_computer_lab: { minX: 0, maxX: 15, minZ: 49, maxZ: 65 },
      door_bio_lab: { minX: 0, maxX: 15, minZ: 67, maxZ: 83 },
      door_board_room: { minX: 45, maxX: 65, minZ: 84, maxZ: 100 },
      door_library: { minX: 65, maxX: 100, minZ: 82, maxZ: 100 },
      door_phy_lab: { minX: 34, maxX: 63, minZ: 0, maxZ: 15 },
      door_locked_room: { minX: 64, maxX: 81, minZ: 0, maxZ: 15 },
      door_unlockable_room: { minX: 82, maxX: 100, minZ: 0, maxZ: 15 }
    };

    for (const [doorId, b] of Object.entries(ROOM_BOUNDS)) {
      if (this.keys.lockedDoorIds.has(doorId)) {
        if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) {
          return true;
        }
      }
    }
    return false;
  }

  getSafeSpawnPosition(team, index = 0) {
    const list = team === 'blue' ? this.blueSpawns : this.redSpawns;
    const base = list[index % list.length];
    const candidate = new THREE.Vector3(
      base.x + (Math.random() - 0.5) * 1.5,
      0.9,
      base.z + (Math.random() - 0.5) * 1.5
    );

    // If candidate ever falls inside Seminar Hall or any locked room, fallback to Central Atrium
    if (this.isInsideRestrictedArea(candidate.x, candidate.z)) {
      return new THREE.Vector3(31, 0.9, 48);
    }
    return candidate;
  }

  initCallbacks() {
    // Lobby Handlers
    this.lobby.onStartMatch = () => {
      if (!this.network.isHost) return;
      const { lockedDoors, keySpawns } = this.keys.setupRandomDoors(4);
      this.network.startMatch({ lockedDoors, keySpawns });
    };

    this.lobby.onBackToMenu = () => {
      this.stop();
      this.gameState.setState(STATES.MENU);
    };

    // HUD Handlers
    this.hud.onReturnToLobby = () => {
      this.isMatchRunning = false;
      this.hud.hide();
      this.lobby.show();
    };

    this.hud.onReturnToMenu = () => {
      this.stop();
      this.gameState.setState(STATES.MENU);
    };

    // Network Handlers
    this.network.onMatchStart = (data) => {
      this.handleMatchStart(data);
    };

    this.network.onPlayerUpdate = (data) => {
      const rp = this.remotePlayers.get(data.id);
      if (rp) {
        rp.updateFromNetwork(data);
      }
    };

    this.network.onPlayerFire = (data) => {
      const rp = this.remotePlayers.get(data.playerId);
      if (rp) {
        rp.playMuzzleFlash();
        if (this.audio && this.audio.playGunshot) {
          this.audio.playGunshot();
        }
      }
    };

    this.network.onPlayerHit = (data) => {
      if (data.targetId === this.network.localId) {
        this.handleLocalDamage(data.damage, data.attackerId);
      } else {
        const rp = this.remotePlayers.get(data.targetId);
        if (rp) {
          rp.takeDamage(data.damage, data.hitPoint, data.isHeadshot);
        }
      }
    };

    this.network.onPlayerEliminated = (data) => {
      this.handleElimination(data);
    };

    this.network.onPlayerRespawn = (data) => {
      const rp = this.remotePlayers.get(data.playerId);
      if (rp && data.pos) {
        rp.respawn(new THREE.Vector3(data.pos.x, data.pos.y, data.pos.z));
      }
    };

    this.network.onKeyCollected = (data) => {
      this.keys.removeKey(data.keyId);
    };

    this.network.onDoorUnlocked = (data) => {
      this.keys.unlockDoor(data.doorId);
      const playerObj = this.network.players.get(data.playerId);
      const pName = playerObj ? playerObj.name : 'An operative';
      if (data.doorId === 'door_seminar_gate') {
        this.hud.showNotice(`🔓 ${pName.toUpperCase()} UNLOCKED THE SEMINAR HALL AUDITORIUM!`, 4.0);
      } else {
        this.hud.showNotice(`🔓 ${pName.toUpperCase()} UNLOCKED A CAMPUS DOOR!`, 3.5);
      }
    };

    this.network.onMatchOver = (data) => {
      this.handleMatchOver(data);
    };

    this.network.onPlayerDisconnect = (msg) => {
      this.hud.showNotice(`⚠️ ${msg}`, 3.5);
    };

    // Key Manager Handlers
    this.keys.onKeyCollected = (keyId, count) => {
      this.hud.updateKeysHeld(count);
      this.hud.showNotice(`🗝️ COLLECTED A KEY! (${count} IN HAND)`, 2.5);
      this.network.sendKeyCollected(keyId);
    };

    this.keys.onDoorUnlocked = (doorId, count) => {
      this.hud.updateKeysHeld(count);
      if (doorId === 'door_seminar_gate') {
        this.hud.showNotice(`🔓 SEMINAR HALL AUDITORIUM UNLOCKED! (${count} KEYS LEFT)`, 3.5);
      } else {
        this.hud.showNotice(`🔓 DOOR UNLOCKED! (${count} KEYS LEFT)`, 3.0);
      }
      this.network.sendDoorUnlocked(doorId);
    };
  }

  openLobby() {
    this.isActive = true;
    this.isMatchRunning = false;
    this.remotePlayers.clear();
    this.lobby.show();
  }

  handleMatchStart(data) {
    this.isMatchRunning = true;
    this.matchTime = data.duration || 120;
    this.isLocalDead = false;
    this.respawnTimer = 0;

    // Apply locked doors and keys
    this.keys.applyMatchConfig(data.lockedDoors || [], data.keySpawns || []);

    // Setup Remote Players
    this.remotePlayers.forEach((rp) => rp.destroy());
    this.remotePlayers.clear();

    const allPlayers = data.players || [];
    let redIndex = 0;
    let blueIndex = 0;

    allPlayers.forEach((p) => {
      const spIdx = (p.team === 'blue' ? blueIndex : redIndex);
      const safePos = this.getSafeSpawnPosition(p.team, spIdx);

      if (p.id === this.network.localId) {
        // Spawn local player at guaranteed safe corridor base
        this.player.position.set(safePos.x, 0.9, safePos.z);
        this.player.health = 100;
        this.player.maxHealth = 100;
      } else {
        // Instantiate remote player with nametag shown ONLY for same-team allies
        const isFriendly = (this.network.matchMode !== '1v1') && (p.team === this.network.localTeam);
        const rp = new BattleRemotePlayer(this.scene, p, { isFriendly });
        rp.currentPos.copy(safePos);
        rp.targetPos.copy(safePos);
        rp.group.position.copy(safePos);
        this.remotePlayers.set(p.id, rp);
      }

      if (p.team === 'blue') blueIndex++;
      else redIndex++;
    });

    // Setup HUD & State
    this.lobby.hide();
    this.hud.show();
    this.hud.setMatchMode(data.matchMode);
    this.hud.updateTimer(this.matchTime);
    this.hud.updateScores(0, 0, data.matchMode, allPlayers);
    this.hud.updateKeysHeld(0);
    this.hud.showNotice('⚔️ 2-MINUTE DEATHMATCH COMMENCED!', 4.0);

    this.gameState.currentMode = GAME_MODES.BATTLE;
    this.gameState.setState(STATES.PLAYING);

    if (this.player.setWeaponsVisible) {
      this.player.setWeaponsVisible(true);
      this.player.switchSlot(0);
    }
    this.input.requestPointerLock();

    if (this.audio && this.audio.playComboSound) {
      this.audio.playComboSound(2);
    }
  }

  update(deltaTime) {
    if (!this.isActive || !this.isMatchRunning) return;

    // 1. Countdown timer
    this.matchTime -= deltaTime;
    this.hud.updateTimer(this.matchTime);

    if (this.matchTime <= 0) {
      this.matchTime = 0;
      if (this.network.isHost) {
        this.computeAndSendMatchEnd();
      }
      return;
    }

    // 2. Update keys and door unlocking
    this.keys.update(deltaTime, this.player.position, this.input);

    // 3. Update remote players
    this.remotePlayers.forEach((rp) => {
      rp.update(deltaTime);
    });

    // 4. Update respawn countdown if local player is dead
    if (this.isLocalDead) {
      this.respawnTimer -= deltaTime;
      const countDisplay = Math.max(1, Math.ceil(this.respawnTimer));
      this.hud.updateRespawnCountdown(countDisplay);

      if (this.respawnTimer <= 0) {
        this.respawnLocalPlayer();
      }
    }

    // 5. 20Hz Network Broadcast of local player state
    this.netSyncTimer += deltaTime;
    if (this.netSyncTimer >= 0.05) { // 20 updates per second
      this.netSyncTimer = 0;
      this.broadcastLocalState();
    }
  }

  broadcastLocalState() {
    if (!this.network.isConnected || !this.isMatchRunning) return;

    const yaw = this.player.camera ? this.player.camera.rotation.y : 0;
    this.network.sendPlayerUpdate({
      pos: {
        x: parseFloat(this.player.position.x.toFixed(2)),
        y: parseFloat(this.player.position.y.toFixed(2)),
        z: parseFloat(this.player.position.z.toFixed(2))
      },
      yaw: parseFloat(yaw.toFixed(2)),
      health: Math.round(this.player.health),
      isDead: this.isLocalDead,
      isCrouching: !!this.player.isCrouching,
      isSliding: !!this.player.isSliding
    });
  }

  /**
   * Returns list of shootable opponents (players on the opposite team)
   */
  getShootableTargets() {
    if (!this.isActive || !this.isMatchRunning) return [];

    const opponents = [];
    this.remotePlayers.forEach((rp) => {
      if (!rp.isDead) {
        // In 1v1, any remote player is an opponent. In 2v2/3v3, only opposite team.
        if (this.network.matchMode === '1v1' || rp.team !== this.network.localTeam) {
          opponents.push(rp);
        }
      }
    });
    return opponents;
  }

  /**
   * Called when local player shoots and scores a hit on a remote player
   */
  handlePlayerHit(shootResult) {
    if (!shootResult || !shootResult.enemy) return;

    const targetRp = shootResult.enemy;
    const damage = shootResult.damage || 25;
    const isHeadshot = !!shootResult.isCritical;
    const hitPoint = shootResult.point;

    // Send hit over network
    this.network.sendPlayerHit({
      targetId: targetRp.id,
      damage,
      isHeadshot,
      hitPoint: hitPoint ? { x: hitPoint.x, y: hitPoint.y, z: hitPoint.z } : null
    });

    // Check if lethal
    if (targetRp.health - damage <= 0) {
      targetRp.takeDamage(damage, hitPoint, isHeadshot);
      this.network.sendPlayerEliminated(targetRp.id, this.network.localId);
    }
  }

  /**
   * Called when local player takes damage from a remote player
   */
  handleLocalDamage(damage, attackerId) {
    if (this.isLocalDead) return;

    this.player.health = Math.max(0, this.player.health - damage);

    // Audio & Screen flash
    if (this.audio && this.audio.playPlayerHurt) {
      this.audio.playPlayerHurt();
    }

    if (this.player.health <= 0) {
      this.isLocalDead = true;
      this.respawnTimer = 3.0;

      const attacker = this.network.players.get(attackerId);
      const attackerName = attacker ? attacker.name : 'An operative';

      this.hud.showRespawnCountdown(attackerName, 3);
      this.network.sendPlayerEliminated(this.network.localId, attackerId);
    }
  }

  respawnLocalPlayer() {
    this.isLocalDead = false;
    this.player.health = 100;
    this.hud.hideRespawn();

    if (this.player.setWeaponsVisible) {
      this.player.setWeaponsVisible(true);
      this.player.switchSlot(0);
    }
    this.input.requestPointerLock();

    // Teleport to safe team base (guaranteed outside locked doors & Seminar Hall)
    const safePos = this.getSafeSpawnPosition(this.network.localTeam, Math.floor(Math.random() * 4));
    this.player.position.set(safePos.x, 0.9, safePos.z);

    // Broadcast respawn
    this.network.sendPlayerUpdate({
      pos: { x: this.player.position.x, y: this.player.position.y, z: this.player.position.z },
      health: 100,
      isDead: false
    });

    if (this.audio && this.audio.playComboSound) {
      this.audio.playComboSound(1);
    }
    this.hud.showNotice('⚡ RESPAWNED IN BATTLE ARENA!', 2.5);
  }

  handleElimination(data) {
    const killer = this.network.players.get(data.attackerId);
    const victim = this.network.players.get(data.victimId);

    const killerName = killer ? killer.name : 'Operative';
    const victimName = victim ? victim.name : 'Operative';
    const isLocalKiller = data.attackerId === this.network.localId;
    const isLocalVictim = data.victimId === this.network.localId;

    this.hud.addKillFeedItem(killerName, victimName, isLocalKiller, isLocalVictim);

    // Calculate team kills
    const players = Array.from(this.network.players.values());
    const redKills = players.filter((p) => p.team === 'red').reduce((sum, p) => sum + (p.kills || 0), 0);
    const blueKills = players.filter((p) => p.team === 'blue').reduce((sum, p) => sum + (p.kills || 0), 0);

    this.hud.updateScores(redKills, blueKills, this.network.matchMode, players);
  }

  computeAndSendMatchEnd() {
    const players = Array.from(this.network.players.values());
    const redKills = players.filter((p) => p.team === 'red').reduce((sum, p) => sum + (p.kills || 0), 0);
    const blueKills = players.filter((p) => p.team === 'blue').reduce((sum, p) => sum + (p.kills || 0), 0);

    let winnerTeam = 'draw';
    let winnerTitle = "IT'S A DRAW!";

    if (this.network.matchMode === '1v1') {
      const p1 = players[0];
      const p2 = players[1];
      if (p1 && p2) {
        if (p1.kills > p2.kills) {
          winnerTitle = `🏆 ${p1.name.toUpperCase()} WINS!`;
          winnerTeam = p1.team;
        } else if (p2.kills > p1.kills) {
          winnerTitle = `🏆 ${p2.name.toUpperCase()} WINS!`;
          winnerTeam = p2.team;
        }
      }
    } else {
      if (redKills > blueKills) {
        winnerTitle = '🏆 🔴 RED TEAM VICTORIOUS!';
        winnerTeam = 'red';
      } else if (blueKills > redKills) {
        winnerTitle = '🏆 🔵 BLUE TEAM VICTORIOUS!';
        winnerTeam = 'blue';
      }
    }

    const winnerData = {
      winnerTitle,
      winnerTeam,
      subtitle: `2 Minutes Expired | RED: ${redKills} vs BLUE: ${blueKills}`,
      players
    };

    this.network.sendMatchOver(winnerData);
  }

  handleMatchOver(data) {
    this.isMatchRunning = false;
    this.hud.showResults(data, data.players || Array.from(this.network.players.values()));

    if (this.audio && this.audio.playComboSound) {
      this.audio.playComboSound(2);
    }
  }

  stop() {
    this.isActive = false;
    this.isMatchRunning = false;
    this.keys.clear();
    this.remotePlayers.forEach((rp) => rp.destroy());
    this.remotePlayers.clear();
    this.hud.hide();
    this.lobby.hide();
    this.network.disconnect();
  }
}
