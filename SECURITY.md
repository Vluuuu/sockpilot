# Security Policy

SockPilot handles proxy credentials and changes browser network settings. Please read this threat model before using it.

## Supported versions

This is a community, pre-stable project. We aim to maintain the latest release and the main branch. No formal security support SLA is promised.

## Reporting vulnerabilities

**Do not publish working exploits, credentials, pairing keys or private proxy details in a public issue.**

Use [GitHub's private vulnerability reporting](https://github.com/Vluuuu/sockpilot/security/advisories/new) if it is enabled. If it is unavailable, open a generic issue requesting a private reporting channel **without disclosing technical exploit details**.

Include the affected version/commit, operating system, browser version, reproduction steps and expected impact. Sanitise logs and screenshots.

## Threat model

- The extension sets Chromium's **regular-profile** HTTP proxy to the local bridge. It does not set a Windows/system proxy.
- The Node.js bridge listens on loopback (`127.0.0.1:18080` data proxy and `127.0.0.1:18081` control API). **Any local process may be able to connect to the data proxy.** This is not process-isolated or a security boundary.
- The control API requires a random pairing key for configuration, test, proxy public-IP check and disconnect actions. The health endpoint reports non-secret status without a key. A malicious local process that can read the token or extension data can control the bridge.
- The control API's origin checks are defence-in-depth, **not** a substitute for keeping the pairing key secret.
- `bridge/.local/bridge-settings.json` contains user-editable listener ports and persists on disk. Apply changes by restarting the bridge. It is gitignored. Both listeners remain bound to loopback.
- `bridge/.local/pairing-token` persists on disk and is gitignored. Keep it out of backups/shares where possible. Restarting without its token file generates a new key.
- Upstream SOCKS5 credentials live in the bridge's memory. Opting into **Remember password** stores the password in `chrome.storage.local` in the browser profile, with **no application-level encryption**. Do not use this on shared computers or when untrusted extensions are installed.
- Clicking **Check IP** causes an HTTPS request to `api.ipify.org` through the authenticated SOCKS5 proxy. That service may observe the resulting IP and request; no direct fallback is used if the proxy fails.
- SOCKS5 username/password (RFC 1929) does **not** encrypt the authentication exchange. Your proxy operator and network path can observe proxy protocol data. HTTPS protects HTTPS payloads but not all connection metadata.
- This is an HTTP/HTTPS **TCP** proxy. WebRTC, UDP/QUIC, other applications, DNS prefetching and browser-specific behavior are **not** comprehensively controlled. Do not assume anonymity or IP leak protection.
- If the bridge is unavailable, browser networking may fail. SockPilot is **not** a verified kill switch. Avoid using it when confidentiality requires guaranteed no-direct fallback.
- Avoid exposing local ports via firewall changes, port forwarding, reverse proxies, tunnels or remote development tools.

## Developer checklist

- Never log credential values or pairing keys in diagnostics, issues, screenshots or CI.
- Keep localhost binding and token checks intact; deny non-loopback exposure.
- Validate hostnames, ports and credential byte length.
- Use HTTPS for any external network resources you access through a proxy.
- Test with `npm test` and conduct manual browser + real SOCKS5 integration tests for releases.
- Review extension permissions before increasing their scope.
