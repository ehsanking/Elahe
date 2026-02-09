/**
 * Elahe Panel - Admin Dashboard JavaScript
 * Full-featured with Iran/Foreign mode + Persian localization
 * Includes: GeoRouting, Core Management, WARP, Content Blocking, Subdomain, API Keys
 * Developer: EHSANKiNG
 * Version: 0.0.4
 */

const API = '/api/admin';
let token = localStorage.getItem('token');
let currentPage = 'dashboard';
let usersPage = 1;
let panelMode = 'iran';
let capabilities = {};

// ============ AUTH CHECK ============
function checkAuth() {
  if (!token) { window.location.href = '/'; return false; }
  const admin = JSON.parse(localStorage.getItem('admin') || '{}');
  document.getElementById('admin-name').textContent = admin.username || '\u0645\u062F\u06CC\u0631';
  document.getElementById('app').style.display = 'flex';
  return true;
}

function headers() { return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' }; }

async function api(path, options = {}) {
  try {
    const res = await fetch(`${API}${path}`, { headers: headers(), ...options });
    if (res.status === 401) { logout(); return null; }
    return res.json();
  } catch (err) { console.error('API Error:', err); return null; }
}

function logout() {
  localStorage.removeItem('token'); localStorage.removeItem('admin');
  window.location.href = '/';
}

// ============ CAPABILITIES ============
async function loadCapabilities() {
  const data = await api('/capabilities');
  if (!data) return;
  panelMode = data.mode;
  capabilities = data.capabilities;
  document.getElementById('mode-badge').innerHTML = `\u062D\u0627\u0644\u062A: <strong style="color:${panelMode === 'iran' ? '#f59e0b' : '#3b82f6'}">${panelMode === 'iran' ? '\u0627\u06CC\u0631\u0627\u0646' : '\u062E\u0627\u0631\u062C'}</strong>`;
  if (!capabilities.createUsers) { const el = document.getElementById('user-actions-iran'); if (el) el.style.display = 'none'; }
  if (!capabilities.importExport) { const el = document.getElementById('nav-importexport'); if (el) el.style.display = 'none'; }
  if (capabilities.customPorts) { const el = document.getElementById('custom-port-card'); if (el) el.style.display = 'block'; }
}

// ============ NAVIGATION ============
const PAGE_TITLES = {
  'dashboard': '\u062F\u0627\u0634\u0628\u0648\u0631\u062F', 'users': '\u06A9\u0627\u0631\u0628\u0631\u0627\u0646', 'servers': '\u0633\u0631\u0648\u0631\u0647\u0627', 'tunnels': '\u062A\u0627\u0646\u0644\u200C\u0647\u0627',
  'autopilot': '\u0627\u062A\u0648\u067E\u0627\u06CC\u0644\u0648\u062A', 'georouting': '\u0645\u0633\u06CC\u0631\u06CC\u0627\u0628\u06CC GeoIP', 'core': '\u0645\u062F\u06CC\u0631\u06CC\u062A \u0647\u0633\u062A\u0647', 'warp': 'WARP',
  'contentblock': '\u0645\u0633\u062F\u0648\u062F\u0633\u0627\u0632\u06CC \u0645\u062D\u062A\u0648\u0627', 'subdomains': '\u0633\u0627\u0628\u200C\u062F\u0627\u0645\u06CC\u0646\u200C\u0647\u0627', 'domains': '\u062F\u0627\u0645\u0646\u0647\u200C\u0647\u0627',
  'external-panels': '\u067E\u0646\u0644\u200C\u0647\u0627\u06CC \u062E\u0627\u0631\u062C\u06CC', 'importexport': '\u0648\u0631\u0648\u062F/\u062E\u0631\u0648\u062C \u062F\u0627\u062F\u0647', 'apikeys': '\u06A9\u0644\u06CC\u062F\u0647\u0627\u06CC API', 'settings': '\u062A\u0646\u0638\u06CC\u0645\u0627\u062A',
};

function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.style.display = 'block';
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  const navEl = document.querySelector(`.sidebar-link[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');
  document.getElementById('page-title').textContent = PAGE_TITLES[page] || page;
  const loaders = {
    'dashboard': loadDashboard, 'users': loadUsers, 'servers': loadServers, 'tunnels': loadTunnels,
    'autopilot': loadAutopilot, 'georouting': loadGeoRouting, 'core': loadCore, 'warp': loadWarp,
    'contentblock': loadContentBlock, 'subdomains': loadSubdomains, 'domains': loadDomains,
    'external-panels': loadExternalPanels, 'importexport': () => {}, 'apikeys': loadApiKeys, 'settings': loadSettings,
  };
  if (loaders[page]) loaders[page]();
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); }

// ============ DASHBOARD ============
async function loadDashboard() {
  const data = await api('/dashboard');
  if (!data) return;
  document.getElementById('stat-users-total').textContent = data.users.total;
  document.getElementById('stat-users-active').textContent = data.users.active;
  document.getElementById('stat-servers-total').textContent = data.servers.total;
  document.getElementById('stat-tunnels-active').textContent = data.tunnels.active || 0;
  
  // Online users badge
  document.getElementById('online-badge').textContent = `${data.onlineUsers || 0} \u0622\u0646\u0644\u0627\u06CC\u0646`;

  document.getElementById('user-stats-detail').innerHTML = `
    <div class="user-field"><span class="badge badge-success">${data.users.online || 0}</span><span class="user-field-label">\u0622\u0646\u0644\u0627\u06CC\u0646</span></div>
    <div class="user-field"><span>${data.users.active}</span><span class="user-field-label">\u0641\u0639\u0627\u0644</span></div>
    <div class="user-field"><span>${data.users.expired}</span><span class="user-field-label">\u0645\u0646\u0642\u0636\u06CC</span></div>
    <div class="user-field"><span>${data.users.limited}</span><span class="user-field-label">\u0645\u062D\u062F\u0648\u062F</span></div>
    <div class="user-field"><span>${data.users.disabled}</span><span class="user-field-label">\u063A\u06CC\u0631\u0641\u0639\u0627\u0644</span></div>`;

  document.getElementById('server-stats-detail').innerHTML = `
    <div class="user-field"><span>${data.servers.iran}</span><span class="user-field-label">\u0633\u0631\u0648\u0631 \u0627\u06CC\u0631\u0627\u0646</span></div>
    <div class="user-field"><span>${data.servers.foreign}</span><span class="user-field-label">\u0633\u0631\u0648\u0631 \u062E\u0627\u0631\u062C</span></div>
    <div class="user-field"><span class="badge badge-success">${data.servers.active}</span><span class="user-field-label">\u0641\u0639\u0627\u0644</span></div>
    <div class="user-field"><span class="badge badge-danger">${data.tunnels.failed || 0}</span><span class="user-field-label">\u062A\u0627\u0646\u0644 \u0646\u0627\u0645\u0648\u0641\u0642</span></div>`;

  const ap = data.autopilot || {};
  document.getElementById('autopilot-dashboard-detail').innerHTML = `
    <div class="user-field"><span class="badge badge-${ap.enabled !== false ? 'success' : 'danger'}">${ap.enabled !== false ? '\u0641\u0639\u0627\u0644' : '\u063A\u06CC\u0631\u0641\u0639\u0627\u0644'}</span><span class="user-field-label">\u0627\u062A\u0648\u067E\u0627\u06CC\u0644\u0648\u062A</span></div>
    <div class="user-field"><span class="badge badge-info">${ap.primary443 || '-'}</span><span class="user-field-label">\u0627\u0635\u0644\u06CC \u0631\u0648\u06CC 443</span></div>
    <div class="user-field"><span class="badge badge-success">\u0647\u0645\u06CC\u0634\u0647 \u0641\u0639\u0627\u0644</span><span class="user-field-label">TrustTunnel (8443)</span></div>`;

  document.getElementById('panel-mode-detail').innerHTML = `
    <div class="user-field"><span class="badge badge-${panelMode === 'iran' ? 'warning' : 'info'}">${panelMode === 'iran' ? '\u0627\u06CC\u0631\u0627\u0646' : '\u062E\u0627\u0631\u062C'}</span><span class="user-field-label">\u062D\u0627\u0644\u062A</span></div>
    <div class="user-field"><span>${data.version}</span><span class="user-field-label">\u0646\u0633\u062E\u0647</span></div>
    <div class="user-field"><span>\u0642\u0648\u0627\u0646\u06CC\u0646 GeoIP: ${data.geoRouting?.total || 0}</span><span class="user-field-label">\u0645\u0633\u06CC\u0631\u06CC\u0627\u0628\u06CC</span></div>
    <div class="user-field"><span>WARP: ${data.warp?.active ? '\u0641\u0639\u0627\u0644' : '\u063A\u06CC\u0631\u0641\u0639\u0627\u0644'}</span><span class="user-field-label">\u0648\u0627\u0631\u067E</span></div>`;

  loadSystemResources();
}

// ============ SYSTEM RESOURCES ============
async function loadSystemResources() {
  const data = await api('/system/resources');
  if (!data || !data.success) return;
  document.getElementById('res-cpu').textContent = `${data.cpu.usagePercent}%`;
  document.getElementById('res-ram').textContent = `${data.memory.usagePercent}%`;
  document.getElementById('res-disk').textContent = `${data.disk.usagePercent}%`;
  document.getElementById('res-uptime').textContent = data.uptime.systemFormatted;
  document.getElementById('res-detail-left').innerHTML = `<div><strong>CPU:</strong> ${data.cpu.model} (${data.cpu.cores} cores)</div><div><strong>Load:</strong> ${data.cpu.loadAvg['1m']} / ${data.cpu.loadAvg['5m']} / ${data.cpu.loadAvg['15m']}</div><div><strong>RAM:</strong> ${data.memory.usedFormatted} / ${data.memory.totalFormatted}</div>`;
  document.getElementById('res-detail-right').innerHTML = `<div><strong>Disk:</strong> ${data.disk.usedFormatted} / ${data.disk.totalFormatted}</div><div><strong>OS:</strong> ${data.os.distro}</div><div><strong>Node.js:</strong> ${data.os.nodeVersion}</div>`;
}

// ============ USERS ============
let searchTimeout;
function debounceSearchUsers() { clearTimeout(searchTimeout); searchTimeout = setTimeout(() => { usersPage = 1; loadUsers(); }, 300); }

async function loadUsers() {
  const search = document.getElementById('user-search').value;
  const status = document.getElementById('user-filter-status').value;
  const data = await api(`/users?page=${usersPage}&limit=15&search=${search}&status=${status}`);
  if (!data) return;

  // Load online users
  const online = await api('/users/online/list');
  if (online && online.success) {
    document.getElementById('online-users-list').innerHTML = online.count > 0
      ? online.users.map(u => `<span class="tag tag-green">${u.username} (${u.protocol || '-'})</span>`).join('')
      : '\u06A9\u0627\u0631\u0628\u0631 \u0622\u0646\u0644\u0627\u06CC\u0646\u06CC \u0648\u062C\u0648\u062F \u0646\u062F\u0627\u0631\u062F';
  }

  const tbody = document.getElementById('users-table-body');
  if (!data.users || data.users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">\u06A9\u0627\u0631\u0628\u0631\u06CC \u06CC\u0627\u0641\u062A \u0646\u0634\u062F</td></tr>';
    return;
  }
  tbody.innerHTML = data.users.map(u => `<tr>
    <td><strong>${u.username}</strong> ${u.is_online ? '<span class="tag tag-green">\u0622\u0646\u0644\u0627\u06CC\u0646</span>' : ''}</td>
    <td><code style="font-size:11px">${u.uuid.substring(0,8)}...</code></td>
    <td><span class="badge badge-info">${u.plan}</span></td>
    <td><span class="badge badge-${u.status === 'active' ? 'success' : u.status === 'expired' ? 'danger' : 'warning'}">${u.status}</span></td>
    <td>${formatBytes(u.data_used)} / ${formatBytes(u.data_limit)}</td>
    <td>${u.expire_at ? new Date(u.expire_at).toLocaleDateString('fa-IR') : '-'}</td>
    <td>
      <button class="btn btn-sm btn-primary" onclick="viewUser(${u.id})">\u0645\u0634\u0627\u0647\u062F\u0647</button>
      ${capabilities.manageUsers ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id},'${u.username}')">\u062D\u0630\u0641</button>` : ''}
    </td></tr>`).join('');

  const pg = data.pagination;
  let pgHtml = '';
  for (let i = 1; i <= pg.totalPages; i++) { pgHtml += `<button class="${i === pg.page ? 'active' : ''}" onclick="usersPage=${i};loadUsers()">${i}</button>`; }
  document.getElementById('users-pagination').innerHTML = pgHtml;
}

function showCreateUserModal() { openModal('\u0627\u06CC\u062C\u0627\u062F \u06A9\u0627\u0631\u0628\u0631', `
  <form onsubmit="createUser(event)">
    <div class="form-group"><label>\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC *</label><input class="form-control" id="cu-username" required dir="ltr"></div>
    <div class="form-group"><label>\u0631\u0645\u0632 \u0639\u0628\u0648\u0631 (\u062E\u0648\u062F\u06A9\u0627\u0631 \u0627\u06AF\u0631 \u062E\u0627\u0644\u06CC)</label><input class="form-control" id="cu-password" dir="ltr"></div>
    <div class="form-group"><label>\u067E\u0644\u0646</label><select class="form-control" id="cu-plan"><option value="bronze">\u0628\u0631\u0646\u0632\u06CC</option><option value="silver">\u0646\u0642\u0631\u0647\u200C\u0627\u06CC</option><option value="gold">\u0637\u0644\u0627\u06CC\u06CC</option></select></div>
    <div class="form-group"><label>\u062D\u062F \u062A\u0631\u0627\u0641\u06CC\u06A9 (GB)</label><input type="number" class="form-control" id="cu-traffic" value="50"></div>
    <div class="form-group"><label>\u0631\u0648\u0632 \u0627\u0646\u0642\u0636\u0627</label><input type="number" class="form-control" id="cu-expiry" value="30"></div>
    <div class="form-group"><label>\u062D\u062F\u0627\u06A9\u062B\u0631 \u0627\u062A\u0635\u0627\u0644</label><input type="number" class="form-control" id="cu-maxconn" value="2"></div>
    <button type="submit" class="btn btn-primary" style="width:100%">\u0627\u06CC\u062C\u0627\u062F \u06A9\u0627\u0631\u0628\u0631</button>
  </form>`); }

function showAutoCreateModal() {
  const count = prompt('\u0686\u0646\u062F \u06A9\u0627\u0631\u0628\u0631 \u0627\u06CC\u062C\u0627\u062F \u0634\u0648\u062F\u061F', '5');
  if (count) autoCreateUsers(parseInt(count));
}

async function createUser(e) {
  e.preventDefault();
  const data = { username: document.getElementById('cu-username').value, password: document.getElementById('cu-password').value || undefined,
    plan: document.getElementById('cu-plan').value, dataLimit: parseInt(document.getElementById('cu-traffic').value) * 1024 * 1024 * 1024,
    expiryDays: parseInt(document.getElementById('cu-expiry').value), maxConnections: parseInt(document.getElementById('cu-maxconn').value) };
  const result = await api('/users', { method: 'POST', body: JSON.stringify(data) });
  if (result && result.success) { closeModal('genericModal'); loadUsers(); alert(`\u06A9\u0627\u0631\u0628\u0631 \u0627\u06CC\u062C\u0627\u062F \u0634\u062F!\n\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC: ${result.user.username}\n\u0631\u0645\u0632 \u0639\u0628\u0648\u0631: ${result.user.plainPassword}`); }
  else alert(result?.error || '\u062E\u0637\u0627 \u062F\u0631 \u0627\u06CC\u062C\u0627\u062F \u06A9\u0627\u0631\u0628\u0631');
}

async function autoCreateUsers(count) {
  const result = await api('/users/auto-create', { method: 'POST', body: JSON.stringify({ count, plan: 'bronze', expiryDays: 30 }) });
  if (result) { loadUsers(); alert(`${result.results.filter(r => r.success).length} \u06A9\u0627\u0631\u0628\u0631 \u0627\u06CC\u062C\u0627\u062F \u0634\u062F`); }
}

async function viewUser(id) {
  const user = await api(`/users/${id}`);
  if (!user) return;
  const subUrl = `${window.location.origin}/sub/${user.subscription_token}`;
  openModal(`\u062C\u0632\u0626\u06CC\u0627\u062A \u06A9\u0627\u0631\u0628\u0631: ${user.username}`, `
    <div class="user-field"><span class="user-field-value">${user.username}</span><span class="user-field-label">\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC</span></div>
    <div class="user-field"><span class="user-field-value" style="font-size:11px;direction:ltr">${user.uuid}</span><span class="user-field-label">UUID</span></div>
    <div class="user-field"><span class="badge badge-info">${user.plan}</span><span class="user-field-label">\u067E\u0644\u0646</span></div>
    <div class="user-field"><span class="badge badge-${user.status === 'active' ? 'success' : 'danger'}">${user.status}</span><span class="user-field-label">\u0648\u0636\u0639\u06CC\u062A</span></div>
    <div class="user-field"><span>${formatBytes(user.data_used)} / ${formatBytes(user.data_limit)}</span><span class="user-field-label">\u062A\u0631\u0627\u0641\u06CC\u06A9</span></div>
    <div class="user-field"><span>${user.expire_at ? new Date(user.expire_at).toLocaleDateString('fa-IR') : '\u0628\u062F\u0648\u0646 \u0627\u0646\u0642\u0636\u0627'}</span><span class="user-field-label">\u0627\u0646\u0642\u0636\u0627</span></div>
    <h4 class="mt-3 mb-1">\u0644\u06CC\u0646\u06A9 \u0627\u0634\u062A\u0631\u0627\u06A9</h4>
    <div class="sub-link" onclick="copyText(this.textContent)" style="direction:ltr">${subUrl}</div>
    <small style="color:#64748b">\u0628\u0631\u0627\u06CC \u06A9\u067E\u06CC \u06A9\u0644\u06CC\u06A9 \u06A9\u0646\u06CC\u062F</small>
    <div class="flex gap-2 mt-3">
      ${capabilities.manageUsers ? `<button class="btn btn-sm btn-secondary" onclick="resetTraffic(${user.id})">\u0631\u06CC\u0633\u062A \u062A\u0631\u0627\u0641\u06CC\u06A9</button>` : ''}
    </div>`);
}

async function deleteUser(id, username) { if (!confirm(`\u062D\u0630\u0641 \u06A9\u0627\u0631\u0628\u0631 "${username}"\u061F`)) return; await api(`/users/${id}`, { method: 'DELETE' }); loadUsers(); }
async function resetTraffic(id) { await api(`/users/${id}/reset-traffic`, { method: 'POST' }); alert('\u062A\u0631\u0627\u0641\u06CC\u06A9 \u0631\u06CC\u0633\u062A \u0634\u062F'); viewUser(id); }

// ============ SERVERS ============
async function loadServers() {
  const servers = await api('/servers');
  if (!servers) return;
  const grid = document.getElementById('servers-grid');
  if (!servers.length) { grid.innerHTML = '<div class="card text-center">\u0633\u0631\u0648\u0631\u06CC \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647. \u0627\u0648\u0644\u06CC\u0646 \u0633\u0631\u0648\u0631 \u062E\u0648\u062F \u0631\u0627 \u0627\u0636\u0627\u0641\u0647 \u06A9\u0646\u06CC\u062F.</div>'; return; }
  grid.innerHTML = servers.map(s => `<div class="card server-card">
    <span class="server-type badge badge-${s.type === 'iran' ? 'info' : 'success'}">${s.type === 'iran' ? '\u0627\u06CC\u0631\u0627\u0646' : '\u062E\u0627\u0631\u062C'}</span>
    <h3>${s.name}</h3><div class="server-ip mt-1">${s.ip}:${s.port}</div>
    <div class="server-meta"><span>\u0647\u0633\u062A\u0647: ${s.core_engine}</span><span>\u0648\u0636\u0639\u06CC\u062A: <span class="badge badge-${s.status === 'active' ? 'success' : 'warning'}">${s.status}</span></span></div>
    <div class="flex gap-2 mt-2">
      <button class="btn btn-sm btn-outline" onclick="regenerateServerToken(${s.id})">\u062A\u0648\u06A9\u0646 \u062C\u062F\u06CC\u062F</button>
      <button class="btn btn-sm btn-danger" onclick="deleteServer(${s.id},'${s.name}')">\u062D\u0630\u0641</button>
    </div></div>`).join('');
}

function showAddServerModal() { openModal('\u0627\u0641\u0632\u0648\u062F\u0646 \u0633\u0631\u0648\u0631', `
  <form onsubmit="addServer(event)">
    <div class="form-group"><label>\u0646\u0627\u0645 *</label><input class="form-control" id="as-name" required></div>
    <div class="form-group"><label>\u0646\u0648\u0639 *</label><select class="form-control" id="as-type"><option value="iran">\u0627\u06CC\u0631\u0627\u0646</option><option value="foreign">\u062E\u0627\u0631\u062C</option></select></div>
    <div class="form-group"><label>IP *</label><input class="form-control" id="as-ip" required dir="ltr"></div>
    <div class="form-group"><label>\u067E\u0648\u0631\u062A</label><input type="number" class="form-control" id="as-port" value="443"></div>
    <div class="form-group"><label>\u0647\u0633\u062A\u0647</label><select class="form-control" id="as-core"><option value="xray">Xray</option><option value="singbox">Sing-box</option></select></div>
    <button type="submit" class="btn btn-primary" style="width:100%">\u0627\u0641\u0632\u0648\u062F\u0646 \u0633\u0631\u0648\u0631</button>
  </form>`); }

async function addServer(e) { e.preventDefault(); const data = { name: document.getElementById('as-name').value, type: document.getElementById('as-type').value, ip: document.getElementById('as-ip').value, port: parseInt(document.getElementById('as-port').value), coreEngine: document.getElementById('as-core').value }; const result = await api('/servers', { method: 'POST', body: JSON.stringify(data) }); if (result && result.success) { closeModal('genericModal'); loadServers(); alert(`\u0633\u0631\u0648\u0631 \u0627\u0636\u0627\u0641\u0647 \u0634\u062F!\n\u062A\u0648\u06A9\u0646: ${result.connectionToken}`); } }
async function regenerateServerToken(id) { if (!confirm('\u062A\u0648\u06A9\u0646 \u062C\u062F\u06CC\u062F \u0627\u06CC\u062C\u0627\u062F \u0634\u0648\u062F\u061F')) return; const r = await api(`/servers/${id}/regenerate-token`, { method: 'POST' }); if (r && r.success) { loadServers(); alert(`\u062A\u0648\u06A9\u0646 \u062C\u062F\u06CC\u062F: ${r.connectionToken}`); } }
async function deleteServer(id, name) { if (!confirm(`\u062D\u0630\u0641 \u0633\u0631\u0648\u0631 "${name}"\u061F`)) return; await api(`/servers/${id}`, { method: 'DELETE' }); loadServers(); }

// ============ TUNNELS ============
async function loadTunnels() {
  const tunnels = await api('/tunnels'); if (!tunnels) return;
  const apStatus = await api('/autopilot/status');
  if (apStatus) { const el = document.getElementById('port443-engine'); if (el) el.textContent = (apStatus.primary443 || 'gost').toUpperCase(); }
  const tbody = document.getElementById('tunnels-table-body');
  if (!tunnels.length) { tbody.innerHTML = '<tr><td colspan="8" class="text-center">\u062A\u0627\u0646\u0644\u06CC \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647. \u062A\u0627\u0646\u0644\u200C\u0647\u0627 \u062A\u0648\u0633\u0637 \u0627\u062A\u0648\u067E\u0627\u06CC\u0644\u0648\u062A \u0645\u062F\u06CC\u0631\u06CC\u062A \u0645\u06CC\u200C\u0634\u0648\u0646\u062F.</td></tr>'; return; }
  tbody.innerHTML = tunnels.map(t => `<tr><td><strong>${t.protocol}</strong></td><td>${t.transport}</td><td>${t.port||'-'}</td><td><span class="badge badge-${t.status==='active'?'success':t.status==='failed'?'danger':'warning'}">${t.status}</span></td><td>${t.score?t.score.toFixed(1):'-'}</td><td>${t.latency_ms?t.latency_ms+'ms':'-'}</td><td>${t.is_primary?'\u2B50':''}</td><td><button class="btn btn-sm btn-danger" onclick="deleteTunnel(${t.id})">\u062D\u0630\u0641</button></td></tr>`).join('');
}
async function runMonitoring() { const btn=event.target; btn.disabled=true; btn.textContent='\u062F\u0631 \u062D\u0627\u0644 \u0627\u062C\u0631\u0627...'; const r=await api('/tunnels/monitor',{method:'POST'}); btn.disabled=false; btn.textContent='\u2699 \u0627\u062C\u0631\u0627\u06CC \u0645\u0627\u0646\u06CC\u062A\u0648\u0631'; if(r){loadTunnels();alert(`\u0645\u0627\u0646\u06CC\u062A\u0648\u0631\u06CC\u0646\u06AF \u06A9\u0627\u0645\u0644 \u0634\u062F. \u0628\u0631\u0631\u0633\u06CC: ${r.checked}, \u062A\u0639\u0648\u06CC\u0636: ${r.switched}`);} }
async function deleteTunnel(id) { if (!confirm('\u062D\u0630\u0641 \u0627\u06CC\u0646 \u062A\u0627\u0646\u0644\u061F')) return; await api(`/tunnels/${id}`,{method:'DELETE'}); loadTunnels(); }

// ============ AUTOPILOT ============
async function loadAutopilot() {
  const data = await api('/autopilot/status'); if (!data) return;
  document.getElementById('ap-primary443').textContent = (data.primary443 || '-').toUpperCase();
  document.getElementById('ap-switch-count').textContent = data.switchCount || 0;
  document.getElementById('ap-last-cycle').textContent = data.lastMonitorCycle ? new Date(data.lastMonitorCycle).toLocaleTimeString('fa-IR') : '\u0647\u0631\u06AF\u0632';
  const candidates = data.portAllocation?.port443?.candidates || ['ssh','frp','gost','chisel'];
  let html = '<div class="grid grid-2 gap-2">';
  for (const eng of candidates) {
    const isPrimary = eng === data.primary443;
    html += `<div class="card" style="padding:16px;border:2px solid ${isPrimary?'#22c55e':'#e2e8f0'}"><div class="flex gap-2" style="justify-content:space-between"><strong>${eng.toUpperCase()}</strong>${isPrimary?'<span class="badge badge-success">\u2B50 \u0627\u0635\u0644\u06CC</span>':'<span class="badge badge-warning">\u0622\u0645\u0627\u062F\u0647</span>'}</div></div>`;
  }
  html += '</div>';
  document.getElementById('autopilot-candidates').innerHTML = html;
  const alwaysOn = data.portAllocation?.alwaysOn || {};
  let aoHtml = '<div class="grid grid-3 gap-2">';
  for (const [name, info] of Object.entries(alwaysOn)) { aoHtml += `<div class="card" style="padding:16px;border:2px solid #22c55e"><strong>${name.toUpperCase()}</strong><div style="font-size:12px;color:#64748b">\u067E\u0648\u0631\u062A\u200C\u0647\u0627: ${(info.ports||[]).join(', ')}</div></div>`; }
  aoHtml += '</div>';
  document.getElementById('autopilot-always-on').innerHTML = aoHtml;
  document.getElementById('tunnel-engines-list').innerHTML = '<div style="color:#64748b;font-size:13px">SSH, FRP, GOST, Chisel, TrustTunnel</div>';
}
async function runAutopilotMonitor() { const btn=event.target; btn.disabled=true; const r=await api('/autopilot/monitor',{method:'POST'}); btn.disabled=false; if(r){loadAutopilot(); alert(`\u0633\u06CC\u06A9\u0644 \u06A9\u0627\u0645\u0644 \u0634\u062F. \u0627\u0635\u0644\u06CC: ${r.primaryEngine||'-'}`);} }
async function setManualPrimary() { const engine=document.getElementById('manual-primary-select').value; if(!confirm(`${engine.toUpperCase()} \u0628\u0647 \u0639\u0646\u0648\u0627\u0646 \u062A\u0627\u0646\u0644 \u0627\u0635\u0644\u06CC \u062A\u0646\u0638\u06CC\u0645 \u0634\u0648\u062F\u061F`))return; const r=await api('/autopilot/set-primary',{method:'POST',body:JSON.stringify({engine})}); if(r&&r.success){loadAutopilot();alert(`\u0627\u0635\u0644\u06CC \u062A\u0646\u0638\u06CC\u0645 \u0634\u062F: ${engine.toUpperCase()}`);} }

// ============ GEO ROUTING ============
async function loadGeoRouting() {
  const [rulesData, statusData] = await Promise.all([api('/geo-routing/rules'), api('/geo-routing/status')]);
  if (statusData && statusData.success) {
    document.getElementById('geo-status').innerHTML = `
      <div class="grid grid-4 gap-2">
        <div><strong>\u06A9\u0644 \u0642\u0648\u0627\u0646\u06CC\u0646:</strong> ${statusData.totalRules}</div>
        <div><strong>\u0641\u0639\u0627\u0644:</strong> ${statusData.enabledRules}</div>
        <div><strong>\u0622\u062E\u0631\u06CC\u0646 \u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC:</strong> ${statusData.lastUpdate ? new Date(statusData.lastUpdate).toLocaleDateString('fa-IR') : '\u0647\u0631\u06AF\u0632'}</div>
        <div><strong>\u0647\u0633\u062A\u0647:</strong> ${statusData.engine}</div>
      </div>`;
  }
  if (rulesData && rulesData.success) {
    const tbody = document.getElementById('geo-rules-body');
    if (!rulesData.rules.length) { tbody.innerHTML = '<tr><td colspan="7">\u0642\u0627\u0646\u0648\u0646\u06CC \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A. \u067E\u06CC\u0634\u200C\u0641\u0631\u0636\u200C\u0647\u0627 \u0631\u0627 \u0628\u0627\u0631\u06AF\u0630\u0627\u0631\u06CC \u06A9\u0646\u06CC\u062F.</td></tr>'; return; }
    tbody.innerHTML = rulesData.rules.map(r => `<tr>
      <td>${r.name}</td><td><span class="tag tag-blue">${r.type}</span></td><td><span class="tag tag-${r.action==='block'?'red':r.action==='direct'?'green':'yellow'}">${r.action}</span></td>
      <td style="direction:ltr;font-size:12px">${r.value}</td><td>${r.priority}</td>
      <td><label class="switch"><input type="checkbox" ${r.enabled?'checked':''} onchange="toggleGeoRule(${r.id})"><span class="slider"></span></label></td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteGeoRule(${r.id})">\u062D\u0630\u0641</button></td></tr>`).join('');
  }
}
async function toggleGeoRule(id) { await api(`/geo-routing/rules/${id}/toggle`,{method:'POST'}); loadGeoRouting(); }
async function deleteGeoRule(id) { if(!confirm('\u062D\u0630\u0641 \u0627\u06CC\u0646 \u0642\u0627\u0646\u0648\u0646\u061F'))return; await api(`/geo-routing/rules/${id}`,{method:'DELETE'}); loadGeoRouting(); }
async function initDefaultGeoRules() { const r=await api('/geo-routing/init-defaults',{method:'POST'}); if(r) { loadGeoRouting(); alert(r.message||`${r.count} \u0642\u0627\u0646\u0648\u0646 \u067E\u06CC\u0634\u200C\u0641\u0631\u0636 \u0627\u0636\u0627\u0641\u0647 \u0634\u062F`); } }
async function updateGeoData() { alert('\u062F\u0631 \u062D\u0627\u0644 \u062F\u0627\u0646\u0644\u0648\u062F GeoData...'); const r=await api('/geo-routing/update-geodata',{method:'POST'}); if(r) { loadGeoRouting(); alert('\u0628\u0631\u0648\u0632\u0631\u0633\u0627\u0646\u06CC \u06A9\u0627\u0645\u0644 \u0634\u062F'); } }
function showAddGeoRuleModal() { openModal('\u0627\u0641\u0632\u0648\u062F\u0646 \u0642\u0627\u0646\u0648\u0646 \u0645\u0633\u06CC\u0631\u06CC\u0627\u0628\u06CC', `
  <form onsubmit="addGeoRule(event)">
    <div class="form-group"><label>\u0646\u0627\u0645 *</label><input class="form-control" id="gr-name" required></div>
    <div class="form-group"><label>\u0646\u0648\u0639</label><select class="form-control" id="gr-type"><option value="geoip">GeoIP</option><option value="geosite">GeoSite</option><option value="domain">Domain</option><option value="ip">IP</option></select></div>
    <div class="form-group"><label>\u0639\u0645\u0644</label><select class="form-control" id="gr-action"><option value="direct">\u0645\u0633\u062A\u0642\u06CC\u0645 (Direct)</option><option value="proxy">\u067E\u0631\u0648\u06A9\u0633\u06CC (Proxy)</option><option value="block">\u0645\u0633\u062F\u0648\u062F (Block)</option><option value="warp">WARP</option></select></div>
    <div class="form-group"><label>\u0645\u0642\u062F\u0627\u0631 *</label><input class="form-control" id="gr-value" required dir="ltr" placeholder="ir, private, category-ads-all, ..."></div>
    <div class="form-group"><label>\u0627\u0648\u0644\u0648\u06CC\u062A</label><input type="number" class="form-control" id="gr-priority" value="50"></div>
    <button type="submit" class="btn btn-primary" style="width:100%">\u0627\u0641\u0632\u0648\u062F\u0646</button></form>`); }
