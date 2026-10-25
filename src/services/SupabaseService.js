/**
 * SupabaseService
 * Handles high scores leaderboard, player name reservation, and site visit analytics
 * using Supabase REST API (PostgREST) with automatic offline/localStorage fallback.
 */

// Keys injected by Vite or import.meta.env
const ENV_URL = (typeof __SUPABASE_URL__ !== 'undefined' && __SUPABASE_URL__)
  || (typeof process !== 'undefined' && process.env && process.env.SUPABASE_URL)
  || (import.meta.env && (import.meta.env.VITE_SUPABASE_URL || import.meta.env.SUPABASE_URL))
  || '';

const ENV_KEY = (typeof __SUPABASE_PUBLISHABLE_KEY__ !== 'undefined' && __SUPABASE_PUBLISHABLE_KEY__)
  || (typeof process !== 'undefined' && process.env && process.env.SUPABASE_PUBLISHABLE_KEY)
  || (import.meta.env && (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.SUPABASE_PUBLISHABLE_KEY))
  || '';

const LOCAL_NAME_KEY = 'kattaikonam_player_name';
const LOCAL_SCORES_KEY = 'kattaikonam_local_high_scores';
const LOCAL_ANALYTICS_KEY = 'kattaikonam_local_analytics';

export function detectDevice() {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown';
  let device = 'Desktop';
  if (/Android/i.test(ua)) {
    device = 'Mobile (Android)';
  } else if (/iPhone|iPad|iPod/i.test(ua)) {
    device = 'Mobile (iOS)';
  } else if (/Windows/i.test(ua)) {
    device = 'Desktop (Windows)';
  } else if (/Macintosh|Mac OS X/i.test(ua)) {
    device = 'Desktop (macOS)';
  } else if (/Linux/i.test(ua)) {
    device = 'Desktop (Linux)';
  } else if (/Mobi/i.test(ua)) {
    device = 'Mobile (Other)';
  }

  const screenInfo = typeof window !== 'undefined' ? `${window.innerWidth}x${window.innerHeight}` : 'N/A';
  return `${device} (${screenInfo})`;
}

export class SupabaseService {
  constructor() {
    this.url = (ENV_URL || '').replace(/\/$/, '');
    this.key = ENV_KEY || '';
    this.isConfigured = !!(this.url && this.key);
  }

