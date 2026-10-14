/**
 * EvadeGame Module
 * Master controller for Evade multiplayer gameplay mode.
 * Features:
 * - PeerJS multiplayer P2P synchronization.
 * - Exact same campus map with locked doors and progressive key hunts.
 * - Evil Santhomites 50% taller than player using uncropped JPGs (abhishek, adesh, aswin, dipu).
 * - Player 100% faster than bots at start, with slide/bhop momentum.
 * - Escalating Evil Santhomite count and speed as rooms are unlocked.
 * - Stylized 3D models for other connected players with floating nametags.
 * - Touch melee damage with cooldowns (no guns).
 * - Proximity teammate revive mechanic.
 * - Seminar Hall escape zone with 'YOU ESCAPED' victory and 'Not so vibrant, are you?' defeat screens.
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

// Pre-allocated static vectors (zero GC allocations)
const _egCamDir = new THREE.Vector3();
const _egKbVec = new THREE.Vector3();

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
    this.isVotingPhase = false;
    this.votingTimer = 10;
    this.isSoloMatch = false;
    this.isLocalEscaped = false;
    this.isLocalDowned = false;
    this.bleedoutTimer = 45.0; // 45s bleedout when downed
    this.subMode = 'escape'; // 'escape' or 'survive'
    this.surviveTimer = 0;
    this.isElevatorEscaping = false;

    // Submodules
    this.network = new NetworkManager();
    this.nextbots = new NextbotManager(this.scene, this.level.colliders, this.audio, this.level);
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
    // Lobby Start Match -> Host triggers voting phase
    this.lobby.onStartMatch = (isSolo) => {
      this.isSoloMatch = isSolo;
      this.network.startVotingPhase(isSolo);
    };

    this.lobby.onBackToMenu = () => {
      this.stop();
      this.gameState.setState(STATES.MENU);
    };

    // Voting Phase Callbacks
    this.network.onVotingStart = (payload) => {
      this.onVotingStart(payload);
    };

    this.network.onVoteUpdate = (votes) => {
      if (this.hud) {
        this.hud.updateVotingTallies(votes, this.network.selectedMode);
      }
    };

    this.network.onVotingDecided = (payload) => {
      this.onVotingDecided(payload);
    };

    // Progression photocopy acquired callback
    this.progression.onPhotocopyObtained = () => {
      this.onPhotocopyObtained();
    };

    // Elevator interaction callback hook
    if (this.level && this.level.elevator) {
      this.level.elevator.onInteract = () => {
        if (this.isActive && this.isMatchRunning && this.subMode === 'escape' && this.player.hasPhotocopy) {
          this.triggerElevatorEscape();
        }
      };
    }

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
      if (data.objective && this.hud) {
        this.hud.setObjective(data.objective);
      }
      if (data.subMode && this.subMode !== data.subMode) {
        this.subMode = data.subMode;
      }
      if (data.surviveTimer !== undefined && this.subMode === 'survive') {
        this.surviveTimer = data.surviveTimer;
        this.hud.setSurvivalTimer(this.surviveTimer);
      }
    };

    // Network gameplay events
    this.network.onGameplayEvent = (event) => {
      if (!this.isActive) return;

      if (event.type === MSG_TYPES.KEY_PICKUP) {
        this.progression.unlockDoor(event.doorId, event.doorName);
        this.progression.spawnKeyForStep(event.step);
        if (this.hud) {
          this.hud.setObjective(this.progression.getCurrentObjectiveText());
        }
        if (this.network.isHost) {
          this.syncNetworkState();
        }
      } else if (event.type === MSG_TYPES.PLAYER_REVIVED) {
        if (event.targetId === this.network.localId) {
          this.reviveLocalPlayer();
        }
      } else if (event.type === MSG_TYPES.PLAYER_OOFED) {
        this.checkAllPlayersDefeated();
      } else if (event.type === MSG_TYPES.PHOTOCOPY_ACQUIRED) {
        const rp = this.remotePlayers.get(event.id);
        if (rp) {
          rp.hasPhotocopy = true;
        }
      } else if (event.type === MSG_TYPES.PLAYER_ESCAPED) {
        const rp = this.remotePlayers.get(event.id);
        if (rp) {
          rp.isEscaped = true;
        }
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
    if (this.lobby) {
      this.lobby.reset();
      this.lobby.show();
    }
  }

  /**
   * Starts the 10-Second In-Game Sub-Mode Voting Phase
   */
  onVotingStart(payload) {
    this.isActive = true;
    this.isVotingPhase = true;
    this.isMatchRunning = false;
    this.isSoloMatch = !!payload.isSolo;
    this.votingTimer = payload.duration || 10;

    // Reset local player to South Spawn Corridor
    const startPos = new THREE.Vector3(34.0, 1.65, 92.5);
    this.player.reset(startPos);
    this.player.health = 100;
    this.player.maxHealth = 100;
    this.player.hasPhotocopy = false;
    if (this.player.setPhotocopyVisible) {
      this.player.setPhotocopyVisible(false);
    }

    // Stow shooting weapons (Evade is pure movement & survival)
    document.body.classList.add('evade-mode');
    if (this.player.setWeaponsVisible) {
      this.player.setWeaponsVisible(false);
    }

    // Reset bots and progress during voting phase
    this.nextbots.reset();
    if (this.progression) {
      this.progression.reset();
    }

    // Hide lobby and ensure any end screens are gone
    if (this.lobby) this.lobby.hide();
    this.hud.hideEndScreens();
    this.hud.hideSurvivalTimer();
    this.hud.setPhotocopyStatus(false);
    this.hud.show();

    // Show the 10-second In-Game Sub-Mode Voting Modal
    this.hud.showVotingModal(payload.duration || 10, (mode) => {
      this.network.sendVote(mode);
    });

    // Enter playing state and lock pointer
    this.gameState.setState(STATES.PLAYING);
    this.input.requestPointerLock();
  }

  /**
   * Callback when voting phase concludes (after 10s)
   */
  onVotingDecided(payload) {
    this.isVotingPhase = false;
    const mode = payload.mode || 'escape';
    const surviveDuration = payload.surviveDuration || 120;
    const isSolo = !!payload.isSolo;

    this.hud.showVotingResult(mode, () => {
      this.beginGameplay(mode, surviveDuration, isSolo);
    });
  }

  /**
   * Starts an active Evade round (triggers voting phase on host)
   */
  startMatch(isSolo = false, mode = 'escape') {
    if (this.network.isHost || isSolo) {
      this.network.startVotingPhase(isSolo);
    }
  }

  /**
   * Begins actual gameplay once voting is decided
   */
  beginGameplay(mode = 'escape', surviveDuration = 120, isSolo = false) {
    this.isMatchRunning = true;
    this.isVotingPhase = false;
    this.isLocalEscaped = false;
    this.isLocalDowned = false;
    this.isElevatorEscaping = false;
    this.bleedoutTimer = 45.0;
    this.subMode = mode;

    const activePlayerCount = Math.max(1, 1 + this.remotePlayers.size);

    // Set network authority on bots
    this.nextbots.isHost = this.network.isHost;
    this.nextbots.isMultiplayer = !isSolo;
    this.nextbots.playerCount = activePlayerCount;

    // Enable Evade HUD
    this.hud.show();
    this.hud.setPhotocopyStatus(false);
    this.hud.setRearView(false);

    if (this.subMode === 'survive') {
      this.surviveTimer = surviveDuration;
      this.hud.setSurvivalTimer(this.surviveTimer);
      this.progression.initSurviveMode();
      this.hud.setObjective('⏱️ SURVIVE UNTIL CAMPUS LOCKDOWN LIFTS!');
      this.hud.setThreatLevel(this.nextbots.getMaxBots(), 1.0);

      // Spawn bots for survive mode
      if (this.network.isHost || isSolo) {
        this.nextbots.spawnSurviveBots(activePlayerCount);
      }
    } else {
      // Escape mode:
      this.surviveTimer = 0;
      this.hud.hideSurvivalTimer(); // NEVER show timer in Escape mode!
      this.progression.initProgression(activePlayerCount);
      this.hud.setObjective(this.progression.getCurrentObjectiveText());
      this.hud.setThreatLevel(2, 1.0);

      // Spawn initial 2 Evil Santhomites
      if (this.network.isHost || isSolo) {
        this.nextbots.spawnInitialBots();
      }
    }

    if (this.network.isHost) {
      this.syncNetworkState();
    }

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
    if (!this.isActive) return;

    // 0. Update Flashlight orientation (0 allocations)
    this.camera.getWorldDirection(_egCamDir);
    this.flashlightTarget.position.copy(this.camera.position).addScaledVector(_egCamDir, 8.0);

    // 1. Voting Phase Update
    if (this.isVotingPhase) {
      // Host Authoritative Countdown ticker
      if (this.network.isHost || this.isSoloMatch) {
        this.votingTimer -= deltaTime;
        this.hud.updateVotingCountdown(this.votingTimer);
        if (this.votingTimer <= 0) {
          this.isVotingPhase = false;
          this.network.finishVotingPhase(this.isSoloMatch);
        }
      }
      return; // Do NOT update nextbots or combat during voting phase!
    }

    if (!this.isMatchRunning) return;

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

    // 2b. Survive mode timer countdown
    if (this.subMode === 'survive' && !this.isLocalDowned && !this.isLocalEscaped) {
      if (this.network.isHost || !this.network.isConnected) {
        this.surviveTimer -= deltaTime;
      }
      this.hud.setSurvivalTimer(Math.max(0, this.surviveTimer));
      if (this.surviveTimer <= 0) {
        this.escapeLocalPlayer(true);
      }
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

    // 3b. Update Persistent Threat Tracker Arrow & Rearview UI
    this.updateThreatTracker();
    this.hud.setRearView(!!this.player.isLookingBehind);
    this.hud.setPhotocopyStatus(!!this.player.hasPhotocopy);

    // 4. Update Key Progression & Seminar Hall Gathering
    if (this.subMode === 'escape') {
      this.progression.update(deltaTime, this.player.position, () => {
        this.onPhotocopyObtained();
      });

      // 4b. Check Elevator Escape Interaction
      this.checkElevatorEscape();
    }

    // 5. Update 3D Remote Players
    remoteArray.forEach((rp) => {
      rp.update(deltaTime);
    });

    // 6. Proximity Revive Check
    this.updateReviveMechanic(deltaTime);

    // 7. Update Evade Roster HUD (reuses allocated list objects to prevent GC churn)
    if (!this._rosterDataList) this._rosterDataList = [];
    let rIdx = 0;
    if (!this._rosterDataList[rIdx]) this._rosterDataList[rIdx] = {};
    this._rosterDataList[rIdx].isLocal = true;
    this._rosterDataList[rIdx].name = this.network.localPlayerName;
    this._rosterDataList[rIdx].health = this.player.health;
    this._rosterDataList[rIdx].isDowned = this.isLocalDowned;
    this._rosterDataList[rIdx].isEscaped = this.isLocalEscaped;
    rIdx++;

    for (let i = 0; i < remoteArray.length; i++) {
      const rp = remoteArray[i];
      if (!this._rosterDataList[rIdx]) this._rosterDataList[rIdx] = {};
      this._rosterDataList[rIdx].isLocal = false;
      this._rosterDataList[rIdx].name = rp.name;
      this._rosterDataList[rIdx].health = rp.health;
      this._rosterDataList[rIdx].isDowned = rp.isDowned;
      this._rosterDataList[rIdx].isEscaped = rp.isEscaped;
      rIdx++;
    }
    this._rosterDataList.length = rIdx;
    this.hud.updateRoster(this._rosterDataList);

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

    // Knockback slightly away from bot (reusing _egKbVec, no allocations)
    if (botPos) {
      _egKbVec.subVectors(this.player.position, botPos);
      _egKbVec.y = 0;
      const kbLen = Math.hypot(_egKbVec.x, _egKbVec.z) || 1;
      this.player.velocity.x += (_egKbVec.x / kbLen) * 6;
      this.player.velocity.z += (_egKbVec.z / kbLen) * 6;
    }

    if (this.player.health <= 0) {
      const container = document.getElementById('game-container') || document.body;
      if (container) {
        container.classList.remove('screen-shake');
        void container.offsetWidth;
        container.classList.add('screen-shake');
        setTimeout(() => container.classList.remove('screen-shake'), 500);
      }

      // Check if other teammates are alive to revive
      const livingTeammates = Array.from(this.remotePlayers.values()).filter((rp) => !rp.isDowned && !rp.isEscaped);
      if (livingTeammates.length > 0) {
        this.downLocalPlayer();
      } else {
        // Solo or all teammates down -> defeat
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

  updateThreatTracker() {
    if (!this.hud || !this.nextbots || !this.nextbots.bots.length) return;

    let nearestBot = null;
    let minDist = Infinity;

    for (let i = 0; i < this.nextbots.bots.length; i++) {
      const b = this.nextbots.bots[i];
      if (b && b.group) {
        const d = Math.hypot(
          b.group.position.x - this.player.position.x,
          b.group.position.z - this.player.position.z
        );
        if (d < minDist) {
          minDist = d;
          nearestBot = b;
        }
      }
    }

    if (nearestBot && nearestBot.group) {
      const dx = nearestBot.group.position.x - this.player.position.x;
      const dz = nearestBot.group.position.z - this.player.position.z;
      // In Three.js world coordinates: forward (yaw=0) is -Z, right is +X.
      const worldAngle = Math.atan2(dx, -dz);
      // Current camera view yaw (including 180° flip if rear view is active)
      const viewYaw = this.player.yaw + (this.player.isLookingBehind ? Math.PI : 0);
      let rel = worldAngle - viewYaw;
      while (rel > Math.PI) rel -= Math.PI * 2;
      while (rel < -Math.PI) rel += Math.PI * 2;
      const deg = (rel * 180) / Math.PI;

      const threatName = nearestBot.type ? nearestBot.type.name : 'Evil Santhomite';
      this.hud.updateThreatTracker(deg, minDist, threatName);
    }
  }

  onPhotocopyObtained() {
    if (this.player.hasPhotocopy) return;
    this.player.hasPhotocopy = true;

    if (this.audio && this.audio.playPickup) {
      this.audio.playPickup();
    }

    if (this.hud) {
      this.hud.setPhotocopyStatus(true);
      this.hud.setObjective(this.progression.getCurrentObjectiveText());
    }

    // Broadcast across network so remote players sync status
    this.network.sendEvent(MSG_TYPES.PHOTOCOPY_ACQUIRED, {
      id: this.network.localId
    });
  }

  checkElevatorEscape() {
    if (this.isElevatorEscaping || this.isLocalEscaped || !this.player.hasPhotocopy) return;

    if (this.level && this.level.elevator) {
      this.level.elevator.update(this.player);

      if (this.level.elevator.isPlayerNear) {
        const wantsInteract = this.input.checkAndConsumeInteract && this.input.checkAndConsumeInteract();
        if (wantsInteract) {
          this.triggerElevatorEscape();
        }
      }
    }
  }

  triggerElevatorEscape() {
    if (this.isElevatorEscaping || this.isLocalEscaped) return;
    this.isElevatorEscaping = true;

    if (this.hud && this.hud.showNotification) {
      this.hud.showNotification('🛗 ENTERING ELEVATOR... ESCAPING CAMPUS!', 5.0);
    }

    if (this.audio && this.audio.playElevatorSequence) {
      this.audio.playElevatorSequence(() => {
        this.escapeLocalPlayer(false);
      });
    } else {
      setTimeout(() => {
        this.escapeLocalPlayer(false);
      }, 3500);
    }
  }

  escapeLocalPlayer(isSurviveMode = false) {
    if (this.isLocalEscaped) return;
    this.isLocalEscaped = true;

    // Victory!
    this.hud.showEscapedScreen(
      () => this.restartMatch(),
      () => this.stopAndExitToMenu(),
      isSurviveMode
    );

    // Notify peers
    this.network.sendEvent(MSG_TYPES.PLAYER_ESCAPED, {
      id: this.network.localId,
      name: this.network.localPlayerName,
      isSurviveMode
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
      isCrouching: this.player.isCrouching,
      hasPhotocopy: this.player.hasPhotocopy
    });

    // 2. If Host, broadcast bots and progression world state
    if (this.network.isHost) {
      this.network.broadcastWorldState({
        bots: this.nextbots.getNetworkState(),
        step: this.progression.currentStep,
        objective: this.progression.getCurrentObjectiveText(),
        isSeminarUnlocked: this.progression.isSeminarUnlocked,
        subMode: this.subMode,
        surviveTimer: this.surviveTimer
      });
    }
  }

  restartMatch() {
    this.hud.hideEndScreens();
    if (this.network.isHost || this.remotePlayers.size === 0) {
      this.network.startVotingPhase(this.remotePlayers.size === 0);
    }
  }

  stopAndExitToMenu() {
    this.stop();
    this.gameState.hasActiveSession = false;
    this.gameState.setState(STATES.MENU);
  }

  stop() {
    this.isActive = false;
    this.isVotingPhase = false;
    this.isMatchRunning = false;
    this.isElevatorEscaping = false;
    document.body.classList.remove('evade-mode');
    this.hud.hide();
    this.hud.hideVotingModal();
    this.hud.hideSurvivalTimer();
    this.nextbots.reset();
    if (this.progression) {
      this.progression.reset();
    }

    this.player.hasPhotocopy = false;
    if (this.player.photocopyMesh) {
      this.player.photocopyMesh.visible = false;
    }

    // Disconnect peerjs network connection
    if (this.network) {
      this.network.disconnect();
    }

    // Reset lobby modal
    if (this.lobby) {
      this.lobby.reset();
      this.lobby.hide();
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

    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
  }
}
