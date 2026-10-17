/**
 * ShootProgression Module
 * Implements all gameplay objectives and progression for Shoot Shoot Shoot mode:
 * 1. Locked doors: Computer Lab, Library, and Physics Lab locked at start.
 * 2. Computer Lab unlocked via 4-digit security keypad (5 tries, 30s cooldown, no repeating digits, green/yellow feedback).
 * 3. Physics Lab lock prompt: 'You need a vernier caliper to unlock seminar hall. Key required to enter.'
 * 4. Sijinil spawns every 5 kills with AK-47, drops Pen Drive.
 * 5. Pen Drive used to hold [E] and hack 3 computers in Computer Lab -> opens Library & triggers 'Computer Lab Wave!' (10 kills).
 * 6. Inside Library, hold [E] at bookshelves to obtain Physics Lab Key (holdable like guns).
 * 7. Key unlocks Physics Lab -> triggers 'Physics Lab Wave!' (10 kills).
 * 8. Inside Physics Lab, hold [E] at wardrobe to find Vernier Caliper (holdable like guns).
 * 9. Vernier Caliper unlocks Seminar Hall -> entering triggers Boss Fight (boss.png, bigger, throws grenades every 5s on colored markers, 2.5x XP).
 * 10. Boss drops Photocopy -> enter elevator -> screen black, elevator ride SFX, elevator arrived SFX, blasting.png fade, 'With Love, IIT Chanthavila Computer Entertainment.'
 * 11. Extra health pickups, grenade pickups, and ammo in other rooms.
 */
import * as THREE from 'three';
import { ASSET_PATHS } from '../config/assets.js';
import { SecurityKeypad } from '../interactive/SecurityKeypad.js';
import { RoomPickups } from '../interactive/RoomPickups.js';
import { DropItemManager } from '../interactive/DropItem.js';
import { HoldableItem } from '../weapon/HoldableItem.js';

export class ShootProgression {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.level = game.level;
    this.enemySpawner = game.enemySpawner;
    this.hud = game.hud;
    this.audio = game.audio;
    this.player = game.player;
    this.camera = game.camera;

    // Subsystems
    this.keypad = new SecurityKeypad(this.audio, () => this.onKeypadUnlocked());
    this.roomPickups = new RoomPickups(this.scene, this.audio);
    this.dropItems = new DropItemManager(this.scene, this.audio);

    // Holdable Items
    this.keyItem = new HoldableItem(this.camera, this.scene, this.audio, {
      id: 'key_phylab',
      name: 'PHYSICS KEY',
      spriteUrl: ASSET_PATHS.items.key,
      hint: 'Use on Physics Lab door to unlock'
    });

    this.vernierItem = new HoldableItem(this.camera, this.scene, this.audio, {
      id: 'vernier_caliper',
      name: 'VERNIER CALIPER',
      spriteUrl: ASSET_PATHS.items.vernier,
      hint: 'Use on Seminar Hall gate to unlock'
    });

    // Progression Flags & States
    this.isComputerLabUnlocked = false;
    this.isLibraryUnlocked = false;
    this.isPhysicsLabUnlocked = false;
    this.isSeminarHallUnlocked = false;

    // Sijinil milestones
    this.lastSijinilMilestone = 0;

    // Computers in Computer Lab
    this.computers = [
      { id: 'cs_pc_1', x: 4.5, z: 53.0, isHacked: false },
      { id: 'cs_pc_2', x: 9.5, z: 53.0, isHacked: false },
      { id: 'cs_pc_3', x: 4.5, z: 61.0, isHacked: false },
      { id: 'cs_pc_4', x: 9.5, z: 61.0, isHacked: false }
    ];
    this.hackedComputersCount = 0;

    // Library Bookshelves
    this.bookshelves = [
      { id: 'lib_shelf_door_right', x: 89.0, z: 83.48 },
      { id: 'lib_shelf_west_top', x: 66.48, z: 88.0 },
      { id: 'lib_shelf_west_bot', x: 66.48, z: 96.0 },
      { id: 'lib_shelf_east_top', x: 99.52, z: 88.0 },
      { id: 'lib_shelf_east_bot', x: 99.52, z: 96.0 }
    ];
    this.hasFoundKey = false;

    // Physics Lab Wardrobes
    this.wardrobes = [
      { id: 'phy_wardrobe_top', x: 35.70, z: 3.6 },
      { id: 'phy_wardrobe_bot', x: 35.70, z: 11.2 }
    ];
    this.hasFoundVernier = false;

    // Hold [E] Action Progress
    this.holdAction = null; // { type, target, timer, duration, label }
    this.actionProgressContainer = document.getElementById('action-progress-container');
    this.actionProgressLabel = document.getElementById('action-progress-label');
    this.actionProgressFill = document.getElementById('action-progress-fill');
    this.actionProgressPercent = document.getElementById('action-progress-percent');