  getHeaders() {
    return {
      'apikey': this.key,
      'Authorization': `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation'
    };
  }

  /**
   * Returns player name stored in localStorage
   */
  getStoredPlayerName() {
    try {
      return (localStorage.getItem(LOCAL_NAME_KEY) || '').trim();
    } catch (e) {
      return '';
    }
  }

  /**
   * Saves player name to localStorage
   */
  setStoredPlayerName(name) {
    try {
      const clean = (name || '').trim();
      localStorage.setItem(LOCAL_NAME_KEY, clean);
      return clean;
    } catch (e) {
      console.warn('[SupabaseService] Failed to save name to localStorage:', e);
      return name;
    }
  }

  /**
   * Checks if a player name is already taken.
   * Rule: Don't let user use the same name if it's NOT saved on localStorage
   * and it ALREADY exists in the Supabase database.
   *
   * @param {string} candidateName
   * @returns {Promise<{ allowed: boolean, reason?: string }>}
   */
  async validatePlayerName(candidateName) {
    const trimmed = (candidateName || '').trim();
    if (!trimmed || trimmed.length < 2) {
      return {
        allowed: false,
        valid: false,
        reason: 'Name must be at least 2 characters long.',
        error: 'Name must be at least 2 characters long.'
      };
    }
    if (trimmed.length > 20) {
      return {
        allowed: false,
        valid: false,
        reason: 'Name cannot exceed 20 characters.',
        error: 'Name cannot exceed 20 characters.'
      };
    }

    const storedName = this.getStoredPlayerName();
    // If the entered name matches the name already saved in localStorage for this user, allow it!
    if (storedName && storedName.toLowerCase() === trimmed.toLowerCase()) {
      return { allowed: true, valid: true };
    }

    // Otherwise check if name already exists in Supabase
    if (this.isConfigured) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3500);

        const queryUrl = `${this.url}/rest/v1/high_scores?name=ilike.${encodeURIComponent(trimmed)}&select=name`;
        const res = await fetch(queryUrl, {
          method: 'GET',
          headers: this.getHeaders(),
          signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows) && rows.length > 0) {
            return {
              allowed: false,
              valid: false,
              reason: `The name "${trimmed}" is already claimed on the global leaderboard. Please choose a different name.`,
              error: `The name "${trimmed}" is already claimed on the global leaderboard. Please choose a different name.`
            };
          }
          return { allowed: true, valid: true };
        } else {
          // Non-200 (e.g. 404 table not yet migrated): don't block user, fallback to local
          console.warn('[SupabaseService] Supabase check returned non-200:', res.status);
        }
      } catch (err) {
        console.warn('[SupabaseService] Error querying Supabase for name availability:', err);
      }
    }

    // Fallback check against local scores
    const localScores = this.getLocalScores();
    const existsLocally = localScores.some((s) => s.name && s.name.toLowerCase() === trimmed.toLowerCase());
    if (existsLocally && storedName.toLowerCase() !== trimmed.toLowerCase()) {
      return {
        allowed: false,
        valid: false,
        reason: `The name "${trimmed}" is already registered. Please choose another name.`,
        error: `The name "${trimmed}" is already registered. Please choose another name.`
      };
    }

    return { allowed: true, valid: true };
  }

  /**
   * Records or updates a player's high score
   *
   * @param {string} name
   * @param {number} score
   * @param {number} wave
   */
  async submitHighScore(name, score, wave = 1) {
    const trimmed = (name || this.getStoredPlayerName() || 'Anonymous').trim();
    const payload = {
      name: trimmed,
      score: Math.max(0, Math.round(score)),
      wave: Math.max(1, Math.round(wave)),
      updated_at: new Date().toISOString()
    };

    // 1. Update local storage cache
    this.saveLocalScore(payload);

    // 2. Submit to Supabase if configured
    if (this.isConfigured) {
      try {
        // First check if an entry exists for this name
        const checkUrl = `${this.url}/rest/v1/high_scores?name=eq.${encodeURIComponent(trimmed)}&select=id,score,wave`;
        const checkRes = await fetch(checkUrl, {
          method: 'GET',
          headers: this.getHeaders()
        });

        if (checkRes.ok) {
          const existing = await checkRes.json();
          if (Array.isArray(existing) && existing.length > 0) {
            const currentBest = existing[0].score || 0;
            // Only update if new score is higher
            if (payload.score >= currentBest) {
              const patchUrl = `${this.url}/rest/v1/high_scores?name=eq.${encodeURIComponent(trimmed)}`;
              await fetch(patchUrl, {
                method: 'PATCH',
                headers: this.getHeaders(),
                body: JSON.stringify(payload)
              });
            }
          } else {
            // New entry
            const postUrl = `${this.url}/rest/v1/high_scores`;
            await fetch(postUrl, {
              method: 'POST',
              headers: this.getHeaders(),
              body: JSON.stringify(payload)
            });
          }
        }
      } catch (err) {
        console.warn('[SupabaseService] Error submitting high score to Supabase:', err);
      }
    }
  }

  /**
   * Retrieves leaderboard top scores
   * @param {number} limit
   * @returns {Promise<Array<{ name: string, score: number, wave: number, created_at?: string }>>}
   */
  async getLeaderboard(limit = 10) {
    if (this.isConfigured) {
      try {
        const queryUrl = `${this.url}/rest/v1/high_scores?select=name,score,wave,updated_at&order=score.desc&limit=${limit}`;
        const res = await fetch(queryUrl, {
          method: 'GET',
          headers: this.getHeaders()
        });

        if (res.ok) {
          const rows = await res.json();
          if (Array.isArray(rows) && rows.length > 0) {
            return rows;
          }
        }
      } catch (err) {
        console.warn('[SupabaseService] Error fetching leaderboard from Supabase:', err);
      }
    }

    return this.getLocalScores().slice(0, limit);
  }

  /**
   * Logs site visit analytics (date time and device)
   */
  async logVisit() {
    // Only log once per browser session to prevent reload spamming
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (sessionStorage.getItem('kattaikonam_visit_logged')) {
          return;
        }
        sessionStorage.setItem('kattaikonam_visit_logged', '1');
      }
    } catch (e) {
      // Ignore
    }

    const visitData = {
      visited_at: new Date().toISOString(),
      device: detectDevice(),
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent.substring(0, 200) : ''
    };

    // Store in localStorage history
    try {
      const raw = localStorage.getItem(LOCAL_ANALYTICS_KEY);
      let list = raw ? JSON.parse(raw) : [];
      if (!Array.isArray(list)) list = [];
      list.push(visitData);
      if (list.length > 50) list = list.slice(-50);
      localStorage.setItem(LOCAL_ANALYTICS_KEY, JSON.stringify(list));
    } catch (e) {
      // Ignore
    }

    // Send to Supabase site_analytics table
    if (this.isConfigured) {
      try {
        const postUrl = `${this.url}/rest/v1/site_analytics`;
        await fetch(postUrl, {
          method: 'POST',
          headers: {
            'apikey': this.key,
            'Authorization': `Bearer ${this.key}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify(visitData)
        });
      } catch (err) {
        console.warn('[SupabaseService] Could not log visit to Supabase site_analytics:', err);
      }
    }
  }

  // --- Local storage helpers ---
  getLocalScores() {
    try {
      const raw = localStorage.getItem(LOCAL_SCORES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return parsed.sort((a, b) => (b.score || 0) - (a.score || 0));
        }
      }
    } catch (e) {
      // Ignore
    }
    // Default seed scores for exciting initial leaderboard view
    return [
      { name: 'Santhomite_Hunter', score: 4200, wave: 8 },
      { name: 'KattaikonamRanger', score: 3100, wave: 6 },
      { name: 'Ak47Master', score: 2400, wave: 5 },
      { name: 'CampusRunner', score: 1800, wave: 4 },
      { name: 'LaserDodger', score: 1200, wave: 3 }
    ];
  }

  saveLocalScore(scoreObj) {
    try {
      const scores = this.getLocalScores().filter((s) => s.name.toLowerCase() !== scoreObj.name.toLowerCase());
      scores.push(scoreObj);
      scores.sort((a, b) => (b.score || 0) - (a.score || 0));
      localStorage.setItem(LOCAL_SCORES_KEY, JSON.stringify(scores.slice(0, 20)));
    } catch (e) {
      // Ignore
    }
  }
}

// Singleton instance
export const supabaseService = new SupabaseService();