async function addGeoRule(e) { e.preventDefault(); const r=await api('/geo-routing/rules',{method:'POST',body:JSON.stringify({name:document.getElementById('gr-name').value,type:document.getElementById('gr-type').value,action:document.getElementById('gr-action').value,value:document.getElementById('gr-value').value,priority:parseInt(document.getElementById('gr-priority').value)})}); if(r&&r.success){closeModal('genericModal');loadGeoRouting();} }

// ============ CORE MANAGEMENT ============
async function loadCore() {
  const data = await api('/core/status'); if (!data || !data.success) return;
  const b = data.binaries;
  document.getElementById('xray-status').innerHTML = `
    <div class="user-field"><span>${b.xray?.installed?'\u0646\u0635\u0628 \u0634\u062F\u0647':'\u0646\u0635\u0628 \u0646\u0634\u062F\u0647'}</span><span class="user-field-label">\u0648\u0636\u0639\u06CC\u062A</span></div>
    ${b.xray?.version?`<div class="user-field"><span>${b.xray.version}</span><span class="user-field-label">\u0646\u0633\u062E\u0647</span></div>`:''}
    <div class="user-field"><span class="badge badge-${data.processStatus.xray?.running?'success':'danger'}">${data.processStatus.xray?.running?'\u062F\u0631 \u062D\u0627\u0644 \u0627\u062C\u0631\u0627':'\u0645\u062A\u0648\u0642\u0641'}</span><span class="user-field-label">\u067E\u0631\u0648\u0633\u0633</span></div>`;
  document.getElementById('singbox-status').innerHTML = `
    <div class="user-field"><span>${b.singbox?.installed?'\u0646\u0635\u0628 \u0634\u062F\u0647':'\u0646\u0635\u0628 \u0646\u0634\u062F\u0647'}</span><span class="user-field-label">\u0648\u0636\u0639\u06CC\u062A</span></div>
    ${b.singbox?.version?`<div class="user-field"><span>${b.singbox.version}</span><span class="user-field-label">\u0646\u0633\u062E\u0647</span></div>`:''}
    <div class="user-field"><span class="badge badge-${data.processStatus.singbox?.running?'success':'danger'}">${data.processStatus.singbox?.running?'\u062F\u0631 \u062D\u0627\u0644 \u0627\u062C\u0631\u0627':'\u0645\u062A\u0648\u0642\u0641'}</span><span class="user-field-label">\u067E\u0631\u0648\u0633\u0633</span></div>`;
  
  // Port conflicts
  const conflicts = data.portConflicts || [];
  document.getElementById('port-conflicts').innerHTML = conflicts.length
    ? conflicts.map(c => `<div class="tag tag-red">\u067E\u0648\u0631\u062A ${c.port} (${c.protocol}) - ${c.process}</div>`).join('')
    : '<span class="tag tag-green">\u062A\u062F\u0627\u062E\u0644\u06CC \u06CC\u0627\u0641\u062A \u0646\u0634\u062F</span>';

  // XTLS protocols info
  document.getElementById('core-versions').innerHTML = `
    <div style="font-size:13px;color:#64748b">
      <strong>\u067E\u0631\u0648\u062A\u06A9\u0644\u200C\u0647\u0627\u06CC XTLS \u067E\u0634\u062A\u06CC\u0628\u0627\u0646\u06CC \u0634\u062F\u0647:</strong> RPRX-Direct, Vision, REALITY<br>
      <strong>\u067E\u0631\u0648\u062A\u06A9\u0644\u200C\u0647\u0627:</strong> ${(data.protocols?.supported||[]).join(', ')}
    </div>`;
}
async function coreAction(engine, action) {
  const r = await api(`/core/${action}`, { method: 'POST', body: JSON.stringify({ engine }) });
  if (r) { alert(r.message || r.error || '\u0639\u0645\u0644\u06CC\u0627\u062A \u0627\u0646\u062C\u0627\u0645 \u0634\u062F'); loadCore(); }
}
async function loadCoreLogs(engine) {
  const r = await api(`/core/logs/${engine}`);
  const el = document.getElementById('core-logs');
  el.style.display = 'block';
  el.textContent = r?.logs || r?.error || 'No logs';
}

