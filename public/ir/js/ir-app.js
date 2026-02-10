/**
 * Elahe Panel - Iranian Camouflage Site JavaScript
 */

// ============ SETTINGS ============
let siteSettings = {};
let captchaData = { login: {}, register: {} };

// Load site settings
async function loadSettings() {
  try {
    const res = await fetch('/api/settings/site');
    siteSettings = await res.json();
    applySettings();
  } catch (e) {
    console.log('Using default settings');
  }
}

function applySettings() {
  if (siteSettings.title) document.getElementById('site-title').textContent = siteSettings.title;
  if (siteSettings.primaryColor) document.documentElement.style.setProperty('--primary', siteSettings.primaryColor);
  if (siteSettings.secondaryColor) document.documentElement.style.setProperty('--secondary', siteSettings.secondaryColor);
  if (siteSettings.accentColor) document.documentElement.style.setProperty('--accent', siteSettings.accentColor);
}

// ============ NAVIGATION ============
function toggleMenu() {
  document.getElementById('nav-links').classList.toggle('active');
}

function scrollTo(selector) {
  const el = document.querySelector(selector);
  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// Header scroll effect
window.addEventListener('scroll', () => {
  const header = document.getElementById('header');
  if (window.scrollY > 50) header.classList.add('scrolled');
  else header.classList.remove('scrolled');
});

// Active nav link
window.addEventListener('scroll', () => {
  const sections = document.querySelectorAll('.section, .hero');
  const links = document.querySelectorAll('.nav-link');
  let current = '';
  
  sections.forEach(section => {
    const rect = section.getBoundingClientRect();
    if (rect.top <= 100) current = section.id;
  });
  
  links.forEach(link => {
    link.classList.remove('active');
    if (link.getAttribute('href') === '#' + current) link.classList.add('active');
  });
});

// ============ CAPTCHA ============
async function loadCaptcha(type) {
  try {
    const res = await fetch('/api/auth/captcha');
    const data = await res.json();
    captchaData[type] = data;
    document.getElementById(`${type}-captcha-svg`).innerHTML = data.svg;
    document.getElementById(`${type}-captcha-id`).value = data.id;
  } catch (e) {
    console.error('Failed to load captcha');
  }
}

// ============ MODALS ============
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

function closeModal(id) {
  document.getElementById(id).classList.remove('active');
}

// Close modal on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('active');
  });
});

// ============ LOGIN ============
async function handleLogin(e) {
  e.preventDefault();
  const btn = document.getElementById('login-btn');
  const errorEl = document.getElementById('login-error');
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> در حال ورود...';
  errorEl.style.display = 'none';

  const data = {
    username: document.getElementById('login-username').value,
    password: document.getElementById('login-password').value,
    otp: document.getElementById('login-otp').value,
    captchaId: document.getElementById('login-captcha-id').value,
    captchaAnswer: document.getElementById('login-captcha').value,
  };

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    
    const result = await res.json();
    
    if (result.success) {
      localStorage.setItem('token', result.token);
      localStorage.setItem('admin', JSON.stringify(result.admin));
      window.location.href = '/admin/';
    } else {
      errorEl.textContent = result.error || '\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627 \u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0627\u0634\u062A\u0628\u0627\u0647 \u0627\u0633\u062A';
      errorEl.style.display = 'block';
      if (result.code === 'OTP_REQUIRED') {
        document.getElementById('login-otp').focus();
      }
      loadCaptcha('login');
    }
  } catch (err) {
    errorEl.textContent = '\u062E\u0637\u0627 \u062F\u0631 \u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u0633\u0631\u0648\u0631';
    errorEl.style.display = 'block';
    loadCaptcha('login');
  }
  
  btn.disabled = false;
  btn.innerHTML = '\u0648\u0631\u0648\u062F';
}

