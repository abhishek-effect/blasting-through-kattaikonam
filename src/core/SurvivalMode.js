/**
 * SurvivalMode Module
 * Wave-based combat mode for Confront where waves of PNG and JPG enemies attack the player.
 * High scores are tracked, names are registered, and results are posted to Supabase leaderboard.
 */
import * as THREE from 'three';
import { ASSET_PATHS, ensureAtLeastOneEnemyType } from '../config/assets.js';
import { isBossEnemy } from '../enemy/EnemySpawner.js';
import { supabaseService } from '../services/SupabaseService.js';

export class SurvivalMode {
  constructor(game) {
    this.game = game;
    this.scene = game.scene;
    this.enemySpawner = game.enemySpawner;
    this.hud = game.hud;
    this.audio = game.audio;
    this.player = game.player;
    this.gameState = game.gameState;

    this.isActive = false;
    this.currentWave = 0;
    this.waveKills = 0;
    this.targetWaveKills = 0;
    this.isIntermission = false;
    this.intermissionTimer = 0;
    this.playerName = '';

    // Spawn points placed in open corridors and campus halls
    this.spawnPoints = [
      new THREE.Vector3(31, 0, 48),  // Central Atrium
      new THREE.Vector3(48, 0, 24),  // North Central Hallway
      new THREE.Vector3(20, 0, 40),  // West Corridor
      new THREE.Vector3(50, 0, 68),  // East Hallway
      new THREE.Vector3(34, 0, 68),  // South Central Hallway
      new THREE.Vector3(20, 0, 65),  // West South Corridor
      new THREE.Vector3(31, 0, 32),  // Central North Hallway
      new THREE.Vector3(40, 0, 85),  // South Hallway Approach
      new THREE.Vector3(75, 0, 88),  // Library Corridor
      new THREE.Vector3(58, 0, 46)   // Seminar Approach
    ];

    this.activeWaveEnemies = [];
  }

  /**
   * Starts a new Survival Mode session
   * @param {string} playerName
   */
  start(playerName = '') {
    this.isActive = true;
    this.isIntermission = false;
    this.intermissionTimer = 0;
    this.currentWave = 0;
    this.waveKills = 0;
    this.playerName = playerName || supabaseService.getStoredPlayerName() || 'Survivor';
    this.activeWaveEnemies = [];

    // Ensure all campus doors are unlocked so player can move freely
    if (this.game.level && this.game.level.doors) {
      this.game.level.doors.forEach((door) => {
        door.isLocked = false;
        door.customLockedPrompt = null;
        door.setOpen(true);
      });
    }

    // Unlock Seminar Hall gate for open campus arena
    if (this.game.level && this.game.level.unlockSeminarGate) {
      this.game.level.unlockSeminarGate();
    }

    // Clear any previous campaign progression or checkpoint data
    if (this.game.shootProgression) {
      this.game.shootProgression.reset();
      // Ensure boss is NOT spawned
      this.game.shootProgression.isBossSpawned = true; // prevent accidental seminar trigger
      this.game.shootProgression.isBossDead = true;
    }

    // Hook spawner kill callback
    if (this.enemySpawner) {
      this.enemySpawner.clear();
      this.enemySpawner.onEnemyKilled = (enemy, totalKills) => {
        this.handleEnemyKilled(enemy, totalKills);
      };
    }

    this.hud.showNotification(`⚔️ SURVIVAL MODE ACTIVATED! CODENAME: ${this.playerName.toUpperCase()}`, 4.0);
    this.startWave(1);
  }

