# Architecture

SockPilot is intentionally split into two small, auditable components.

## Components

### Browser extension (`extension/`)

- Manifest V3 popup handles user input, displays status, and communicates with the local control API.
- The service worker uses `chrome.proxy.settings` to set the Chromium browser's regular-profile proxy to `127.0.0.1:<selected-proxy-port>` and clear it on disconnect.
- It needs the `proxy` and `storage` permissions and `http://127.0.0.1/*` host permission.
- The extension does not implement the SOCKS5 protocol and cannot make Chromium natively negotiate SOCKS5 username/password.

### Node.js bridge (`bridge/`)

- Bound to `127.0.0.1` only. No system-wide proxy changes, drivers, kernel tunnel or privileged service.
- HTTP proxy data port: **18080**. Accepts absolute-form HTTP requests and HTTP `CONNECT` tunnels.
- Control API port: **18081** by default. Exposes `GET /health` and token-protected `POST /configure`, `/test`, `/ip` and `/disconnect`.
- On configure, validates the fields, authenticates with the upstream SOCKS5 endpoint and then stores connection configuration in memory.
- For HTTP destinations, connects via SOCKS5 and forwards the request without hop-by-hop proxy headers.
- For HTTPS, tunnels the opaque TCP stream using `CONNECT`. HTTPS encryption is end-to-end between browser and destination site.
- The `/ip` endpoint opens a SOCKS5 connection to `api.ipify.org:443`, negotiates certificate-validated TLS and returns the public IP in a JSON response. It does not directly fetch an IP when the upstream proxy fails.
- Supports domain-name address type to request *remote destination resolution* by the SOCKS5 server. This does not imply all possible browser DNS activities are proxied.

## Traffic flow

```text
Browser UI -> Chrome extension popup
                  |
                  | control HTTP with bearer pairing key
                  v
        127.0.0.1:18081 (control)
                  |
                  | config in memory
                  v
Browser HTTP proxy 127.0.0.1:18080
                  |
                  | SOCKS5 auth and CONNECT
                  v
          SOCKS5 provider:port
                  |
                  v
             Web server
```

## Persistence

- `bridge/.local/pairing-token` — random 48-hex-character secret, created on first bridge run and ignored by Git.
- `bridge/.local/bridge-settings.json` — locally persisted and user-editable HTTP and control listener ports, read at bridge startup (restart required to apply changes).
- `chrome.storage.local` — SOCKS5 host, port, username, pairing key, chosen bridge ports and optional password when **Remember password** is selected. Stored without application-level encryption.
- Imported `host:port:user:password` is parsed in the popup and the raw line is cleared; only password persistence is opt-in. IPv6 must be bracketed and username cannot contain a colon in the quick-import format.
- Bridge upstream configuration — in RAM only. Restarting the bridge requires reconnecting from the extension.

## Non-goals for the initial version

- Proxying all OS applications, TUN/VPN behavior, UDP/QUIC support or comprehensive leak prevention.
- Browser-independent proxy switching or automatic per-URL routing.
- A hardened multi-user or hostile-local-process security boundary.
- Remote control API access, public network binding or remote telemetry.

For known risks, read [SECURITY.md](../SECURITY.md).
