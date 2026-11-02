/**
 * ZombieModelManager Module
 * Handles loading, caching, scaling, and animating 3D zombie models.
 * Supports:
 * 1. DZNarutoRun.fbx (rigged skinned mesh with Naruto Run animation clip)
 * 2. lowpoly_stylish_zombie.glb (articulated limbs, custom zombie diffuse colors)
 * 3. lowpoly_bbq_dad_zombie.glb (articulated limbs, custom zombie diffuse colors)
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
const BASE = import.meta.env.BASE_URL || '/';
const assetUrl = (path) => `${BASE}${path.replace(/^\//, '')}`;

class ZombieModelManager {
  constructor() {
    this.models = {
      fbx: null,
      stylish: null,
      bbqDad: null
    };
    this.loadPromise = null;
    this.isLoaded = false;
  }

  async loadAll() {
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = new Promise(async (resolve) => {
      const gltfLoader = new GLTFLoader();
      const fbxLoader = new FBXLoader();
      const texLoader = new THREE.TextureLoader();

      const promises = [];

      // 1. Load DZNarutoRun.fbx
      const fbxPromise = new Promise((res) => {
        try {
          const fbxUrl = assetUrl('/models/zombies/diaper-zombierun/source/DZNarutoRun.fbx');
          const texUrl = assetUrl('/models/zombies/diaper-zombierun/textures/zombieREGULAR.png');

          const texture = texLoader.load(texUrl, () => {
            texture.colorSpace = THREE.SRGBColorSpace;
          });

          fbxLoader.load(
            fbxUrl,
            (fbx) => {
              // Standard human zombie height ~1.8m
              const box = new THREE.Box3().setFromObject(fbx);
              const size = box.getSize(new THREE.Vector3());
              const center = box.getCenter(new THREE.Vector3());
              const targetHeight = 1.8;
              const scale = (size.y > 0.01) ? (targetHeight / size.y) : 0.01;

              fbx.scale.setScalar(scale);
              fbx.position.x = -center.x * scale;
              fbx.position.z = -center.z * scale;
              fbx.position.y = -box.min.y * scale;

              fbx.traverse((child) => {
                if (child.isLine || child.type.includes('Line') || (child.name && (child.name.toLowerCase().includes('nurb') || child.name.toLowerCase().includes('circle') || child.name.toLowerCase().includes('ikhandle')))) {
                  child.visible = false;
                }
                if (child.isMesh) {
                  child.frustumCulled = false;
                  child.castShadow = true;
                  child.receiveShadow = true;
                  child.material = new THREE.MeshStandardMaterial({
                    map: texture,
                    roughness: 0.65,
                    metalness: 0.1
                  });
                }
              });

              const container = new THREE.Group();
              container.add(fbx);
              container.animations = fbx.animations || [];
              this.models.fbx = container;
              res();
            },
            undefined,
            (err) => {
              console.warn('[ZombieModelManager] Failed to load DZNarutoRun.fbx:', err);
              res();
            }
          );
        } catch (e) {
          console.warn('[ZombieModelManager] FBX load error:', e);
          res();
        }
      });
      promises.push(fbxPromise);

      // 2. Load lowpoly_stylish_zombie.glb
      const stylishPromise = new Promise((res) => {
        try {
          const glbUrl = assetUrl('/models/zombies/lowpoly_stylish_zombie.glb');
          gltfLoader.load(
            glbUrl,
            (gltf) => {
              const root = gltf.scene;
              const box = new THREE.Box3().setFromObject(root);
              const size = box.getSize(new THREE.Vector3());
              const center = box.getCenter(new THREE.Vector3());
              const targetHeight = 1.8;
              const scale = (size.y > 0.01) ? (targetHeight / size.y) : 1.0;

              root.scale.setScalar(scale);
              root.position.x = -center.x * scale;
              root.position.z = -center.z * scale;
              root.position.y = -box.min.y * scale;

              // Apply vibrant zombie palette
              root.traverse((child) => {
                if (child.isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                  const name = child.name || '';

                  let matColor = 0x9ec718; // Green zombie skin
                  let roughness = 0.7;
                  let metalness = 0.05;
                  let transparent = false;
                  let opacity = 1.0;

                  if (name === 'Object_4') {
                    matColor = 0x9ec718; // Skin (arms, chest, face)
                  } else if (name === 'Object_5') {
                    matColor = 0xb87508; // Belt buckle
                    metalness = 0.7;
                    roughness = 0.3;
                  } else if (name === 'Object_6') {
                    matColor = 0x1e180d; // Belt
                  } else if (name === 'Object_7') {
                    matColor = 0x382c24; // Pants
                  } else if (name === 'Object_8') {
                    matColor = 0x241d10; // Shoes
                  } else if (name === 'Object_9') {
                    matColor = 0x5b4412; // Hair
                  } else if (name === 'Object_11') {
                    matColor = 0x151f2e; // Glasses frame
                  } else if (name === 'Object_12') {
                    matColor = 0xddeeff; // Glasses lens
                    transparent = true;
                    opacity = 0.45;
                    roughness = 0.1;
                  } else if (name === 'Object_14') {
                    matColor = 0xbb1412; // Red tie
                  }

                  child.material = new THREE.MeshStandardMaterial({
                    color: matColor,
                    roughness,
                    metalness,
                    transparent,
                    opacity
                  });
                }
              });

              const container = new THREE.Group();
              container.add(root);
              this.models.stylish = container;
              res();
            },
            undefined,
            (err) => {
              console.warn('[ZombieModelManager] Failed to load stylish zombie GLB:', err);
              res();
            }
          );
        } catch (e) {
          console.warn('[ZombieModelManager] GLB stylish load error:', e);
          res();
        }
      });
      promises.push(stylishPromise);

      // 3. Load lowpoly_bbq_dad_zombie.glb
      const bbqPromise = new Promise((res) => {
        try {
          const glbUrl = assetUrl('/models/zombies/lowpoly_bbq_dad_zombie.glb');
          gltfLoader.load(
            glbUrl,
            (gltf) => {
              const root = gltf.scene;
              const box = new THREE.Box3().setFromObject(root);
              const size = box.getSize(new THREE.Vector3());
              const center = box.getCenter(new THREE.Vector3());
              const targetHeight = 1.8;
              const scale = (size.y > 0.01) ? (targetHeight / size.y) : 1.0;

              root.scale.setScalar(scale);
              root.position.x = -center.x * scale;
              root.position.z = -center.z * scale;
              root.position.y = -box.min.y * scale;

              // Apply BBQ Dad zombie palette
              root.traverse((child) => {
                if (child.isMesh) {
                  child.castShadow = true;
                  child.receiveShadow = true;
                  const name = child.name || '';

                  let matColor = 0x9ec718; // Skin
                  let roughness = 0.7;
                  let metalness = 0.05;

                  if (name === 'Object_4') {
                    matColor = 0x9ec718; // Combo skin
                  } else if (name === 'Object_5') {
                    matColor = 0xb87508; // Belt buckle
                    metalness = 0.7;
                    roughness = 0.3;
                  } else if (name === 'Object_6') {
                    matColor = 0x1e180d; // Belt
                  } else if (name === 'Object_7') {
                    matColor = 0x382c24; // Pants
                  } else if (name === 'Object_8') {
                    matColor = 0x241d10; // Shoes
                  } else if (name === 'Object_9') {
                    matColor = 0x5b4412; // Hair
                  } else if (name === 'Object_10') {
                    matColor = 0x3877cc; // Blue polo dad shirt
                  }

                  child.material = new THREE.MeshStandardMaterial({
                    color: matColor,
                    roughness,
                    metalness
                  });
                }
              });

              const container = new THREE.Group();
              container.add(root);
              this.models.bbqDad = container;
              res();
            },
            undefined,
            (err) => {
              console.warn('[ZombieModelManager] Failed to load bbq dad zombie GLB:', err);
              res();
            }
          );
        } catch (e) {
          console.warn('[ZombieModelManager] GLB bbq dad load error:', e);
          res();
        }
      });
      promises.push(bbqPromise);

      await Promise.all(promises);
      this.isLoaded = true;
      resolve();
    });

    return this.loadPromise;
  }

  createProceduralFallbackZombie() {
    const group = new THREE.Group();
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x9ec718, roughness: 0.7 });
    const clothesMat = new THREE.MeshStandardMaterial({ color: 0x2a3b4c, roughness: 0.8 });

    // Torso
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.75, 0.32), clothesMat);
    torso.position.y = 1.15;
    torso.name = 'torso';
    group.add(torso);

    // Head
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.38, 0.35), skinMat);
    head.position.y = 1.68;
    head.name = 'head';
    group.add(head);

    // Left Arm (stretched forward)
    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.65, 0.16), skinMat);
    leftArm.position.set(-0.38, 1.25, 0.28);
    leftArm.rotation.x = Math.PI / 2.3;
    leftArm.name = 'leftArm';
    group.add(leftArm);

    // Right Arm (stretched forward)
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.65, 0.16), skinMat);
    rightArm.position.set(0.38, 1.25, 0.28);
    rightArm.rotation.x = Math.PI / 2.3;
    rightArm.name = 'rightArm';
    group.add(rightArm);

    // Left Leg
    const leftLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), clothesMat);
    leftLeg.position.set(-0.16, 0.4, 0);
    leftLeg.name = 'leftLeg';
    group.add(leftLeg);

    // Right Leg
    const rightLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.8, 0.2), clothesMat);
    rightLeg.position.set(0.16, 0.4, 0);
    rightLeg.name = 'rightLeg';
    group.add(rightLeg);

    const container = new THREE.Group();
    container.add(group);
    return container;
  }

  createZombieInstance(preferredIndex = null) {
    const available = [];
    if (this.models.fbx) available.push({ type: 'fbx', template: this.models.fbx });
    if (this.models.stylish) available.push({ type: 'stylish', template: this.models.stylish });
    if (this.models.bbqDad) available.push({ type: 'bbq', template: this.models.bbqDad });

    let chosen = null;
    if (preferredIndex !== null && available[preferredIndex % available.length]) {
      chosen = available[preferredIndex % available.length];
    } else if (available.length > 0) {
      chosen = available[Math.floor(Math.random() * available.length)];
    }

    if (!chosen) {
      // Fallback procedural zombie
      const fallbackGroup = this.createProceduralFallbackZombie();
      return new ZombieInstance(fallbackGroup, 'procedural', null);
    }

    let clonedModel;
    let mixer = null;

    if (chosen.type === 'fbx') {
      clonedModel = SkeletonUtils.clone(chosen.template);
      clonedModel.traverse((c) => {
        if (c.isLine || c.type.includes('Line') || (c.name && (c.name.toLowerCase().includes('nurb') || c.name.toLowerCase().includes('circle') || c.name.toLowerCase().includes('ikhandle')))) {
          c.visible = false;
        }
        if (c.isMesh) {
          c.frustumCulled = false;
          if (c.material) {
            c.material = c.material.clone();
          }
        }
      });
      if (chosen.template.animations && chosen.template.animations.length > 0) {
        mixer = new THREE.AnimationMixer(clonedModel);
        const action = mixer.clipAction(chosen.template.animations[0]);
        action.play();
      }
    } else {
      clonedModel = chosen.template.clone(true);
      // Ensure unique materials so hurt flash is independent
      clonedModel.traverse((c) => {
        if (c.isMesh) {
          c.frustumCulled = false;
          if (c.material) {
            c.material = c.material.clone();
          }
        }
      });
    }

    return new ZombieInstance(clonedModel, chosen.type, mixer);
  }
}

class ZombieInstance {
  constructor(rootObject, modelType, mixer) {
    this.root = rootObject;
    this.modelType = modelType;
    this.mixer = mixer;

    this.group = new THREE.Group();
    this.group.add(this.root);

    // Collect meshes and cache original material colors
    this.meshes = [];
    this.originalColors = new Map();
    this.root.traverse((c) => {
      if (c.isMesh) {
        this.meshes.push(c);
        if (c.material && c.material.color) {
          this.originalColors.set(c, c.material.color.clone());
        }
      }
    });

    // Locate articulable parts for GLB models
    this.parts = {};
    this.root.traverse((c) => {
      if (c.name) {
        this.parts[c.name] = c;
      }
    });

    this.walkTimer = Math.random() * 20;
    this.isHurt = false;
    this.hurtTimer = 0;
    this.isDead = false;
    this.deathTimer = 0;
  }

  update(deltaTime, isMoving, isAttacking, attackProgress, targetPosition) {
    if (this.isDead) {
      this.deathTimer += deltaTime;
      const progress = Math.min(1.0, this.deathTimer / 1.2);
      // Collapse backward onto ground
      this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, -Math.PI / 2, deltaTime * 6);
      this.root.position.y = THREE.MathUtils.lerp(this.root.position.y, -0.2, deltaTime * 6);
      this.meshes.forEach((m) => {
        if (m.material) {
          m.material.transparent = true;
          m.material.opacity = Math.max(0, 1.0 - progress);
        }
      });
      return;
    }

    // Face player
    if (targetPosition) {
      const dx = targetPosition.x - this.group.position.x;
      const dz = targetPosition.z - this.group.position.z;
      if (Math.abs(dx) > 0.05 || Math.abs(dz) > 0.05) {
        const targetAngle = Math.atan2(dx, dz);
        this.group.rotation.y = targetAngle;
      }
    }

    // Hurt flash update
    if (this.hurtTimer > 0) {
      this.hurtTimer -= deltaTime;
      if (this.hurtTimer <= 0) {
        this.resetHurtFlash();
      }
    }

    // Animation updates
    if (this.modelType === 'fbx' && this.mixer) {
      if (isMoving) {
        this.mixer.update(deltaTime * 1.35); // Energetic run
      } else {
        this.mixer.update(deltaTime * 0.25); // Slow shuffle
      }

      // Attack lunge
      if (isAttacking) {
        const lunge = Math.sin(attackProgress * Math.PI);
        this.root.position.z = lunge * 0.45;
        this.root.rotation.x = 0.2 + lunge * 0.4;
      } else {
        this.root.position.z = 0;
        this.root.rotation.x = 0;
      }
    } else {
      // Articulated GLB or Procedural
      if (isMoving) {
        this.walkTimer += deltaTime * 8.5;
        const stride = Math.sin(this.walkTimer);

        // Body lurch & sway
        this.root.rotation.z = Math.sin(this.walkTimer * 0.5) * 0.12;
        this.root.rotation.x = 0.22 + Math.sin(this.walkTimer) * 0.06;
        this.root.position.y = Math.abs(stride) * 0.08;

        // Limbs swing
        if (this.parts['Object_7']) { // Pants
          this.parts['Object_7'].rotation.x = stride * 0.35;
        }
        if (this.parts['Object_8']) { // Shoes
          this.parts['Object_8'].rotation.x = stride * 0.4;
        }
        if (this.parts['leftLeg']) {
          this.parts['leftLeg'].rotation.x = stride * 0.5;
        }
        if (this.parts['rightLeg']) {
          this.parts['rightLeg'].rotation.x = -stride * 0.5;
        }
      } else {
        this.root.rotation.z = 0;
        this.root.rotation.x = 0.1;
        this.root.position.y = 0;
      }

      // Attack animation: violent forward lunging strike
      if (isAttacking) {
        const lunge = Math.sin(attackProgress * Math.PI);
        this.root.position.z = lunge * 0.5;
        this.root.rotation.x = 0.35 + lunge * 0.5;
      } else if (!isMoving) {
        this.root.position.z = 0;
      }
    }
  }

  setHurtFlash(isCritical = false) {
    this.hurtTimer = 0.15;
    const flashColor = isCritical ? new THREE.Color(1.0, 0.85, 0.15) : new THREE.Color(1.0, 0.15, 0.15);
    this.meshes.forEach((m) => {
      if (m.material && m.material.color) {
        m.material.color.copy(flashColor);
      }
    });
  }

  resetHurtFlash() {
    this.meshes.forEach((m) => {
      if (m.material && m.material.color && this.originalColors.has(m)) {
        m.material.color.copy(this.originalColors.get(m));
      }
    });
  }

  die() {
    this.isDead = true;
    this.deathTimer = 0;
  }

  dispose() {
    if (this.group.parent) {
      this.group.parent.remove(this.group);
    }
    if (this.mixer) {
      this.mixer.stopAllAction();
    }
    this.meshes.forEach((m) => {
      if (m.material) {
        m.material.dispose();
      }
    });
  }
}

export const zombieModelManager = new ZombieModelManager();
