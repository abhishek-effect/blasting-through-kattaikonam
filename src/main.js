/**
 * Main Application Entry Point
 */
import { Game } from './core/Game.js';
import { supabaseService } from './services/SupabaseService.js';

function init() {
  const game = new Game();
  game.start();
  window.__game = game;

  // Log site visit analytics (timestamp and device)
  supabaseService.logVisit().catch((err) => {
    console.warn('[Analytics] Failed to log visit:', err);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
