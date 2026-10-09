/**
 * EvadeGame Module
 * Master controller for Roblox Evade multiplayer gameplay mode.
 * Features:
 * - PeerJS multiplayer P2P synchronization.
 * - Exact same campus map with locked doors and progressive key hunts.
 * - Nextbots 50% taller than player using uncropped JPGs (abhishek, adesh, aswin, dipu).
 * - Player 100% faster than bots at start, with slide/bhop momentum.
 * - Escalating Nextbot count and speed as rooms are unlocked.
 * - Simple 3D models for other connected players with floating nametags.
 * - Touch melee damage with cooldowns (no guns).
 * - Proximity teammate revive mechanic.
 * - Seminar Hall escape zone with 'YOU ESCAPED' victory and 'You oofed' defeat screens.
 */
import * as THREE from 'three';
import { NetworkManager, MSG_TYPES } from './NetworkManager.js';
import { NextbotManager } from './NextbotManager.js';
import { KeyProgression } from './KeyProgression.js';
import { RemotePlayer } from './RemotePlayer.js';
import { EvadeHUD } from './EvadeHUD.js';
import { EvadeLobbyUI } from './EvadeLobbyUI.js';
import { STATES } from '../core/GameState.js';
import { ASSET_PATHS } from '../config/assets.js';

export class EvadeGame {
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
    this.isLocalEscaped = false;
    this.isLocalDowned = false;
    this.bleedoutTimer = 45.0; // 45s bleedout when downed

    // Submodules
    this.network = new NetworkManager();
    this.nextbots = new NextbotManager(this.scene, this.level.colliders, this.audio);
    this.progression = new KeyProgression(this.scene, this.level, this.nextbots, this.audio);
    this.hud = new EvadeHUD();
    this.lobby = new EvadeLobbyUI(this.network);

    // Map of connected 3D remote players: Map<id, RemotePlayer>
    this.remotePlayers = new Map();

    // Revive state
    this.revivingTarget = null;
    this.reviveHoldTimer = 0;
    this.reviveDuration = 2.5;

    // Flashlight
    this.flashlight = new THREE.SpotLight(0xffffff, 4.0, 32, Math.PI / 5, 0.45, 1.2);
    this.flashlight.position.set(0, 0, 0);
    this.flashlightTarget = new THREE.Object3D();
    this.scene.add(this.flashlightTarget);
    this.flashlight.target = this.flashlightTarget;
    this.camera.add(this.flashlight);
    this.flashlight.visible = true;

    // Network broadcast timer (20 Hz)
    this.netBroadcastTimer = 0;

