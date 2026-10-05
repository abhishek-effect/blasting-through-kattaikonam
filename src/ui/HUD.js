/**
 * HUD Module
 * Manages the retro FPS bottom HUD:
 * - 3 inventory slots (Rifle, Pistol, Medkit) with active slot highlight
 * - Health and colored health bar
 * - Current weapon ammo
 * - Grenade count
 * - Crosshair and hitmarker
 * - Proximity interaction box (e.g. Elevator Photocopy prompt)
 * - Temporary action banners and notifications
 */
import { STATES } from '../core/GameState.js';
import {
  ASSET_PATHS,
  processUploadedImage,
  registerEnemyType,
  saveCustomEnemyToStorage,
  removeCustomEnemy
} from '../config/assets.js';

export class HUD {
  constructor(gameState, input) {
    this.gameState = gameState;
    this.input = input;

    // Elements
    this.healthEl = document.getElementById('hud-health-val');
    this.healthBarEl = document.getElementById('hud-health-bar');
    this.grenadeEl = document.getElementById('hud-grenade-val');
    this.reloadStatusEl = document.getElementById('hud-reload-status');
    this.notificationEl = document.getElementById('hud-notification');
    this.hitmarkerEl = document.getElementById('crosshair-hitmarker');
    this.damageVignetteEl = document.getElementById('damage-vignette');

    // Slot Elements
    this.slotEls = [
      document.getElementById('hud-slot-1'),
      document.getElementById('hud-slot-2'),
      document.getElementById('hud-slot-3'),
    ];
    this.slotAmmoEls = [
      document.getElementById('slot-1-ammo'),
      document.getElementById('slot-2-ammo'),
      document.getElementById('slot-3-ammo'),
    ];

    // Interaction Prompt
    this.interactionBox = document.getElementById('interaction-prompt');
    this.interactionTitle = document.getElementById('interaction-title');
    this.interactionSubtitle = document.getElementById('interaction-subtitle');

    // Overlays
    this.screenOverlay = document.getElementById('game-overlay');
    this.overlayTitle = document.getElementById('overlay-title');
    this.overlaySubtitle = document.getElementById('overlay-subtitle');
    this.btnStart = document.getElementById('btn-start-game');

    // Photo Upload Elements
    this.photoInput = document.getElementById('enemy-photo-input');
    this.uploadStatusEl = document.getElementById('upload-status');
    this.rosterPreviewEl = document.getElementById('roster-preview');

    // Mobile controls container
    this.mobileControlsEl = document.getElementById('mobile-controls');

    this.hitmarkerTimer = 0;
    this.notificationTimer = 0;

    this.initEvents();
    this.initSlotClickHandlers();
    this.initPhotoUpload();
    this.renderRosterPreview();
    this.checkMobileVisibility();
  }

  initPhotoUpload() {
    if (!this.photoInput) return;

    this.photoInput.addEventListener('change', async (e) => {
      const files = Array.from(e.target.files || []);
      if (files.length === 0) return;

      if (this.uploadStatusEl) {
        this.uploadStatusEl.textContent = `⏳ Processing ${files.length} photo(s)...`;
      }

      try {
        let addedCount = 0;
        for (const file of files) {
          const res = await processUploadedImage(file);
          registerEnemyType(res.id, res.name, res.dataUrl, { isCustom: true });
          saveCustomEnemyToStorage(res.id, res.name, res.dataUrl);
          addedCount++;
        }

        if (this.uploadStatusEl) {
          this.uploadStatusEl.textContent = `✅ Added ${addedCount} photo(s)! They will now spawn as enemies.`;
        }
        this.renderRosterPreview();
      } catch (err) {
        console.error('Error processing uploaded photos:', err);
        if (this.uploadStatusEl) {
          this.uploadStatusEl.textContent = '❌ Error loading photo. Please try a PNG or JPG.';
        }
      }

      // Reset input so same file can be chosen again if needed
      this.photoInput.value = '';
    });
  }

