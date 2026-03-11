/* ============================================
   GREYSTONE TRADING PLATFORM - Auth UI Controller
   Handles login/signup screen, session management,
   user avatar/dropdown, and sign-out flow.
   ============================================ */

(function initAuthUI() {
  var authScreen = document.getElementById('authScreen');
  var landing = document.getElementById('landing');
  if (!authScreen) return;

  // ---- Elements ----
  var tabSignIn = document.getElementById('authTabSignIn');
  var tabSignUp = document.getElementById('authTabSignUp');
  var tabIndicator = document.getElementById('authTabIndicator');
  var signInForm = document.getElementById('authSignInForm');
  var signUpForm = document.getElementById('authSignUpForm');
  var forgotForm = document.getElementById('authForgotForm');
  var authError = document.getElementById('authError');
  var authSuccess = document.getElementById('authSuccess');
  var forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  var backToSignInBtn = document.getElementById('backToSignInBtn');
  var githubSignInBtn = document.getElementById('githubSignInBtn');
  var guestModeBtn = document.getElementById('guestModeBtn');

  // Topbar elements
  var userAvatar = document.getElementById('userAvatar');
  var userDropdown = document.getElementById('userDropdown');
  var userDropdownName = document.getElementById('userDropdownName');
  var userDropdownEmail = document.getElementById('userDropdownEmail');
  var userSignOutBtn = document.getElementById('userSignOutBtn');
  var topbarUser = document.getElementById('topbarUser');

  // ---- Tab Switching ----
  function switchTab(tab) {
    clearMessages();
    if (tab === 'signin') {
      tabSignIn.classList.add('active');
      tabSignUp.classList.remove('active');
      signInForm.classList.remove('auth-form-hidden');
      signUpForm.classList.add('auth-form-hidden');
      forgotForm.classList.add('auth-form-hidden');
      tabIndicator.style.transform = 'translateX(0)';
    } else {
      tabSignUp.classList.add('active');
      tabSignIn.classList.remove('active');
      signUpForm.classList.remove('auth-form-hidden');
      signInForm.classList.add('auth-form-hidden');
      forgotForm.classList.add('auth-form-hidden');
      tabIndicator.style.transform = 'translateX(100%)';
    }
  }

  tabSignIn.addEventListener('click', function () { switchTab('signin'); });
  tabSignUp.addEventListener('click', function () { switchTab('signup'); });

  // ---- Forgot Password ----
  forgotPasswordBtn.addEventListener('click', function () {
    clearMessages();
    signInForm.classList.add('auth-form-hidden');
    signUpForm.classList.add('auth-form-hidden');
    forgotForm.classList.remove('auth-form-hidden');
    document.querySelector('.auth-tabs').style.display = 'none';
  });

  backToSignInBtn.addEventListener('click', function () {
    clearMessages();
    forgotForm.classList.add('auth-form-hidden');
    document.querySelector('.auth-tabs').style.display = '';
    switchTab('signin');
  });

  // ---- Messages ----
  function showError(msg) {
    authError.textContent = msg;
    authError.style.display = 'block';
    authSuccess.style.display = 'none';
  }

  function showSuccess(msg) {
    authSuccess.textContent = msg;
    authSuccess.style.display = 'block';
    authError.style.display = 'none';
  }

  function clearMessages() {
    authError.style.display = 'none';
    authSuccess.style.display = 'none';
    authError.textContent = '';
    authSuccess.textContent = '';
  }

  function setLoading(btn, loading) {
    if (loading) {
      btn.disabled = true;
      btn.dataset.originalText = btn.querySelector('span').textContent;
      btn.querySelector('span').textContent = 'Loading...';
    } else {
      btn.disabled = false;
      if (btn.dataset.originalText) {
        btn.querySelector('span').textContent = btn.dataset.originalText;
      }
    }
  }

  // ---- Sign In ----
  signInForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearMessages();
    var email = document.getElementById('signInEmail').value.trim();
    var password = document.getElementById('signInPassword').value;
    var btn = document.getElementById('signInBtn');

    if (!email || !password) {
      showError('Please enter both email and password.');
      return;
    }

    setLoading(btn, true);
    try {
      await SupabaseClient.signInWithEmail(email, password);
      onAuthSuccess();
    } catch (err) {
      showError(err.message || 'Sign in failed. Check your credentials.');
    }
    setLoading(btn, false);
  });

  // ---- Sign Up ----
  signUpForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearMessages();
    var displayName = document.getElementById('signUpDisplayName').value.trim();
    var email = document.getElementById('signUpEmail').value.trim();
    var password = document.getElementById('signUpPassword').value;
    var confirm = document.getElementById('signUpConfirm').value;
    var btn = document.getElementById('signUpBtn');

    if (!displayName || !email || !password || !confirm) {
      showError('Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      showError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirm) {
      showError('Passwords do not match.');
      return;
    }

    setLoading(btn, true);
    try {
      var data = await SupabaseClient.signUpWithEmail(email, password, displayName);
      if (data.user && !data.session) {
        showSuccess('Check your email to confirm your account, then sign in.');
        switchTab('signin');
      } else {
        onAuthSuccess();
      }
    } catch (err) {
      showError(err.message || 'Sign up failed. Try a different email.');
    }
    setLoading(btn, false);
  });

  // ---- Forgot Password ----
  forgotForm.addEventListener('submit', async function (e) {
    e.preventDefault();
    clearMessages();
    var email = document.getElementById('forgotEmail').value.trim();
    var btn = document.getElementById('resetBtn');

    if (!email) {
      showError('Please enter your email.');
      return;
    }

    setLoading(btn, true);
    try {
      await SupabaseClient.resetPassword(email);
      showSuccess('Password reset link sent. Check your email.');
    } catch (err) {
      showError(err.message || 'Failed to send reset link.');
    }
    setLoading(btn, false);
  });

  // ---- GitHub OAuth ----
  githubSignInBtn.addEventListener('click', async function () {
    clearMessages();
    try {
      await SupabaseClient.signInWithGitHub();
      // Redirects to GitHub, then back to the app
    } catch (err) {
      showError(err.message || 'GitHub sign in failed.');
    }
  });

  // ---- Guest Mode ----
  guestModeBtn.addEventListener('click', function () {
    SupabaseClient.enterGuestMode();
    onAuthSuccess();
  });

  // ---- Auth Success: Hide auth screen, show landing ----
  function onAuthSuccess() {
    authScreen.classList.add('auth-hidden');
    setTimeout(function () {
      authScreen.style.display = 'none';
    }, 500);
    updateUserUI();
  }

  // ---- Sign Out ----
  if (userSignOutBtn) {
    userSignOutBtn.addEventListener('click', async function () {
      try {
        await SupabaseClient.signOut();
      } catch (err) {
        console.error('[Auth] Sign out error:', err);
      }
      // Reset UI
      authScreen.style.display = '';
      authScreen.classList.remove('auth-hidden');
      clearMessages();
      switchTab('signin');

      // Reset forms
      signInForm.reset();
      signUpForm.reset();
      forgotForm.reset();

      // Close dropdown
      if (userDropdown) userDropdown.classList.remove('active');

      // Reset avatar
      if (userAvatar) {
        userAvatar.textContent = '?';
        userAvatar.title = '';
      }
    });
  }

  // ---- User Dropdown Toggle ----
  if (topbarUser) {
    topbarUser.addEventListener('click', function (e) {
      e.stopPropagation();
      if (userDropdown) userDropdown.classList.toggle('active');
    });

    document.addEventListener('click', function () {
      if (userDropdown) userDropdown.classList.remove('active');
    });
  }

  // ---- Update User UI (avatar, dropdown) ----
  function updateUserUI() {
    if (!userAvatar) return;

    if (SupabaseClient.isGuestMode()) {
      userAvatar.textContent = 'G';
      userAvatar.title = 'Guest Mode';
      if (userDropdownName) userDropdownName.textContent = 'Guest';
      if (userDropdownEmail) userDropdownEmail.textContent = 'Read-only mode';
      return;
    }

    if (SupabaseClient.isAuthenticated()) {
      var initial = SupabaseClient.getUserInitial();
      var displayName = SupabaseClient.getDisplayName();
      var user = SupabaseClient.getUser();
      userAvatar.textContent = initial;
      userAvatar.title = displayName;
      if (userDropdownName) userDropdownName.textContent = displayName;
      if (userDropdownEmail) userDropdownEmail.textContent = user ? user.email : '';
    }
  }

  // ---- Listen for auth state changes ----
  SupabaseClient.onAuthChange(function (event, session) {
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
      onAuthSuccess();
    } else if (event === 'SIGNED_OUT') {
      authScreen.style.display = '';
      authScreen.classList.remove('auth-hidden');
    }
    updateUserUI();
  });

  // ---- Initialize: check session on page load ----
  async function checkInitialSession() {
    var initialized = await SupabaseClient.init();

    if (initialized && SupabaseClient.isAuthenticated()) {
      // Already signed in, skip auth screen
      onAuthSuccess();
    } else if (!initialized) {
      // Supabase not configured, go straight to guest mode
      SupabaseClient.enterGuestMode();
      onAuthSuccess();
    }
    // else: show auth screen (default state)
  }

  checkInitialSession();
})();