// ============ WARP ============
async function loadWarp() {
  const [statusData, configsData] = await Promise.all([api('/warp/status'), api('/warp/configs')]);
  if (statusData && statusData.success) {
    document.getElementById('warp-status').innerHTML = `
      <div class="user-field"><span class="badge badge-${statusData.active?'success':'warning'}">${statusData.active?'\u0641\u0639\u0627\u0644':'\u063A\u06CC\u0631\u0641\u0639\u0627\u0644'}</span><span class="user-field-label">\u0648\u0636\u0639\u06CC\u062A</span></div>
      <div class="user-field"><span>${statusData.configCount}</span><span class="user-field-label">\u062A\u0639\u062F\u0627\u062F \u062A\u0646\u0638\u06CC\u0645\u0627\u062A</span></div>
      ${statusData.activeName?`<div class="user-field"><span>${statusData.activeName}</span><span class="user-field-label">\u0641\u0639\u0627\u0644</span></div>`:''}
      <div class="user-field"><span>${(statusData.domains||[]).length} \u062F\u0627\u0645\u0646\u0647</span><span class="user-field-label">\u062F\u0627\u0645\u0646\u0647\u200C\u0647\u0627\u06CC WARP</span></div>`;
  }
  if (configsData && configsData.success) {
    document.getElementById('warp-configs').innerHTML = configsData.configs.length
      ? configsData.configs.map(c => `<div class="card mb-2" style="padding:12px">
          <div class="flex gap-2" style="justify-content:space-between"><strong>${c.name}</strong><span class="badge badge-${c.status==='active'?'success':'warning'}">${c.status}</span></div>
          <div style="font-size:12px;color:#64748b;direction:ltr">Endpoint: ${c.endpoint||'-'}</div>
          <div class="flex gap-2 mt-2">
            <button class="btn btn-sm btn-success" onclick="activateWarp(${c.id})">\u0641\u0639\u0627\u0644\u200C\u0633\u0627\u0632\u06CC</button>
            <button class="btn btn-sm btn-danger" onclick="deleteWarp(${c.id})">\u062D\u0630\u0641</button>
          </div></div>`).join('')
      : '\u062A\u0646\u0638\u06CC\u0645\u0627\u062A WARP \u0627\u06CC \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A';
  }
}
function showAddWarpModal() { openModal('\u0627\u0641\u0632\u0648\u062F\u0646 \u062A\u0646\u0638\u06CC\u0645\u0627\u062A WARP', `
  <form onsubmit="addWarpConfig(event)">
    <div class="form-group"><label>\u0646\u0627\u0645 *</label><input class="form-control" id="wc-name" required></div>
    <div class="form-group"><label>Private Key</label><input class="form-control" id="wc-privkey" dir="ltr"></div>
    <div class="form-group"><label>Public Key</label><input class="form-control" id="wc-pubkey" dir="ltr"></div>
    <div class="form-group"><label>Endpoint</label><input class="form-control" id="wc-endpoint" value="engage.cloudflareclient.com:2408" dir="ltr"></div>
    <button type="submit" class="btn btn-primary" style="width:100%">\u0627\u0636\u0627\u0641\u0647 \u06A9\u0631\u062F\u0646</button></form>`); }