// ============ FAKE REGISTRATION ============
async function handleRegister(e) {
  e.preventDefault();
  const btn = document.getElementById('register-btn');
  const errorEl = document.getElementById('register-error');
  
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> \u062F\u0631 \u062D\u0627\u0644 \u062B\u0628\u062A\u200C\u0646\u0627\u0645...';
  errorEl.style.display = 'none';

  const pass1 = document.getElementById('reg-password').value;
  const pass2 = document.getElementById('reg-password2').value;
  
  if (pass1 !== pass2) {
    errorEl.textContent = '\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 \u0648 \u062A\u06A9\u0631\u0627\u0631 \u0622\u0646 \u06CC\u06A9\u0633\u0627\u0646 \u0646\u06CC\u0633\u062A';
    errorEl.style.display = 'block';
    btn.disabled = false;
    btn.innerHTML = '\u0639\u0636\u0648\u06CC\u062A';
    return;
  }

  const data = {
    name: document.getElementById('reg-name').value,
    email: document.getElementById('reg-email').value,
    username: document.getElementById('reg-username').value,
    password: pass1,
    captchaId: document.getElementById('register-captcha-id').value,
    captchaAnswer: document.getElementById('register-captcha').value,
  };

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept-Language': 'fa' },
      body: JSON.stringify(data),
    });
    
    const result = await res.json();
    
    // Registration always fails with confusing errors
    errorEl.textContent = result.error || '\u062E\u0637\u0627\u06CC \u0646\u0627\u0634\u0646\u0627\u062E\u062A\u0647';
    if (result.code) errorEl.textContent += '\n\u06A9\u062F \u067E\u06CC\u06AF\u06CC\u0631\u06CC: ' + result.code;
    errorEl.style.display = 'block';
    loadCaptcha('register');
  } catch (err) {
    errorEl.textContent = '\u062E\u0637\u0627 \u062F\u0631 \u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u0633\u0631\u0648\u0631. \u0644\u0637\u0641\u0627\u064B \u0628\u0639\u062F\u0627\u064B \u062A\u0644\u0627\u0634 \u06A9\u0646\u06CC\u062F.';
    errorEl.style.display = 'block';
    loadCaptcha('register');
  }
  
  btn.disabled = false;
  btn.innerHTML = '\u0639\u0636\u0648\u06CC\u062A';
}

// ============ UTILITY ============
function copyDns(text) {
  navigator.clipboard.writeText(text).then(() => {
    const toast = document.createElement('div');
    toast.className = 'alert alert-success';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);z-index:9999;animation:fadeIn 0.3s';
    toast.textContent = '\u06A9\u067E\u06CC \u0634\u062F!';
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  });
}