  /**
   * Spawns a new wave of PNG and JPG enemies (STRICTLY NO BOSSES)
   * @param {number} waveNum
   */
  startWave(waveNum) {
    this.currentWave = waveNum;
    this.waveKills = 0;
    this.isIntermission = false;
    this.intermissionTimer = 0;

    // Escalating wave size: Wave 1 = 6, Wave 2 = 9, Wave 3 = 12, etc. Capped at 26
    this.targetWaveKills = Math.min(26, 6 + (waveNum - 1) * 3);

    // Get all valid PNG and JPG enemies, excluding bosses
    ensureAtLeastOneEnemyType();
    const roster = ASSET_PATHS.enemies.types;

    const isPng = (s) => {
      const lower = (s || '').toLowerCase();
      return lower.endsWith('.png') || lower.startsWith('data:image/png');
    };

    const isJpg = (s) => {
      const lower = (s || '').toLowerCase();
      return lower.endsWith('.jpg') || lower.endsWith('.jpeg');
    };

    const allKeys = Object.keys(roster).filter((k) => !isBossEnemy(k, roster[k]) && !k.toLowerCase().includes('photocopy'));
    const pngKeys = allKeys.filter((k) => isPng(roster[k].sprite));
    const jpgKeys = allKeys.filter((k) => isJpg(roster[k].sprite));

    // Fallbacks if either list is empty
    const validPngs = pngKeys.length > 0 ? pngKeys : allKeys;
    const validJpgs = jpgKeys.length > 0 ? jpgKeys : allKeys;

    // Spawn half PNGs and half JPGs
    const halfCount = Math.ceil(this.targetWaveKills / 2);

    for (let i = 0; i < this.targetWaveKills; i++) {
      const usePng = i < halfCount;
      const keyPool = usePng ? validPngs : validJpgs;
      const chosenKey = keyPool[Math.floor(Math.random() * keyPool.length)];
      const typeConfig = roster[chosenKey];

      // Pick spawn point (staggered around campus)
      const sp = this.spawnPoints[i % this.spawnPoints.length];
      const offsetX = (Math.random() - 0.5) * 5.0;
      const offsetZ = (Math.random() - 0.5) * 5.0;
      const spawnX = sp.x + offsetX;
      const spawnZ = sp.z + offsetZ;

      if (this.enemySpawner && this.enemySpawner.spawnSurvivalEnemy) {
        this.enemySpawner.spawnSurvivalEnemy(spawnX, spawnZ, chosenKey);
      } else {
        // Fallback spawn
        this.enemySpawner.spawnJpgEnemy(spawnX, spawnZ);
      }
    }

    // Display banner
    if (this.hud && this.hud.showWaveBanner) {
      this.hud.showWaveBanner(`SURVIVAL: WAVE ${this.currentWave}!`, `DEFEAT ${this.targetWaveKills} ENEMIES (0 / ${this.targetWaveKills})`);
    } else {
      this.hud.showNotification(`⚠️ WAVE ${this.currentWave} BEGUN! ${this.targetWaveKills} ENEMIES INCOMING!`, 4.0);
    }

    if (this.audio && this.audio.playComboSound) {
      this.audio.playComboSound(1);
    }
  }

  handleEnemyKilled(enemy, totalKills) {
    if (!this.isActive) return;

    this.waveKills++;
    const remaining = Math.max(0, this.targetWaveKills - this.waveKills);

    // Update banner
    if (this.hud && this.hud.showWaveBanner) {
      this.hud.showWaveBanner(
        `SURVIVAL: WAVE ${this.currentWave}!`,
        `ELIMINATE ENEMIES (${this.waveKills} / ${this.targetWaveKills})`
      );
    }

    // Check if wave cleared
    if (this.waveKills >= this.targetWaveKills) {
      this.handleWaveCleared();
    }
  }

  handleWaveCleared() {
    this.isIntermission = true;
    this.intermissionTimer = 3.5;

    // Bonus points
    const waveBonus = this.currentWave * 500;
    this.gameState.score = (this.gameState.score || 0) + waveBonus;

    if (this.audio && this.audio.playComboSound) {
      this.audio.playComboSound(2);
    }

    this.hud.showNotification(
      `🎉 WAVE ${this.currentWave} CLEARED! +${waveBonus} BONUS PTS! (SCORE: ${this.gameState.score})`,
      3.5
    );

    // Give player +1 grenade and replenish medkit
    if (this.game.grenadeManager) {
      this.game.grenadeManager.addGrenade(1);
    }
    if (this.game.medkit && this.game.medkit.count < 3) {
      this.game.medkit.count++;
    }
    if (this.game.rifle) {
      this.game.rifle.reserveAmmo = Math.min(180, this.game.rifle.reserveAmmo + 60);
    }

    // Submit intermediate high score
    supabaseService.submitHighScore(this.playerName, this.gameState.score, this.currentWave);
  }

  update(deltaTime) {
    if (!this.isActive) return;

    // Intermission countdown between waves
    if (this.isIntermission) {
      this.intermissionTimer -= deltaTime;
      if (this.intermissionTimer <= 0) {
        this.isIntermission = false;
        this.startWave(this.currentWave + 1);
      }
    }
  }

  /**
   * Called when player dies in Survival Mode
   */
  onPlayerDeath() {
    if (!this.isActive) return;
    this.isActive = false;

    const finalScore = this.gameState.score || 0;
    const waveReached = this.currentWave || 1;

    // Save final high score to Supabase and local storage
    supabaseService.submitHighScore(this.playerName, finalScore, waveReached);

    // Show custom Survival game over alert & leaderboard prompt
    setTimeout(() => {
      this.hud.showSurvivalGameOver(this.playerName, finalScore, waveReached);
    }, 1200);
  }

  stop() {
    this.isActive = false;
    this.isIntermission = false;
    if (this.hud && this.hud.hideWaveBanner) {
      this.hud.hideWaveBanner();
    }
  }
}