  renderRosterPreview() {
    if (!this.rosterPreviewEl) return;
    this.rosterPreviewEl.innerHTML = '';

    const types = ASSET_PATHS.enemies.types;
    const keys = Object.keys(types);

    if (keys.length === 0) {
      this.rosterPreviewEl.innerHTML = '<span style="font-size:11px;color:#888;">No enemies registered</span>';
      return;
    }

    keys.forEach((key) => {
      const enemy = types[key];
      const pill = document.createElement('div');
      pill.className = `roster-pill ${enemy.isCustom ? 'custom' : ''}`;

      const img = document.createElement('img');
      img.src = enemy.sprite;
      img.alt = enemy.name;
      img.onerror = () => { img.style.display = 'none'; };

      const nameSpan = document.createElement('span');
      nameSpan.textContent = enemy.name;

      pill.appendChild(img);
      pill.appendChild(nameSpan);

      // Allow clicking delete on custom enemies
      if (enemy.isCustom) {
        const delBtn = document.createElement('span');
        delBtn.textContent = ' ✕';
        delBtn.style.cursor = 'pointer';
        delBtn.style.color = '#ff6b6b';
        delBtn.title = 'Remove this custom enemy';
        delBtn.addEventListener('click', (ev) => {
          ev.stopPropagation();
          removeCustomEnemy(enemy.id);
          this.renderRosterPreview();
        });
        pill.appendChild(delBtn);
      }

      this.rosterPreviewEl.appendChild(pill);
    });
  }

  checkMobileVisibility() {
    if (this.input.isTouchDevice && this.mobileControlsEl) {
      this.mobileControlsEl.classList.remove('hidden');
    }
  }

  initSlotClickHandlers() {
    // Clicking or tapping HUD slots switches weapon/item
    this.slotEls.forEach((slotEl, idx) => {
      if (slotEl) {
        const select = (e) => {
          e.preventDefault();
          this.input.requestSlot(idx);
        };
        slotEl.addEventListener('click', select);
        slotEl.addEventListener('touchend', select);
      }
    });
  }

  initEvents() {
    this.gameState.on('stateChange', ({ newState }) => {
      this.onStateChange(newState);
    });

    const handleStart = (e) => {
      if (e) e.stopPropagation();

      if (this.screenOverlay) {
        this.screenOverlay.classList.add('hidden');
      }

      if (
        this.gameState.current === STATES.MENU ||
        this.gameState.current === STATES.GAME_OVER ||
        this.gameState.current === STATES.VICTORY
      ) {
        this.gameState.emit('restartGame');
      } else if (this.gameState.current === STATES.PAUSED) {
        this.gameState.setState(STATES.PLAYING);
        this.input.requestPointerLock();
      }
    };

    if (this.btnStart) {
      this.btnStart.addEventListener('click', handleStart);
      this.btnStart.addEventListener('touchend', (e) => {
        e.preventDefault();
        handleStart(e);
      });
    }

    // Support clicking anywhere on overlay to start/resume
    if (this.screenOverlay) {
      this.screenOverlay.addEventListener('click', (e) => {
        // If clicked on overlay background
        if (e.target === this.screenOverlay) {
          handleStart(e);
        }
      });
    }

    // Support keyboard Enter and Space keys to enter level / restart / resume
    window.addEventListener('keydown', (e) => {
      if (
        this.screenOverlay &&
        !this.screenOverlay.classList.contains('hidden') &&
        (e.code === 'Enter' || e.code === 'Space' || e.key === 'Enter' || e.key === ' ')
      ) {
        e.preventDefault();
        handleStart(e);
      }
    });
  }

  onStateChange(state) {
    if (!this.screenOverlay) return;

    if (state === STATES.PLAYING) {
      this.screenOverlay.classList.add('hidden');
    } else {
      this.screenOverlay.classList.remove('hidden');

      if (state === STATES.MENU) {
        this.overlayTitle.textContent = 'BLASTING THROUGH KATTAIKONAM';
        this.overlaySubtitle.textContent = 'FLOOR 1 - RETRO SCHOOL FPS';
        this.btnStart.textContent = 'ENTER LEVEL (CLICK TO PLAY)';
      } else if (state === STATES.GAME_OVER) {
        this.overlayTitle.textContent = 'DETENTION! YOU FAILED!';
        this.overlaySubtitle.textContent = 'Expelled by the campus patrol.';
        this.btnStart.textContent = 'TRY AGAIN';
      } else if (state === STATES.VICTORY) {
        this.overlayTitle.textContent = 'CAMPUS CLEARED!';
        this.overlaySubtitle.textContent = 'All enemies eliminated. Find the elevator to proceed!';
        this.btnStart.textContent = 'PLAY AGAIN';
      } else if (state === STATES.PAUSED) {
        this.overlayTitle.textContent = 'PAUSED';
        this.overlaySubtitle.textContent = 'Click to resume pointer lock';
        this.btnStart.textContent = 'RESUME';
      }
    }
  }

  triggerHitmarker() {
    if (this.hitmarkerEl) {
      this.hitmarkerEl.classList.add('active');
      this.hitmarkerTimer = 0.12;
    }
  }

