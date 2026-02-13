const storageKey = 'elahe.foreign.baseUrl';

const dom = {
  form: document.getElementById('endpoint-form'),
  foreignUrl: document.getElementById('foreign-url'),
  statusMessage: document.getElementById('status-message'),
  quickRefresh: document.getElementById('quick-refresh'),
  cpu: document.getElementById('cpu-value'),
  ram: document.getElementById('ram-value'),
  disk: document.getElementById('disk-value'),
  connections: document.getElementById('connections-value'),
  iranEndpoint: document.getElementById('iran-endpoint'),
  iranStatus: document.getElementById('iran-status'),
  iranKey: document.getElementById('iran-key'),
  copyToken: document.getElementById('copy-token'),
  tunnelsBody: document.getElementById('tunnels-body'),
  updatedAt: document.getElementById('updated-at'),
  actionButtons: document.querySelectorAll('.action-btn'),
  commandResult: document.getElementById('command-result'),
};

let state = {
  baseUrl: localStorage.getItem(storageKey) || '',
  token: '',
};

function getApiUrl(path) {
  const cleanBase = state.baseUrl.replace(/\/$/, '');
  return `${cleanBase}${path}`;
}

function setMessage(text, type = 'info') {
  dom.statusMessage.textContent = text;
  dom.statusMessage.style.color = type === 'error' ? 'var(--bad)' : type === 'ok' ? 'var(--ok)' : 'var(--muted)';
}

function setBadge(status) {
  dom.iranStatus.className = 'badge';
  const normalized = (status || '').toLowerCase();
  if (['active', 'connected', 'healthy'].includes(normalized)) dom.iranStatus.classList.add('ok');
  else if (['degraded', 'warning'].includes(normalized)) dom.iranStatus.classList.add('warn');
  else if (normalized) dom.iranStatus.classList.add('bad');
  dom.iranStatus.textContent = status || 'نامشخص';
}

function formatPercent(value) {
  return typeof value === 'number' ? `${value.toFixed(1)}%` : '--';
}

function formatMemory(memory) {
  if (!memory || typeof memory !== 'object') return '--';
  if (typeof memory.usedPercent === 'number') return `${memory.usedPercent.toFixed(1)}%`;
  if (typeof memory.used === 'number' && typeof memory.total === 'number' && memory.total > 0) {
    return `${((memory.used / memory.total) * 100).toFixed(1)}%`;
  }
  return '--';
}

function renderTunnels(tunnels = []) {
  if (!tunnels.length) {
    dom.tunnelsBody.innerHTML = '<tr><td colspan="5" class="empty">تانل فعالی یافت نشد.</td></tr>';
    return;
  }

  dom.tunnelsBody.innerHTML = tunnels.map((tunnel, i) => `
    <tr>
      <td>${i + 1}</td>
      <td>${tunnel.protocol || '-'}</td>
      <td>${tunnel.port || '-'}</td>
      <td>${tunnel.status || '-'}</td>
      <td>${typeof tunnel.latencyMs === 'number' ? `${tunnel.latencyMs} ms` : '-'}</td>
    </tr>
  `).join('');
}

function renderStatus(data) {
  const resources = data.resources || {};
  dom.cpu.textContent = formatPercent(resources.cpu?.usagePercent ?? resources.cpu?.percent);
  dom.ram.textContent = formatMemory(resources.memory);
  dom.disk.textContent = formatMemory(resources.disk);

  const activeConnections = Array.isArray(data.connections)
    ? data.connections.length
    : data.connections?.total ?? '--';
  dom.connections.textContent = activeConnections;

  const link = data.iranLink || {};
  dom.iranEndpoint.textContent = link.endpoint || '--';
  dom.iranKey.textContent = link.key || '--';
  dom.copyToken.disabled = !link.key || link.key === 'not-set';
  state.token = link.key || '';
  setBadge(link.status);

  renderTunnels(data.activeTunnels || []);

  const time = data.generatedAt ? new Date(data.generatedAt).toLocaleString('fa-IR') : '--';
  dom.updatedAt.textContent = `آخرین بروزرسانی: ${time}`;
}

async function fetchStatus() {
  if (!state.baseUrl) {
    setMessage('ابتدا آدرس پنل سرور خارج را وارد کنید.', 'error');
    return;
  }

  setMessage('در حال دریافت وضعیت...', 'info');
  try {
    const response = await fetch(getApiUrl('/api/public/status'));
    if (!response.ok) throw new Error('status request failed');
    const data = await response.json();
    renderStatus(data);
    setMessage('وضعیت با موفقیت دریافت شد.', 'ok');
  } catch (error) {
    setMessage('اتصال به سرور خارج برقرار نشد یا API در دسترس نیست.', 'error');
  }
}

async function runCommand(action) {
  if (!state.baseUrl) {
    setMessage('ابتدا اتصال به سرور خارج را تنظیم کنید.', 'error');
    return;
  }

  if (!state.token || state.token === 'not-set') {
    setMessage('کلید اتصال ایران در پاسخ وضعیت موجود نیست.', 'error');
    return;
  }

  dom.commandResult.textContent = 'در حال ارسال فرمان...';
  try {
    const response = await fetch(getApiUrl('/api/public/control'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-connection-token': state.token,
      },
      body: JSON.stringify({ action }),
    });
    const data = await response.json();
    dom.commandResult.textContent = JSON.stringify(data, null, 2);

    if (response.ok && data.success) {
      setMessage(`فرمان «${action}» با موفقیت اجرا شد.`, 'ok');
      if (action === 'status') {
        renderTunnels((data.tunnels || []).map(tunnel => ({
          ...tunnel,
          latencyMs: tunnel.latency_ms,
        })));
      }
    } else {
      setMessage(data.error || 'اجرای فرمان ناموفق بود.', 'error');
    }
  } catch (error) {
    dom.commandResult.textContent = error.message;
    setMessage('ارسال فرمان با خطا مواجه شد.', 'error');
  }
}

function initEvents() {
  dom.form.addEventListener('submit', async (event) => {
    event.preventDefault();
    state.baseUrl = dom.foreignUrl.value.trim();
    localStorage.setItem(storageKey, state.baseUrl);
    await fetchStatus();
  });

  dom.quickRefresh.addEventListener('click', fetchStatus);

  dom.copyToken.addEventListener('click', async () => {
    if (!state.token) return;
    await navigator.clipboard.writeText(state.token);
    setMessage('کلید اتصال کپی شد.', 'ok');
  });

  dom.actionButtons.forEach(button => {
    button.addEventListener('click', () => runCommand(button.dataset.action));
  });
}

function boot() {
  dom.foreignUrl.value = state.baseUrl;
  initEvents();
  if (state.baseUrl) fetchStatus();
}

document.addEventListener('DOMContentLoaded', boot);
