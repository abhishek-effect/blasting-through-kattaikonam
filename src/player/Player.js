/**
 * Player Module
 * First-person controller with axis-separated wall collision resolution,
 * inventory management (Rifle, Pistol, Medkit), photocopy progression state,
 * gravity, sprint, crouch ('C'), slide ('Ctrl'), and health.
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
    this.standHeight = 1.65;
    this.crouchHeight = 0.95;
    this.slideHeight = 0.82;
    this.currentHeight = 1.65;
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
    this.crouchSpeed = 2.4;
    this.yaw = 0;
    this.pitch = 0;
    this.targetYaw = 0;
    this.targetPitch = 0;

    // Dynamic look delta history for viewmodel sway
    this.lastDeltaYaw = 0;
    this.lastDeltaPitch = 0;

    // Crouch & Slide State
    this.isCrouching = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideDuration = 0.75;
    this.slideCooldown = 0;
    this.initialSlideSpeed = 10.5;
    this.slideDirection = new THREE.Vector3();
    this.slideRoll = 0;
    this.currentSlideRoll = 0;

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

  reset(startPosition = new THREE.Vector3(0, this.standHeight, 18), startYaw = 0) {
    this.currentHeight = this.standHeight;
    this.height = this.standHeight;
    this.position.copy(startPosition);
    this.position.y = this.standHeight;
    this.velocity.set(0, 0, 0);
    this.yaw = startYaw;
    this.pitch = 0;
    this.targetYaw = startYaw;
    this.targetPitch = 0;
    this.lastDeltaYaw = 0;
    this.lastDeltaPitch = 0;
    this.isCrouching = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.slideCooldown = 0;
    this.slideRoll = 0;
    this.currentSlideRoll = 0;
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
    this.lastDeltaYaw = deltaYaw;
    this.lastDeltaPitch = deltaPitch;
    this.targetYaw += deltaYaw;
    this.targetPitch += deltaPitch;

    const maxPitch = (85 * Math.PI) / 180;
    this.targetPitch = Math.max(-maxPitch, Math.min(maxPitch, this.targetPitch));

    // Smooth exponential damping
    const smoothFactor = Math.min(1.0, deltaTime * 28.0);
    this.yaw += (this.targetYaw - this.yaw) * smoothFactor;
    this.pitch += (this.targetPitch - this.pitch) * smoothFactor;

    // 2. Crouch & Slide Input Processing
    if (this.slideCooldown > 0) {
      this.slideCooldown = Math.max(0, this.slideCooldown - deltaTime);
    }

    const move = this.input.getMoveVector();
    const forward = new THREE.Vector3(-Math.sin(this.yaw), 0, -Math.cos(this.yaw));
    const right = new THREE.Vector3(Math.cos(this.yaw), 0, -Math.sin(this.yaw));

    // Check Slide Activation ('Ctrl' key)
    if (
      this.input.checkAndConsumeSlide &&
      this.input.checkAndConsumeSlide() &&
      this.isGrounded &&
      this.slideCooldown <= 0
    ) {
      this.isSliding = true;
      this.slideTimer = 0;
      this.slideCooldown = 0.25;
      this.isCrouching = false;
      if (this.input.setCrouching) {
        this.input.setCrouching(false);
      }

      const moveDir = new THREE.Vector3()
        .addScaledVector(right, move.x)
        .addScaledVector(forward, -move.z);

      if (moveDir.lengthSq() > 0.001) {
        moveDir.normalize();
        this.slideDirection.copy(moveDir);
      } else {
        this.slideDirection.copy(forward).normalize();
      }

      if (this.audio && this.audio.playSlide) {
        this.audio.playSlide();
      }
    }

    // Check Crouch Activation ('C' key)
    if (!this.isSliding) {
      this.isCrouching = this.input.isCrouching ? this.input.isCrouching() : false;
      if (this.input.isSprinting() && (move.x !== 0 || move.z !== 0)) {
        this.isCrouching = false;
        if (this.input.setCrouching) {
          this.input.setCrouching(false);
        }
      }
    }

    // 3. Movement Physics (Slide vs Normal Walking/Sprinting/Crouching)
    let isMoving = false;
    if (this.isSliding) {
      this.slideTimer += deltaTime;
      const slideProgress = Math.min(1.0, this.slideTimer / this.slideDuration);
      const currentSlideSpeed = THREE.MathUtils.lerp(
        this.initialSlideSpeed,
        this.crouchSpeed,
        Math.sin(slideProgress * Math.PI * 0.5)
      );

      this.velocity.x = this.slideDirection.x * currentSlideSpeed;
      this.velocity.z = this.slideDirection.z * currentSlideSpeed;
      isMoving = true;

      // Camera dynamic roll during slide
      this.slideRoll = -0.042 * Math.sin(slideProgress * Math.PI);

      // Slide Jump mechanics
      if (this.input.checkAndConsumeJump && this.input.checkAndConsumeJump() && this.isGrounded) {
        this.velocity.y = this.jumpForce * 1.05;
        this.isGrounded = false;
        this.isSliding = false;
        this.slideRoll = 0;
        if (this.audio && this.audio.playJump) {
          this.audio.playJump();
        }
      } else if (this.slideTimer >= this.slideDuration) {
        this.isSliding = false;
        this.slideRoll = 0;
        if (this.input.isCrouching && this.input.isCrouching()) {
          this.isCrouching = true;
        }
      }
    } else {
      this.slideRoll = 0;
      const isSprinting = this.input.isSprinting();
      const currentSpeed = this.isCrouching
        ? this.crouchSpeed
        : (isSprinting ? this.sprintSpeed : this.walkSpeed);

      const moveDir = new THREE.Vector3()
        .addScaledVector(right, move.x)
        .addScaledVector(forward, -move.z);

      isMoving = moveDir.lengthSq() > 0.001;
      if (isMoving) {
        moveDir.normalize();
        this.velocity.x = moveDir.x * currentSpeed;
        this.velocity.z = moveDir.z * currentSpeed;
      } else {
        this.velocity.x = 0;
        this.velocity.z = 0;
      }

      // Jump & Gravity
      if (this.input.checkAndConsumeJump && this.input.checkAndConsumeJump() && this.isGrounded) {
        this.isCrouching = false;
        if (this.input.setCrouching) {
          this.input.setCrouching(false);
        }
        this.velocity.y = this.jumpForce;
        this.isGrounded = false;
        if (this.audio && this.audio.playJump) {
          this.audio.playJump();
        }
      }
    }

    if (!this.isGrounded) {
      this.velocity.y -= this.gravity * deltaTime;
    }

    // 4. Smooth Height Interpolation (Stand / Crouch / Slide)
    let targetH = this.standHeight;
    if (this.isSliding) {
      targetH = this.slideHeight;
    } else if (this.isCrouching) {
      targetH = this.crouchHeight;
    }

    const ceilingH = (this.world && this.world.data && this.world.data.ceilingHeight)
      ? this.world.data.ceilingHeight
      : 5.0;
    const currentFloorY = (this.world && this.world.getFloorHeightAt)
      ? this.world.getFloorHeightAt(this.position)
      : 0;

    // Prevent uncrouching if player is beneath a low ceiling
    if (targetH > this.currentHeight && (currentFloorY + targetH) > (ceilingH - 0.25)) {
      targetH = this.currentHeight;
    }

    this.currentHeight = THREE.MathUtils.lerp(
      this.currentHeight,
      targetH,
      Math.min(1.0, deltaTime * 14.0)
    );
    this.height = this.currentHeight;

    // 5. Update Position with Axis-Separated Collision Resolution
    this.position.x += this.velocity.x * deltaTime;
    if (this.world.resolveAxisCollision) {
      this.world.resolveAxisCollision(this.position, this.radius, 'x');
    }

    this.position.z += this.velocity.z * deltaTime;
    if (this.world.resolveAxisCollision) {
      this.world.resolveAxisCollision(this.position, this.radius, 'z');
    }

    // Vertical step, ground check and ceiling collision clamp
    this.position.y += this.velocity.y * deltaTime;
    const targetGroundY = currentFloorY + this.height;

    const maxHeadY = ceilingH - 0.25;
    if (this.position.y > maxHeadY) {
      this.position.y = maxHeadY;
      this.velocity.y = Math.min(0, this.velocity.y);
    }

    if (this.velocity.y <= 0) {
      if (this.position.y <= targetGroundY) {
        this.position.y = targetGroundY;
        this.velocity.y = 0;
        this.isGrounded = true;
      } else if (this.isGrounded && (this.position.y - targetGroundY) <= 0.35) {
        // Player is smoothly crouching, sliding, or stepping down while grounded
        this.position.y = targetGroundY;
        this.velocity.y = 0;
        this.isGrounded = true;
      } else {
        this.isGrounded = false;
      }
    } else {
      this.isGrounded = false;
    }

    // 6. Head Bobbing
    let bobOffset = 0;
    if (isMoving && this.isGrounded && !this.isSliding) {
      const isSprinting = this.input.isSprinting();
      this.bobTimer += deltaTime * (isSprinting ? this.bobSpeed * 1.3 : this.bobSpeed);
      bobOffset = Math.sin(this.bobTimer) * (this.isCrouching ? this.bobIntensity * 0.5 : this.bobIntensity);
    } else {
      this.bobTimer = 0;
    }

    // 7. Camera Position & Dynamic Transforms
    this.currentSlideRoll = THREE.MathUtils.lerp(
      this.currentSlideRoll,
      this.slideRoll,
      Math.min(1.0, deltaTime * 16.0)
    );

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
    this.camera.rotation.z = this.currentSlideRoll;
  }
}
