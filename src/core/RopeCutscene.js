/**
 * RopeCutscene Module
 * Cutscene where the player climbs down a rope from ceiling level and lands on the ground floor.
 * Includes:
 * - 3D Rope cylinder with rope texture
 * - Animated first-person climbing hands grasping the rope
 * - Smooth descending camera with lateral sway and climbing rhythm
 * - Cinematic letterboxing and mission briefing text
 * - Landing impact sound & screen shake
 * - Seamless trigger of Computer Lab Door Explosion on touchdown
 */
import * as THREE from 'three';
import { assetUrl, loadTexture } from '../config/assets.js';

export class RopeCutscene {
  constructor(scene, camera, player, audio, hud) {
    this.scene = scene;
    this.camera = camera;
    this.player = player;
    this.audio = audio;
    this.hud = hud;

    this.isActive = false;
    this.timer = 0;
    this.duration = 3.6; // 3.6 seconds smooth cinematic descent
    this.startY = 5.3;
    this.landY = 1.65;
    this.ropeX = 23.5;
    this.ropeZ = 57.0;

    this.ropeGroup = null;
    this.handsGroup = null;
    this.letterboxTop = null;
    this.letterboxBottom = null;
    this.onCompleteCallback = null;

    this.lastClimbSoundTime = 0;
    this.initUI();
  }