async function addWarpConfig(e) { e.preventDefault(); const r=await api('/warp/configs',{method:'POST',body:JSON.stringify({name:document.getElementById('wc-name').value,private_key:document.getElementById('wc-privkey').value,public_key:document.getElementById('wc-pubkey').value,endpoint:document.getElementById('wc-endpoint').value})}); if(r&&r.success){closeModal('genericModal');loadWarp();} }
async function activateWarp(id) { await api(`/warp/configs/${id}/activate`,{method:'POST'}); loadWarp(); }
async function deleteWarp(id) { if(!confirm('\u062D\u0630\u0641\u061F'))return; await api(`/warp/configs/${id}`,{method:'DELETE'}); loadWarp(); }

// ============ CONTENT BLOCKING ============
async function loadContentBlock() {
  const data = await api('/content-block/categories'); if (!data || !data.success) return;
  const catNames = { torrent: '\u062A\u0648\u0631\u0646\u062A (BitTorrent)', porn: '\u067E\u0648\u0631\u0646\u0648\u06AF\u0631\u0627\u0641\u06CC', gambling: '\u0642\u0645\u0627\u0631', ads: '\u062A\u0628\u0644\u06CC\u063A\u0627\u062A', malware: '\u0628\u062F\u0627\u0641\u0632\u0627\u0631 / \u0641\u06CC\u0634\u06CC\u0646\u06AF', custom: '\u0633\u0641\u0627\u0631\u0634\u06CC' };
  document.getElementById('content-categories').innerHTML = data.categories.map(c => `
    <div class="user-field" style="padding:12px 0">
      <div>
        <strong>${catNames[c.category]||c.category}</strong>
        <div style="font-size:12px;color:#64748b">${c.description}</div>
      </div>
      <label class="switch"><input type="checkbox" ${c.enabled?'checked':''} onchange="toggleContentBlock('${c.category}',this.checked)"><span class="slider"></span></label>
    </div>`).join('');
}
async function toggleContentBlock(category, enabled) { await api('/content-block/toggle',{method:'POST',body:JSON.stringify({category,enabled})}); }

