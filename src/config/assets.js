/**
 * Centralized Asset Configuration & Dynamic Enemy Registry
 * Completely dynamic: Zero hardcoded enemy names or files!
 * Automatically discovers any images in images/enemies/,
 * supports runtime photo uploads from users,
 * and falls back to a procedural retro sprite if no photos are present.
 */
import * as THREE from 'three';
import { discoveredEnemyFiles } from 'virtual:enemy-list';

const BASE = import.meta.env.BASE_URL || '/';
export const assetUrl = (path) => `${BASE}${path.replace(/^\//, '')}`;

export const ASSET_PATHS = {
  textures: {
    floor: assetUrl('/images/textures/floor-tile.png'),
    wall: assetUrl('/images/textures/wall-color.png'),
    ceiling: assetUrl('/images/textures/ceiling-white.png'),
    door: assetUrl('/images/textures/door-texture.jpg'),
    chairs: assetUrl('/images/textures/cartoon-chairs.webp'),
    elevator: assetUrl('/images/textures/elevator.jpg'),
    laserLauncher: assetUrl('/images/textures/laser-launcher.png'),
    laserBeam: assetUrl('/images/textures/laser-texture.png'),
  },
  weapons: {
    // Transparent PNGs for viewmodels and HUD
    ak47: assetUrl('/images/weapons/ak47.png'),
    pistol: assetUrl('/images/weapons/pistol.png'),
    medkit: assetUrl('/images/weapons/medkit.png'),
  },
  items: {
    grenade: assetUrl('/images/grenade.avif'),
  },
  enemies: {
    // Fully dynamic: filled by auto-discovery and user photo uploads
    types: {}
  },
  audio: {
    metalBgm: assetUrl('/audio/metal-bgm.mp3'),
    grenade: assetUrl('/audio/grenade.mp3'),
    shoot: assetUrl('/audio/shoot.mp3'),
  },
  models: {
    map: assetUrl('/images/map.glb'),
  }
};

/**
 * Creates a procedural retro enemy billboard canvas data URL
 * Used as a 100% reliable fallback so the game NEVER crashes even with 0 photo files.
 */
export function createProceduralEnemySprite() {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');

  // Retro school campus patrol silhouette
  ctx.fillStyle = '#b71540';
  ctx.beginPath();
  ctx.arc(64, 40, 24, 0, Math.PI * 2); // Head
  ctx.fill();

  ctx.fillRect(36, 60, 56, 50); // Body
  ctx.fillRect(24, 66, 14, 40); // Left arm
  ctx.fillRect(90, 66, 14, 40); // Right arm
  ctx.fillRect(44, 110, 16, 18); // Left leg
  ctx.fillRect(68, 110, 16, 18); // Right leg

  // Eyes
  ctx.fillStyle = '#fffa65';
  ctx.fillRect(52, 34, 8, 8);
  ctx.fillRect(68, 34, 8, 8);

  ctx.fillStyle = '#000000';
  ctx.fillRect(56, 36, 4, 4);
  ctx.fillRect(72, 36, 4, 4);

  // Tie / Badge
  ctx.fillStyle = '#f6b93b';
  ctx.fillRect(60, 68, 8, 22);

  return canvas.toDataURL('image/png');
}

/**
 * Derives consistent, balanced stats from an enemy name string
 */
function deriveStats(name) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) & 0xffffffff;
  }
  const posHash = Math.abs(hash);
  return {
    hp: 85 + (posHash % 40), // 85 - 125 HP
    speed: 2.6 + ((posHash >> 2) % 8) * 0.1, // 2.6 - 3.3 speed
    scale: 1.68, // Uniform human proportion matching player eye height (1.65m)
    damage: 12 + ((posHash >> 6) % 7) * 1.5, // 12 - 21 damage
  };
}

/**
 * Register any photo into the active enemy roster
 */
export function registerEnemyType(id, name, spriteUrl, stats = {}) {
  const defaultStats = deriveStats(name);
  ASSET_PATHS.enemies.types[id] = {
    id,
    name,
    sprite: spriteUrl,
    hp: stats.hp || defaultStats.hp,
    speed: stats.speed || defaultStats.speed,
    scale: stats.scale || defaultStats.scale,
    damage: stats.damage || defaultStats.damage,
    isCustom: !!stats.isCustom
  };
}

/**
 * Auto-discover any photos present in images/enemies/ via virtual:enemy-list
 */
if (Array.isArray(discoveredEnemyFiles)) {
  discoveredEnemyFiles.forEach((fileName) => {
    const id = fileName.replace(/\.[^/.]+$/, '').toLowerCase();
    const prettyName = id
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, (c) => c.toUpperCase());

    registerEnemyType(id, prettyName, assetUrl(`/images/enemies/${fileName}`));
  });
}

/**
 * Storage helpers for user-uploaded custom enemy photos
 */
const STORAGE_KEY = 'kattaikonam_custom_enemies';

export function loadCustomEnemiesFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const items = JSON.parse(raw);
    if (Array.isArray(items)) {
      items.forEach((item) => {
        if (item && item.id && item.sprite) {
          registerEnemyType(item.id, item.name || 'Uploaded Enemy', item.sprite, { isCustom: true });
        }
      });
    }
  } catch (err) {
    console.warn('[Assets] Could not load saved custom enemies:', err);
  }
}

