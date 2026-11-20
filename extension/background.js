'use strict';

const PROXY_HOST = '127.0.0.1';
const DEFAULT_PROXY_PORT = 18080;

async function configuredPort() {
  const saved = await chrome.storage.local.get(['bridgeProxyPort']);
  const port = Number(saved.bridgeProxyPort || DEFAULT_PROXY_PORT);
  return Number.isInteger(port) && port >= 1 && port <= 65535 ? port : DEFAULT_PROXY_PORT;
}

async function setBadge(enabled) {
  await chrome.action.setBadgeText({ text: enabled ? 'ON' : '' });
  if (enabled) await chrome.action.setBadgeBackgroundColor({ color: '#1da889' });
}

async function getProxyState() {
  const proxyPort = await configuredPort();
  const setting = await chrome.proxy.settings.get({ incognito: false });
  const current = setting.value || {};
  const proxy = current.rules && current.rules.singleProxy;
  const ours = current.mode === 'fixed_servers' && proxy &&
    proxy.scheme === 'http' && proxy.host === PROXY_HOST && proxy.port === proxyPort;
  return {
    enabled: Boolean(ours),
    levelOfControl: setting.levelOfControl || 'unknown'
  };
}

chrome.runtime.onMessage.addListener((message, sender, respond) => {
  if (sender.id !== chrome.runtime.id) return false;
  (async () => {
    if (message.action === 'state') return getProxyState();
    if (message.action === 'connect') {
      const proxyPort = Number(message.proxyPort || DEFAULT_PROXY_PORT);
      if (!Number.isInteger(proxyPort) || proxyPort < 1 || proxyPort > 65535) {
        throw new Error('Port HTTP bridge tidak valid.');
      }
      const setting = await chrome.proxy.settings.get({ incognito: false });
      if (!['controllable_by_this_extension', 'controlled_by_this_extension'].includes(setting.levelOfControl)) {
        throw new Error('Proxy dikontrol kebijakan browser atau extension lain.');
      }
      await chrome.proxy.settings.set({
        scope: 'regular',
        value: {
          mode: 'fixed_servers',
          rules: {
            singleProxy: { scheme: 'http', host: PROXY_HOST, port: proxyPort },
            bypassList: ['127.0.0.1', 'localhost', '[::1]']
          }
        }
      });
      await chrome.storage.local.set({ bridgeProxyPort: proxyPort });
      const result = await getProxyState();
      if (!result.enabled) throw new Error('Brave tidak menerapkan proxy lokal.');
      await setBadge(true);
      return result;
    }
    if (message.action === 'disconnect') {
      await chrome.proxy.settings.clear({ scope: 'regular' });
      await setBadge(false);
      return getProxyState();
    }
    throw new Error('Aksi tidak dikenal.');
  })().then(data => respond({ ok: true, data }))
    .catch(error => respond({ ok: false, error: String(error.message || error) }));
  return true;
});

chrome.runtime.onStartup.addListener(async () => {
  try { await setBadge((await getProxyState()).enabled); } catch (_) {}
});