// ============ SUBDOMAINS ============
async function loadSubdomains() {
  const data = await api('/subdomains'); if (!data || !data.success) return;
  const tbody = document.getElementById('subdomains-body');
  if (!data.subdomains.length) { tbody.innerHTML = '<tr><td colspan="5">\u0633\u0627\u0628\u200C\u062F\u0627\u0645\u06CC\u0646\u06CC \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A</td></tr>'; return; }
  tbody.innerHTML = data.subdomains.map(s => `<tr>
    <td style="direction:ltr">${s.subdomain}</td><td style="direction:ltr">${s.parent_domain}</td><td>${s.purpose}</td>
    <td><span class="badge badge-${s.ssl_status==='active'?'success':s.ssl_status==='pending'?'warning':'danger'}">${s.ssl_status}</span></td>
    <td>
      <button class="btn btn-sm btn-success" onclick="requestSubdomainSSL(${s.id})">\u062F\u0631\u062E\u0648\u0627\u0633\u062A SSL</button>
      <button class="btn btn-sm btn-danger" onclick="deleteSubdomain(${s.id})">\u062D\u0630\u0641</button>
    </td></tr>`).join('');
}
function showAddSubdomainModal() { openModal('\u0627\u0641\u0632\u0648\u062F\u0646 \u0633\u0627\u0628\u200C\u062F\u0627\u0645\u06CC\u0646', `
  <form onsubmit="addSubdomain(event)">
    <div class="form-group"><label>\u0633\u0627\u0628\u200C\u062F\u0627\u0645\u06CC\u0646 *</label><input class="form-control" id="sd-sub" required dir="ltr" placeholder="cdn.example.com"></div>
    <div class="form-group"><label>\u062F\u0627\u0645\u06CC\u0646 \u0627\u0635\u0644\u06CC *</label><input class="form-control" id="sd-parent" required dir="ltr" placeholder="example.com"></div>
    <div class="form-group"><label>\u06A9\u0627\u0631\u0628\u0631\u062F</label><input class="form-control" id="sd-purpose" value="general"></div>
    <button type="submit" class="btn btn-primary" style="width:100%">\u0627\u0641\u0632\u0648\u062F\u0646</button></form>`); }
