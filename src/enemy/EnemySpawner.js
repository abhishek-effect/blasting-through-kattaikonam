/**
 * EnemySpawner Module
 * Spawns instance-based enemies across predefined spawn zones in the level.
 * Features:
 * - Proximity-based activation: Enemies DO NOT spawn until the player comes near their zone!
 * - Automatic phone scaling: Balances spawn count on touch devices.
 * - Dynamic enemy photo roster support.
 * - Soft separation so enemies do not bunch up.
 * - Grenade pickups drop every 3 kills.
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
    this.pendingZones = []; // Proximity zones waiting for player arrival
    this.instanceCounter = 0;
    this.totalKills = 0;
    this.isMobile = false;
  }

  /**
   * Sets up spawn zones with proximity triggers.
   * Enemies do NOT spawn immediately; they emerge when the player goes near them!
   */
  spawnLevelEnemies(spawnZones = [], isMobile = false) {
    this.clear();
    this.totalKills = 0;
    this.isMobile = isMobile;

    ensureAtLeastOneEnemyType();

    this.pendingZones = spawnZones.map((zone) => {
      const minC = isMobile ? Math.max(1, Math.round(zone.minCount * 0.55)) : zone.minCount;
      const maxC = isMobile ? Math.max(minC, Math.round(zone.maxCount * 0.55)) : zone.maxCount;
      const count = Math.floor(Math.random() * (maxC - minC + 1)) + minC;

      return {
        ...zone,
        count,
        spawned: false,
        triggerRadius: zone.triggerRadius || 18.0,
      };
    });

    const totalPlanned = this.pendingZones.reduce((sum, z) => sum + (z.isActive ? z.count : 0), 0);
    this.gameState.totalEnemies = totalPlanned;
  }

  /**
   * Spawns enemies for a single zone when player enters trigger radius
   */
  spawnZoneEnemies(zone) {
    ensureAtLeastOneEnemyType();
    const roster = ASSET_PATHS.enemies.types;

    // Shoot Shoot Shoot mode: Exclusively no-background PNGs (exclude all JPGs)
    const isPngSprite = (item) => {
      if (!item || !item.sprite) return false;
      const s = item.sprite.toLowerCase();
      if (s.endsWith('.jpg') || s.endsWith('.jpeg')) return false;
      return s.endsWith('.png') || s.startsWith('data:image/png') || s.startsWith('data:');
    };

    let pngKeys = Object.keys(roster).filter((k) => isPngSprite(roster[k]));
    if (pngKeys.length === 0) {
      pngKeys = Object.keys(roster);
    }

    for (let i = 0; i < zone.count; i++) {
      let validTypes = (zone.allowedTypes && !zone.allowedTypes.includes('all'))
        ? zone.allowedTypes.filter((t) => roster[t] && isPngSprite(roster[t]))
        : pngKeys;

      if (validTypes.length === 0) {
        validTypes = pngKeys;
      }

      const typeKey = validTypes[Math.floor(Math.random() * validTypes.length)];
      const typeConfig = roster[typeKey] || roster[pngKeys[0]];

      this.instanceCounter++;
      const instanceId = `${typeKey}_${String(this.instanceCounter).padStart(3, '0')}`;

      // Create independent enemy instance
      const enemy = new Enemy(this.scene, this.world, this.audio, typeConfig, instanceId);

      // Bind onDeath to instantly record kills and grant grenades
      enemy.onDeath = (deadEnemy) => {
        this.handleEnemyKill(deadEnemy, this.lastPlayerRef);
      };

      // Randomize placement within zone circle
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.sqrt(Math.random()) * zone.radius;
      const spawnX = zone.center.x + Math.cos(angle) * dist;
      const spawnZ = zone.center.z + Math.sin(angle) * dist;

      enemy.spawn(spawnX, spawnZ);

      // Nudge if inside a wall
      if (this.world && this.world.resolveSphereCollision) {
        this.world.resolveSphereCollision(enemy.position, enemy.radius);
      }
      if (enemy.sprite) {
        enemy.sprite.position.copy(enemy.position);
      }
      if (enemy.hitMesh) {
        enemy.hitMesh.position.copy(enemy.position);
      }

      this.enemies.push(enemy);
    }
  }

  handleEnemyKill(enemy, player) {
    if (enemy._deathHandled) return;
    enemy._deathHandled = true;

    this.totalKills++;
    this.gameState.recordKill();

    // Automatically add a grenade to inventory every 3 kills
    if (this.totalKills % 3 === 0 && this.grenadeManager) {
      this.grenadeManager.addGrenade(1);
      const p = player || this.lastPlayerRef;
      if (p && p.onPickupNotification) {
        p.onPickupNotification('+1 GRENADE ACQUIRED! (3 KILLS)');
      }
    }
  }

  update(deltaTime, player) {
    this.lastPlayerRef = player;

    // 1. Proximity Spawning: Only spawn enemies when player approaches their zone!
    if (this.pendingZones && this.pendingZones.length > 0 && player && player.position) {
      for (let i = 0; i < this.pendingZones.length; i++) {
        const zone = this.pendingZones[i];
        if (zone.spawned || !zone.isActive) continue;

        const dist = Math.hypot(player.position.x - zone.center.x, player.position.z - zone.center.z);
        if (dist <= zone.triggerRadius) {
          zone.spawned = true;
          this.spawnZoneEnemies(zone);
        }
      }
    }

    // 2. Soft separation between active enemies so they don't overlap
    this.resolveEnemySeparation();

    // 3. Update each active enemy instance (and garbage-collect fully dead instances)
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const enemy = this.enemies[i];

      enemy.update(deltaTime, player.position, (dmg, sourcePos) => {
        player.takeDamage(dmg, sourcePos);
      });

      // Fallback check if death was triggered during update
      if (enemy.isDead && !enemy._deathHandled) {
        this.handleEnemyKill(enemy, player);
      }

      // Cleanup fully dead enemy after death animation completes (prevents array bloat)
      if (enemy.isDead && enemy.deathTimer > 1.3) {
        enemy.destroy();
        this.enemies.splice(i, 1);
      }
    }
  }

  resolveEnemySeparation() {
    const minDist = 1.1;
    const minDistSq = minDist * minDist;
    for (let i = 0; i < this.enemies.length; i++) {
      const e1 = this.enemies[i];
      if (e1.isDead) continue;
      for (let j = i + 1; j < this.enemies.length; j++) {
        const e2 = this.enemies[j];
        if (e2.isDead) continue;

        const dx = e2.position.x - e1.position.x;
        const dz = e2.position.z - e1.position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq > 0 && distSq < minDistSq) {
          const dist = Math.sqrt(distSq);
          const overlap = (minDist - dist) * 0.5;
          const invDist = 1 / dist;
          const nx = dx * invDist;
          const nz = dz * invDist;

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
    this.pendingZones = [];
  }

  getEnemies() {
    return this.enemies;
  }
}
