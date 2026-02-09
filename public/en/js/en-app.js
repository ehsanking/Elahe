/**
 * Elahe Panel - English/Foreign Site JavaScript
 */

let siteSettings = {};
let captchaData = { login: {}, register: {} };

async function loadSettings() {
  try {
    const res = await fetch('/api/settings/site');
    siteSettings = await res.json();
    if (siteSettings.title) document.getElementById('site-title').textContent = siteSettings.title;
    if (siteSettings.primaryColor) document.documentElement.style.setProperty('--primary', siteSettings.primaryColor);
    if (siteSettings.secondaryColor) document.documentElement.style.setProperty('--secondary', siteSettings.secondaryColor);
    if (siteSettings.accentColor) document.documentElement.style.setProperty('--accent', siteSettings.accentColor);
  } catch (e) {}
}

function toggleMenu() { document.getElementById('nav-links').classList.toggle('active'); }
function scrollTo(sel) { document.querySelector(sel)?.scrollIntoView({ behavior: 'smooth' }); }

window.addEventListener('scroll', () => {
  document.getElementById('header').classList.toggle('scrolled', window.scrollY > 50);
});

async function loadCaptcha(type) {
  try {
    const res = await fetch('/api/auth/captcha');
    const data = await res.json();
    captchaData[type] = data;
    document.getElementById(`${type}-captcha-svg`).innerHTML = data.svg;
    document.getElementById(`${type}-captcha-id`).value = data.id;
  } catch (e) {}
}

function showLoginModal() {
  document.getElementById('loginModal').classList.add('active');
  document.getElementById('login-error').style.display = 'none';
  loadCaptcha('login');
}

function showRegisterModal() {
  document.getElementById('registerModal').classList.add('active');
  document.getElementById('register-error').style.display = 'none';
  loadCaptcha('register');
}

function closeModal(id) { document.getElementById(id).classList.remove('active'); }

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); });
});

async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const err = document.getElementById('login-error');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in...';
  err.style.display = 'none';

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: document.getElementById('login-username').value,
        password: document.getElementById('login-password').value,
        captchaId: document.getElementById('login-captcha-id').value,
        captchaAnswer: document.getElementById('login-captcha').value,
      }),
    });
    const result = await res.json();
    if (result.success) {
      localStorage.setItem('token', result.token);
      localStorage.setItem('admin', JSON.stringify(result.admin));
      window.location.href = '/admin/';
    } else {
      err.textContent = result.error || 'Invalid credentials';
      err.style.display = 'block';
      loadCaptcha('login');
    }
  } catch (ex) {
    err.textContent = 'Connection error. Please try again.';
    err.style.display = 'block';
    loadCaptcha('login');
  }
  btn.disabled = false;
  btn.innerHTML = 'Sign In';
}

async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  const err = document.getElementById('register-error');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Creating account...';
  err.style.display = 'none';

  if (document.getElementById('reg-password').value !== document.getElementById('reg-password2').value) {
    err.textContent = 'Passwords do not match';
    err.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = 'Create Account';
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: document.getElementById('reg-name').value,
        email: document.getElementById('reg-email').value,
        username: document.getElementById('reg-username').value,
        password: document.getElementById('reg-password').value,
        captchaId: document.getElementById('register-captcha-id').value,
        captchaAnswer: document.getElementById('register-captcha').value,
      }),
    });
    const result = await res.json();
    err.textContent = result.error || 'Unknown error occurred';
    if (result.code) err.textContent += '\nTracking code: ' + result.code;
    err.style.display = 'block';
    loadCaptcha('register');
  } catch (ex) {
    err.textContent = 'Server connection failed. Please try again later.';
    err.style.display = 'block';
    loadCaptcha('register');
  }
  btn.disabled = false;
  btn.innerHTML = 'Create Account';
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => {
    const t = document.createElement('div');
    t.className = 'alert alert-success';
    t.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999';
    t.textContent = 'Copied!';
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2000);
  });
}

document.addEventListener('DOMContentLoaded', loadSettings);