async function addSubdomain(e) { e.preventDefault(); const r=await api('/subdomains',{method:'POST',body:JSON.stringify({subdomain:document.getElementById('sd-sub').value,parent_domain:document.getElementById('sd-parent').value,purpose:document.getElementById('sd-purpose').value})}); if(r&&r.success){closeModal('genericModal');loadSubdomains();} else alert(r?.error||'\u062E\u0637\u0627'); }
async function requestSubdomainSSL(id) { const r=await api(`/subdomains/${id}/request-ssl`,{method:'POST'}); if(r) alert(r.message||'\u062F\u0631\u062E\u0648\u0627\u0633\u062A \u062B\u0628\u062A \u0634\u062F'); loadSubdomains(); }
async function deleteSubdomain(id) { if(!confirm('\u062D\u0630\u0641\u061F'))return; await api(`/subdomains/${id}`,{method:'DELETE'}); loadSubdomains(); }

// ============ DOMAINS ============
async function loadDomains() {
  const data = await api('/domains'); if (!data || !data.success) return;
  const tbody = document.getElementById('domains-table-body');
  if (!data.domains || !data.domains.length) { tbody.innerHTML = '<tr><td colspan="7">\u062F\u0627\u0645\u0646\u0647\u200C\u0627\u06CC \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647</td></tr>'; return; }
  tbody.innerHTML = data.domains.map(d => `<tr>
    <td style="direction:ltr"><strong>${d.domain}</strong></td>
    <td><span class="badge badge-${d.type==='main'?'info':'success'}">${d.type}</span></td>
    <td>${d.purpose||'-'}</td>
    <td><span class="badge badge-${d.ssl_status!=='none'?'success':'warning'}">${d.ssl_status}</span></td>
    <td>${d.is_accessible_iran===1?'<span class="badge badge-success">\u0628\u0644\u0647</span>':d.is_accessible_iran===0?'<span class="badge badge-danger">\u0645\u0633\u062F\u0648\u062F</span>':'<span class="badge badge-warning">\u0646\u0627\u0645\u0634\u062E\u0635</span>'}</td>
    <td>${d.last_check||'-'}</td>
    <td><button class="btn btn-sm btn-danger" onclick="deleteDomain('${d.domain}')">\u062D\u0630\u0641</button></td></tr>`).join('');
}
function showAddDomainModal() { openModal('\u0627\u0641\u0632\u0648\u062F\u0646 \u062F\u0627\u0645\u0646\u0647', `
  <form onsubmit="addDomain(event)">
    <div class="form-group"><label>\u062F\u0627\u0645\u0646\u0647 *</label><input class="form-control" id="ad-domain" required dir="ltr" placeholder="example.com"></div>
    <button type="submit" class="btn btn-primary" style="width:100%">\u0627\u0641\u0632\u0648\u062F\u0646</button></form>`); }