  initUI() {
    // Top letterbox bar
    this.letterboxTop = document.createElement('div');
    this.letterboxTop.id = 'cutscene-letterbox-top';
    this.letterboxTop.style.position = 'fixed';
    this.letterboxTop.style.top = '0';
    this.letterboxTop.style.left = '0';
    this.letterboxTop.style.width = '100%';
    this.letterboxTop.style.height = '11vh';
    this.letterboxTop.style.background = '#000000';
    this.letterboxTop.style.zIndex = '9998';
    this.letterboxTop.style.transition = 'transform 0.4s ease';
    this.letterboxTop.style.transform = 'translateY(-100%)';
    this.letterboxTop.style.display = 'flex';
    this.letterboxTop.style.alignItems = 'center';
    this.letterboxTop.style.justifyContent = 'space-between';
    this.letterboxTop.style.padding = '0 24px';
    this.letterboxTop.style.boxSizing = 'border-box';
    this.letterboxTop.innerHTML = `
      <div style="color: #ffcc00; font-family: monospace; font-weight: 900; font-size: 15px; letter-spacing: 2px;">
        ◆ MISSION: INFILTRATION — GROUND FLOOR
      </div>
      <div style="color: rgba(255,255,255,0.5); font-family: monospace; font-size: 11px;">
        [SPACE / CLICK] SKIP
      </div>
    `;

    // Bottom letterbox bar
    this.letterboxBottom = document.createElement('div');
    this.letterboxBottom.id = 'cutscene-letterbox-bottom';
    this.letterboxBottom.style.position = 'fixed';
    this.letterboxBottom.style.bottom = '0';
    this.letterboxBottom.style.left = '0';
    this.letterboxBottom.style.width = '100%';
    this.letterboxBottom.style.height = '11vh';
    this.letterboxBottom.style.background = '#000000';
    this.letterboxBottom.style.zIndex = '9998';
    this.letterboxBottom.style.transition = 'transform 0.4s ease';
    this.letterboxBottom.style.transform = 'translateY(100%)';
    this.letterboxBottom.style.display = 'flex';
    this.letterboxBottom.style.alignItems = 'center';
    this.letterboxBottom.style.justifyContent = 'center';
    this.letterboxBottom.innerHTML = `
      <div id="cutscene-sub-text" style="color: #ffffff; font-family: monospace; font-weight: 700; font-size: 14px; letter-spacing: 1.5px;">
        DESCENDING ROPE TO COMPUTER LAB CORRIDOR...
      </div>
    `;

    document.body.appendChild(this.letterboxTop);
    document.body.appendChild(this.letterboxBottom);

    const handleSkip = () => {
      if (this.isActive) {
        this.finish();
      }
    };
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space' && this.isActive) {
        handleSkip();
      }
    });
    this.letterboxTop.addEventListener('click', handleSkip);
    this.letterboxBottom.addEventListener('click', handleSkip);
  }

  build3DRope() {
    if (this.ropeGroup) {
      this.scene.remove(this.ropeGroup);
    }

    this.ropeGroup = new THREE.Group();

    // Rope texture
    const ropeTex = loadTexture(assetUrl('/images/rope.png'), 1, 12, '#8b5a2b', '#4a2e12');
    ropeTex.wrapS = THREE.RepeatWrapping;
    ropeTex.wrapT = THREE.RepeatWrapping;
    ropeTex.repeat.set(2, 28);

    const ropeMat = new THREE.MeshStandardMaterial({
      map: ropeTex,
      roughness: 0.85,
      metalness: 0.05,
      color: 0xc89d66
    });

    const ropeHeight = 6.0;
    const ropeGeo = new THREE.CylinderGeometry(0.045, 0.045, ropeHeight, 14);
    const ropeMesh = new THREE.Mesh(ropeGeo, ropeMat);
    ropeMesh.position.set(this.ropeX, ropeHeight / 2, this.ropeZ);
    ropeMesh.castShadow = true;
    this.ropeGroup.add(ropeMesh);

    // Ceiling anchor ring
    const ringGeo = new THREE.TorusGeometry(0.12, 0.03, 8, 16);
    const metalMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8, roughness: 0.2 });
    const ringMesh = new THREE.Mesh(ringGeo, metalMat);
    ringMesh.position.set(this.ropeX, ropeHeight, this.ropeZ);
    ringMesh.rotation.x = Math.PI / 2;
    this.ropeGroup.add(ringMesh);

    this.scene.add(this.ropeGroup);
  }

  buildClimbingHands() {
    this.handsGroup = new THREE.Group();

    const skinMat = new THREE.MeshStandardMaterial({ color: 0xd49b74, roughness: 0.7 });
    const gloveMat = new THREE.MeshStandardMaterial({ color: 0x1a252f, roughness: 0.6 });

    // Left Arm / Glove
    this.leftHand = new THREE.Group();
    const lForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.35, 10), gloveMat);
    lForearm.rotation.z = Math.PI / 6;
    this.leftHand.add(lForearm);

    const lFist = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.1), gloveMat);
    lFist.position.set(0.06, 0.18, 0);
    this.leftHand.add(lFist);

    this.leftHand.position.set(-0.16, -0.05, -0.45);
    this.handsGroup.add(this.leftHand);

    // Right Arm / Glove
    this.rightHand = new THREE.Group();
    const rForearm = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.35, 10), gloveMat);
    rForearm.rotation.z = -Math.PI / 6;
    this.rightHand.add(rForearm);

    const rFist = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.1), gloveMat);
    rFist.position.set(-0.06, 0.18, 0);
    this.rightHand.add(rFist);

    this.rightHand.position.set(0.16, 0.15, -0.45);
    this.handsGroup.add(this.rightHand);

    this.camera.add(this.handsGroup);
  }

  start(onComplete) {
    this.isActive = true;
    this.timer = 0;
    this.lastClimbSoundTime = 0;
    this.onCompleteCallback = onComplete;

    // Build 3D objects
    this.build3DRope();
    this.buildClimbingHands();

    // Disable player normal input & hide active weapon viewmodels
    if (this.player) {
      this.player.isFrozen = true;
      if (this.player.setWeaponsVisible) {
        this.player.setWeaponsVisible(false);
      }
      this.player.position.set(this.ropeX, this.startY, this.ropeZ);
      this.player.yaw = -Math.PI / 2; // Face West towards Computer Lab door
      this.player.pitch = -0.15; // Look slightly downward
    }

    this.camera.position.set(this.ropeX, this.startY, this.ropeZ);
    this.camera.rotation.set(-0.15, -Math.PI / 2, 0, 'YXZ');

    // Show letterbox overlay
    if (this.letterboxTop) this.letterboxTop.style.transform = 'translateY(0)';
    if (this.letterboxBottom) this.letterboxBottom.style.transform = 'translateY(0)';

    // Play initial slide SFX
    if (this.audio) {
      if (this.audio.playBuffer) {
        this.audio.playBuffer('combo-1', 0.6);
      }
    }
  }

  update(deltaTime) {
    if (!this.isActive) return;

    this.timer += deltaTime;
    const progress = Math.min(1.0, this.timer / this.duration);

    // Smooth cubic easing for vertical descent
    // Easing: starts, slides, cushions smoothly into floor landing
    const easeProgress = progress * progress * (3 - 2 * progress);
    const currentY = THREE.MathUtils.lerp(this.startY, this.landY, easeProgress);

    // Lateral sway and vertical cadence
    const climbCycle = this.timer * 4.5;
    const swayX = Math.sin(climbCycle) * 0.04;
    const swayZ = Math.cos(climbCycle * 0.5) * 0.02;

    this.camera.position.set(this.ropeX + swayX, currentY, this.ropeZ + swayZ);

    if (this.player) {
      this.player.position.set(this.ropeX + swayX, currentY, this.ropeZ + swayZ);
    }

    // Animate climbing hands (alternating hand-over-hand slide down)
    if (this.leftHand && this.rightHand) {
      const leftCycle = Math.sin(climbCycle);
      const rightCycle = Math.sin(climbCycle + Math.PI);

      this.leftHand.position.y = -0.05 + leftCycle * 0.12;
      this.rightHand.position.y = -0.05 + rightCycle * 0.12;

      // Slight tilt when grabbing
      this.leftHand.rotation.z = leftCycle * 0.1;
      this.rightHand.rotation.z = -rightCycle * 0.1;
    }

    // Periodic climbing audio
    if (this.timer - this.lastClimbSoundTime > 0.55 && progress < 0.9) {
      this.lastClimbSoundTime = this.timer;
      if (this.audio && this.audio.playFootstep) {
        this.audio.playFootstep();
      }
    }

    // Subtitle update as player gets closer to ground
    const subText = document.getElementById('cutscene-sub-text');
    if (subText) {
      if (progress < 0.45) {
        subText.textContent = 'DESCENDING ROPE OUTSIDE COMPUTER LAB...';
      } else if (progress < 0.85) {
        subText.textContent = 'APPROACHING FLOOR LEVEL — PREPARE FOR IMPACT...';
      } else {
        subText.textContent = 'TOUCHDOWN IMMINENT!';
      }
    }

    // Touchdown landing!
    if (progress >= 1.0) {
      this.finish();
    }
  }

  finish() {
    if (!this.isActive) return;
    this.isActive = false;

    // Land firmly on floor
    if (this.player) {
      this.player.isFrozen = false;
      this.player.position.set(this.ropeX, this.landY, this.ropeZ);
      this.player.yaw = -Math.PI / 2;
      this.player.pitch = 0;
      if (this.player.setWeaponsVisible) {
        this.player.setWeaponsVisible(true);
      }
    }

    this.camera.position.set(this.ropeX, this.landY, this.ropeZ);
    this.camera.rotation.set(0, -Math.PI / 2, 0, 'YXZ');

    // Clean up cutscene hands
    if (this.handsGroup && this.camera) {
      this.camera.remove(this.handsGroup);
      this.handsGroup = null;
    }

    // Slide away letterbox bars
    if (this.letterboxTop) this.letterboxTop.style.transform = 'translateY(-100%)';
    if (this.letterboxBottom) this.letterboxBottom.style.transform = 'translateY(100%)';

    // Screen shake on landing impact
    const container = document.getElementById('game-container') || document.body;
    if (container) {
      container.classList.remove('screen-shake');
      void container.offsetWidth;
      container.classList.add('screen-shake');
      setTimeout(() => container.classList.remove('screen-shake'), 650);
    }

    // Landing thud sound
    if (this.audio) {
      if (this.audio.playFootstep) {
        this.audio.playFootstep();
      }
      if (this.audio.playBuffer) {
        this.audio.playBuffer('combo-2', 0.8);
      }
    }

    // Call completion callback (which explodes the Computer Lab door!)
    if (this.onCompleteCallback) {
      const cb = this.onCompleteCallback;
      this.onCompleteCallback = null;
      cb();
    }
  }

  reset() {
    this.isActive = false;
    this.timer = 0;
    if (this.ropeGroup && this.scene) {
      this.scene.remove(this.ropeGroup);
      this.ropeGroup = null;
    }
    if (this.handsGroup && this.camera) {
      this.camera.remove(this.handsGroup);
      this.handsGroup = null;
    }
    if (this.letterboxTop) this.letterboxTop.style.transform = 'translateY(-100%)';
    if (this.letterboxBottom) this.letterboxBottom.style.transform = 'translateY(100%)';
  }
}
