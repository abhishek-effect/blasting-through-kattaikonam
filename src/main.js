/**
 * Main Application Entry Point
 */
import { Game } from './core/Game.js';

function init() {
  const game = new Game();
  game.start();
  window.__game = game;
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
