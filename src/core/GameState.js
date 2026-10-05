/**
 * GameState Manager
 * Handles transitions between Menu, Playing, Paused, and Game Over / Victory.
 */
export const STATES = {
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAME_OVER: 'GAME_OVER',
  VICTORY: 'VICTORY'
};

export class GameState {
  constructor() {
    this.current = STATES.MENU;
    this.score = 0;
    this.kills = 0;
    this.totalEnemies = 0;
    this.listeners = new Map();
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
  }

  emit(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach((cb) => cb(data));
    }
  }

  setState(newState) {
    if (this.current === newState) return;
    const oldState = this.current;
    this.current = newState;
    this.emit('stateChange', { oldState, newState });
  }

  recordKill() {
    this.kills++;
    this.score += 100;
    this.emit('kill', { kills: this.kills, score: this.score, total: this.totalEnemies });
    if (this.totalEnemies > 0 && this.kills >= this.totalEnemies) {
      this.setState(STATES.VICTORY);
    }
  }

  reset(totalEnemies = 0) {
    this.kills = 0;
    this.score = 0;
    this.totalEnemies = totalEnemies;
    this.setState(STATES.PLAYING);
    this.emit('reset', { totalEnemies });
  }

  isPlaying() {
    return this.current === STATES.PLAYING;
  }
}
