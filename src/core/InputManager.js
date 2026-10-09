/**
 * InputManager Module
 * Handles unified input across PC (Pointer Lock + Keyboard + Mouse)
 * and Mobile (Virtual Joystick + Touch Look + On-screen buttons).
 */
export class InputManager {
  constructor(canvasElement, hudElement) {
    this.canvas = canvasElement;
    this.hud = hudElement;

    // Movement & action keys
    this.keys = {
      KeyW: false,
      KeyA: false,
      KeyS: false,
      KeyD: false,
      ArrowUp: false,
      ArrowDown: false,
      ArrowLeft: false,
      ArrowRight: false,
      ShiftLeft: false,
      ShiftRight: false,
      KeyR: false,
      KeyG: false,
      KeyE: false,
      Digit1: false,
      Digit2: false,
      Digit3: false,
      Space: false,
      KeyC: false,
      ControlLeft: false,
      ControlRight: false,
    };

    // Crouch & Slide state
    this.crouchActive = false;
    this.crouchKeyDownTime = 0;
    this.slideRequested = false;

    // Virtual joystick state
    this.joystick = {
      active: false,
      touchId: null,
      startX: 0,
      startY: 0,
      currentX: 0,
      currentY: 0,
      deltaX: 0,
      deltaY: 0,
      maxRadius: 45
    };

    // Touch look state
    this.touchLook = {
      active: false,
      touchId: null,
      lastX: 0,
      lastY: 0,
      deltaX: 0,
      deltaY: 0
    };

    // Pointer lock mouse deltas
    this.mouseDelta = { x: 0, y: 0 };
    this.isPointerLocked = false;

    // Actions
    this.isMouseDown = false;
    this.isTouchFiring = false;
    this.triggerJustPressed = false;
    this.isSprintPressed = false;
    this.isSprintToggledMobile = false;

    // Queued one-shot events
    this.reloadRequested = false;
    this.grenadeRequested = false;
    this.interactRequested = false;
    this.jumpRequested = false;
    this.requestedSlot = null; // 0, 1, or 2

    // Sensitivity configuration & saved preferences
    this.baseMouseSensitivity = 0.0022;
    this.baseTouchSensitivity = 0.0038;

    const savedMouseMult = parseFloat(localStorage.getItem('kattaikonam_mouse_sens') || '1.0');
    const savedTouchMult = parseFloat(localStorage.getItem('kattaikonam_touch_sens') || '1.0');

    this.mouseSensitivity = this.baseMouseSensitivity * (isNaN(savedMouseMult) ? 1.0 : savedMouseMult);
    this.touchSensitivity = this.baseTouchSensitivity * (isNaN(savedTouchMult) ? 1.0 : savedTouchMult);

    // Detect if device supports touch
    this.isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

    this.initKeyboard();
    this.initPointerLock();
    this.initMobileControls();
  }

  setMouseSensitivityMultiplier(mult) {
    this.mouseSensitivity = this.baseMouseSensitivity * mult;
    try { localStorage.setItem('kattaikonam_mouse_sens', mult.toString()); } catch (e) {}
  }

  setTouchSensitivityMultiplier(mult) {
    this.touchSensitivity = this.baseTouchSensitivity * mult;
    try { localStorage.setItem('kattaikonam_touch_sens', mult.toString()); } catch (e) {}
  }

  getCurrentSensitivityMultiplier() {
    if (this.isTouchDevice) {
      return this.touchSensitivity / this.baseTouchSensitivity;
    }
    return this.mouseSensitivity / this.baseMouseSensitivity;
  }

  setSensitivityMultiplier(mult) {
    if (this.isTouchDevice) {
      this.setTouchSensitivityMultiplier(mult);
    } else {
      this.setMouseSensitivityMultiplier(mult);
    }
  }

