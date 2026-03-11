/* ============================================
   GREYSTONE TRADING PLATFORM - Supabase Client
   Handles authentication, session management,
   and user data persistence.
   ============================================ */

const SupabaseClient = (function () {
  let supabase = null;
  let currentSession = null;
  let currentUser = null;
  let isGuest = false;
  let authListeners = [];

  // ---- INITIALIZATION ----

  async function init() {
    try {
      const res = await fetch('/api/config');
      if (!res.ok) throw new Error('Failed to fetch config');
      const config = await res.json();

      if (!config.supabaseUrl || !config.supabaseAnonKey) {
        console.warn('[Supabase] No Supabase config found, running in guest mode');
        isGuest = true;
        return false;
      }

      // Load Supabase JS from CDN if not already loaded
      if (!window.supabase) {
        await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js');
      }

      supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

      // Listen for auth state changes
      supabase.auth.onAuthStateChange(function (event, session) {
        currentSession = session;
        currentUser = session ? session.user : null;
        notifyListeners(event, session);
      });

      // Check existing session
      const { data } = await supabase.auth.getSession();
      currentSession = data.session;
      currentUser = data.session ? data.session.user : null;

      return true;
    } catch (err) {
      console.error('[Supabase] Init error:', err);
      isGuest = true;
      return false;
    }
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (document.querySelector('script[src="' + src + '"]')) {
        resolve();
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  // ---- AUTH METHODS ----

  async function signInWithEmail(email, password) {
    if (!supabase) throw new Error('Supabase not initialized');
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password
    });
    if (error) throw error;
    return data;
  }

  async function signUpWithEmail(email, password, displayName) {
    if (!supabase) throw new Error('Supabase not initialized');
    const { data, error } = await supabase.auth.signUp({
      email: email,
      password: password,
      options: {
        data: { display_name: displayName }
      }
    });
    if (error) throw error;
    return data;
  }

  async function signInWithGitHub() {
    if (!supabase) throw new Error('Supabase not initialized');
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: window.location.origin
      }
    });
    if (error) throw error;
    return data;
  }

  async function signOut() {
    if (!supabase) {
      isGuest = false;
      currentSession = null;
      currentUser = null;
      notifyListeners('SIGNED_OUT', null);
      return;
    }
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    currentSession = null;
    currentUser = null;
    isGuest = false;
  }

  async function resetPassword(email) {
    if (!supabase) throw new Error('Supabase not initialized');
    const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: window.location.origin
    });
    if (error) throw error;
    return data;
  }

  function enterGuestMode() {
    isGuest = true;
    currentSession = null;
    currentUser = null;
    notifyListeners('GUEST_MODE', null);
  }

  // ---- SESSION HELPERS ----

  function getSession() { return currentSession; }
  function getUser() { return currentUser; }
  function isAuthenticated() { return !!currentSession; }
  function isGuestMode() { return isGuest; }

  function getAccessToken() {
    return currentSession ? currentSession.access_token : null;
  }

  function getDisplayName() {
    if (!currentUser) return isGuest ? 'Guest' : null;
    var meta = currentUser.user_metadata || {};
    return meta.display_name || meta.name || meta.full_name || currentUser.email.split('@')[0];
  }

  function getUserInitial() {
    var name = getDisplayName();
    if (!name) return '?';
    return name.charAt(0).toUpperCase();
  }

  // ---- AUTH STATE LISTENERS ----

  function onAuthChange(callback) {
    authListeners.push(callback);
    return function () {
      authListeners = authListeners.filter(function (cb) { return cb !== callback; });
    };
  }

  function notifyListeners(event, session) {
    authListeners.forEach(function (cb) {
      try { cb(event, session); } catch (e) { console.error('[Supabase] Listener error:', e); }
    });
  }

  // ---- USER DATA PERSISTENCE ----

  async function fetchWithAuth(url, options) {
    options = options || {};
    options.headers = options.headers || {};
    var token = getAccessToken();
    if (token) {
      options.headers['Authorization'] = 'Bearer ' + token;
    }
    return fetch(url, options);
  }

  async function getWatchlists() {
    if (!isAuthenticated()) return [];
    var res = await fetchWithAuth('/api/user/watchlists');
    if (!res.ok) return [];
    return res.json();
  }

  async function saveWatchlist(name, tickers, isDefault) {
    if (!isAuthenticated()) return null;
    var res = await fetchWithAuth('/api/user/watchlists', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, tickers: tickers, is_default: isDefault || false })
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function getSettings() {
    if (!isAuthenticated()) return {};
    var res = await fetchWithAuth('/api/user/settings');
    if (!res.ok) return {};
    return res.json();
  }

  async function saveSettings(settings) {
    if (!isAuthenticated()) return null;
    var res = await fetchWithAuth('/api/user/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings)
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function getProfile() {
    if (!isAuthenticated()) return null;
    var res = await fetchWithAuth('/api/auth/profile');
    if (!res.ok) return null;
    return res.json();
  }

  async function updateProfile(data) {
    if (!isAuthenticated()) return null;
    var res = await fetchWithAuth('/api/auth/profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) return null;
    return res.json();
  }

  // ---- PUBLIC API ----

  return {
    init: init,
    signInWithEmail: signInWithEmail,
    signUpWithEmail: signUpWithEmail,
    signInWithGitHub: signInWithGitHub,
    signOut: signOut,
    resetPassword: resetPassword,
    enterGuestMode: enterGuestMode,
    getSession: getSession,
    getUser: getUser,
    isAuthenticated: isAuthenticated,
    isGuestMode: isGuestMode,
    getAccessToken: getAccessToken,
    getDisplayName: getDisplayName,
    getUserInitial: getUserInitial,
    onAuthChange: onAuthChange,
    fetchWithAuth: fetchWithAuth,
    getWatchlists: getWatchlists,
    saveWatchlist: saveWatchlist,
    getSettings: getSettings,
    saveSettings: saveSettings,
    getProfile: getProfile,
    updateProfile: updateProfile
  };
})();
