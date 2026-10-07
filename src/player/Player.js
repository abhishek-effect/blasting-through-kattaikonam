/**
 * Player Module
 * First-person controller with axis-separated wall collision resolution,
 * inventory management (Rifle, Pistol, Medkit), photocopy progression state,
 * gravity, sprint, and health.
 */
import * as THREE from 'three';

export class Player {
  constructor(camera, world, input, audio, gameState) {
    this.camera = camera;
    this.world = world;
    this.input = input;
    this.audio = audio;
    this.gameState = gameState;

    // Dimensions and physics
    this.height = 1.65;
    this.radius = 0.45;
    this.position = new THREE.Vector3(0, this.height, 18);
    this.velocity = new THREE.Vector3();
    this.gravity = 18.0;
    this.jumpForce = 7.8;
    this.isGrounded = true;

    // Movement attributes
    this.walkSpeed = 4.5;
    this.sprintSpeed = 7.5;
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;

    // Camera bobbing
    this.bobTimer = 0;
    this.bobIntensity = 0.045;
    this.bobSpeed = 10;

    // Health
    this.maxHealth = 100;
    this.health = 100;
    this.isDead = false;

    // Progression Hook: Photocopy requirement for elevator
    this.hasPhotocopy = false;

    // Damage flash timer
    this.damageFlashTimer = 0;

    // Inventory slots: [Rifle, Pistol, Medkit]
    this.slots = [];
    this.activeSlotIndex = 0;

    // Notification callback for HUD
    this.onPickupNotification = null;

    this.reset(new THREE.Vector3(0, this.height, 18));
  }

  setInventory(slots = []) {
    this.slots = slots;
    // Hide all viewmodels initially
    this.slots.forEach((s) => {
      if (s && s.setVisible) s.setVisible(false);
    });
    // Display only slot 0
    this.switchSlot(0);
  }

  getActiveItem() {
    return this.slots[this.activeSlotIndex] || null;
  }

  switchSlot(slotIndex) {
    if (slotIndex < 0 || slotIndex >= this.slots.length) return;
    this.activeSlotIndex = slotIndex;

    // Strict exclusive visibility so weapons NEVER overlap
    this.slots.forEach((slot, idx) => {
      if (slot && slot.setVisible) {
        slot.setVisible(idx === this.activeSlotIndex);
      }
    });
  }

  reset(startPosition = new THREE.Vector3(0, this.height, 18), startYaw = 0) {
    this.position.copy(startPosition);
    this.velocity.set(0, 0, 0);
    this.yaw = startYaw;
    this.pitch = 0;
    this.targetYaw = startYaw;
    this.targetPitch = 0;
    this.health = this.maxHealth;
    this.isDead = false;
    this.hasPhotocopy = false;
    this.updateCameraTransform();
  }

  takeDamage(amount) {
    if (this.isDead || !this.gameState.isPlaying()) return;

    this.health = Math.max(0, this.health - amount);
    this.damageFlashTimer = 0.25;
    this.audio.playPlayerHurt();

    if (this.health <= 0) {
      this.isDead = true;
      this.gameState.setState('GAME_OVER');
    }
  }

  update(deltaTime) {
    if (this.isDead) return;

    // Check slot change input (1, 2, 3 or tap)
    const requestedSlot = this.input.checkAndConsumeSlotChange();
    if (requestedSlot !== null) {
      this.switchSlot(requestedSlot);
    }

    // 1. Process Look (Mouse or Touch Drag) with Smooth Interpolation
    const { yaw: deltaYaw, pitch: deltaPitch } = this.input.getLookDelta();
    this.targetYaw += deltaYaw;
    this.targetPitch += deltaPitch;

    const maxPitch = (85 * Math.PI) / 180;
    this.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, this.targetPitch));

    // Smooth exponential damping: ultra-smooth turning on mobile while maintaining responsive PC aim
    const smoothFactor = Math.min(1.0, deltaTime * 28.0);
    this.yaw += (this.targetYaw - this.yaw) * smoothFactor;
    this.pitch += (this.targetPitch - this.pitch) * smoothFactor;

    // 2. Process Movement
    const move = this.input.getMoveVector();
    const isSprinting = this.input.isSprinting();
    const currentSpeed = isSprinting ? this.sprintSpeed : this.walkSpeed;

    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    const moveDir = new THREE.Vector3()
      .addScaledVector(right, move.x)
      .addScaledVector(forward, -move.z);

    const isMoving = moveDir.lengthSq() > 0.001;
    if (isMoving) {
      moveDir.normalize();
      this.velocity.x = moveDir.x * currentSpeed;
      this.velocity.z = moveDir.z * currentSpeed;
    } else {
      this.velocity.x = 0;
      this.velocity.z = 0;
    }

    // 3. Jump & Gravity
    if (this.input.checkAndConsumeJump && this.input.checkAndConsumeJump() && this.isGrounded) {
      this.velocity.y = this.jumpForce;
      this.isGrounded = false;
      if (this.audio && this.audio.playJump) {
        this.audio.playJump();
      }
    }

    if (!this.isGrounded) {
      this.velocity.y -= this.gravity * deltaTime;
    }

    // 4. Update Position with Bulletproof Axis-Separated Collision Resolution
    // Move X first and resolve
    this.position.x += this.velocity.x * deltaTime;
    if (this.world.resolveAxisCollision) {
      this.world.resolveAxisCollision(this.position, this.radius, 'x');
    }

    // Move Z next and resolve
    this.position.z += this.velocity.z * deltaTime;
    if (this.world.resolveAxisCollision) {
      this.world.resolveAxisCollision(this.position, this.radius, 'z');
    }

    // Vertical step
    this.position.y += this.velocity.y * deltaTime;
    if (this.position.y <= this.height) {
      this.position.y = this.height;
      this.velocity.y = 0;
      this.isGrounded = true;
    } else {
      this.isGrounded = false;
    }

    // 5. Head Bobbing
    let bobOffset = 0;
    if (isMoving && this.isGrounded) {
      this.bobTimer += deltaTime * (isSprinting ? this.bobSpeed * 1.3 : this.bobSpeed);
      bobOffset = Math.sin(this.bobTimer) * this.bobIntensity;
    } else {
      this.bobTimer = 0;
    }

    // 6. Camera Position & Rotation
    this.camera.position.set(this.position.x, this.position.y + bobOffset, this.position.z);
    this.updateCameraTransform();

    // Damage flash timer
    if (this.damageFlashTimer > 0) {
      this.damageFlashTimer = Math.max(0, this.damageFlashTimer - deltaTime);
    }
  }

  updateCameraTransform() {
    this.camera.rotation.set(0, 0, 0);
    this.camera.rotation.order = 'YXZ';
    this.camera.rotation.y = this.yaw;
    this.camera.rotation.x = this.pitch;
  }
}