// ============ LOAD TERMS ============
async function loadTerms() {
  try {
    const res = await fetch('/api/files/terms');
    if (res.ok) {
      const text = await res.text();
      document.getElementById('terms-content').innerHTML = `<div style="white-space:pre-wrap;line-height:2">${text}</div>`;
    } else {
      // Fallback: show summary
      document.getElementById('terms-content').innerHTML = `
        <h3>\u0634\u0631\u0627\u06CC\u0637 \u0648 \u0636\u0648\u0627\u0628\u0637 \u0627\u0633\u062A\u0641\u0627\u062F\u0647</h3>
        <p>\u0633\u0631\u0648\u06CC\u0633 \u00AB\u06AF\u0630\u0631 \u062A\u062D\u0631\u06CC\u0645\u00BB \u06CC\u06A9 \u0633\u0631\u0648\u06CC\u0633 \u062A\u063A\u06CC\u06CC\u0631 \u062F\u06CC\u200C\u0627\u0646\u200C\u0627\u0633 \u0628\u0631\u0627\u06CC \u0628\u06CC\u200C\u0627\u062B\u0631 \u06A9\u0631\u062F\u0646 \u062A\u062D\u0631\u06CC\u0645\u200C\u0647\u0627\u06CC \u0627\u06CC\u0646\u062A\u0631\u0646\u062A\u06CC \u0648 \u062A\u0633\u0647\u06CC\u0644 \u062F\u0633\u062A\u0631\u0633\u06CC \u06A9\u0627\u0631\u0628\u0631\u0627\u0646 \u0627\u06CC\u0631\u0627\u0646\u06CC \u0628\u0647 \u0628\u0631\u062E\u06CC \u062E\u062F\u0645\u0627\u062A \u0622\u0646\u0644\u0627\u06CC\u0646 \u062E\u0627\u0631\u062C\u06CC \u0627\u0633\u062A.</p>
        <p>\u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0627\u0632 \u062A\u0645\u0627\u0645\u06CC \u062E\u062F\u0645\u0627\u062A \u00AB\u0645\u0627\u00BB \u0628\u0647 \u0645\u0639\u0646\u0627\u06CC \u067E\u0630\u06CC\u0631\u0634 \u06A9\u0627\u0645\u0644 \u06A9\u0644\u06CC\u0647\u0654 \u0645\u0641\u0627\u062F \u0627\u06CC\u0646 \u0634\u0631\u0627\u06CC\u0637 \u0648 \u0636\u0648\u0627\u0628\u0637 \u0645\u06CC\u200C\u0628\u0627\u0634\u062F.</p>
        <h3>\u062A\u0639\u0627\u0631\u06CC\u0641</h3>
        <p><strong>\u0645\u0627:</strong> \u0633\u0627\u0645\u0627\u0646\u0647 \u0648 \u0633\u0631\u0648\u06CC\u0633 \u062F\u06CC\u200C\u0627\u0646\u200C\u0627\u0633 \u0627\u0631\u0627\u0626\u0647\u200C\u0634\u062F\u0647</p>
        <p><strong>\u06A9\u0627\u0631\u0628\u0631:</strong> \u0647\u0631 \u0634\u062E\u0635 \u062D\u0642\u06CC\u0642\u06CC \u06CC\u0627 \u062D\u0642\u0648\u0642\u06CC \u06A9\u0647 \u0627\u0632 \u062E\u062F\u0645\u0627\u062A \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0645\u06CC\u200C\u06A9\u0646\u062F</p>
        <p><strong>\u0633\u0631\u0648\u06CC\u0633 \u0631\u0627\u06CC\u06AF\u0627\u0646:</strong> \u062E\u062F\u0645\u0627\u062A \u0639\u0645\u0648\u0645\u06CC \u0628\u062F\u0648\u0646 \u0646\u06CC\u0627\u0632 \u0628\u0647 \u062B\u0628\u062A\u200C\u0646\u0627\u0645</p>
        <p><strong>\u0633\u0631\u0648\u06CC\u0633 \u062D\u0631\u0641\u0647\u200C\u0627\u06CC:</strong> \u062E\u062F\u0645\u0627\u062A \u067E\u06CC\u0634\u0631\u0641\u062A\u0647 \u0628\u0627 \u0627\u0634\u062A\u0631\u0627\u06A9 (\u0628\u0631\u0646\u0632\u06CC\u060C \u0646\u0642\u0631\u0647\u200C\u0627\u06CC\u060C \u0637\u0644\u0627\u06CC\u06CC)</p>
        <p class="mt-2">\u0628\u0631\u0627\u06CC \u0645\u0637\u0627\u0644\u0639\u0647 \u06A9\u0627\u0645\u0644 \u0642\u0648\u0627\u0646\u06CC\u0646 \u0648 \u0645\u0642\u0631\u0631\u0627\u062A\u060C \u0644\u0637\u0641\u0627\u064B \u0628\u0647 <a href="/terms.txt">\u0627\u06CC\u0646 \u0644\u06CC\u0646\u06A9</a> \u0645\u0631\u0627\u062C\u0639\u0647 \u06A9\u0646\u06CC\u062F.</p>
      `;
    }
  } catch (e) {
    document.getElementById('terms-content').innerHTML = '<p>\u062E\u0637\u0627 \u062F\u0631 \u0628\u0627\u0631\u06AF\u0630\u0627\u0631\u06CC \u0642\u0648\u0627\u0646\u06CC\u0646</p>';
  }
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
  loadTerms();
  
  // Duplicate carousel items for infinite scroll
  const track = document.getElementById('carousel-track');
  if (track) {
    track.innerHTML += track.innerHTML;
  }
});
