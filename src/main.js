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

  // Register Service Worker for PWA Add-to-Home-Screen eligibility
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const base = import.meta.env.BASE_URL || '/';
      const swUrl = `${base.replace(/\/$/, '')}/sw.js`;
      navigator.serviceWorker.register(swUrl).then((reg) => {
        console.log('[PWA] ServiceWorker registered with scope:', reg.scope);
      }).catch((err) => {
        console.debug('[PWA] ServiceWorker registration:', err);
      });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
