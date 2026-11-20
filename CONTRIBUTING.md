# Contributing to SockPilot

Thanks for helping make authenticated SOCKS5 proxying easier and more transparent in Chromium browsers.

## Before opening a pull request

1. Search existing issues and pull requests for overlapping work.
2. Open an issue for significant feature changes, particularly changes to proxy behavior, credential storage or browser permissions.
3. Fork the repository and create a focused feature branch from `main`.
4. Keep changes small, readable and dependency-light.

## Local setup

Requires Node.js 20+.

```bash
git clone https://github.com/Vluuuu/sockpilot.git
cd sockpilot
npm test
npm run bridge
```

No `npm install` is required. Load the `extension/` folder via `brave://extensions/` → Developer mode → Load unpacked. Reload the extension after changing its source.

## Expectations

- Include or update tests for protocol and bridge behavior.
- Run `npm test` and syntax checks before submitting.
- Update the README or relevant docs if user-visible behavior changes.
- Never commit actual proxy hostnames tied to your account, passwords, tokens, `bridge/.local/` or private logs.
- Do not add trackers, remote telemetry or external runtime dependencies without an explicit design review.
- Treat changes to proxy scoping, failover, credential handling and origin checks as security-sensitive.
- Respect the MIT license and the [Code of Conduct](CODE_OF_CONDUCT.md).

## Commit / PR convention

Prefer descriptive commits, for example `fix: validate bridge port`, `docs: clarify setup`, or `test: cover wrong SOCKS5 password`.

In pull requests, explain **what changed, why, how you tested it, and known limitations**. Screenshots are welcome for UI changes (redact any secrets).

For vulnerabilities, use [SECURITY.md](SECURITY.md) instead of public issues.