  initKeyboard() {
    window.addEventListener('keydown', (e) => {
      if (this.keys.hasOwnProperty(e.code)) {
        this.keys[e.code] = true;
      }

      if (e.code === 'KeyP') {
        if (this.onPauseRequested) {
          this.onPauseRequested();
        }
      } else if (e.code === 'Space') {
        this.jumpRequested = true;
      } else if (e.code === 'KeyR') {
        this.reloadRequested = true;
      } else if (e.code === 'KeyG') {
        this.grenadeRequested = true;
      } else if (e.code === 'KeyE') {
        this.interactRequested = true;
      } else if (e.code === 'Digit1' || e.code === 'Numpad1') {
        this.requestedSlot = 0;
      } else if (e.code === 'Digit2' || e.code === 'Numpad2') {
        this.requestedSlot = 1;
      } else if (e.code === 'Digit3' || e.code === 'Numpad3') {
        this.requestedSlot = 2;
      } else if (e.code === 'KeyC') {
        this.crouchKeyDownTime = performance.now();
        this.crouchActive = !this.crouchActive;
      } else if (e.code === 'ControlLeft' || e.code === 'ControlRight') {
        this.slideRequested = true;
        if (e.cancelable && this.isPointerLocked) {
          e.preventDefault();
        }
      }

      // Jumping or sprinting automatically stands up from crouch
      if (e.code === 'Space' || e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.crouchActive = false;
      }
    });

    window.addEventListener('keyup', (e) => {
      if (this.keys.hasOwnProperty(e.code)) {
        this.keys[e.code] = false;
      }

      if (e.code === 'KeyC') {
        const heldTime = performance.now() - (this.crouchKeyDownTime || 0);
        // If held for over 220ms, release crouch on keyup (hold-to-crouch behavior)
        if (heldTime > 220) {
          this.crouchActive = false;
        }
      }
    });

    window.addEventListener('mousedown', (e) => {
      if (e.button === 0 && this.isPointerLocked) {
        this.isMouseDown = true;
        this.triggerJustPressed = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) {
        this.isMouseDown = false;
      }
    });
  }

