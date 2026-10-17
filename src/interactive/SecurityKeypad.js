/**
 * SecurityKeypad Module
 * Implements the 4-digit security keypad puzzle for unlocking the Computer Lab.
 * Features:
 * - 4 distinct digits code (no repeating digits)
 * - 5 guess attempts before triggering a 30-second cooldown lockout
 * - Detailed feedback:
 *   - Green background on digit if correct position AND correct digit
 *   - Clear notification/amber styling if digit is included in the code but in the wrong position
 *   - Dark styling if digit is not in the code
 * - Digits cannot repeat within a guess
 * - Full mouse and keyboard numpad/digits integration
 */

export class SecurityKeypad {
  constructor(audio = null, onUnlocked = null) {
    this.audio = audio;
    this.onUnlocked = onUnlocked;

    this.isOpen = false;
    this.isUnlocked = false;
    this.secretCode = this.generateSecretCode();
    this.maxTries = 5;
    this.triesRemaining = 5;
    this.cooldownSeconds = 10;
    this.cooldownTimer = 0;
    this.cooldownInterval = null;

    this.currentDigits = [];
    this.history = [];

    this.modalEl = document.getElementById('security-keypad-modal');
    this.slotsContainer = document.getElementById('keypad-slots-container');
    this.triesEl = document.getElementById('keypad-tries-left');
    this.timerEl = document.getElementById('keypad-timer');
    this.feedbackEl = document.getElementById('keypad-feedback-msg');
    this.historyListEl = document.getElementById('keypad-history-list');
    this.btnClose = document.getElementById('keypad-btn-close');
    this.btnSubmit = document.getElementById('keypad-btn-submit');
    this.btnClear = document.getElementById('keypad-btn-clear');
    this.btnBack = document.getElementById('keypad-btn-back');

    this.initDOM();
  }

  generateSecretCode() {
    // Generate 4 distinct random digits (0-9)
    const digits = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    for (let i = digits.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [digits[i], digits[j]] = [digits[j], digits[i]];
    }
    const code = digits.slice(0, 4);
    return code;
  }

