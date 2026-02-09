/**
 * Elahe Panel - Admin Dashboard JavaScript
 * Full-featured with Iran/Foreign mode separation
 * Includes Autopilot tunnel management controls
 * Developer: EHSANKiNG
 * Version: 0.0.3
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
  document.getElementById('admin-name').textContent = admin.username || 'Admin';
  document.getElementById('app').style.display = 'flex';
  return true;
}

function headers() {
  return { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function api(path, options = {}) {
  try {
    const res = await fetch(`${API}${path}`, { headers: headers(), ...options });
    if (res.status === 401) { logout(); return null; }
    return res.json();
  } catch (err) {
    console.error('API Error:', err);
    return null;
  }
}

function logout() {
  localStorage.removeItem('token');
  localStorage.removeItem('admin');
  window.location.href = '/';
}

// ============ CAPABILITIES ============
async function loadCapabilities() {
  const data = await api('/capabilities');
  if (!data) return;
  panelMode = data.mode;
  capabilities = data.capabilities;

  document.getElementById('mode-badge').innerHTML = `Mode: <strong style="color:${panelMode === 'iran' ? '#f59e0b' : '#3b82f6'}">${panelMode === 'iran' ? 'Iran' : 'Foreign'}</strong>`;

  if (!capabilities.createUsers) {
    const el = document.getElementById('user-actions-iran');
    if (el) el.style.display = 'none';
  }
  if (!capabilities.importExport) {
    const el = document.getElementById('nav-importexport');
    if (el) el.style.display = 'none';
  }
}

// ============ NAVIGATION ============
function navigate(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
  const pageEl = document.getElementById(`page-${page}`);
  if (pageEl) pageEl.style.display = 'block';
  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));
  const navEl = document.querySelector(`.sidebar-link[data-page="${page}"]`);
  if (navEl) navEl.classList.add('active');
  document.getElementById('page-title').textContent = page.charAt(0).toUpperCase() + page.slice(1).replace(/-/g, ' ');

  const loaders = {
    'dashboard': loadDashboard,
    'users': loadUsers,
    'servers': loadServers,
    'tunnels': loadTunnels,
    'autopilot': loadAutopilot,
    'domains': loadDomains,
    'external-panels': loadExternalPanels,
    'importexport': () => {},
    'settings': loadSettings,
  };
  if (loaders[page]) loaders[page]();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

// ============ DASHBOARD ============
async function loadDashboard() {
  const data = await api('/dashboard');
  if (!data) return;

  document.getElementById('stat-users-total').textContent = data.users.total;
  document.getElementById('stat-users-active').textContent = data.users.active;
  document.getElementById('stat-servers-total').textContent = data.servers.total;
  document.getElementById('stat-tunnels-active').textContent = data.tunnels.active || 0;

  document.getElementById('user-stats-detail').innerHTML = `
    <div class="user-field"><span class="user-field-label">Online</span><span class="badge badge-success">${data.users.online}</span></div>
    <div class="user-field"><span class="user-field-label">Active</span><span>${data.users.active}</span></div>
    <div class="user-field"><span class="user-field-label">Expired</span><span>${data.users.expired}</span></div>
    <div class="user-field"><span class="user-field-label">Limited</span><span>${data.users.limited}</span></div>
    <div class="user-field"><span class="user-field-label">Disabled</span><span>${data.users.disabled}</span></div>
  `;

  document.getElementById('server-stats-detail').innerHTML = `
    <div class="user-field"><span class="user-field-label">Iran Servers</span><span>${data.servers.iran}</span></div>
    <div class="user-field"><span class="user-field-label">Foreign Servers</span><span>${data.servers.foreign}</span></div>
    <div class="user-field"><span class="user-field-label">Active</span><span class="badge badge-success">${data.servers.active}</span></div>
    <div class="user-field"><span class="user-field-label">Failed Tunnels</span><span class="badge badge-danger">${data.tunnels.failed || 0}</span></div>
    <div class="user-field"><span class="user-field-label">Primary Tunnels</span><span>${data.tunnels.primary || 0}</span></div>
  `;

  // Autopilot dashboard
  const ap = data.autopilot || {};
  const tunnelAp = data.tunnels?.autopilot || {};
  document.getElementById('autopilot-dashboard-detail').innerHTML = `
    <div class="user-field"><span class="user-field-label">Autopilot</span><span class="badge badge-${ap.enabled !== false ? 'success' : 'danger'}">${ap.enabled !== false ? 'Enabled' : 'Disabled'}</span></div>
    <div class="user-field"><span class="user-field-label">Primary on 443</span><span class="badge badge-info">${tunnelAp.primary443 || ap.primary443 || '-'}</span></div>
    <div class="user-field"><span class="user-field-label">TrustTunnel (8443)</span><span class="badge badge-success">Always Active</span></div>
    <div class="user-field"><span class="user-field-label">OpenVPN</span><span class="badge badge-success">Always Active</span></div>
    <div class="user-field"><span class="user-field-label">WireGuard</span><span class="badge badge-success">Always Active</span></div>
    <div class="user-field"><span class="user-field-label">Auto Switches</span><span>${tunnelAp.switchCount || ap.switchCount || 0}</span></div>
  `;

  // Load system resources for dashboard
  loadSystemResources();

  document.getElementById('panel-mode-detail').innerHTML = `
    <div class="user-field"><span class="user-field-label">Mode</span><span class="badge badge-${panelMode === 'iran' ? 'warning' : 'info'}">${panelMode}</span></div>
    <div class="user-field"><span class="user-field-label">Version</span><span>${data.version}</span></div>
    <div class="user-field"><span class="user-field-label">External Panels</span><span>${data.externalPanels || 0}</span></div>
    <div class="user-field"><span class="user-field-label">Tunnel Engines</span><span>5 (SSH, FRP, GOST, Chisel, TrustTunnel)</span></div>
    <div class="user-field"><span class="user-field-label">User Creation</span><span class="badge badge-${capabilities.createUsers ? 'success' : 'danger'}">${capabilities.createUsers ? 'Enabled' : 'Disabled (Foreign)'}</span></div>
  `;
}

// ============ SYSTEM RESOURCES ============
async function loadSystemResources() {
  const data = await api('/system/resources');
  if (!data || !data.success) return;

  document.getElementById('res-cpu').textContent = `${data.cpu.usagePercent}%`;
  document.getElementById('res-ram').textContent = `${data.memory.usagePercent}%`;
  document.getElementById('res-disk').textContent = `${data.disk.usagePercent}%`;
  document.getElementById('res-uptime').textContent = data.uptime.systemFormatted;

  document.getElementById('res-detail-left').innerHTML = `
    <div><strong>CPU:</strong> ${data.cpu.model} (${data.cpu.cores} cores)</div>
    <div><strong>Load Avg:</strong> ${data.cpu.loadAvg['1m']} / ${data.cpu.loadAvg['5m']} / ${data.cpu.loadAvg['15m']}</div>
    <div><strong>RAM:</strong> ${data.memory.usedFormatted} / ${data.memory.totalFormatted}</div>
    <div><strong>Swap:</strong> ${data.memory.swap.usedFormatted} / ${data.memory.swap.totalFormatted}</div>
  `;
  document.getElementById('res-detail-right').innerHTML = `
    <div><strong>Disk:</strong> ${data.disk.usedFormatted} / ${data.disk.totalFormatted} (${data.disk.freeFormatted} free)</div>
    <div><strong>OS:</strong> ${data.os.distro}</div>
    <div><strong>Node.js:</strong> ${data.os.nodeVersion} | <strong>Process RSS:</strong> ${data.process.rssFormatted}</div>
    <div><strong>Network:</strong> ${(data.network || []).map(n => `${n.name}: ${n.ipv4 || '-'}`).join(' | ')}</div>
  `;

  // Bandwidth
  if (data.bandwidth) {
    document.getElementById('bw-today').textContent = data.bandwidth.today.formatted;
    document.getElementById('bw-total').textContent = data.bandwidth.allTime.formatted;
  }
  document.getElementById('bw-connections').textContent = data.connections?.total || 0;
}

// ============ USERS ============
let searchTimeout;
function debounceSearchUsers() {
  clearTimeout(searchTimeout);
  searchTimeout = setTimeout(() => { usersPage = 1; loadUsers(); }, 300);
}

async function loadUsers() {
  const search = document.getElementById('user-search').value;
  const status = document.getElementById('user-filter-status').value;
  const data = await api(`/users?page=${usersPage}&limit=15&search=${search}&status=${status}`);
  if (!data) return;

  const tbody = document.getElementById('users-table-body');
  if (!data.users || data.users.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No users found</td></tr>';
    return;
  }

  tbody.innerHTML = data.users.map(u => `
    <tr>
      <td><strong>${u.username}</strong></td>
      <td><code style="font-size:11px">${u.uuid.substring(0,8)}...</code></td>
      <td><span class="badge badge-info">${u.plan}</span></td>
      <td><span class="badge badge-${u.status === 'active' ? 'success' : u.status === 'expired' ? 'danger' : 'warning'}">${u.status}</span></td>
      <td>${formatBytes(u.data_used)} / ${formatBytes(u.data_limit)}</td>
      <td>${u.expire_at ? new Date(u.expire_at).toLocaleDateString() : '-'}</td>
      <td>
        <button class="btn btn-sm btn-primary" onclick="viewUser(${u.id})">View</button>
        ${capabilities.manageUsers ? `<button class="btn btn-sm btn-danger" onclick="deleteUser(${u.id},'${u.username}')">Del</button>` : ''}
      </td>
    </tr>
  `).join('');

  const pg = data.pagination;
  let pgHtml = '';
  for (let i = 1; i <= pg.totalPages; i++) {
    pgHtml += `<button class="${i === pg.page ? 'active' : ''}" onclick="usersPage=${i};loadUsers()">${i}</button>`;
  }
  document.getElementById('users-pagination').innerHTML = pgHtml;
}

function showCreateUserModal() { document.getElementById('createUserModal').classList.add('active'); }
function showAutoCreateModal() {
  const count = prompt('How many users to create?', '5');
  if (count) autoCreateUsers(parseInt(count));
}

async function createUser(e) {
  e.preventDefault();
  const data = {
    username: document.getElementById('cu-username').value,
    password: document.getElementById('cu-password').value || undefined,
    email: document.getElementById('cu-email').value || undefined,
    plan: document.getElementById('cu-plan').value,
    dataLimit: parseInt(document.getElementById('cu-traffic').value) * 1024 * 1024 * 1024,
    expiryDays: parseInt(document.getElementById('cu-expiry').value),
    maxConnections: parseInt(document.getElementById('cu-maxconn').value),
    note: document.getElementById('cu-note').value || undefined,
  };

  const result = await api('/users', { method: 'POST', body: JSON.stringify(data) });
  if (result && result.success) {
    closeModal('createUserModal');
    loadUsers();
    alert(`User created!\nUsername: ${result.user.username}\nPassword: ${result.user.plainPassword}\nUUID: ${result.user.uuid}`);
  } else {
    document.getElementById('create-user-error').textContent = result?.error || 'Failed';
    document.getElementById('create-user-error').style.display = 'block';
  }
}

async function autoCreateUsers(count) {
  const result = await api('/users/auto-create', { method: 'POST', body: JSON.stringify({ count, plan: 'bronze', expiryDays: 30 }) });
  if (result) { loadUsers(); alert(`${result.results.filter(r => r.success).length} users created`); }
}

async function viewUser(id) {
  const user = await api(`/users/${id}`);
  if (!user) return;

  const subUrl = `${window.location.origin}/sub/${user.subscription_token}`;
  const subInfoUrl = `${window.location.origin}/sub/info/${user.subscription_token}`;

  let html = `
    <div class="user-field"><span class="user-field-label">Username</span><span class="user-field-value">${user.username}</span></div>
    <div class="user-field"><span class="user-field-label">UUID</span><span class="user-field-value" style="font-size:11px">${user.uuid}</span></div>
    <div class="user-field"><span class="user-field-label">Plan</span><span class="badge badge-info">${user.plan}</span></div>
    <div class="user-field"><span class="user-field-label">Status</span><span class="badge badge-${user.status === 'active' ? 'success' : 'danger'}">${user.status}</span></div>
    <div class="user-field"><span class="user-field-label">Traffic</span><span>${formatBytes(user.data_used)} / ${formatBytes(user.data_limit)}</span></div>
    <div class="user-field"><span class="user-field-label">Expires</span><span>${user.expire_at ? new Date(user.expire_at).toLocaleString() : 'Never'}</span></div>
    <div class="user-field"><span class="user-field-label">Max Connections</span><span>${user.max_connections}</span></div>
    <div class="user-field"><span class="user-field-label">Created</span><span>${new Date(user.created_at).toLocaleString()}</span></div>
    
    <h4 class="mt-3 mb-1">Subscription Link</h4>
    <div class="sub-link" onclick="copyText(this.textContent)">${subUrl}</div>
    <small style="color:#64748b">Click to copy. Use in V2rayNG/Hiddify/Streisand</small>

    <h4 class="mt-3 mb-1">Subscription Info Page</h4>
    <div class="sub-link" onclick="copyText(this.textContent)">${subInfoUrl}</div>
    <small style="color:#64748b">Rich HTML page with all configs, TrustTunnel config, QR code, app downloads</small>
  `;

  // TrustTunnel config info
  const protocols = JSON.parse(user.protocols_enabled || '[]');
  if (protocols.includes('trusttunnel')) {
    html += `<div class="alert alert-info mt-2" style="font-size:12px">
      <strong>TrustTunnel (Port 8443):</strong> Always active. HTTP/3 (QUIC) transport with application layer camouflage.<br>
      <strong>Connection:</strong> trusttunnel://${user.uuid}@[SERVER_IP]:8443?security=tls&alpn=h3&type=quic<br>
      <strong>Apps:</strong> Hiddify, Streisand (full config available on subscription info page)
    </div>`;
  }

  // Always-on services info
  html += `<div class="alert alert-success mt-2" style="font-size:12px">
    <strong>Always-On Services:</strong><br>
    - TrustTunnel HTTP/3 on port 8443<br>
    - OpenVPN on ports 110, 510<br>
    - WireGuard on ports 1414, 53133<br>
    <em>All configs available on the subscription info page.</em>
  </div>`;

  html += `<div class="flex gap-2 mt-3">
    ${capabilities.manageUsers ? `<button class="btn btn-sm btn-secondary" onclick="resetTraffic(${user.id})">Reset Traffic</button>
    <button class="btn btn-sm btn-outline" onclick="revokeSubscription(${user.id})">Revoke Sub</button>` : ''}
  </div>`;

  document.getElementById('user-info-content').innerHTML = html;
  document.getElementById('userInfoModal').classList.add('active');
}

async function deleteUser(id, username) {
  if (!confirm(`Delete user "${username}"?`)) return;
  await api(`/users/${id}`, { method: 'DELETE' });
  loadUsers();
}

async function resetTraffic(id) {
  await api(`/users/${id}/reset-traffic`, { method: 'POST' });
  alert('Traffic reset');
  viewUser(id);
}

async function revokeSubscription(id) {
  if (!confirm('Revoke subscription? Old links will stop working.')) return;
  await api(`/users/${id}/revoke-subscription`, { method: 'POST' });
  alert('Subscription revoked');
  viewUser(id);
}

// ============ SERVERS ============
async function loadServers() {
  const servers = await api('/servers');
  if (!servers) return;

  const grid = document.getElementById('servers-grid');
  if (!servers.length) {
    grid.innerHTML = '<div class="card text-center">No servers configured. Add your first server.</div>';
    return;
  }

  grid.innerHTML = servers.map(s => `
    <div class="card server-card">
      <span class="server-type badge badge-${s.type === 'iran' ? 'info' : 'success'}">${s.type}</span>
      <h3>${s.name}</h3>
      <div class="server-ip mt-1">${s.ip}:${s.port}</div>
      <div class="server-meta">
        <span>Engine: ${s.core_engine}</span>
        <span>Status: <span class="badge badge-${s.status === 'active' ? 'success' : 'warning'}">${s.status}</span></span>
        ${s.location ? `<span>${s.location}</span>` : ''}
      </div>
      ${s.latency_ms ? `<div class="server-meta"><span>Latency: ${s.latency_ms}ms</span></div>` : ''}
      <div class="mt-2"><strong>Connection Token:</strong></div>
      <div class="token-display">${s.connection_token || 'N/A'}</div>
      <div class="flex gap-2 mt-2">
        <button class="btn btn-sm btn-outline" onclick="regenerateServerToken(${s.id})">Regenerate Token</button>
        <button class="btn btn-sm btn-danger" onclick="deleteServer(${s.id},'${s.name}')">Delete</button>
      </div>
    </div>
  `).join('');
}

function showAddServerModal() { document.getElementById('addServerModal').classList.add('active'); }

async function addServer(e) {
  e.preventDefault();
  const data = {
    name: document.getElementById('as-name').value,
    type: document.getElementById('as-type').value,
    ip: document.getElementById('as-ip').value,
    port: parseInt(document.getElementById('as-port').value),
    coreEngine: document.getElementById('as-core').value,
    location: document.getElementById('as-location').value,
    maxUsers: parseInt(document.getElementById('as-maxusers').value),
  };

  const result = await api('/servers', { method: 'POST', body: JSON.stringify(data) });
  if (result && result.success) {
    closeModal('addServerModal');
    loadServers();
    alert(`Server added!\nConnection Token: ${result.connectionToken}`);
  }
}

async function regenerateServerToken(id) {
  if (!confirm('Regenerate connection token?')) return;
  const result = await api(`/servers/${id}/regenerate-token`, { method: 'POST' });
  if (result && result.success) { loadServers(); alert(`New token: ${result.connectionToken}`); }
}

async function deleteServer(id, name) {
  if (!confirm(`Delete server "${name}"?`)) return;
  await api(`/servers/${id}`, { method: 'DELETE' });
  loadServers();
}

// ============ TUNNELS ============
async function loadTunnels() {
  const tunnels = await api('/tunnels');
  if (!tunnels) return;

  // Update port 443 engine display
  const apStatus = await api('/autopilot/status');
  if (apStatus) {
    const el = document.getElementById('port443-engine');
    if (el) el.textContent = (apStatus.primary443 || 'gost').toUpperCase();
  }

  const tbody = document.getElementById('tunnels-table-body');
  if (!tunnels.length) {
    tbody.innerHTML = '<tr><td colspan="8" class="text-center">No tunnels configured. Tunnels are managed by Autopilot.</td></tr>';
    return;
  }

  tbody.innerHTML = tunnels.map(t => `
    <tr>
      <td><strong>${t.protocol}</strong></td>
      <td>${t.transport}</td>
      <td>${t.port || '-'}</td>
      <td><span class="badge badge-${t.status === 'active' ? 'success' : t.status === 'failed' ? 'danger' : 'warning'}">${t.status}</span></td>
      <td>${t.score ? t.score.toFixed(1) : '-'}</td>
      <td>${t.latency_ms ? t.latency_ms + 'ms' : '-'}</td>
      <td>${t.is_primary ? '&#11088; Primary' : ''} ${t.autopilotPrimary ? '&#9889; AP' : ''} ${t.autopilotAlwaysOn ? '&#128994;' : ''}</td>
      <td><button class="btn btn-sm btn-danger" onclick="deleteTunnel(${t.id})">Delete</button></td>
    </tr>
  `).join('');
}

async function runMonitoring() {
  const btn = event.target;
  btn.disabled = true; btn.textContent = 'Running...';
  const result = await api('/tunnels/monitor', { method: 'POST' });
  btn.disabled = false; btn.textContent = '\u2699 Run Monitor';
  if (result) { loadTunnels(); alert(`Monitoring complete.\nDB Tunnels checked: ${result.checked}\nSwitched: ${result.switched}\nAutopilot primary: ${result.autopilot?.primaryEngine || '-'}`); }
}

async function deleteTunnel(id) {
  if (!confirm('Delete this tunnel?')) return;
  await api(`/tunnels/${id}`, { method: 'DELETE' });
  loadTunnels();
}

// ============ AUTOPILOT ============
async function loadAutopilot() {
  const data = await api('/autopilot/status');
  if (!data) return;

  // Stats
  document.getElementById('ap-primary443').textContent = (data.primary443 || '-').toUpperCase();
  document.getElementById('ap-switch-count').textContent = data.switchCount || 0;
  document.getElementById('ap-last-cycle').textContent = data.lastMonitorCycle ? new Date(data.lastMonitorCycle).toLocaleTimeString() : 'Never';

  // Port 443 candidates
  const candidates = data.portAllocation?.port443?.candidates || ['ssh', 'frp', 'gost', 'chisel'];
  const latestResults = data.latestResults || {};
  
  let candidatesHtml = '<div class="grid grid-2 gap-2">';
  for (const eng of candidates) {
    const isPrimary = eng === data.primary443;
    const result = latestResults[eng] || {};
    candidatesHtml += `
      <div class="card" style="padding:16px;border:2px solid ${isPrimary ? '#22c55e' : '#e2e8f0'}">
        <div class="flex gap-2" style="justify-content:space-between;align-items:center">
          <strong>${eng.toUpperCase()}</strong>
          ${isPrimary ? '<span class="badge badge-success">&#11088; PRIMARY</span>' : '<span class="badge badge-warning">Standby</span>'}
        </div>
        <div style="margin-top:8px;font-size:13px;color:#64748b">
          ${result.score !== undefined ? `Score: <strong>${result.score}</strong> | Latency: ${result.latency}ms | Jitter: ${result.jitter}ms | ${result.status || '-'}` : 'No data yet'}
        </div>
      </div>`;
  }
  candidatesHtml += '</div>';
  document.getElementById('autopilot-candidates').innerHTML = candidatesHtml;

  // Always-on
  const alwaysOn = data.portAllocation?.alwaysOn || {};
  let alwaysOnHtml = '<div class="grid grid-3 gap-2">';
  for (const [name, info] of Object.entries(alwaysOn)) {
    alwaysOnHtml += `
      <div class="card" style="padding:16px;border:2px solid #22c55e">
        <div class="flex gap-2" style="justify-content:space-between;align-items:center">
          <strong>${name.toUpperCase()}</strong>
          <span class="badge badge-success">Always Active</span>
        </div>
        <div style="margin-top:8px;font-size:13px;color:#64748b">
          Ports: ${(info.ports || []).join(', ')}<br>
          ${info.description || ''}
        </div>
      </div>`;
  }
  alwaysOnHtml += '</div>';
  document.getElementById('autopilot-always-on').innerHTML = alwaysOnHtml;

  // Update manual select
  const select = document.getElementById('manual-primary-select');
  if (select && data.primary443) {
    select.value = data.primary443;
  }

  // Tunnel engines
  const engines = data.engines || {};
  let enginesHtml = '<div class="grid grid-2 gap-2">';
  for (const [key, eng] of Object.entries(engines)) {
    enginesHtml += `
      <div class="card" style="padding:12px">
        <strong>${eng.name}</strong>
        <div style="font-size:12px;color:#64748b;margin-top:4px">
          ${eng.description}<br>
          Transport: ${(eng.transport || []).join(', ')}<br>
          Encryption: ${eng.encryption}<br>
          Role: <span class="badge badge-${eng.role === 'secondary' ? 'info' : 'warning'}">${eng.role}</span>
        </div>
      </div>`;
  }
  enginesHtml += '</div>';
  document.getElementById('tunnel-engines-list').innerHTML = enginesHtml;
}

async function runAutopilotMonitor() {
  const btn = event.target;
  btn.disabled = true; btn.textContent = 'Running...';
  const result = await api('/autopilot/monitor', { method: 'POST' });
  btn.disabled = false; btn.textContent = '\u26A1 Run Autopilot Cycle';
  
  if (result) {
    loadAutopilot();
    let msg = `Autopilot cycle complete.\nChecked: ${result.checked || 0} engines\nPrimary: ${result.primaryEngine || '-'}`;
    if (result.switched) {
      msg += `\n\nSWITCHED: ${result.switchReason || ''}`;
    }
    alert(msg);
  }
}

async function setManualPrimary() {
  const engine = document.getElementById('manual-primary-select').value;
  if (!confirm(`Set ${engine.toUpperCase()} as primary tunnel on port 443?`)) return;
  
  const result = await api('/autopilot/set-primary', {
    method: 'POST',
    body: JSON.stringify({ engine })
  });
  
  if (result && result.success) {
    loadAutopilot();
    alert(`Primary set to ${engine.toUpperCase()}`);
  }
}

// ============ DOMAINS ============
async function loadDomains() {
  const data = await api('/domains');
  if (!data || !data.success) return;

  const tbody = document.getElementById('domains-table-body');
  if (!data.domains || data.domains.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7" class="text-center">No domains configured. Add your first domain.</td></tr>';
    return;
  }

  tbody.innerHTML = data.domains.map(d => `
    <tr>
      <td><strong>${d.domain}</strong></td>
      <td><span class="badge badge-${d.type === 'main' ? 'info' : 'success'}">${d.type}</span></td>
      <td>${d.purpose || '-'}</td>
      <td><span class="badge badge-${d.ssl_status !== 'none' ? 'success' : 'warning'}">${d.ssl_status}</span></td>
      <td>${d.is_accessible_iran === 1 ? '<span class="badge badge-success">Yes</span>' : d.is_accessible_iran === 0 ? '<span class="badge badge-danger">Blocked</span>' : '<span class="badge badge-warning">Unknown</span>'}</td>
      <td>${d.last_check || '-'}</td>
      <td>
        <button class="btn btn-sm btn-outline" onclick="checkDomainAccess('${d.domain}')">Check</button>
        <button class="btn btn-sm btn-danger" onclick="deleteDomain('${d.domain}')">Del</button>
      </td>
    </tr>
  `).join('');

  const servers = await api('/servers');
  if (servers && servers.length) {
    const options = servers.map(s => `<option value="${s.id}">${s.name} (${s.type})</option>`).join('');
    ['ad-server', 'gs-server'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.innerHTML = '<option value="">None</option>' + options;
    });
  }
}

function showAddDomainModal() { document.getElementById('addDomainModal').classList.add('active'); }
function showGenerateSubdomainsModal() { document.getElementById('generateSubdomainsModal').classList.add('active'); }

async function addDomain(e) {
  e.preventDefault();
  const result = await api('/domains', {
    method: 'POST',
    body: JSON.stringify({
      domain: document.getElementById('ad-domain').value,
      serverId: document.getElementById('ad-server').value || null,
    })
  });
  if (result && result.success) { closeModal('addDomainModal'); loadDomains(); }
}

async function generateSubdomains(e) {
  e.preventDefault();
  const result = await api('/domains/generate-subdomains', {
    method: 'POST',
    body: JSON.stringify({
      domain: document.getElementById('gs-domain').value,
      serverId: document.getElementById('gs-server').value || null,
    })
  });
  if (result && result.success) {
    closeModal('generateSubdomainsModal');
    loadDomains();
    alert(`Generated ${result.subdomains.length} subdomains`);
  }
}

async function checkDomainAccess(domain) {
  alert('Checking accessibility via check-host.net API...');
  const result = await api('/domains/check-accessibility', {
    method: 'POST',
    body: JSON.stringify({ domain })
  });
  if (result) {
    if (result.iranAccessible === true) alert(`${domain}: ACCESSIBLE from Iran`);
    else if (result.iranAccessible === false) alert(`${domain}: BLOCKED in Iran`);
    else alert(`${domain}: Check result - ${JSON.stringify(result)}`);
    loadDomains();
  }
}

async function deleteDomain(domain) {
  if (!confirm(`Delete domain "${domain}"?`)) return;
  await api(`/domains/${domain}`, { method: 'DELETE' });
  loadDomains();
}

// ============ EXTERNAL PANELS ============
async function loadExternalPanels() {
  const data = await api('/external-panels');
  if (!data || !data.success) return;

  const grid = document.getElementById('external-panels-grid');
  if (!data.panels || data.panels.length === 0) {
    grid.innerHTML = '<div class="card text-center" style="grid-column:span 2">No external panels configured.</div>';
    return;
  }

  grid.innerHTML = data.panels.map(p => `
    <div class="card">
      <div class="flex gap-2" style="justify-content:space-between;align-items:center">
        <h3>${p.name}</h3>
        <span class="badge badge-${p.status === 'active' ? 'success' : p.status === 'error' ? 'danger' : 'warning'}">${p.status}</span>
      </div>
      <div class="server-meta mt-1">
        <span>Type: <strong>${p.type}</strong></span>
        <span>URL: ${p.url}</span>
        ${p.last_sync ? `<span>Last sync: ${new Date(p.last_sync).toLocaleString()}</span>` : ''}
      </div>
      <div class="flex gap-2 mt-2">
        <button class="btn btn-sm btn-primary" onclick="openExternalPanel(${p.id})">Open</button>
        <button class="btn btn-sm btn-secondary" onclick="syncExternalPanel(${p.id})">Sync</button>
        <button class="btn btn-sm btn-outline" onclick="checkExternalPanelHealth(${p.id})">Health</button>
        <button class="btn btn-sm btn-danger" onclick="deleteExternalPanel(${p.id})">Del</button>
      </div>
    </div>
  `).join('');
}

function showAddExternalPanelModal() { document.getElementById('addExternalPanelModal').classList.add('active'); }

async function addExternalPanel(e) {
  e.preventDefault();
  const result = await api('/external-panels', {
    method: 'POST',
    body: JSON.stringify({
      name: document.getElementById('ep-name').value,
      type: document.getElementById('ep-type').value,
      url: document.getElementById('ep-url').value,
      username: document.getElementById('ep-username').value,
      password: document.getElementById('ep-password').value,
    })
  });
  if (result && result.success) { closeModal('addExternalPanelModal'); loadExternalPanels(); }
}

async function openExternalPanel(id) {
  const data = await api(`/external-panels/${id}/proxy-url`);
  if (data && data.success) window.open(data.url, '_blank');
}

async function syncExternalPanel(id) {
  if (!confirm('Sync users from this external panel?')) return;
  const result = await api(`/external-panels/${id}/sync`, { method: 'POST' });
  if (result) { alert(`Sync: ${result.imported || 0} imported, ${result.skipped || 0} skipped`); loadUsers(); }
}

async function checkExternalPanelHealth(id) {
  const result = await api(`/external-panels/${id}/health`, { method: 'POST' });
  if (result) { alert(`Status: ${result.status}, Latency: ${result.latency}ms`); loadExternalPanels(); }
}

async function deleteExternalPanel(id) {
  if (!confirm('Remove this external panel?')) return;
  await api(`/external-panels/${id}`, { method: 'DELETE' });
  loadExternalPanels();
}

// ============ IMPORT / EXPORT ============
async function exportUsers() {
  const format = document.getElementById('export-format').value;
  const data = await api(`/export/users?format=${format}`);
  if (data) downloadJSON(data, `elahe-users-${format}`);
}

async function exportSettings() {
  const data = await api('/export/settings');
  if (data) downloadJSON(data, 'elahe-settings');
}

async function exportFull() {
  const data = await api('/export/full');
  if (data) downloadJSON(data, 'elahe-full-backup');
}

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}-${new Date().toISOString().split('T')[0]}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

async function readImportFile() {
  return new Promise((resolve, reject) => {
    const file = document.getElementById('import-file').files[0];
    if (!file) { alert('Please select a JSON file'); reject('No file'); return; }
    const reader = new FileReader();
    reader.onload = (e) => {
      try { resolve(JSON.parse(e.target.result)); } catch (err) { alert('Invalid JSON file'); reject(err); }
    };
    reader.readAsText(file);
  });
}

async function importUsers() { try { const d = await readImportFile(); showImportResult(await api('/import/users', { method: 'POST', body: JSON.stringify(d) })); } catch (e) {} }
async function importSettings() { try { const d = await readImportFile(); showImportResult(await api('/import/settings', { method: 'POST', body: JSON.stringify(d) })); } catch (e) {} }
async function importFull() { try { const d = await readImportFile(); showImportResult(await api('/import/full', { method: 'POST', body: JSON.stringify(d) })); } catch (e) {} }

function showImportResult(result) {
  const el = document.getElementById('import-result');
  if (!result) { el.style.display = 'none'; return; }
  el.style.display = 'block';
  el.className = 'mt-2 alert ' + (result.success ? 'alert-success' : 'alert-error');
  el.innerHTML = `<strong>${result.success ? 'Success' : 'Error'}:</strong> ${JSON.stringify(result)}`;
}

// ============ SETTINGS ============
async function loadSettings() {
  const settings = await api('/settings');
  if (!settings) return;

  // Build settings form based on mode
  const isIran = settings._mode === 'iran';
  let html = '<div class="grid grid-2 gap-3">';

  // Show relevant site settings based on mode
  if (isIran) {
    html += `<div>
      <h4 class="mb-2">Iran Site (Persian)</h4>
      <div class="form-group"><label>Title</label><input class="form-control" name="site.ir.title" value="${escHtml(settings['site.ir.title'] || '')}"></div>
      <div class="form-group"><label>Subtitle</label><input class="form-control" name="site.ir.subtitle" value="${escHtml(settings['site.ir.subtitle'] || '')}"></div>
      <div class="form-group"><label>Primary Color</label><input type="color" class="form-control" name="site.ir.primaryColor" value="${settings['site.ir.primaryColor'] || '#1a73e8'}" style="height:40px"></div>
      <div class="form-group"><label>Secondary Color</label><input type="color" class="form-control" name="site.ir.secondaryColor" value="${settings['site.ir.secondaryColor'] || '#34a853'}" style="height:40px"></div>
      <div class="form-group"><label>Accent Color</label><input type="color" class="form-control" name="site.ir.accentColor" value="${settings['site.ir.accentColor'] || '#fbbc04'}" style="height:40px"></div>
    </div>`;
  } else {
    html += `<div>
      <h4 class="mb-2">Foreign Site (English)</h4>
      <div class="form-group"><label>Title</label><input class="form-control" name="site.en.title" value="${escHtml(settings['site.en.title'] || '')}"></div>
      <div class="form-group"><label>Subtitle</label><input class="form-control" name="site.en.subtitle" value="${escHtml(settings['site.en.subtitle'] || '')}"></div>
      <div class="form-group"><label>Primary Color</label><input type="color" class="form-control" name="site.en.primaryColor" value="${settings['site.en.primaryColor'] || '#0f172a'}" style="height:40px"></div>
      <div class="form-group"><label>Secondary Color</label><input type="color" class="form-control" name="site.en.secondaryColor" value="${settings['site.en.secondaryColor'] || '#3b82f6'}" style="height:40px"></div>
      <div class="form-group"><label>Accent Color</label><input type="color" class="form-control" name="site.en.accentColor" value="${settings['site.en.accentColor'] || '#10b981'}" style="height:40px"></div>
    </div>`;
  }

  html += `<div>
    <h4 class="mb-2">Core Settings</h4>
    <div class="form-group"><label>Core Engine</label><select class="form-control" name="core.engine"><option value="xray" ${settings['core.engine'] === 'xray' ? 'selected' : ''}>Xray</option><option value="singbox" ${settings['core.engine'] === 'singbox' ? 'selected' : ''}>Sing-box</option></select></div>
    <div class="form-group"><label>Monitor Interval (ms)</label><input type="number" class="form-control" name="tunnel.monitorInterval" value="${settings['tunnel.monitorInterval'] || '600000'}"></div>
    <h4 class="mb-2 mt-3">User Defaults</h4>
    <div class="form-group"><label>Default Plan</label><select class="form-control" name="user.defaultPlan"><option value="bronze" ${settings['user.defaultPlan'] === 'bronze' ? 'selected' : ''}>Bronze</option><option value="silver" ${settings['user.defaultPlan'] === 'silver' ? 'selected' : ''}>Silver</option><option value="gold" ${settings['user.defaultPlan'] === 'gold' ? 'selected' : ''}>Gold</option></select></div>
    <div class="form-group"><label>Default Traffic Limit (bytes)</label><input type="number" class="form-control" name="user.defaultTrafficLimit" value="${settings['user.defaultTrafficLimit'] || ''}"></div>
    <div class="form-group"><label>Default Expiry Days</label><input type="number" class="form-control" name="user.defaultExpiryDays" value="${settings['user.defaultExpiryDays'] || ''}"></div>
    <div class="form-group"><label>Default Max Connections</label><input type="number" class="form-control" name="user.defaultMaxConnections" value="${settings['user.defaultMaxConnections'] || ''}"></div>
  </div>`;

  html += '</div>';

  document.getElementById('settings-sections').innerHTML = html;
}

async function saveSettings(e) {
  e.preventDefault();
  const form = document.getElementById('settings-form');
  const data = {};
  form.querySelectorAll('[name]').forEach(el => { data[el.name] = el.value; });
  const result = await api('/settings', { method: 'PUT', body: JSON.stringify(data) });
  if (result && result.success) alert('Settings saved!');
}

// ============ UTILS ============
function closeModal(id) { document.getElementById(id).classList.remove('active'); }

function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function copyText(text) {
  navigator.clipboard.writeText(text).then(() => alert('Copied!'));
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); });
});

// ============ INIT ============
if (checkAuth()) {
  loadCapabilities().then(() => loadDashboard());
}
