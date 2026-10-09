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
  constructor(gameState, input, audio = null) {
    this.gameState = gameState;
    this.input = input;
    this.audio = audio;
    this.previousState = STATES.MENU;

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

    // Intro Screen Presentation Elements
    this.introScreen = document.getElementById('intro-screen');
    this.introLoadingFill = document.getElementById('intro-loading-fill');
    this.introLoadingStatus = document.getElementById('intro-loading-status');
    this.btnIntroContinue = document.getElementById('btn-intro-continue');

    // Overlays & Header (blasting.png title logo)
    this.screenOverlay = document.getElementById('game-overlay');
    this.menuTitleImg = document.getElementById('menu-title-img');
    this.overlayTitle = document.getElementById('overlay-title');
    this.overlaySubtitle = document.getElementById('overlay-subtitle');

    // Menu Views
    this.mainMenuView = document.getElementById('main-menu-view');
    this.pauseMenuView = document.getElementById('pause-menu-view');
    this.gameoverMenuView = document.getElementById('gameover-menu-view');
    this.optionsView = document.getElementById('options-view');
    this.creditsView = document.getElementById('credits-view');

    // Main Menu Buttons
    this.btnMenuContinue = document.getElementById('btn-menu-continue');
    this.btnMenuNewGame = document.getElementById('btn-menu-newgame');
    this.btnMenuOptions = document.getElementById('btn-menu-options');
    this.btnMenuCredits = document.getElementById('btn-menu-credits');

    // Pause Menu Buttons
    this.btnPauseResume = document.getElementById('btn-pause-resume');
    this.btnPauseOptions = document.getElementById('btn-pause-options');
    this.btnPauseMainMenu = document.getElementById('btn-pause-mainmenu');

    // Game Over Buttons
    this.btnGameoverRestart = document.getElementById('btn-gameover-restart');
    this.btnGameoverMainMenu = document.getElementById('btn-gameover-mainmenu');

    // Options Controls & Audio Toggles
    this.sliderSens = document.getElementById('slider-sensitivity');
    this.sensValDisplay = document.getElementById('sens-val-display');
    this.btnToggleBgm = document.getElementById('btn-toggle-bgm');
    this.btnToggleSfx = document.getElementById('btn-toggle-sfx');
    this.btnOptionsBack = document.getElementById('btn-options-back');
    this.cardPcControls = document.getElementById('card-pc-controls');
    this.cardMobileControls = document.getElementById('card-mobile-controls');
    this.photoUploadSection = document.getElementById('photo-upload-section');

    // Credits Elements
    this.creditsTextEl = document.getElementById('credits-text-content');
    this.btnCreditsBack = document.getElementById('btn-credits-back');

    // Photo Upload Elements
    this.photoInput = document.getElementById('enemy-photo-input');
    this.uploadStatusEl = document.getElementById('upload-status');
    this.rosterPreviewEl = document.getElementById('roster-preview');

    // Mobile controls container & pause
    this.mobileControlsEl = document.getElementById('mobile-controls');
    this.btnMobilePause = document.getElementById('btn-mobile-pause');

    this.hitmarkerTimer = 0;
    this.notificationTimer = 0;

    this.initEvents();
    this.initSlotClickHandlers();
    this.initSettings();
    this.initMobilePause();
    this.initPhotoUpload();
    this.renderRosterPreview();
    this.checkMobileVisibility();
    this.updateControlsCardVisibility();
    this.loadCredits();
    this.updateAudioButtons();
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
    if (this.input.isTouchDevice) {
      if (this.mobileControlsEl) {
        this.mobileControlsEl.classList.remove('hidden');
      }
      if (this.btnMobilePause) {
        this.btnMobilePause.style.display = 'flex';
      }
    } else {
      if (this.btnMobilePause) {
        this.btnMobilePause.style.display = 'none';
      }
    }
  }

  initSettings() {
    if (!this.sliderSens) return;
    const currentMult = this.input.getCurrentSensitivityMultiplier ? this.input.getCurrentSensitivityMultiplier() : 1.0;
    this.sliderSens.value = currentMult.toFixed(1);
    if (this.sensValDisplay) {
      this.sensValDisplay.textContent = `${parseFloat(currentMult).toFixed(1)}x`;
    }

    this.sliderSens.addEventListener('input', (e) => {
      const mult = parseFloat(e.target.value);
      if (this.input.setSensitivityMultiplier) {
        this.input.setSensitivityMultiplier(mult);
      }
      if (this.sensValDisplay) {
        this.sensValDisplay.textContent = `${mult.toFixed(1)}x`;
      }
    });
  }

  initMobilePause() {
    if (!this.btnMobilePause) return;
    const handlePause = (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (this.gameState.current === STATES.PLAYING) {
        this.gameState.setState(STATES.PAUSED);
      }
    };
    this.btnMobilePause.addEventListener('pointerdown', handlePause);
    this.btnMobilePause.addEventListener('click', handlePause);
  }

  updateControlsCardVisibility() {
    // On PC, dont display mobile controls and on mobile, dont display pc controls
    if (this.input.isTouchDevice) {
      if (this.cardMobileControls) this.cardMobileControls.classList.remove('hidden');
      if (this.cardPcControls) this.cardPcControls.classList.add('hidden');
    } else {
      if (this.cardPcControls) this.cardPcControls.classList.remove('hidden');
      if (this.cardMobileControls) this.cardMobileControls.classList.add('hidden');
    }
  }

  initSlotClickHandlers() {
    // Clicking or tapping HUD slots, gun name, or gun image switches weapon/item instantly
    this.slotEls.forEach((slotEl, idx) => {
      if (!slotEl) return;
      const select = (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.input.requestSlot(idx);
      };
      // Register pointerdown and touchstart for zero-latency tap response on phones
      slotEl.addEventListener('pointerdown', select);
      slotEl.addEventListener('touchstart', select, { passive: false });
      slotEl.addEventListener('click', select);
    });
  }

  initEvents() {
    this.gameState.on('stateChange', ({ newState }) => {
      this.onStateChange(newState);
    });

    // 1. Main Menu Buttons
    if (this.btnMenuContinue) {
      this.btnMenuContinue.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!this.gameState.hasActiveSession) return;
        this.requestFullscreen();
        if (this.audio) this.audio.ensureContext();
        this.gameState.setState(STATES.PLAYING);
        this.input.requestPointerLock();
      });
    }

    if (this.btnMenuNewGame) {
      this.btnMenuNewGame.addEventListener('click', (e) => {
        e.stopPropagation();
        this.requestFullscreen();
        if (this.audio) this.audio.ensureContext();
        this.gameState.emit('restartGame');
      });
    }

    if (this.btnMenuOptions) {
      this.btnMenuOptions.addEventListener('click', (e) => {
        e.stopPropagation();
        this.previousState = STATES.MENU;
        this.gameState.setState(STATES.OPTIONS);
      });
    }

    if (this.btnMenuCredits) {
      this.btnMenuCredits.addEventListener('click', (e) => {
        e.stopPropagation();
        this.previousState = STATES.MENU;
        this.gameState.setState(STATES.CREDITS);
      });
    }

    // 2. Pause Menu Buttons
    if (this.btnPauseResume) {
      this.btnPauseResume.addEventListener('click', (e) => {
        e.stopPropagation();
        this.requestFullscreen();
        if (this.audio) this.audio.ensureContext();
        this.gameState.setState(STATES.PLAYING);
        this.input.requestPointerLock();
      });
    }

    if (this.btnPauseOptions) {
      this.btnPauseOptions.addEventListener('click', (e) => {
        e.stopPropagation();
        this.previousState = STATES.PAUSED;
        this.gameState.setState(STATES.OPTIONS);
      });
    }

    if (this.btnPauseMainMenu) {
      this.btnPauseMainMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        this.gameState.setState(STATES.MENU);
      });
    }

    // 3. Game Over / Victory Buttons
    if (this.btnGameoverRestart) {
      this.btnGameoverRestart.addEventListener('click', (e) => {
        e.stopPropagation();
        this.requestFullscreen();
        if (this.audio) this.audio.ensureContext();
        this.gameState.emit('restartGame');
      });
    }

    if (this.btnGameoverMainMenu) {
      this.btnGameoverMainMenu.addEventListener('click', (e) => {
        e.stopPropagation();
        this.gameState.setState(STATES.MENU);
      });
    }

    // 4. Options View Buttons & Toggles
    if (this.btnOptionsBack) {
      this.btnOptionsBack.addEventListener('click', (e) => {
        e.stopPropagation();
        this.gameState.setState(this.previousState || STATES.MENU);
      });
    }

    if (this.btnToggleBgm) {
      this.btnToggleBgm.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.audio) {
          this.audio.toggleBGM();
          this.updateAudioButtons();
        }
      });
    }

    if (this.btnToggleSfx) {
      this.btnToggleSfx.addEventListener('click', (e) => {
        e.stopPropagation();
        if (this.audio) {
          this.audio.toggleSFX();
          this.updateAudioButtons();
        }
      });
    }

    // 5. Credits View Buttons
    if (this.btnCreditsBack) {
      this.btnCreditsBack.addEventListener('click', (e) => {
        e.stopPropagation();
        this.gameState.setState(STATES.MENU);
      });
    }

    // 6. Keyboard shortcuts (Enter / Space to play or resume)
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Enter' || e.code === 'Space' || e.key === 'Enter') {
        if (this.gameState.current === STATES.MENU) {
          if (this.gameState.hasActiveSession) {
            this.requestFullscreen();
            this.gameState.setState(STATES.PLAYING);
            this.input.requestPointerLock();
          } else {
            this.requestFullscreen();
            this.gameState.emit('restartGame');
          }
        } else if (this.gameState.current === STATES.PAUSED) {
          this.requestFullscreen();
          this.gameState.setState(STATES.PLAYING);
          this.input.requestPointerLock();
        } else if (this.gameState.current === STATES.GAME_OVER || this.gameState.current === STATES.VICTORY) {
          this.requestFullscreen();
          this.gameState.emit('restartGame');
        }
      }
    });
  }

  updateAudioButtons() {
    if (this.btnToggleBgm && this.audio) {
      const on = !this.audio.bgmMuted;
      this.btnToggleBgm.textContent = on ? '🎵 MUSIC: ON' : '🎵 MUSIC: OFF';
      this.btnToggleBgm.style.borderColor = on ? '#2ecc71' : '#7f8c8d';
      this.btnToggleBgm.style.color = on ? '#a3f7bf' : '#bdc3c7';
    }
    if (this.btnToggleSfx && this.audio) {
      const on = !this.audio.sfxMuted;
      this.btnToggleSfx.textContent = on ? '🔊 SOUND: ON' : '🔊 SOUND: OFF';
      this.btnToggleSfx.style.borderColor = on ? '#2ecc71' : '#7f8c8d';
      this.btnToggleSfx.style.color = on ? '#a3f7bf' : '#bdc3c7';
    }
  }

  async loadCredits() {
    const fallback = `Special Thanks: YOU!
Thanks for Playing! <3
Lead Developer: Pinky
Creative Head: Dip-u
Gameplay Music: Alex Morgan
Assets: Magnify, Pixaby
Created by Abhishek U and Devkrishna Dipu
Coded by Gemini 3.8 Flash`;

    try {
      const res = await fetch('./credits.txt');
      if (res.ok) {
        const text = await res.text();
        if (this.creditsTextEl && text.trim().length > 0) {
          this.creditsTextEl.textContent = text.trim();
          return;
        }
      }
    } catch (e) {}

    if (this.creditsTextEl) {
      this.creditsTextEl.textContent = fallback;
    }
  }

  updateIntroLoading(progress, message) {
    if (this.introLoadingFill) {
      this.introLoadingFill.style.width = `${Math.min(100, Math.round(progress * 100))}%`;
    }
    if (this.introLoadingStatus && message) {
      this.introLoadingStatus.textContent = message;
    }
  }

  finishIntroLoading(onComplete) {
    if (this.introLoadingFill) {
      this.introLoadingFill.style.width = '100%';
    }
    if (this.introLoadingStatus) {
      this.introLoadingStatus.textContent = 'CAMPUS SYSTEMS READY. CLICK OR PRESS ANY KEY';
    }
    if (this.btnIntroContinue) {
      this.btnIntroContinue.classList.remove('hidden');
    }

    let transitioned = false;
    const proceed = (e) => {
      if (transitioned) return;
      transitioned = true;
      if (e) {
        e.preventDefault();
        e.stopPropagation();
      }
      this.requestFullscreen();
      if (this.audio) this.audio.ensureContext();

      if (this.introScreen) {
        this.introScreen.classList.add('fade-out');
        setTimeout(() => {
          this.introScreen.classList.add('hidden');
          this.introScreen.classList.remove('fade-out');
          if (onComplete) onComplete();
        }, 350);
      } else {
        if (onComplete) onComplete();
      }

      window.removeEventListener('keydown', keyProceed);
      if (this.introScreen) {
        this.introScreen.removeEventListener('click', proceed);
      }
      if (this.btnIntroContinue) {
        this.btnIntroContinue.removeEventListener('click', proceed);
      }
    };
    const keyProceed = (e) => {
      proceed(e);
    };

    if (this.btnIntroContinue) {
      this.btnIntroContinue.addEventListener('click', proceed);
    }
    if (this.introScreen) {
      this.introScreen.addEventListener('click', proceed);
    }
    window.addEventListener('keydown', keyProceed);
  }

  hideAllViews() {
    if (this.mainMenuView) this.mainMenuView.classList.add('hidden');
    if (this.pauseMenuView) this.pauseMenuView.classList.add('hidden');
    if (this.gameoverMenuView) this.gameoverMenuView.classList.add('hidden');
    if (this.optionsView) this.optionsView.classList.add('hidden');
    if (this.creditsView) this.creditsView.classList.add('hidden');
  }

  onStateChange(state) {
    this.updateControlsCardVisibility();

    if (state === STATES.INTRO) {
      if (this.introScreen) this.introScreen.classList.remove('hidden');
      if (this.screenOverlay) this.screenOverlay.classList.add('hidden');
      if (this.btnMobilePause) this.btnMobilePause.style.display = 'none';
      return;
    }

    if (this.introScreen) {
      this.introScreen.classList.add('hidden');
    }

    if (state === STATES.PLAYING) {
      if (this.screenOverlay) this.screenOverlay.classList.add('hidden');
      if (this.btnMobilePause && this.input.isTouchDevice) {
        this.btnMobilePause.style.display = 'flex';
      }
      return;
    }

    if (this.screenOverlay) {
      this.screenOverlay.classList.remove('hidden');
    }
    if (this.btnMobilePause) {
      this.btnMobilePause.style.display = 'none';
    }

    this.hideAllViews();

    if (state === STATES.MENU) {
      if (this.mainMenuView) this.mainMenuView.classList.remove('hidden');
      if (this.menuTitleImg) this.menuTitleImg.classList.remove('hidden');
      if (this.overlayTitle) this.overlayTitle.classList.add('hidden');
      if (this.overlaySubtitle) {
        this.overlaySubtitle.textContent = 'FLOOR 1 - RETRO SCHOOL FPS';
      }
      if (this.btnMenuContinue) {
        if (this.gameState.hasActiveSession) {
          this.btnMenuContinue.classList.remove('disabled');
        } else {
          this.btnMenuContinue.classList.add('disabled');
        }
      }
    } else if (state === STATES.PAUSED) {
      if (this.pauseMenuView) this.pauseMenuView.classList.remove('hidden');
      if (this.menuTitleImg) this.menuTitleImg.classList.remove('hidden');
      if (this.overlayTitle) {
        this.overlayTitle.classList.remove('hidden');
        this.overlayTitle.textContent = 'GAME PAUSED';
      }
      if (this.overlaySubtitle) {
        this.overlaySubtitle.textContent = 'Adjust turn sensitivity & review controls';
      }
    } else if (state === STATES.GAME_OVER) {
      if (this.gameoverMenuView) this.gameoverMenuView.classList.remove('hidden');
      if (this.menuTitleImg) this.menuTitleImg.classList.remove('hidden');
      if (this.overlayTitle) {
        this.overlayTitle.classList.remove('hidden');
        this.overlayTitle.textContent = 'DETENTION! YOU FAILED!';
      }
      if (this.overlaySubtitle) {
        this.overlaySubtitle.textContent = 'Expelled by the campus patrol.';
      }
      if (this.btnGameoverRestart) {
        this.btnGameoverRestart.textContent = '🔄 TRY AGAIN';
      }
    } else if (state === STATES.VICTORY) {
      if (this.gameoverMenuView) this.gameoverMenuView.classList.remove('hidden');
      if (this.menuTitleImg) this.menuTitleImg.classList.remove('hidden');
      if (this.overlayTitle) {
        this.overlayTitle.classList.remove('hidden');
        this.overlayTitle.textContent = 'CAMPUS CLEARED!';
      }
      if (this.overlaySubtitle) {
        this.overlaySubtitle.textContent = 'All enemies eliminated. Find the elevator to proceed!';
      }
      if (this.btnGameoverRestart) {
        this.btnGameoverRestart.textContent = '★ PLAY AGAIN';
      }
    } else if (state === STATES.OPTIONS) {
      if (this.optionsView) this.optionsView.classList.remove('hidden');
      if (this.menuTitleImg) this.menuTitleImg.classList.remove('hidden');
      if (this.overlayTitle) this.overlayTitle.classList.add('hidden');
      if (this.sliderSens && this.input.getCurrentSensitivityMultiplier) {
        const mult = this.input.getCurrentSensitivityMultiplier();
        this.sliderSens.value = mult.toFixed(1);
        if (this.sensValDisplay) {
          this.sensValDisplay.textContent = `${parseFloat(mult).toFixed(1)}x`;
        }
      }
      this.updateAudioButtons();
    } else if (state === STATES.CREDITS) {
      if (this.creditsView) this.creditsView.classList.remove('hidden');
      if (this.menuTitleImg) this.menuTitleImg.classList.remove('hidden');
      if (this.overlayTitle) this.overlayTitle.classList.add('hidden');
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

  /**
   * Triggers full-screen browser mode upon user interaction (Play / Try Again)
   */
  requestFullscreen() {
    try {
      const docEl = document.documentElement;
      const isFullscreen = document.fullscreenElement ||
                           document.webkitFullscreenElement ||
                           document.mozFullScreenElement ||
                           document.msFullscreenElement;

      if (!isFullscreen) {
        if (docEl.requestFullscreen) {
          docEl.requestFullscreen().catch(() => {});
        } else if (docEl.webkitRequestFullscreen) {
          docEl.webkitRequestFullscreen();
        } else if (docEl.mozRequestFullScreen) {
          docEl.mozRequestFullScreen();
        } else if (docEl.msRequestFullscreen) {
          docEl.msRequestFullscreen();
        }
      }
    } catch (err) {
      console.debug('[HUD] Fullscreen request prevented by browser policy:', err);
    }
  }
}