  initDOM() {
    if (!this.modalEl) return;

    if (this.btnClose) {
      this.btnClose.addEventListener('click', () => this.close());
    }

    if (this.btnClear) {
      this.btnClear.addEventListener('click', () => this.clearInput());
    }

    if (this.btnBack) {
      this.btnBack.addEventListener('click', () => this.deleteDigit());
    }

    if (this.btnSubmit) {
      this.btnSubmit.addEventListener('click', () => this.submitGuess());
    }

    // Number buttons 0-9
    const numButtons = this.modalEl.querySelectorAll('.keypad-num-btn');
    numButtons.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const val = parseInt(btn.getAttribute('data-val'), 10);
        if (!isNaN(val)) {
          this.enterDigit(val);
        }
      });
    });

    // Keyboard controls when modal is open
    window.addEventListener('keydown', (e) => {
      if (!this.isOpen) return;

      if (e.key >= '0' && e.key <= '9') {
        this.enterDigit(parseInt(e.key, 10));
        e.preventDefault();
      } else if (e.key === 'Backspace') {
        this.deleteDigit();
        e.preventDefault();
      } else if (e.key === 'Enter') {
        this.submitGuess();
        e.preventDefault();
      } else if (e.key === 'Escape') {
        this.close();
        e.preventDefault();
      }
    });
  }

  open() {
    if (this.isUnlocked) return;
    this.isOpen = true;
    if (this.modalEl) {
      this.modalEl.classList.remove('hidden');
    }
    if (document.exitPointerLock) {
      document.exitPointerLock();
    }
    this.updateDisplay();
  }

  close() {
    this.isOpen = false;
    if (this.modalEl) {
      this.modalEl.classList.add('hidden');
    }
    const canvas = document.getElementById('game-canvas');
    if (canvas && !this.isTouchDevice && window.__game && window.__game.input) {
      window.__game.input.requestPointerLock();
    }
  }

  enterDigit(num) {
    if (this.cooldownTimer > 0) return;
    if (this.currentDigits.length >= 4) return;

    // Rule: Digits should not repeat
    if (this.currentDigits.includes(num)) {
      this.setFeedback(`DIGIT ${num} IS ALREADY ENTERED! DIGITS CANNOT REPEAT.`, 'warning');
      return;
    }

    this.currentDigits.push(num);
    if (this.audio && this.audio.playJump) {
      this.audio.playJump();
    }
    this.setFeedback('ENTER 4-DIGIT ACCESS CODE', 'normal');
    this.updateDisplay();
  }

  deleteDigit() {
    if (this.cooldownTimer > 0) return;
    if (this.currentDigits.length > 0) {
      this.currentDigits.pop();
      this.updateDisplay();
    }
  }

  clearInput() {
    if (this.cooldownTimer > 0) return;
    this.currentDigits = [];
    this.updateDisplay();
  }

  submitGuess() {
    if (this.cooldownTimer > 0) return;

    if (this.currentDigits.length < 4) {
      this.setFeedback('CODE INCOMPLETE: ENTER ALL 4 DIGITS', 'warning');
      return;
    }

    const guess = [...this.currentDigits];
    const code = this.secretCode;

    // Evaluate feedback
    let correctCount = 0;
    const digitResults = [];
    const includedWrongPos = [];

    for (let i = 0; i < 4; i++) {
      const g = guess[i];
      if (g === code[i]) {
        digitResults.push({ digit: g, status: 'CORRECT' });
        correctCount++;
      } else if (code.includes(g)) {
        digitResults.push({ digit: g, status: 'IN_CODE' });
        includedWrongPos.push(g);
      } else {
        digitResults.push({ digit: g, status: 'WRONG' });
      }
    }

    // Save to history
    this.history.unshift({
      guess,
      results: digitResults,
      included: includedWrongPos,
      allCorrect: correctCount === 4
    });

    if (correctCount === 4) {
      // VICTORY!
      this.isUnlocked = true;
      this.setFeedback('ACCESS GRANTED! COMPUTER LAB UNLOCKED!', 'success');
      this.updateDisplay(true);

      if (this.audio && this.audio.playComboSound) {
        this.audio.playComboSound(2);
      }

      setTimeout(() => {
        this.close();
        if (this.onUnlocked) {
          this.onUnlocked();
        }
      }, 1200);
      return;
    }

    // Wrong guess
    this.triesRemaining--;
    this.currentDigits = [];

    if (this.triesRemaining <= 0) {
      // Start 30-second cooldown
      this.startCooldown();
    } else {
      let msg = `CODE INCORRECT! (${this.triesRemaining} TRIES LEFT)`;
      if (includedWrongPos.length > 0) {
        msg += ` | Digit${includedWrongPos.length > 1 ? 's' : ''} [${includedWrongPos.join(', ')}] in code but wrong position!`;
      }
      this.setFeedback(msg, 'error');
      this.updateDisplay();
    }
  }

  startCooldown() {
    this.cooldownTimer = this.cooldownSeconds;
    this.setFeedback(`SECURITY LOCKOUT: 0 TRIES LEFT. 10s COOLDOWN ACTIVE.`, 'error');
    this.updateDisplay();

    if (this.cooldownInterval) clearInterval(this.cooldownInterval);

    this.cooldownInterval = setInterval(() => {
      this.cooldownTimer--;
      if (this.cooldownTimer <= 0) {
        clearInterval(this.cooldownInterval);
        this.cooldownInterval = null;
        this.cooldownTimer = 0;
        this.triesRemaining = this.maxTries;
        this.setFeedback('SYSTEM RESET: 5 ATTEMPTS RESTORED. ENTER CODE.', 'normal');
        this.updateDisplay();
      } else {
        this.updateDisplay();
      }
    }, 1000);
  }

  setFeedback(msg, type = 'normal') {
    if (!this.feedbackEl) return;
    this.feedbackEl.textContent = msg;
    this.feedbackEl.className = `keypad-msg type-${type}`;
  }

  updateDisplay(isAllCorrect = false) {
    // 1. Update Slots
    if (this.slotsContainer) {
      const slotEls = this.slotsContainer.querySelectorAll('.keypad-digit-slot');
      slotEls.forEach((slot, idx) => {
        const val = this.currentDigits[idx];
        slot.textContent = val !== undefined ? val : '_';
        if (isAllCorrect) {
          slot.className = 'keypad-digit-slot correct-pos';
        } else {
          slot.className = val !== undefined ? 'keypad-digit-slot filled' : 'keypad-digit-slot';
        }
      });
    }

    // 2. Update Tries & Timer
    if (this.triesEl) {
      this.triesEl.textContent = `ATTEMPTS: ${this.triesRemaining} / ${this.maxTries}`;
    }

    if (this.timerEl) {
      if (this.cooldownTimer > 0) {
        this.timerEl.classList.remove('hidden');
        this.timerEl.textContent = `LOCKOUT: ${this.cooldownTimer}s`;
      } else {
        this.timerEl.classList.add('hidden');
      }
    }

    // 3. Render Guess History
    if (this.historyListEl) {
      this.historyListEl.innerHTML = '';
      this.history.forEach((h, hIdx) => {
        const row = document.createElement('div');
        row.className = 'keypad-history-row';

        const digitsDiv = document.createElement('div');
        digitsDiv.className = 'keypad-history-digits';

        h.results.forEach((r) => {
          const dBox = document.createElement('span');
          dBox.textContent = r.digit;
          if (r.status === 'CORRECT') {
            dBox.className = 'keypad-hist-box hist-green';
            dBox.title = 'Correct Digit & Position';
          } else if (r.status === 'IN_CODE') {
            dBox.className = 'keypad-hist-box hist-yellow';
            dBox.title = 'In Code (Wrong Position)';
          } else {
            dBox.className = 'keypad-hist-box hist-grey';
            dBox.title = 'Not in Code';
          }
          digitsDiv.appendChild(dBox);
        });

        const noteDiv = document.createElement('div');
        noteDiv.className = 'keypad-history-note';
        if (h.allCorrect) {
          noteDiv.innerHTML = '<b style="color: #2ecc71;">ACCESS GRANTED</b>';
        } else if (h.included.length > 0) {
          noteDiv.innerHTML = `<span style="color: #f39c12;">In code, wrong pos: <b>${h.included.join(', ')}</b></span>`;
        } else {
          noteDiv.innerHTML = '<span style="color: #95a5a6;">No matching digits</span>';
        }

        row.appendChild(digitsDiv);
        row.appendChild(noteDiv);
        this.historyListEl.appendChild(row);
      });
    }
  }

  reset() {
    if (this.cooldownInterval) {
      clearInterval(this.cooldownInterval);
      this.cooldownInterval = null;
    }
    this.isOpen = false;
    this.isUnlocked = false;
    this.secretCode = this.generateSecretCode();
    this.triesRemaining = this.maxTries;
    this.cooldownTimer = 0;
    this.currentDigits = [];
    this.history = [];
    if (this.modalEl) {
      this.modalEl.classList.add('hidden');
    }
    this.setFeedback('ENTER 4-DIGIT ACCESS CODE', 'normal');
    this.updateDisplay();
  }
}