async function addDomain(e) { e.preventDefault(); const r=await api('/domains',{method:'POST',body:JSON.stringify({domain:document.getElementById('ad-domain').value})}); if(r&&r.success){closeModal('genericModal');loadDomains();} }
async function deleteDomain(domain) { if(!confirm(`\u062D\u0630\u0641 "${domain}"\u061F`))return; await api(`/domains/${domain}`,{method:'DELETE'}); loadDomains(); }

// ============ EXTERNAL PANELS ============
async function loadExternalPanels() {
  const data = await api('/external-panels'); if (!data || !data.success) return;
  const grid = document.getElementById('external-panels-grid');
  if (!data.panels.length) { grid.innerHTML = '<div class="card text-center" style="grid-column:span 2">\u067E\u0646\u0644 \u062E\u0627\u0631\u062C\u06CC \u062A\u0646\u0638\u06CC\u0645 \u0646\u0634\u062F\u0647</div>'; return; }
  grid.innerHTML = data.panels.map(p => `<div class="card"><h3>${p.name}</h3><span class="badge badge-${p.status==='active'?'success':'warning'}">${p.status}</span><div class="server-meta mt-1"><span>\u0646\u0648\u0639: ${p.type}</span></div><div class="flex gap-2 mt-2"><button class="btn btn-sm btn-danger" onclick="deleteExternalPanel(${p.id})">\u062D\u0630\u0641</button></div></div>`).join('');
}
function showAddExternalPanelModal() { openModal('\u0627\u0641\u0632\u0648\u062F\u0646 \u067E\u0646\u0644 \u062E\u0627\u0631\u062C\u06CC', `
  <form onsubmit="addExternalPanel(event)">
    <div class="form-group"><label>\u0646\u0627\u0645 *</label><input class="form-control" id="ep-name" required></div>
    <div class="form-group"><label>\u0646\u0648\u0639</label><select class="form-control" id="ep-type"><option value="marzban">Marzban</option><option value="3xui">3x-ui</option></select></div>
    <div class="form-group"><label>URL *</label><input class="form-control" id="ep-url" required dir="ltr"></div>
    <div class="form-group"><label>\u0646\u0627\u0645 \u06A9\u0627\u0631\u0628\u0631\u06CC</label><input class="form-control" id="ep-user" dir="ltr"></div>
    <div class="form-group"><label>\u0631\u0645\u0632 \u0639\u0628\u0648\u0631</label><input type="password" class="form-control" id="ep-pass" dir="ltr"></div>
    <button type="submit" class="btn btn-primary" style="width:100%">\u0627\u0636\u0627\u0641\u0647 \u06A9\u0631\u062F\u0646</button></form>`); }
async function addExternalPanel(e) { e.preventDefault(); const r=await api('/external-panels',{method:'POST',body:JSON.stringify({name:document.getElementById('ep-name').value,type:document.getElementById('ep-type').value,url:document.getElementById('ep-url').value,username:document.getElementById('ep-user').value,password:document.getElementById('ep-pass').value})}); if(r&&r.success){closeModal('genericModal');loadExternalPanels();} }
async function deleteExternalPanel(id) { if(!confirm('\u062D\u0630\u0641\u061F'))return; await api(`/external-panels/${id}`,{method:'DELETE'}); loadExternalPanels(); }

// ============ API KEYS ============
async function loadApiKeys() {
  const data = await api('/api-keys'); if (!data || !data.success) return;
  const tbody = document.getElementById('apikeys-body');
  if (!data.keys.length) { tbody.innerHTML = '<tr><td colspan="6">\u06A9\u0644\u06CC\u062F API \u0645\u0648\u062C\u0648\u062F \u0646\u06CC\u0633\u062A</td></tr>'; return; }
  tbody.innerHTML = data.keys.map(k => `<tr>
    <td>${k.name}</td><td>${k.permissions}</td>
    <td><span class="badge badge-${k.status==='active'?'success':'danger'}">${k.status}</span></td>
    <td>${k.last_used||'-'}</td><td>${k.expires_at||'\u0628\u062F\u0648\u0646 \u0627\u0646\u0642\u0636\u0627'}</td>
    <td><button class="btn btn-sm btn-danger" onclick="revokeApiKey(${k.id})">\u0644\u063A\u0648</button></td></tr>`).join('');
}
function showCreateApiKeyModal() { openModal('\u0627\u06CC\u062C\u0627\u062F \u06A9\u0644\u06CC\u062F API', `
  <form onsubmit="createApiKey(event)">
    <div class="form-group"><label>\u0646\u0627\u0645 *</label><input class="form-control" id="ak-name" required></div>
    <div class="form-group"><label>\u0627\u0646\u0642\u0636\u0627 (\u0631\u0648\u0632)</label><input type="number" class="form-control" id="ak-expiry" placeholder="\u0628\u062F\u0648\u0646 \u0627\u0646\u0642\u0636\u0627"></div>
    <button type="submit" class="btn btn-primary" style="width:100%">\u0627\u06CC\u062C\u0627\u062F</button></form>`); }
async function createApiKey(e) { e.preventDefault(); const r=await api('/api-keys',{method:'POST',body:JSON.stringify({name:document.getElementById('ak-name').value,expiresIn:parseInt(document.getElementById('ak-expiry').value)||null})}); if(r&&r.success){closeModal('genericModal');loadApiKeys();alert(`\u06A9\u0644\u06CC\u062F API:\n${r.key}\n\n\u0627\u06CC\u0646 \u06A9\u0644\u06CC\u062F \u0641\u0642\u0637 \u06CC\u06A9\u200C\u0628\u0627\u0631 \u0646\u0645\u0627\u06CC\u0634 \u062F\u0627\u062F\u0647 \u0645\u06CC\u200C\u0634\u0648\u062F!`);} }
async function revokeApiKey(id) { if(!confirm('\u0644\u063A\u0648 \u06A9\u0644\u06CC\u062F\u061F'))return; await api(`/api-keys/${id}`,{method:'DELETE'}); loadApiKeys(); }