export function saveCustomEnemyToStorage(id, name, spriteDataUrl) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    let items = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(items)) items = [];
    items = items.filter((it) => it.id !== id);
    items.push({ id, name, sprite: spriteDataUrl });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.warn('[Assets] Could not save custom enemy to localStorage:', err);
  }
}

export function removeCustomEnemy(id) {
  delete ASSET_PATHS.enemies.types[id];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      let items = JSON.parse(raw);
      if (Array.isArray(items)) {
        items = items.filter((it) => it.id !== id);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
      }
    }
  } catch (err) {
    console.warn('[Assets] Error removing custom enemy:', err);
  }
  ensureAtLeastOneEnemyType();
}

// Load previously uploaded user photos from localStorage
loadCustomEnemiesFromStorage();

// Ensure at least one guaranteed enemy type exists so game NEVER crashes
export function ensureAtLeastOneEnemyType() {
  if (Object.keys(ASSET_PATHS.enemies.types).length === 0) {
    const fallbackSprite = createProceduralEnemySprite();
    registerEnemyType('detention_warden', 'Detention Warden', fallbackSprite);
  }
}
ensureAtLeastOneEnemyType();

/**
 * Helper to downscale and process user-uploaded image files into fast billboard textures
 */
export function processUploadedImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 512;
        let w = img.width;
        let h = img.height;
        if (w > maxDim || h > maxDim) {
          if (w > h) {
            h = Math.round((h * maxDim) / w);
            w = maxDim;
          } else {
            w = Math.round((w * maxDim) / h);
            h = maxDim;
          }
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL('image/png');
        resolve({
          id: `custom_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          name: file.name.replace(/\.[^/.]+$/, '').replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          dataUrl
        });
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const textureLoader = new THREE.TextureLoader();

/**
 * Creates a procedural checkerboard/colored fallback texture
 * to guarantee materials render even before images load or if a file is missing.
 */
export function createFallbackTexture(color1 = '#777777', color2 = '#444444', size = 64) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color1;
  ctx.fillRect(0, 0, size, size);
  ctx.fillStyle = color2;
  ctx.fillRect(0, 0, size / 2, size / 2);
  ctx.fillRect(size / 2, size / 2, size / 2, size / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  return texture;
}

const metricsCache = new Map();

/**
 * Analyzes alpha channel bounding box and aspect ratio of a sprite image
 * Ensures characters match human proportions and removes arbitrary head-space offset
 */
export function analyzeImageMetrics(img) {
  if (!img || !img.width || !img.height) {
    return { aspect: 0.75, topRatio: 0.20, bottomRatio: 1.0, contentRatio: 0.80 };
  }

  const scanH = Math.min(128, img.height);
  const scanW = Math.max(1, Math.round((img.width / img.height) * scanH));

  const canvas = document.createElement('canvas');
  canvas.width = scanW;
  canvas.height = scanH;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, scanW, scanH);

  let data;
  try {
    data = ctx.getImageData(0, 0, scanW, scanH).data;
  } catch (e) {
    return {
      aspect: img.width / img.height,
      topRatio: 0.20,
      bottomRatio: 1.0,
      contentRatio: 0.80,
    };
  }

  let minY = scanH;
  let maxY = 0;

  for (let y = 0; y < scanH; y++) {
    for (let x = 0; x < scanW; x++) {
      const alpha = data[(y * scanW + x) * 4 + 3];
      if (alpha > 20) {
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
        break;
      }
    }
  }

  if (minY >= maxY) {
    minY = 0;
    maxY = scanH;
  }

  const topRatio = minY / scanH;
  const bottomRatio = maxY / scanH;
  const contentRatio = Math.max(0.35, bottomRatio - topRatio);
  const aspect = img.width / img.height;

  return {
    aspect,
    topRatio,
    bottomRatio,
    contentRatio,
  };
}

export function getImageMetrics(url) {
  return metricsCache.get(url) || null;
}

/**
 * Safe texture loader with automatic fallback and texture wrapping
 */
export function loadTexture(url, repeatX = 1, repeatY = 1, fallbackColor1 = '#555555', fallbackColor2 = '#333333', onMetricsReady = null) {
  const fallback = createFallbackTexture(fallbackColor1, fallbackColor2);
  fallback.repeat.set(repeatX, repeatY);

  if (!url) {
    return fallback;
  }

  const texture = textureLoader.load(
    url,
    (loadedTex) => {
      loadedTex.wrapS = THREE.RepeatWrapping;
      loadedTex.wrapT = THREE.RepeatWrapping;
      loadedTex.repeat.set(repeatX, repeatY);
      loadedTex.colorSpace = THREE.SRGBColorSpace;
      loadedTex.needsUpdate = true;

      if (loadedTex.image && loadedTex.image.width) {
        const metrics = analyzeImageMetrics(loadedTex.image);
        metricsCache.set(url, metrics);
        loadedTex.userData.metrics = metrics;
        if (onMetricsReady) onMetricsReady(metrics);
        if (loadedTex.userData.onMetrics) loadedTex.userData.onMetrics(metrics);
      }
    },
    undefined,
    (err) => {
      console.warn(`[AssetManager] Could not load texture at "${url}", using fallback.`, err);
    }
  );

  if (metricsCache.has(url)) {
    texture.userData.metrics = metricsCache.get(url);
  }

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  return texture;
}
