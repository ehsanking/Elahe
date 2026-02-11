/**
 * Elahe Panel - Foreign panel status-only UI
 */

let siteSettings = {};

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

async function loadForeignStatus() {
  const iranBox = document.getElementById('foreign-iran-link');
  const resBox = document.getElementById('foreign-resources');
  const conBox = document.getElementById('foreign-connections');
  const tunBox = document.getElementById('foreign-tunnels');
  const refreshedAt = document.getElementById('refresh-at');
  if (!iranBox || !resBox || !conBox || !tunBox) return;

  try {
    const res = await fetch('/api/public/status');
    const data = await res.json();
    if (!data.success) throw new Error('status unavailable');

    if (data.iranLink) {
      iranBox.innerHTML = `
        <div><strong>Server:</strong> ${data.iranLink.name || '-'} (${data.iranLink.endpoint || '-'})</div>
        <div><strong>Status:</strong> ${data.iranLink.status || '-'}</div>
        <div><strong>Connection Key:</strong> <code>${data.iranLink.key || '-'}</code></div>
        <div><strong>Latency/Jitter:</strong> ${data.iranLink.latencyMs ?? '-'}ms / ${data.iranLink.jitterMs ?? '-'}ms</div>
      `;
    } else {
      iranBox.textContent = 'Iran link is not configured yet.';
    }

    resBox.innerHTML = `
      <div><strong>CPU:</strong> ${data.resources?.cpu?.usagePercent ?? '-'}%</div>
      <div><strong>Memory:</strong> ${data.resources?.memory?.usagePercent ?? '-'}%</div>
      <div><strong>Disk:</strong> ${data.resources?.disk?.usagePercent ?? '-'}%</div>
      <div><strong>Node RSS:</strong> ${data.resources?.process?.memoryRssMb ?? '-'} MB</div>
    `;

    const totalCon = data.connections?.total ?? 0;
    conBox.innerHTML = `<div><strong>Total connections:</strong> ${totalCon}</div>`;

    const tunnels = Array.isArray(data.activeTunnels) ? data.activeTunnels : [];
    if (!tunnels.length) {
      tunBox.textContent = 'No active tunnels found.';
    } else {
      tunBox.innerHTML = `<ul>${tunnels.slice(0, 20).map(t => `<li>${t.protocol} :${t.port} - ${t.status} (latency: ${t.latency_ms ?? '-'}ms)</li>`).join('')}</ul>`;
    }

    refreshedAt.textContent = new Date().toLocaleString();
  } catch (e) {
    iranBox.textContent = 'Status temporarily unavailable.';
    resBox.textContent = 'Status temporarily unavailable.';
    conBox.textContent = 'Status temporarily unavailable.';
    tunBox.textContent = 'Status temporarily unavailable.';
  }
}

document.addEventListener('DOMContentLoaded', async () => {
  await loadSettings();
  await loadForeignStatus();
  setInterval(loadForeignStatus, 15000);
});