// ============ IMPORT/EXPORT ============
async function exportUsers() { const format=document.getElementById('export-format').value; const d=await api(`/export/users?format=${format}`); if(d)downloadJSON(d,`elahe-users-${format}`); }
async function exportSettings() { const d=await api('/export/settings'); if(d)downloadJSON(d,'elahe-settings'); }
async function exportFull() { const d=await api('/export/full'); if(d)downloadJSON(d,'elahe-full-backup'); }
function downloadJSON(data,filename) { const b=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}); const u=URL.createObjectURL(b); const a=document.createElement('a'); a.href=u; a.download=`${filename}-${new Date().toISOString().split('T')[0]}.json`; a.click(); URL.revokeObjectURL(u); }
async function readImportFile() { return new Promise((resolve,reject)=>{ const f=document.getElementById('import-file').files[0]; if(!f){alert('\u0644\u0637\u0641\u0627\u064B \u06CC\u06A9 \u0641\u0627\u06CC\u0644 JSON \u0627\u0646\u062A\u062E\u0627\u0628 \u06A9\u0646\u06CC\u062F');reject('No file');return;} const r=new FileReader(); r.onload=(e)=>{try{resolve(JSON.parse(e.target.result))}catch(err){alert('\u0641\u0627\u06CC\u0644 JSON \u0646\u0627\u0645\u0639\u062A\u0628\u0631');reject(err)}}; r.readAsText(f); }); }
async function importUsers() { try{const d=await readImportFile();showImportResult(await api('/import/users',{method:'POST',body:JSON.stringify(d)}))}catch(e){} }
async function importSettings() { try{const d=await readImportFile();showImportResult(await api('/import/settings',{method:'POST',body:JSON.stringify(d)}))}catch(e){} }
async function importFull() { try{const d=await readImportFile();showImportResult(await api('/import/full',{method:'POST',body:JSON.stringify(d)}))}catch(e){} }
function showImportResult(result) { const el=document.getElementById('import-result'); if(!result){el.style.display='none';return;} el.style.display='block'; el.className='mt-2 alert '+(result.success?'alert-success':'alert-error'); el.innerHTML=`<strong>${result.success?'\u0645\u0648\u0641\u0642':'\u062E\u0637\u0627'}:</strong> ${JSON.stringify(result)}`; }

// ============ SETTINGS ============
async function loadSettings() {
  const settings = await api('/settings'); if (!settings) return;
  const isIran = settings._mode === 'iran';
  let html = '<div class="grid grid-2 gap-3">';
  if (isIran) {
    html += `<div><h4 class="mb-2">\u0633\u0627\u06CC\u062A \u0627\u06CC\u0631\u0627\u0646 (\u0641\u0627\u0631\u0633\u06CC)</h4>
      <div class="form-group"><label>\u0639\u0646\u0648\u0627\u0646</label><input class="form-control" name="site.ir.title" value="${escHtml(settings['site.ir.title']||'')}"></div>
      <div class="form-group"><label>\u0632\u06CC\u0631\u0639\u0646\u0648\u0627\u0646</label><input class="form-control" name="site.ir.subtitle" value="${escHtml(settings['site.ir.subtitle']||'')}"></div>
      <div class="form-group"><label>\u0631\u0646\u06AF \u0627\u0635\u0644\u06CC</label><input type="color" class="form-control" name="site.ir.primaryColor" value="${settings['site.ir.primaryColor']||'#1a73e8'}" style="height:40px"></div></div>`;
  } else {
    html += `<div><h4 class="mb-2">\u0633\u0627\u06CC\u062A \u062E\u0627\u0631\u062C (\u0627\u0646\u06AF\u0644\u06CC\u0633\u06CC)</h4>
      <div class="form-group"><label>\u0639\u0646\u0648\u0627\u0646</label><input class="form-control" name="site.en.title" value="${escHtml(settings['site.en.title']||'')}"></div>
      <div class="form-group"><label>\u0632\u06CC\u0631\u0639\u0646\u0648\u0627\u0646</label><input class="form-control" name="site.en.subtitle" value="${escHtml(settings['site.en.subtitle']||'')}"></div></div>`;
  }
  html += `<div><h4 class="mb-2">\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0647\u0633\u062A\u0647</h4>
    <div class="form-group"><label>\u0645\u0648\u062A\u0648\u0631 \u0647\u0633\u062A\u0647</label><select class="form-control" name="core.engine"><option value="xray" ${settings['core.engine']==='xray'?'selected':''}>Xray</option><option value="singbox" ${settings['core.engine']==='singbox'?'selected':''}>Sing-box</option></select></div>
    <h4 class="mb-2 mt-3">\u067E\u06CC\u0634\u200C\u0641\u0631\u0636 \u06A9\u0627\u0631\u0628\u0631\u0627\u0646</h4>
    <div class="form-group"><label>\u067E\u0644\u0646 \u067E\u06CC\u0634\u200C\u0641\u0631\u0636</label><select class="form-control" name="user.defaultPlan"><option value="bronze" ${settings['user.defaultPlan']==='bronze'?'selected':''}>\u0628\u0631\u0646\u0632\u06CC</option><option value="silver" ${settings['user.defaultPlan']==='silver'?'selected':''}>\u0646\u0642\u0631\u0647\u200C\u0627\u06CC</option><option value="gold" ${settings['user.defaultPlan']==='gold'?'selected':''}>\u0637\u0644\u0627\u06CC\u06CC</option></select></div>
    <div class="form-group"><label>\u0631\u0648\u0632 \u0627\u0646\u0642\u0636\u0627</label><input type="number" class="form-control" name="user.defaultExpiryDays" value="${settings['user.defaultExpiryDays']||'30'}"></div>
    <div class="form-group"><label>\u062D\u062F\u0627\u06A9\u062B\u0631 \u0627\u062A\u0635\u0627\u0644</label><input type="number" class="form-control" name="user.defaultMaxConnections" value="${settings['user.defaultMaxConnections']||'2'}"></div></div></div>`;
  document.getElementById('settings-sections').innerHTML = html;
}
async function saveSettings(e) { e.preventDefault(); const form=document.getElementById('settings-form'); const data={}; form.querySelectorAll('[name]').forEach(el=>{data[el.name]=el.value}); const r=await api('/settings',{method:'PUT',body:JSON.stringify(data)}); if(r&&r.success)alert('\u062A\u0646\u0638\u06CC\u0645\u0627\u062A \u0630\u062E\u06CC\u0631\u0647 \u0634\u062F!'); }

// Custom port management
async function requestCustomPort() {
  const port = document.getElementById('cp-port').value;
  const protocol = document.getElementById('cp-protocol').value;
  if (!port) { alert('\u0634\u0645\u0627\u0631\u0647 \u067E\u0648\u0631\u062A \u0631\u0627 \u0648\u0627\u0631\u062F \u06A9\u0646\u06CC\u062F'); return; }
  const r = await api('/custom-port', { method: 'POST', body: JSON.stringify({ port: parseInt(port), protocol }) });
  const el = document.getElementById('cp-result');
  el.style.display = 'block';
  if (r && r.success) { el.className = 'mt-2 alert alert-success'; el.textContent = r.message + ` | \u0641\u0627\u06CC\u0631\u0648\u0627\u0644: ${r.firewall_command}`; }
  else { el.className = 'mt-2 alert alert-error'; el.textContent = r?.error || '\u062E\u0637\u0627'; }
}

// ============ UTILS ============
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
function openModal(title, body) { document.getElementById('modal-title-text').textContent = title; document.getElementById('modal-body').innerHTML = body; document.getElementById('genericModal').classList.add('active'); }

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024, sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function copyText(text) { navigator.clipboard.writeText(text).then(() => alert('\u06A9\u067E\u06CC \u0634\u062F!')); }
function escHtml(str) { if(!str)return''; const d=document.createElement('div'); d.textContent=str; return d.innerHTML; }

document.querySelectorAll('.modal-overlay').forEach(o => { o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); }); });

// ============ INIT ============
if (checkAuth()) { loadCapabilities().then(() => loadDashboard()); }