  showNotification(text, duration = 2.5) {
    if (this.notificationEl) {
      this.notificationEl.textContent = text;
      this.notificationEl.style.display = 'block';
      this.notificationTimer = duration;
    }
  }

  updateInteractionPrompt(promptData) {
    if (!this.interactionBox) return;

    if (promptData && promptData.title) {
      this.interactionTitle.textContent = promptData.title;
      this.interactionSubtitle.textContent = promptData.subtitle;
      this.interactionBox.classList.remove('hidden');

      if (promptData.isLocked) {
        this.interactionBox.classList.add('locked');
      } else {
        this.interactionBox.classList.remove('locked');
      }
    } else {
      this.interactionBox.classList.add('hidden');
    }
  }

  update(deltaTime, player, grenadeManager) {
    // 1. Health
    if (this.healthEl && player) {
      const hp = Math.max(0, Math.round(player.health));
      this.healthEl.textContent = `${hp}%`;
      if (this.healthBarEl) {
        this.healthBarEl.style.width = `${hp}%`;
        if (hp > 50) {
          this.healthBarEl.style.backgroundColor = '#2ecc71';
        } else if (hp > 25) {
          this.healthBarEl.style.backgroundColor = '#f39c12';
        } else {
          this.healthBarEl.style.backgroundColor = '#e74c3c';
        }
      }
    }

    // 2. Grenade count
    if (this.grenadeEl && grenadeManager) {
      this.grenadeEl.textContent = `${grenadeManager.grenades} / ${grenadeManager.maxGrenades}`;
    }

    // 3. Inventory Slots & Current Item
    if (player && player.slots) {
      const activeIdx = player.activeSlotIndex;

      this.slotEls.forEach((slotEl, idx) => {
        if (!slotEl) return;
        if (idx === activeIdx) {
          slotEl.classList.add('active');
        } else {
          slotEl.classList.remove('active');
        }
      });

      // Update slot 1 ammo (Rifle)
      if (player.slots[0] && this.slotAmmoEls[0]) {
        this.slotAmmoEls[0].textContent = `${player.slots[0].ammoInMag}/${player.slots[0].reserveAmmo}`;
      }

      // Update slot 2 ammo (Pistol)
      if (player.slots[1] && this.slotAmmoEls[1]) {
        this.slotAmmoEls[1].textContent = `${player.slots[1].ammoInMag}/${player.slots[1].reserveAmmo}`;
      }

      // Update slot 3 count & cooldown (Medkit)
      if (player.slots[2] && this.slotAmmoEls[2]) {
        const medkit = player.slots[2];
        const status = medkit.isUsing ? 'USING...' : medkit.getCooldownText();
        this.slotAmmoEls[2].textContent = `x${medkit.count} (${status})`;
      }

      // Center alerts for active item
      const activeItem = player.getActiveItem();
      if (this.reloadStatusEl) {
        if (activeItem && activeItem.isReloading) {
          this.reloadStatusEl.textContent = 'RELOADING...';
          this.reloadStatusEl.style.display = 'block';
        } else if (activeItem && activeItem.ammoInMag === 0 && activeItem.type !== 'medkit') {
          this.reloadStatusEl.textContent = 'EMPTY - PRESS R / RELOAD';
          this.reloadStatusEl.style.display = 'block';
        } else if (activeItem && activeItem.type === 'medkit' && activeItem.isUsing) {
          this.reloadStatusEl.textContent = 'APPLYING FIRST AID...';
          this.reloadStatusEl.style.display = 'block';
        } else {
          this.reloadStatusEl.style.display = 'none';
        }
      }
    }

    // 4. Hitmarker timer
    if (this.hitmarkerTimer > 0) {
      this.hitmarkerTimer -= deltaTime;
      if (this.hitmarkerTimer <= 0 && this.hitmarkerEl) {
        this.hitmarkerEl.classList.remove('active');
      }
    }

    // 5. Temporary Notification Timer
    if (this.notificationTimer > 0) {
      this.notificationTimer -= deltaTime;
      if (this.notificationTimer <= 0 && this.notificationEl) {
        this.notificationEl.style.display = 'none';
      }
    }

    // 6. Damage Vignette Flash
    if (this.damageVignetteEl && player) {
      if (player.damageFlashTimer > 0) {
        this.damageVignetteEl.style.opacity = (player.damageFlashTimer / 0.25) * 0.7;
      } else {
        this.damageVignetteEl.style.opacity = '0';
      }
    }
  }
}
