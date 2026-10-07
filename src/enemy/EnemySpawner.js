/**
 * EnemySpawner Module
 * Spawns instance-based enemies across predefined spawn zones in the level.
 * Handles random placement, separation, kill tracking, and dropped grenade pickups every 3 kills.
 */
import * as THREE from 'three';
import { Enemy } from './Enemy.js';
import { ASSET_PATHS, ensureAtLeastOneEnemyType } from '../config/assets.js';

export class EnemySpawner {
  constructor(scene, world, audio, gameState, grenadeManager) {
    this.scene = scene;
    this.world = world;
    this.audio = audio;
    this.gameState = gameState;
    this.grenadeManager = grenadeManager;

    this.enemies = []; // Active Enemy instances
    this.instanceCounter = 0;
    this.totalKills = 0;
  }

  /**
   * Spawns enemies into the level using the level's spawnZones configuration.
   * Enemy types are picked dynamically from all discovered and uploaded photos.
   */
  spawnLevelEnemies(spawnZones = [], isMobile = false) {
    this.clear();
    this.totalKills = 0;

    ensureAtLeastOneEnemyType();
    const roster = ASSET_PATHS.enemies.types;
    let allRosterKeys = Object.keys(roster);

    spawnZones.forEach((zone) => {
      if (!zone.isActive) {
        return;
      }

      // If playing on phone / touch device, reduce enemy count by ~45% for smooth performance & fair touch controls
      const minC = isMobile ? Math.max(1, Math.round(zone.minCount * 0.55)) : zone.minCount;
      const maxC = isMobile ? Math.max(minC, Math.round(zone.maxCount * 0.55)) : zone.maxCount;

      // Randomize count between minCount and maxCount
      const count = Math.floor(
        Math.random() * (maxC - minC + 1)
      ) + minC;

      for (let i = 0; i < count; i++) {
        allRosterKeys = Object.keys(roster);
        if (allRosterKeys.length === 0) {
          ensureAtLeastOneEnemyType();
          allRosterKeys = Object.keys(roster);
        }

        let validTypes = (zone.allowedTypes && !zone.allowedTypes.includes('all'))
          ? zone.allowedTypes.filter((t) => roster[t])
          : allRosterKeys;

        if (validTypes.length === 0) {
          validTypes = allRosterKeys;
        }

        const typeKey = validTypes[Math.floor(Math.random() * validTypes.length)];
        const typeConfig = roster[typeKey] || roster[allRosterKeys[0]];

        this.instanceCounter++;
        const instanceId = `${typeKey}_${String(this.instanceCounter).padStart(3, '0')}`;

        // Create independent enemy instance
        const enemy = new Enemy(this.scene, this.world, this.audio, typeConfig, instanceId);

        // Randomize placement within zone circle
        const angle = Math.random() * Math.PI * 2;
        const dist = Math.sqrt(Math.random()) * zone.radius;
        const spawnX = zone.center.x + Math.cos(angle) * dist;
        const spawnZ = zone.center.z + Math.sin(angle) * dist;

        enemy.spawn(spawnX, spawnZ);

        // Nudge if inside a wall
        this.world.resolveSphereCollision(enemy.position, enemy.radius);
        enemy.sprite.position.copy(enemy.position);
        enemy.hitMesh.position.copy(enemy.position);

        this.enemies.push(enemy);
      }
    });

    this.gameState.totalEnemies = this.enemies.length;
  }

  update(deltaTime, player) {
    // 1. Soft separation between active enemies so they don't overlap
    this.resolveEnemySeparation();

    // 2. Update each enemy instance
    for (let i = 0; i < this.enemies.length; i++) {
      const enemy = this.enemies[i];
      const wasDead = enemy.isDead;

      enemy.update(deltaTime, player.position, (dmg) => {
        player.takeDamage(dmg);
      });

      // Check if enemy just died
      if (!wasDead && enemy.isDead) {
        this.totalKills++;
        this.gameState.recordKill();

        // Drop a grenade pickup every 3 kills!
        if (this.totalKills % 3 === 0 && this.grenadeManager) {
          this.grenadeManager.spawnPickup(enemy.position);
        }
      }
    }
  }

  resolveEnemySeparation() {
    const minDist = 1.1;
    for (let i = 0; i < this.enemies.length; i++) {
      const e1 = this.enemies[i];
      if (e1.isDead) continue;

      for (let j = i + 1; j < this.enemies.length; j++) {
        const e2 = this.enemies[j];
        if (e2.isDead) continue;

        const dx = e2.position.x - e1.position.x;
        const dz = e2.position.z - e1.position.z;
        const dist = Math.hypot(dx, dz);

        if (dist > 0 && dist < minDist) {
          const overlap = (minDist - dist) / 2;
          const nx = dx / dist;
          const nz = dz / dist;

          e1.position.x -= nx * overlap;
          e1.position.z -= nz * overlap;
          e2.position.x += nx * overlap;
          e2.position.z += nz * overlap;
        }
      }
    }
  }

  clear() {
    this.enemies.forEach((e) => e.destroy());
    this.enemies = [];
  }

  getEnemies() {
    return this.enemies;
  }
}