    this.initCallbacks();
  }

  initCallbacks() {
    // Lobby Start Match
    this.lobby.onStartMatch = (isSolo) => {
      this.startMatch(isSolo);
    };

    this.lobby.onBackToMenu = () => {
      this.stop();
      this.gameState.setState(STATES.MENU);
    };

    // Key collected callback
    this.progression.onKeyCollected = (keyData, nextStep) => {
      if (this.hud) {
        this.hud.setObjective(this.progression.getCurrentObjectiveText());
      }
      // Broadcast event across network
      this.network.sendEvent(MSG_TYPES.KEY_PICKUP, {
        keyId: keyData.id,
        keyName: keyData.name,
        doorId: keyData.doorId,
        doorName: keyData.doorName,
        step: nextStep
      });
    };

    // Room unlocked callback
    this.progression.onRoomUnlocked = (roomName, isSeminar) => {
      const activeCount = this.nextbots.bots.length;
      const speedMult = this.nextbots.currentSpeed / this.nextbots.initialSpeed;
      if (this.hud) {
        this.hud.setThreatLevel(activeCount, speedMult);
        this.hud.setObjective(this.progression.getCurrentObjectiveText());
      }
    };

    // Network remote player updates
    this.network.onRemotePlayerUpdate = (data) => {
      if (!this.isActive || data.id === this.network.localId) return;

      let rp = this.remotePlayers.get(data.id);
      if (!rp) {
        rp = new RemotePlayer(this.scene, data.id, data.name, !!data.isHost);
        this.remotePlayers.set(data.id, rp);
      }
      rp.updateFromNetwork(data);
    };

    // Network host state sync (client side)
    this.network.onHostStateSync = (data) => {
      if (!this.isActive || this.network.isHost) return;

      if (data.bots) {
        this.nextbots.syncFromNetwork(data.bots);
      }
      if (data.step !== undefined && data.step !== this.progression.currentStep) {
        this.progression.spawnKeyForStep(data.step);
      }
      if (data.isSeminarUnlocked && !this.progression.isSeminarUnlocked) {
        this.progression.unlockDoor('door_seminar_gate', 'SEMINAR HALL');
      }
    };

    // Network gameplay events
    this.network.onGameplayEvent = (event) => {
      if (!this.isActive) return;

      if (event.type === MSG_TYPES.KEY_PICKUP) {
        if (!this.network.isHost) {
          this.progression.unlockDoor(event.doorId, event.doorName);
          this.progression.spawnKeyForStep(event.step);
          if (this.hud) {
            this.hud.setObjective(this.progression.getCurrentObjectiveText());
          }
        }
      } else if (event.type === MSG_TYPES.PLAYER_REVIVED) {
        if (event.targetId === this.network.localId) {
          this.reviveLocalPlayer();
        }
      } else if (event.type === MSG_TYPES.PLAYER_OOFED) {
        this.checkAllPlayersDefeated();
      }
    };

    this.network.onPlayerDisconnected = (pid, name) => {
      const rp = this.remotePlayers.get(pid);
      if (rp) {
        rp.destroy();
        this.remotePlayers.delete(pid);
      }
    };
  }

  /**
   * Opens the Evade Lobby (triggered by clicking PLAY on main menu)
   */
  openLobby() {
    this.isActive = true;
    this.lobby.show();
  }

  /**
   * Starts an active Evade round
   */
  startMatch(isSolo = false) {
    this.isMatchRunning = true;
    this.isLocalEscaped = false;
    this.isLocalDowned = false;
    this.bleedoutTimer = 45.0;

    // Reset local player to South Spawn Corridor
    const startPos = new THREE.Vector3(34.0, 1.65, 92.5);
    this.player.reset(startPos);
    this.player.health = 100;
    this.player.maxHealth = 100;

    // Stow shooting weapons (Evade is pure movement & survival)
    document.body.classList.add('evade-mode');
    if (this.player.setWeaponsVisible) {
      this.player.setWeaponsVisible(false);
    }

    // Enable Evade HUD
    this.hud.show();
    this.hud.setObjective('🔑 OBJECTIVE: SEARCH SOUTH HALL FOR INFIRMARY KEY');
    this.hud.setThreatLevel(1, 1.0);

    // Initialize key progression (locks all doors, spawns Key 1)
    this.progression.initProgression();

    // Spawn initial Nextbot
    this.nextbots.spawnInitialBot();

    // Set playing state and lock pointer
    this.gameState.setState(STATES.PLAYING);
    this.input.requestPointerLock();

    // Start high-energy chase music
    if (this.audio) {
      this.audio.playBGM(ASSET_PATHS.audio.metalBgm, 0.4);
    }
  }

  /**
   * Main game loop update
   */
  update(deltaTime) {
    if (!this.isActive || !this.isMatchRunning) return;

    // 1. Update Flashlight orientation
    const camDir = new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    this.flashlightTarget.position.copy(this.camera.position).addScaledVector(camDir, 8.0);

    // 2. Downed / Bleedout State handling
    if (this.isLocalDowned) {
      this.bleedoutTimer -= deltaTime;
      this.hud.setDowned(true, this.bleedoutTimer / 45.0);

      // Crawling speed when downed
      this.player.walkSpeed = 1.2;
      this.player.sprintSpeed = 1.2;

      if (this.bleedoutTimer <= 0) {
        this.oofLocalPlayer();
      }
    } else {
      // Normal Evade mobility: player is 100% faster than bots at start
      this.player.walkSpeed = 5.0;
      this.player.sprintSpeed = 8.5; // ~8.5 m/s vs initial bot 4.2 m/s
      this.hud.setDowned(false);
    }

    // 3. Update Nextbots (chase AI, touch damage)
    const remoteArray = Array.from(this.remotePlayers.values());
    this.nextbots.update(
      deltaTime,
      {
        id: this.network.localId,
        position: this.player.position,
        isDowned: this.isLocalDowned,
        isEscaped: this.isLocalEscaped,
        takeDamage: (dmg, botPos) => this.takeNextbotDamage(dmg, botPos)
      },
      remoteArray,
      this.camera,
      this.network.isHost
    );

    // 4. Update Key Progression & Escape detection
    this.progression.update(deltaTime, this.player.position, () => {
      this.escapeLocalPlayer();
    });

    // 5. Update 3D Remote Players
    remoteArray.forEach((rp) => {
      rp.update(deltaTime);
    });

    // 6. Proximity Revive Check
    this.updateReviveMechanic(deltaTime);

    // 7. Update Evade Roster HUD
    const rosterData = [
      {
        isLocal: true,
        name: this.network.localPlayerName,
        health: this.player.health,
        isDowned: this.isLocalDowned,
        isEscaped: this.isLocalEscaped
      },
      ...remoteArray.map((rp) => ({
        isLocal: false,
        name: rp.name,
        health: rp.health,
        isDowned: rp.isDowned,
        isEscaped: rp.isEscaped
      }))
    ];
    this.hud.updateRoster(rosterData);

    // 8. Network Synchronization (20 Hz)
    this.netBroadcastTimer += deltaTime;
    if (this.netBroadcastTimer >= 0.05) {
      this.netBroadcastTimer = 0;
      this.syncNetworkState();
    }
  }

  takeNextbotDamage(damage, botPos) {
    if (this.isLocalDowned || this.isLocalEscaped) return;

    this.player.health = Math.max(0, this.player.health - damage);

    // Play damage audio
    if (this.audio && this.audio.playPlayerHurt) {
      this.audio.playPlayerHurt();
    }

    // Outer border damage flash & directional indicator
    if (this.player.onDamageTaken) {
      this.player.onDamageTaken(damage, botPos);
    }

    // Knockback slightly away from bot
    if (botPos) {
      const kb = new THREE.Vector3().subVectors(this.player.position, botPos).normalize();
      this.player.velocity.x += kb.x * 6;
      this.player.velocity.z += kb.z * 6;
    }

    if (this.player.health <= 0) {
      // Check if other teammates are alive to revive
      const livingTeammates = Array.from(this.remotePlayers.values()).filter((rp) => !rp.isDowned && !rp.isEscaped);
      if (livingTeammates.length > 0) {
        this.downLocalPlayer();
      } else {
        // Solo or all teammates down -> instant oof
        this.oofLocalPlayer();
      }
    }
  }

  downLocalPlayer() {
    this.isLocalDowned = true;
    this.bleedoutTimer = 45.0;

    // Send downed state to peers
    this.network.sendEvent(MSG_TYPES.PLAYER_DOWNED, {
      id: this.network.localId,
      name: this.network.localPlayerName
    });
  }

  reviveLocalPlayer() {
    this.isLocalDowned = false;
    this.player.health = 55;
    this.player.walkSpeed = 5.0;
    this.player.sprintSpeed = 8.5;
    this.hud.setDowned(false);

    if (this.audio && this.audio.playPickup) {
      this.audio.playPickup();
    }
  }

  updateReviveMechanic(deltaTime) {
    if (this.isLocalDowned || this.isLocalEscaped) {
      this.hud.hideRevivePrompt();
      return;
    }

    // Find closest downed teammate
    let nearestDowned = null;
    let nearestDist = 3.2;

    for (const rp of this.remotePlayers.values()) {
      if (rp.isDowned) {
        const d = this.player.position.distanceTo(rp.group.position);
        if (d < nearestDist) {
          nearestDist = d;
          nearestDowned = rp;
        }
      }
    }

    if (nearestDowned) {
      // Show revive prompt
      if (this.input.keys && this.input.keys['KeyE']) {
        // Holding E to revive
        this.reviveHoldTimer += deltaTime;
        const progress = Math.min(1.0, this.reviveHoldTimer / this.reviveDuration);
        this.hud.showRevivePrompt(nearestDowned.name, progress);

        if (this.reviveHoldTimer >= this.reviveDuration) {
          // Revived teammate!
          this.reviveHoldTimer = 0;
          nearestDowned.isDowned = false;
          nearestDowned.health = 55;
          nearestDowned.updateNameTag();

          this.network.sendEvent(MSG_TYPES.PLAYER_REVIVED, {
            reviverId: this.network.localId,
            targetId: nearestDowned.id
          });
        }
      } else {
        this.reviveHoldTimer = 0;
        this.hud.showRevivePrompt(nearestDowned.name, 0);
      }
    } else {
      this.reviveHoldTimer = 0;
      this.hud.hideRevivePrompt();
    }
  }

  escapeLocalPlayer() {
    if (this.isLocalEscaped) return;
    this.isLocalEscaped = true;

    // Victory!
    this.hud.showEscapedScreen(
      () => this.restartMatch(),
      () => this.stopAndExitToMenu()
    );

    // Notify peers
    this.network.sendEvent(MSG_TYPES.PLAYER_ESCAPED, {
      id: this.network.localId,
      name: this.network.localPlayerName
    });

    if (this.audio && this.audio.playComboSound) {
      this.audio.playComboSound(6);
    }
  }

  oofLocalPlayer() {
    this.isLocalDowned = false;
    this.isMatchRunning = false;

    // Defeat display: 'You oofed'
    this.hud.showOofedScreen(
      () => this.restartMatch(),
      () => this.stopAndExitToMenu()
    );

    this.network.sendEvent(MSG_TYPES.PLAYER_OOFED, {
      id: this.network.localId,
      name: this.network.localPlayerName
    });

    if (this.audio) {
      this.audio.stopBGM();
    }
  }

  checkAllPlayersDefeated() {
    if (this.isLocalEscaped) return;

    let anyoneAlive = !this.isLocalDowned && this.player.health > 0;
    for (const rp of this.remotePlayers.values()) {
      if (!rp.isDowned && !rp.isEscaped) {
        anyoneAlive = true;
        break;
      }
    }

    if (!anyoneAlive) {
      this.oofLocalPlayer();
    }
  }

  syncNetworkState() {
    // 1. Send local player state to host/peers
    this.network.sendClientUpdate({
      pos: {
        x: Number(this.player.position.x.toFixed(2)),
        y: Number(this.player.position.y.toFixed(2)),
        z: Number(this.player.position.z.toFixed(2))
      },
      yaw: Number(this.player.yaw.toFixed(2)),
      health: Math.round(this.player.health),
      isDowned: this.isLocalDowned,
      isEscaped: this.isLocalEscaped,
      isSliding: this.player.isSliding,
      isCrouching: this.player.isCrouching
    });

    // 2. If Host, broadcast bots and progression world state
    if (this.network.isHost) {
      this.network.broadcastWorldState({
        bots: this.nextbots.getNetworkState(),
        step: this.progression.currentStep,
        isSeminarUnlocked: this.progression.isSeminarUnlocked
      });
    }
  }

  restartMatch() {
    this.hud.hideEndScreens();
    this.startMatch(this.remotePlayers.size === 0);
  }

  stopAndExitToMenu() {
    this.stop();
    this.gameState.setState(STATES.MENU);
  }

  stop() {
    this.isActive = false;
    this.isMatchRunning = false;
    document.body.classList.remove('evade-mode');
    this.hud.hide();
    this.nextbots.reset();
    if (this.progression) {
      this.progression.reset();
    }

    // Destroy remote players
    for (const rp of this.remotePlayers.values()) {
      rp.destroy();
    }
    this.remotePlayers.clear();

    // Restore weapon visibility for Shoot Shoot Shoot mode
    if (this.player.setWeaponsVisible) {
      this.player.setWeaponsVisible(true);
    }

    if (this.audio) {
      this.audio.stopBGM();
    }
  }
}