    // Waves Management
    this.currentWave = null; // { type: 'computer_lab' | 'physics_lab', kills: 0, target: 10 }
    this.waveBannerEl = document.getElementById('wave-banner');
    this.waveBannerTitleEl = document.getElementById('wave-banner-title');
    this.waveBannerSubEl = document.getElementById('wave-banner-sub');

    // Boss Fight
    this.isBossSpawned = false;
    this.isBossDead = false;
    this.bossEnemy = null;
    this.bossHudEl = document.getElementById('boss-hud');
    this.bossHpFillEl = document.getElementById('boss-hp-fill');
    this.bossHpValEl = document.getElementById('boss-hp-val');

    // Ending Cutscene
    this.isEscaping = false;
    this.endingOverlayEl = document.getElementById('ending-cutscene-overlay');
    this.endingBlastingImg = document.getElementById('ending-blasting-img');
    this.endingCreditsText = document.getElementById('ending-credits-text');
    this.endingActionsEl = document.getElementById('ending-actions');
    this.endingBtnRestart = document.getElementById('ending-btn-restart');
    this.endingBtnMenu = document.getElementById('ending-btn-menu');

    this.initEndingListeners();
    this.bindSpawnerHooks();
  }

  bindSpawnerHooks() {
    if (!this.enemySpawner) return;

    // Drop items from enemies
    this.enemySpawner.onEnemyDropItem = (type, pos) => {
      this.dropItems.spawnDrop(type, pos, (collectedType) => {
        if (collectedType === 'pendrive') {
          this.player.penDriveCount = (this.player.penDriveCount || 0) + 1;
          this.player.hasPenDrive = true;
          this.hud.showNotification(`💾 PEN DRIVE ACQUIRED (x${this.player.penDriveCount})! Hold [E] at Computer Lab PC to hack.`, 4.0);
        } else if (collectedType === 'photocopy') {
          this.player.hasPhotocopy = true;
          this.hud.showNotification('📄 PHOTOCOPY OBTAINED! Escape via the Elevator!');
        }
      });
    };

    // Kill listener for Sijinil milestones and Wave counters
    this.enemySpawner.onEnemyKilled = (enemy, totalKills) => {
      // 1. Sijinil milestone: Spawns every 5 kills (only if player hasn't hacked all 3 computers yet)
      const milestone = Math.floor(totalKills / 5) * 5;
      if (milestone > 0 && milestone > this.lastSijinilMilestone) {
        this.lastSijinilMilestone = milestone;
        if (this.hackedComputersCount < 3) {
          this.spawnSijinilWave();
        }
      }

      // 2. Active wave progression (10 kills each)
      if (this.currentWave) {
        this.currentWave.kills++;
        this.updateWaveBanner();

        if (this.currentWave.kills >= this.currentWave.target) {
          const waveName = this.currentWave.type === 'computer_lab' ? 'Computer Lab Wave' : 'Physics Lab Wave';
          this.hud.showNotification(`🎉 ${waveName.toUpperCase()} CLEARED!`, 4.0);
          this.currentWave = null;
          this.hideWaveBanner();
        } else {
          // Replenish wave enemies if low
          this.replenishWaveEnemies();
        }
      }

      // 3. Boss kill check
      if (enemy.isBoss) {
        this.isBossDead = true;
        if (this.bossHudEl) {
          this.bossHudEl.classList.add('hidden');
        }
        this.hud.showNotification('👑 CHIEF OVERSEER ELIMINATED! Photocopy dropped!', 5.0);
      }
    };
  }

  initEndingListeners() {
    if (this.endingBtnRestart) {
      this.endingBtnRestart.addEventListener('click', () => {
        if (this.endingOverlayEl) this.endingOverlayEl.classList.add('hidden');
        this.game.restart('shoot');
      });
    }
    if (this.endingBtnMenu) {
      this.endingBtnMenu.addEventListener('click', () => {
        if (this.endingOverlayEl) this.endingOverlayEl.classList.add('hidden');
        this.game.gameState.setState('MENU');
      });
    }
  }

  reset() {
    this.isComputerLabUnlocked = false;
    this.isLibraryUnlocked = false;
    this.isPhysicsLabUnlocked = false;
    this.isSeminarHallUnlocked = false;
    this.lastSijinilMilestone = 0;

    this.computers.forEach((c) => (c.isHacked = false));
    this.hackedComputersCount = 0;
    this.hasFoundKey = false;
    this.hasFoundVernier = false;

    this.holdAction = null;
    this.hideActionProgress();

    this.currentWave = null;
    this.hideWaveBanner();

    this.isBossSpawned = false;
    this.isBossDead = false;
    this.bossEnemy = null;
    if (this.bossHudEl) this.bossHudEl.classList.add('hidden');

    this.isEscaping = false;
    if (this.endingOverlayEl) this.endingOverlayEl.classList.add('hidden');

    // Reset holdable items in inventory
    if (this.player) {
      this.player.hasPenDrive = false;
      this.player.penDriveCount = 0;
      this.player.hasPhotocopy = false;
      // Remove slot 4 if present
      if (this.player.slots.length > 3) {
        this.player.slots.splice(3, this.player.slots.length - 3);
      }
      this.player.switchSlot(0);
    }

    if (this.keypad) this.keypad.reset();
    if (this.roomPickups) this.roomPickups.reset();
    if (this.dropItems) this.dropItems.clear();

    // Lock doors
    this.lockDoorsAtStart();
  }

  lockDoorsAtStart() {
    if (!this.level || !this.level.doors) return;

    this.level.doors.forEach((door) => {
      if (door.id === 'door_computer_lab') {
        door.isLocked = true;
        door.customLockedPrompt = {
          title: 'COMPUTER LAB: SECURITY KEYPAD',
          subtitle: 'Press [E] to Access Security Keypad (4-Digit Code)',
          isLocked: true
        };
      } else if (door.id === 'door_library') {
        door.isLocked = true;
        door.customLockedPrompt = {
          title: 'CAMPUS LIBRARY: LOCKED',
          subtitle: 'Hack 3 computers in the Computer Lab to unlock',
          isLocked: true
        };
      } else if (door.id === 'door_phy_lab') {
        door.isLocked = true;
        // User requirement: 'You need a vernier caliper to unlock seminar hall'
        door.customLockedPrompt = {
          title: 'PHYSICS LAB: LOCKED',
          subtitle: 'You need a vernier caliper to unlock seminar hall. (Physics Lab Key required)',
          isLocked: true
        };
      }
    });

    // Seminar hall gate
    if (this.level.seminarGate) {
      this.level.seminarGate.isUnlocked = false;
      if (this.level.seminarGate.mesh) {
        this.level.seminarGate.mesh.visible = true;
      }
      if (!this.level.colliders.includes(this.level.seminarGate.collider)) {
        this.level.colliders.push(this.level.seminarGate.collider);
      }
      this.level.seminarGate.customPrompt = {
        title: 'SEMINAR HALL: LOCKED',
        subtitle: 'You need a vernier caliper to unlock seminar hall',
        isLocked: true
      };
    }
  }

  onKeypadUnlocked() {
    this.isComputerLabUnlocked = true;
    const door = this.level.doors.find((d) => d.id === 'door_computer_lab');
    if (door) {
      door.isLocked = false;
      door.customLockedPrompt = null;
      door.setOpen(true);
    }
    this.hud.showNotification('🔓 COMPUTER LAB UNLOCKED!', 4.0);
  }

  spawnSijinilWave() {
    if (this.hackedComputersCount >= 3) return;
    this.hud.showNotification('⚠️ SIJINIL HAS SPAWNED ON CAMPUS! (5 KILLS)', 4.0);
    // Spawn Sijinil in central corridor near black tiles
    const spawnX = 31.0 + (Math.random() - 0.5) * 6;
    const spawnZ = 50.0 + (Math.random() - 0.5) * 8;
    this.enemySpawner.spawnSijinil(spawnX, spawnZ);
  }

  startComputerLabWave(shouldSave = true) {
    this.currentWave = {
      type: 'computer_lab',
      kills: 0,
      target: 10
    };
    this.showWaveBanner('COMPUTER LAB WAVE!', 'DEFEAT 10 ENEMIES (0 / 10)');
    this.hud.showNotification('💥 COMPUTER LAB WAVE INCOMING! Defeat 10 enemies!', 4.5);

    if (shouldSave) {
      this.saveCheckpoint('computer_lab_wave', 'Computer Lab Wave', { x: 8.0, y: 1.65, z: 57.0 });
    }

    // Spawn 5 JPG enemies outside Computer Lab in hallway (X: 20..35, Z: 50..65)
    for (let i = 0; i < 5; i++) {
      const sx = 24.0 + (Math.random() - 0.5) * 8.0;
      const sz = 57.0 + (Math.random() - 0.5) * 10.0;
      this.enemySpawner.spawnJpgEnemy(sx, sz);
    }
  }

  startPhysicsLabWave(shouldSave = true) {
    this.currentWave = {
      type: 'physics_lab',
      kills: 0,
      target: 10
    };
    this.showWaveBanner('PHYSICS LAB WAVE!', 'DEFEAT 10 ENEMIES (0 / 10)');
    this.hud.showNotification('💥 PHYSICS LAB WAVE INCOMING! Defeat 10 enemies!', 4.5);

    if (shouldSave) {
      this.saveCheckpoint('physics_lab_wave', 'Physics Lab Wave', { x: 31.0, y: 1.65, z: 18.0 });
    }

    // Spawn 5 JPG enemies near Physics Lab North corridor (X: 40..60, Z: 18..26)
    for (let i = 0; i < 5; i++) {
      const sx = 48.0 + (Math.random() - 0.5) * 12.0;
      const sz = 22.0 + (Math.random() - 0.5) * 6.0;
      this.enemySpawner.spawnJpgEnemy(sx, sz);
    }
  }

  replenishWaveEnemies() {
    if (!this.currentWave) return;
    const living = this.enemySpawner.getEnemies().filter((e) => !e.isDead).length;
    if (living < 3 && this.currentWave.kills < this.currentWave.target) {
      const countToSpawn = Math.min(3, this.currentWave.target - this.currentWave.kills);
      const isComp = this.currentWave.type === 'computer_lab';
      for (let i = 0; i < countToSpawn; i++) {
        const sx = isComp ? 26.0 + (Math.random() - 0.5) * 6 : 48.0 + (Math.random() - 0.5) * 10;
        const sz = isComp ? 57.0 + (Math.random() - 0.5) * 8 : 22.0 + (Math.random() - 0.5) * 6;
        this.enemySpawner.spawnJpgEnemy(sx, sz);
      }
    }
  }

  showWaveBanner(title, sub) {
    if (this.waveBannerEl) {
      this.waveBannerEl.classList.remove('hidden');
    }
    if (this.waveBannerTitleEl) this.waveBannerTitleEl.textContent = title;
    if (this.waveBannerSubEl) this.waveBannerSubEl.textContent = sub;
  }

  updateWaveBanner() {
    if (!this.currentWave || !this.waveBannerSubEl) return;
    this.waveBannerSubEl.textContent = `DEFEAT 10 ENEMIES (${this.currentWave.kills} / ${this.currentWave.target})`;
  }

  hideWaveBanner() {
    if (this.waveBannerEl) {
      this.waveBannerEl.classList.add('hidden');
    }
  }

  equipHoldableItem(item) {
    // Add to player's 4th slot
    this.player.slots[3] = item;
    // Show 4th slot in HUD
    const slot4 = document.getElementById('hud-slot-4');
    const slot4Icon = document.getElementById('slot-4-icon');
    const slot4Name = document.getElementById('slot-4-name');
    const slot4Ammo = document.getElementById('slot-4-ammo');

    if (slot4) slot4.classList.remove('hidden');
    if (slot4Icon) slot4Icon.src = item.iconUrl;
    if (slot4Name) slot4Name.textContent = item.name;
    if (slot4Ammo) slot4Ammo.textContent = 'READY';

    // Switch player to hold this item
    this.player.switchSlot(3);
  }

  removeHoldableItem() {
    if (this.player.slots.length > 3) {
      const item = this.player.slots[3];
      if (item && item.setVisible) item.setVisible(false);
      this.player.slots.splice(3, 1);
    }
    const slot4 = document.getElementById('hud-slot-4');
    if (slot4) slot4.classList.add('hidden');
    this.player.switchSlot(0); // Return to primary weapon (rifle)
  }

  startHoldAction(type, target, label, duration = 2.0) {
    this.holdAction = {
      type,
      target,
      label,
      timer: 0,
      duration
    };
    this.showActionProgress(label, 0);
  }

  cancelHoldAction() {
    this.holdAction = null;
    this.hideActionProgress();
  }

  showActionProgress(label, percent) {
    if (this.actionProgressContainer) {
      this.actionProgressContainer.classList.remove('hidden');
    }
    if (this.actionProgressLabel) this.actionProgressLabel.textContent = label;
    if (this.actionProgressFill) this.actionProgressFill.style.width = `${percent}%`;
    if (this.actionProgressPercent) this.actionProgressPercent.textContent = `${Math.round(percent)}%`;
  }

  hideActionProgress() {
    if (this.actionProgressContainer) {
      this.actionProgressContainer.classList.add('hidden');
    }
  }

  update(deltaTime, player, input) {
    if (!player || player.isDead) return;

    // 1. Update sub-managers
    if (this.roomPickups) {
      this.roomPickups.update(deltaTime, player, this.game.grenadeManager, this.game.rifle, this.game.pistol);
    }
    if (this.dropItems) {
      this.dropItems.update(deltaTime, player);
    }

    // Update active holdable item viewmodel if equipped
    if (player.slots[3]) {
      player.slots[3].update(deltaTime, player);
    }

    // 2. Boss Health Bar update
    if (this.isBossSpawned && !this.isBossDead && this.bossEnemy) {
      const hpPct = Math.max(0, Math.min(100, Math.round((this.bossEnemy.health / this.bossEnemy.maxHealth) * 100)));
      if (this.bossHpFillEl) this.bossHpFillEl.style.width = `${hpPct}%`;
      if (this.bossHpValEl) this.bossHpValEl.textContent = `${hpPct}%`;
    }

    // 3. Boss Encounter Trigger: Step inside Seminar Hall (X > 58, Z: 27..66)
    if (this.isSeminarHallUnlocked && !this.isBossSpawned) {
      if (player.position.x > 58 && player.position.z >= 27 && player.position.z <= 66) {
        this.triggerBossFight();
      }
    }

    // 4. Update Hold [E] Action Progress
    if (this.holdAction) {
      const isHoldingE = input && (input.keys ? input.keys['KeyE'] : false);
      if (!isHoldingE) {
        this.cancelHoldAction();
      } else {
        this.holdAction.timer += deltaTime;
        const pct = Math.min(100, (this.holdAction.timer / this.holdAction.duration) * 100);
        this.showActionProgress(this.holdAction.label, pct);

        if (this.holdAction.timer >= this.holdAction.duration) {
          this.completeHoldAction(this.holdAction);
          this.cancelHoldAction();
        }
      }
    }

    // 5. Interaction Check with Shoot Mode Targets
    this.checkInteractions(player, input);
  }

  completeHoldAction(action) {
    if (action.type === 'hack_pc') {
      const pc = action.target;
      pc.isHacked = true;
      this.hackedComputersCount++;

      // Consume 1 pen drive per computer
      if (this.player) {
        this.player.penDriveCount = Math.max(0, (this.player.penDriveCount || 1) - 1);
        this.player.hasPenDrive = this.player.penDriveCount > 0;
      }

      if (this.audio && this.audio.playComboSound) {
        this.audio.playComboSound(2);
      }
      const drivesLeft = this.player ? (this.player.penDriveCount || 0) : 0;
      this.hud.showNotification(`💻 COMPUTER HACKED! (${this.hackedComputersCount}/3) | Pen Drives: ${drivesLeft}`, 3.5);

      if (this.hackedComputersCount === 3 && !this.isLibraryUnlocked) {
        this.isLibraryUnlocked = true;
        const libDoor = this.level.doors.find((d) => d.id === 'door_library');
        if (libDoor) {
          libDoor.isLocked = false;
          libDoor.customLockedPrompt = null;
          libDoor.setOpen(true);
        }
        this.hud.showNotification('🔓 3 COMPUTERS HACKED! CAMPUS LIBRARY OPENED!', 4.5);
        this.startComputerLabWave(true);
      }
    } else if (action.type === 'search_shelf') {
      this.hasFoundKey = true;
      if (this.audio && this.audio.playPickup) {
        this.audio.playPickup();
      }
      this.hud.showNotification('🔑 FOUND PHYSICS LAB KEY! Press 4 to hold key.', 5.0);
      this.equipHoldableItem(this.keyItem);
    } else if (action.type === 'search_wardrobe') {
      this.hasFoundVernier = true;
      if (this.audio && this.audio.playPickup) {
        this.audio.playPickup();
      }
      this.hud.showNotification('📏 FOUND VERNIER CALIPER! Press 4 to hold Vernier Caliper.', 5.0);
      this.equipHoldableItem(this.vernierItem);
    }
  }

  checkInteractions(player, input) {
    let promptFound = false;

    // A. Check Computer Lab Door Keypad
    const compDoor = this.level.doors.find((d) => d.id === 'door_computer_lab');
    if (compDoor && !this.isComputerLabUnlocked) {
      const dist = Math.hypot(player.position.x - compDoor.x, player.position.z - compDoor.z);
      if (dist <= 3.2) {
        promptFound = true;
        this.hud.updateInteractionPrompt({
          title: 'COMPUTER LAB: SECURITY KEYPAD',
          subtitle: 'Press [E] to Access Security Keypad',
          isLocked: true
        });

        if (input && input.checkAndConsumeInteract()) {
          this.keypad.open();
        }
        return;
      }
    }

    // B. Check Computer Lab Workstations (Hacking with Pen Drive)
    if (this.isComputerLabUnlocked && this.hackedComputersCount < 3) {
      for (let i = 0; i < this.computers.length; i++) {
        const pc = this.computers[i];
        if (pc.isHacked) continue;

        const dist = Math.hypot(player.position.x - pc.x, player.position.z - pc.z);
        if (dist <= 2.2) {
          promptFound = true;
          const driveCount = (player && player.penDriveCount) || 0;
          if (driveCount <= 0) {
            this.hud.updateInteractionPrompt({
              title: 'WORKSTATION TERMINAL',
              subtitle: 'Pen drive required to hack computer (Defeat Sijinil)',
              isLocked: true
            });
          } else {
            this.hud.updateInteractionPrompt({
              title: 'WORKSTATION TERMINAL',
              subtitle: `Hold [E] to Hack Computer (${driveCount} Pen Drive${driveCount > 1 ? 's' : ''})`,
              isLocked: false
            });

            const isHoldingE = input && (input.keys ? input.keys['KeyE'] : false);
            if (isHoldingE && !this.holdAction) {
              this.startHoldAction('hack_pc', pc, 'HACKING COMPUTER TERMINAL...', 2.0);
            }
          }
          return;
        }
      }
    }

    // C. Check Library Bookshelves (Searching for Key)
    if (this.isLibraryUnlocked && !this.hasFoundKey) {
      for (let i = 0; i < this.bookshelves.length; i++) {
        const bs = this.bookshelves[i];
        const dist = Math.hypot(player.position.x - bs.x, player.position.z - bs.z);
        if (dist <= 2.2) {
          promptFound = true;
          this.hud.updateInteractionPrompt({
            title: 'CAMPUS BOOKSHELF',
            subtitle: 'Hold [E] to Search Bookshelf for Key',
            isLocked: false
          });

          const isHoldingE = input && (input.keys ? input.keys['KeyE'] : false);
          if (isHoldingE && !this.holdAction) {
            this.startHoldAction('search_shelf', bs, 'SEARCHING BOOKSHELF...', 2.0);
          }
          return;
        }
      }
    }

    // D. Check Physics Lab Door Unlocking with Key
    const phyDoor = this.level.doors.find((d) => d.id === 'door_phy_lab');
    if (phyDoor && !this.isPhysicsLabUnlocked) {
      const dist = Math.hypot(player.position.x - phyDoor.x, player.position.z - phyDoor.z);
      if (dist <= 3.2) {
        promptFound = true;
        if (!this.hasFoundKey) {
          // Required user text: 'You need a vernier caliper to unlock seminar hall'
          this.hud.updateInteractionPrompt({
            title: 'PHYSICS LAB: LOCKED',
            subtitle: 'You need a vernier caliper to unlock seminar hall. Key required to enter.',
            isLocked: true
          });
        } else {
          this.hud.updateInteractionPrompt({
            title: 'PHYSICS LAB DOOR',
            subtitle: 'Press [E] to UNLOCK PHYSICS LAB (USE KEY)',
            isLocked: false
          });

          if (input && input.checkAndConsumeInteract()) {
            this.isPhysicsLabUnlocked = true;
            phyDoor.isLocked = false;
            phyDoor.customLockedPrompt = null;
            phyDoor.setOpen(true);
            this.removeHoldableItem(); // Consumes key
            this.hud.showNotification('🔓 PHYSICS LAB UNLOCKED!', 4.0);
            this.startPhysicsLabWave();
          }
        }
        return;
      }
    }

    // E. Check Physics Lab Wardrobes (Searching for Vernier Caliper)
    if (this.isPhysicsLabUnlocked && !this.hasFoundVernier) {
      for (let i = 0; i < this.wardrobes.length; i++) {
        const wd = this.wardrobes[i];
        const dist = Math.hypot(player.position.x - wd.x, player.position.z - wd.z);
        if (dist <= 2.2) {
          promptFound = true;
          this.hud.updateInteractionPrompt({
            title: 'LABORATORY WARDROBE',
            subtitle: 'Hold [E] to Search Wardrobe for Vernier Caliper',
            isLocked: false
          });

          const isHoldingE = input && (input.keys ? input.keys['KeyE'] : false);
          if (isHoldingE && !this.holdAction) {
            this.startHoldAction('search_wardrobe', wd, 'SEARCHING WARDROBE...', 2.0);
          }
          return;
        }
      }
    }

    // F. Check Seminar Hall Gate (Unlocking with Vernier Caliper)
    if (this.level.seminarGate && !this.isSeminarHallUnlocked) {
      const gate = this.level.seminarGate;
      const dist = Math.hypot(player.position.x - gate.x, player.position.z - gate.z);
      if (dist <= 3.8) {
        promptFound = true;
        if (!this.hasFoundVernier) {
          this.hud.updateInteractionPrompt({
            title: 'SEMINAR HALL: LOCKED',
            subtitle: 'You need a vernier caliper to unlock seminar hall',
            isLocked: true
          });
        } else {
          this.hud.updateInteractionPrompt({
            title: 'SEMINAR HALL GATE',
            subtitle: 'Press [E] to UNLOCK SEMINAR HALL (VERNIER CALIPER)',
            isLocked: false
          });

          if (input && input.checkAndConsumeInteract()) {
            this.isSeminarHallUnlocked = true;
            this.level.unlockSeminarGate();
            this.removeHoldableItem(); // Consumes Vernier Caliper
            this.saveCheckpoint('seminar_hall_unlocked', 'Seminar Hall Unlocked', { x: 54.0, y: 1.65, z: 46.5 });
            this.hud.showNotification('🏛️ SEMINAR HALL UNLOCKED! ENTER AUDITORIUM!', 4.5);
          }
        }
        return;
      }
    }

    // G. Check Elevator Escape Interaction
    if (this.level.elevator) {
      const elev = this.level.elevator;
      const dist = player.position.distanceTo(elev.frontPosition);
      if (dist <= elev.interactionRadius) {
        promptFound = true;
        if (!player.hasPhotocopy) {
          this.hud.updateInteractionPrompt({
            title: 'WHERE IS YOUR PHOTOCOPY?',
            subtitle: 'Defeat the Boss to obtain photocopy and enter elevator.',
            isLocked: true
          });
        } else {
          this.hud.updateInteractionPrompt({
            title: '[E] ESCAPE VIA ELEVATOR',
            subtitle: 'Photocopy authenticated. Press E to escape campus!',
            isLocked: false
          });

          if (input && input.checkAndConsumeInteract()) {
            this.triggerElevatorEscapeCutscene();
          }
        }
        return;
      }
    }

    // H. Other Campus Doors
    if (!promptFound && this.level && this.level.doors && this.level.doors.length > 0) {
      let nearestDoor = null;
      let minDoorDist = Infinity;

      for (let i = 0; i < this.level.doors.length; i++) {
        const door = this.level.doors[i];
        if (door.id === 'door_computer_lab' && !this.isComputerLabUnlocked) continue;
        if (door.id === 'door_phy_lab' && !this.isPhysicsLabUnlocked) continue;
        const dist = Math.hypot(player.position.x - door.x, player.position.z - door.z);
        if (dist <= door.interactionRadius && dist < minDoorDist) {
          minDoorDist = dist;
          nearestDoor = door;
        }
      }

      if (nearestDoor) {
        promptFound = true;
        const kills = this.enemySpawner ? this.enemySpawner.totalKills : 0;
        this.hud.updateInteractionPrompt(nearestDoor.getPromptInfo(kills));

        if (input && input.checkAndConsumeInteract()) {
          nearestDoor.toggle();
          this.hud.updateInteractionPrompt(nearestDoor.getPromptInfo(kills));
        }
        return;
      }
    }

    if (!promptFound) {
      this.hud.updateInteractionPrompt(null);
    }
  }

  triggerBossFight() {
    this.isBossSpawned = true;
    this.hud.showNotification('⚠️ WARNING: CAMPUS OVERSEER APPROACHES!', 5.0);

    // Show Boss HUD
    if (this.bossHudEl) {
      this.bossHudEl.classList.remove('hidden');
    }

    // Spawn Boss on the Seminar Hall stage (X: 82.0, Z: 46.5)
    this.bossEnemy = this.enemySpawner.spawnBoss(82.0, 46.5);
  }

  triggerElevatorEscapeCutscene() {
    if (this.isEscaping) return;
    this.isEscaping = true;

    // 1. Stop BGM and disable pointer lock
    if (this.audio) this.audio.stopBGM();
    if (document.exitPointerLock) document.exitPointerLock();

    // 2. Black Screen Overlay
    if (this.endingOverlayEl) {
      this.endingOverlayEl.classList.remove('hidden');
      this.endingOverlayEl.style.opacity = '1';
    }
    if (this.endingBlastingImg) this.endingBlastingImg.classList.remove('visible');
    if (this.endingCreditsText) this.endingCreditsText.classList.add('hidden');
    if (this.endingActionsEl) this.endingActionsEl.classList.add('hidden');

    // 3. Play sequential elevator ride audio then elevator arrived audio
    if (this.audio && this.audio.playElevatorSequence) {
      this.audio.playElevatorSequence(() => {
        this.showEndingPresentation();
      });
    } else {
      setTimeout(() => this.showEndingPresentation(), 4500);
    }
  }

  showEndingPresentation() {
    // 4. Show blasting.png centered on screen
    if (this.endingBlastingImg) {
      this.endingBlastingImg.classList.add('visible');
    }

    // 5. Fade out blasting.png after 2.8s and display "With Love, IIT Chanthavila Computer Entertainment."
    setTimeout(() => {
      if (this.endingBlastingImg) {
        this.endingBlastingImg.classList.remove('visible');
      }

      setTimeout(() => {
        if (this.endingCreditsText) {
          this.endingCreditsText.classList.remove('hidden');
          this.endingCreditsText.classList.add('visible');
        }
        if (this.endingActionsEl) {
          this.endingActionsEl.classList.remove('hidden');
        }
      }, 1000);
    }, 2800);
  }

  saveCheckpoint(checkpointId, checkpointName, spawnOverride = null) {
    const pos = spawnOverride || {
      x: this.player ? this.player.position.x : 0,
      y: this.player ? this.player.position.y : 1.65,
      z: this.player ? this.player.position.z : 0
    };

    const cp = {
      checkpointId,
      checkpointName,
      timestamp: Date.now(),
      player: {
        position: { x: pos.x, y: pos.y, z: pos.z },
        yaw: this.player ? this.player.yaw : 0,
        health: 100,
        grenades: this.game.grenadeManager ? Math.max(2, this.game.grenadeManager.grenades) : 2,
        rifleAmmoInMag: this.game.rifle ? this.game.rifle.magSize : 30,
        rifleReserveAmmo: this.game.rifle ? Math.max(60, this.game.rifle.reserveAmmo) : 90,
        pistolAmmoInMag: this.game.pistol ? this.game.pistol.magSize : 12,
        pistolReserveAmmo: this.game.pistol ? Math.max(24, this.game.pistol.reserveAmmo) : 36,
        medkitCount: this.game.medkit ? Math.max(2, this.game.medkit.count) : 2,
        penDriveCount: (this.player && this.player.penDriveCount) || 0
      },
      progression: {
        isComputerLabUnlocked: this.isComputerLabUnlocked,
        isLibraryUnlocked: this.isLibraryUnlocked,
        isPhysicsLabUnlocked: this.isPhysicsLabUnlocked,
        isSeminarHallUnlocked: this.isSeminarHallUnlocked,
        hackedComputersCount: this.hackedComputersCount,
        computers: this.computers.map((c) => ({ id: c.id, x: c.x, z: c.z, isHacked: c.isHacked })),
        hasFoundKey: this.hasFoundKey,
        hasFoundVernier: this.hasFoundVernier,
        lastSijinilMilestone: this.lastSijinilMilestone
      }
    };

    try {
      localStorage.setItem('kattaikonam_checkpoint', JSON.stringify(cp));
      this.hud.showNotification(`💾 CHECKPOINT REACHED: ${checkpointName.toUpperCase()}!`, 4.5);
      if (this.audio && this.audio.playComboSound) {
        this.audio.playComboSound(1);
      }
    } catch (err) {
      console.warn('[ShootProgression] Failed to save checkpoint to localStorage:', err);
    }
  }

  loadCheckpointState(cp) {
    if (!cp || !cp.progression) return;
    const p = cp.progression;

    this.isComputerLabUnlocked = !!p.isComputerLabUnlocked;
    this.isLibraryUnlocked = !!p.isLibraryUnlocked;
    this.isPhysicsLabUnlocked = !!p.isPhysicsLabUnlocked;
    this.isSeminarHallUnlocked = !!p.isSeminarHallUnlocked;
    this.hackedComputersCount = p.hackedComputersCount || 0;
    this.hasFoundKey = !!p.hasFoundKey;
    this.hasFoundVernier = !!p.hasFoundVernier;
    this.lastSijinilMilestone = p.lastSijinilMilestone || 0;

    if (p.computers && Array.isArray(p.computers)) {
      p.computers.forEach((saved) => {
        const found = this.computers.find((c) => c.id === saved.id);
        if (found) found.isHacked = !!saved.isHacked;
      });
    }

    // Apply door unlock states
    if (this.level && this.level.doors) {
      if (this.isComputerLabUnlocked) {
        const d = this.level.doors.find((door) => door.id === 'door_computer_lab');
        if (d) { d.isLocked = false; d.customLockedPrompt = null; d.setOpen(true); }
        if (this.keypad) this.keypad.isUnlocked = true;
      }
      if (this.isLibraryUnlocked) {
        const d = this.level.doors.find((door) => door.id === 'door_library');
        if (d) { d.isLocked = false; d.customLockedPrompt = null; d.setOpen(true); }
      }
      if (this.isPhysicsLabUnlocked) {
        const d = this.level.doors.find((door) => door.id === 'door_nw_lock');
        if (d) { d.isLocked = false; d.customLockedPrompt = null; d.setOpen(true); }
      }
    }

    if (this.isSeminarHallUnlocked) {
      if (this.level && this.level.unlockSeminarGate) {
        this.level.unlockSeminarGate();
      }
    }

    // Restore player inventory status
    if (this.player && cp.player) {
      this.player.penDriveCount = cp.player.penDriveCount || 0;
      this.player.hasPenDrive = this.player.penDriveCount > 0;
    }

    // Launch appropriate wave or boss encounter
    if (cp.checkpointId === 'computer_lab_wave') {
      this.startComputerLabWave(false);
    } else if (cp.checkpointId === 'physics_lab_wave') {
      this.startPhysicsLabWave(false);
    } else if (cp.checkpointId === 'seminar_hall_unlocked') {
      this.hud.showNotification('🏛️ SEMINAR HALL UNLOCKED! ENTER AUDITORIUM FOR THE FINAL BOSS!', 5.0);
    }
  }
}