  initPointerLock() {
    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.canvas;
      if (!this.isPointerLocked) {
        this.isMouseDown = false;
      }
    });

    document.addEventListener('mousemove', (e) => {
      if (this.isPointerLocked) {
        this.mouseDelta.x += e.movementX;
        this.mouseDelta.y += e.movementY;
      }
    });
  }

  requestPointerLock() {
    if (!this.isPointerLocked && !this.isTouchDevice) {
      try {
        const promise = this.canvas.requestPointerLock();
        if (promise && typeof promise.catch === 'function') {
          promise.catch((err) => {
            console.debug('[InputManager] Pointer lock rejected:', err);
          });
        }
      } catch (err) {
        console.warn('[InputManager] Pointer lock request error:', err);
      }
    }
  }

  initMobileControls() {
    const joystickZone = document.getElementById('joystick-zone');
    const joystickThumb = document.getElementById('joystick-thumb');
    const lookZone = document.getElementById('touch-look-zone');
    const btnFire = document.getElementById('btn-mobile-fire');
    const btnReload = document.getElementById('btn-mobile-reload');
    const btnSprint = document.getElementById('btn-mobile-sprint');
    const btnCrouch = document.getElementById('btn-mobile-crouch');
    const btnJump = document.getElementById('btn-mobile-jump');
    const btnGrenade = document.getElementById('btn-mobile-grenade');
    const btnInteract = document.getElementById('btn-mobile-interact');

    // 1. Joystick handling
    if (joystickZone) {
      const handleJoystickStart = (e) => {
        e.preventDefault();
        const touch = e.changedTouches[0];
        const rect = joystickZone.getBoundingClientRect();
        this.joystick.active = true;
        this.joystick.touchId = touch.identifier;
        this.joystick.startX = rect.left + rect.width / 2;
        this.joystick.startY = rect.top + rect.height / 2;
        this.joystick.currentX = touch.clientX;
        this.joystick.currentY = touch.clientY;
        this.updateJoystickThumb(joystickThumb);
      };

      const handleJoystickMove = (e) => {
        if (!this.joystick.active) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === this.joystick.touchId) {
            this.joystick.currentX = touch.clientX;
            this.joystick.currentY = touch.clientY;
            this.updateJoystickThumb(joystickThumb);
            break;
          }
        }
      };

      const handleJoystickEnd = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.joystick.touchId) {
            this.joystick.active = false;
            this.joystick.touchId = null;
            this.joystick.deltaX = 0;
            this.joystick.deltaY = 0;
            if (joystickThumb) {
              joystickThumb.style.transform = `translate(0px, 0px)`;
            }
            break;
          }
        }
      };

      joystickZone.addEventListener('touchstart', handleJoystickStart, { passive: false });
      window.addEventListener('touchmove', handleJoystickMove, { passive: false });
      window.addEventListener('touchend', handleJoystickEnd, { passive: false });
      window.addEventListener('touchcancel', handleJoystickEnd, { passive: false });
    }

    // 2. Right-side touch look
    if (lookZone) {
      lookZone.addEventListener('touchstart', (e) => {
        if (e.target && e.target.closest && (e.target.closest('#hud') || e.target.closest('.inventory-slot'))) {
          return;
        }
        const touch = e.changedTouches[0];
        if (!this.touchLook.active) {
          this.touchLook.active = true;
          this.touchLook.touchId = touch.identifier;
          this.touchLook.lastX = touch.clientX;
          this.touchLook.lastY = touch.clientY;
        }
      }, { passive: true });

      window.addEventListener('touchmove', (e) => {
        if (!this.touchLook.active) return;
        for (let i = 0; i < e.changedTouches.length; i++) {
          const touch = e.changedTouches[i];
          if (touch.identifier === this.touchLook.touchId) {
            this.touchLook.deltaX += touch.clientX - this.touchLook.lastX;
            this.touchLook.deltaY += touch.clientY - this.touchLook.lastY;
            this.touchLook.lastX = touch.clientX;
            this.touchLook.lastY = touch.clientY;
            break;
          }
        }
      }, { passive: true });

      const endLook = (e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
          if (e.changedTouches[i].identifier === this.touchLook.touchId) {
            this.touchLook.active = false;
            this.touchLook.touchId = null;
            break;
          }
        }
      };
      window.addEventListener('touchend', endLook, { passive: true });
      window.addEventListener('touchcancel', endLook, { passive: true });
    }

    // 3. Fire button (hold to fire auto, taps for semi-auto)
    if (btnFire) {
      btnFire.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.isTouchFiring = true;
        this.triggerJustPressed = true;
      }, { passive: false });

      const stopFire = () => {
        this.isTouchFiring = false;
      };
      btnFire.addEventListener('touchend', stopFire);
      btnFire.addEventListener('touchcancel', stopFire);
    }

    // 4. Reload button
    if (btnReload) {
      btnReload.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.reloadRequested = true;
      }, { passive: false });
    }

    // 5. Sprint button
    if (btnSprint) {
      btnSprint.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.isSprintToggledMobile = !this.isSprintToggledMobile;
        btnSprint.classList.toggle('active', this.isSprintToggledMobile);
      }, { passive: false });
    }

    // 5b. Crouch / Slide button
    if (btnCrouch) {
      btnCrouch.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (this.isSprinting()) {
          this.slideRequested = true;
        } else {
          this.crouchActive = !this.crouchActive;
          btnCrouch.classList.toggle('active', this.crouchActive);
        }
      }, { passive: false });
    }

    // 5b. Jump button
    if (btnJump) {
      btnJump.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.jumpRequested = true;
      }, { passive: false });
    }

    // 6. Grenade button
    if (btnGrenade) {
      btnGrenade.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.grenadeRequested = true;
      }, { passive: false });
    }

    // 7. Interact button
    if (btnInteract) {
      btnInteract.addEventListener('touchstart', (e) => {
        e.preventDefault();
        this.interactRequested = true;
      }, { passive: false });
    }
  }

  updateJoystickThumb(thumbEl) {
    let dx = this.joystick.currentX - this.joystick.startX;
    let dy = this.joystick.currentY - this.joystick.startY;
    const distance = Math.hypot(dx, dy);

    if (distance > this.joystick.maxRadius) {
      const angle = Math.atan2(dy, dx);
      dx = Math.cos(angle) * this.joystick.maxRadius;
      dy = Math.sin(angle) * this.joystick.maxRadius;
    }

    if (thumbEl) {
      thumbEl.style.transform = `translate(${dx}px, ${dy}px)`;
    }

    // Normalize -1.0 to 1.0
    this.joystick.deltaX = dx / this.joystick.maxRadius;
    this.joystick.deltaY = dy / this.joystick.maxRadius;
  }

  /**
   * Returns normalized movement vector: x (lateral), z (forward/back)
   */
  getMoveVector() {
    let moveX = 0;
    let moveZ = 0;

    // Keyboard WASD / Arrows
    if (this.keys.KeyW || this.keys.ArrowUp) moveZ -= 1;
    if (this.keys.KeyS || this.keys.ArrowDown) moveZ += 1;
    if (this.keys.KeyA || this.keys.ArrowLeft) moveX -= 1;
    if (this.keys.KeyD || this.keys.ArrowRight) moveX += 1;

    // Mobile virtual joystick input
    if (this.joystick.active) {
      moveX += this.joystick.deltaX;
      moveZ += this.joystick.deltaY;
    }

    // Clamp or normalize to prevent faster diagonal walking
    const length = Math.hypot(moveX, moveZ);
    if (length > 1) {
      moveX /= length;
      moveZ /= length;
    }

    return { x: moveX, z: moveZ };
  }

  /**
   * Returns look deltas in radians and resets accumulator
   */
  getLookDelta() {
    let yaw = 0;
    let pitch = 0;

    // Mouse movement
    if (this.mouseDelta.x !== 0 || this.mouseDelta.y !== 0) {
      yaw -= this.mouseDelta.x * this.mouseSensitivity;
      pitch -= this.mouseDelta.y * this.mouseSensitivity;
      this.mouseDelta.x = 0;
      this.mouseDelta.y = 0;
    }

    // Touch look movement
    if (this.touchLook.deltaX !== 0 || this.touchLook.deltaY !== 0) {
      yaw -= this.touchLook.deltaX * this.touchSensitivity;
      pitch -= this.touchLook.deltaY * this.touchSensitivity;
      this.touchLook.deltaX = 0;
      this.touchLook.deltaY = 0;
    }

    return { yaw, pitch };
  }

  isFiring() {
    return this.isMouseDown || this.isTouchFiring;
  }

  /**
   * Consumes single click/tap event for semi-automatic weapon or item use
   */
  checkAndConsumeTrigger() {
    if (this.triggerJustPressed) {
      this.triggerJustPressed = false;
      return true;
    }
    return false;
  }

  isSprinting() {
    return this.keys.ShiftLeft || this.keys.ShiftRight || this.isSprintToggledMobile;
  }

  checkAndConsumeReload() {
    if (this.reloadRequested) {
      this.reloadRequested = false;
      return true;
    }
    return false;
  }

  checkAndConsumeGrenade() {
    if (this.grenadeRequested) {
      this.grenadeRequested = false;
      return true;
    }
    return false;
  }

  checkAndConsumeInteract() {
    if (this.interactRequested) {
      this.interactRequested = false;
      return true;
    }
    return false;
  }

  checkAndConsumeJump() {
    if (this.jumpRequested) {
      this.jumpRequested = false;
      return true;
    }
    return false;
  }

  checkAndConsumeSlotChange() {
    if (this.requestedSlot !== null) {
      const slot = this.requestedSlot;
      this.requestedSlot = null;
      return slot;
    }
    return null;
  }

  requestSlot(slotIndex) {
    this.requestedSlot = slotIndex;
  }

  isCrouching() {
    return this.crouchActive;
  }

  setCrouching(crouching) {
    this.crouchActive = !!crouching;
    const btnCrouch = document.getElementById('btn-mobile-crouch');
    if (btnCrouch) {
      btnCrouch.classList.toggle('active', this.crouchActive);
    }
  }

  checkAndConsumeSlide() {
    if (this.slideRequested) {
      this.slideRequested = false;
      return true;
    }
    return false;
  }
}
