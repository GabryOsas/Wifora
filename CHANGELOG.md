# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-08-25

First stable public release. Wifora broadcasts Windows PC system audio to any
browser on the local network (iOS, iPadOS, Android, desktop) with sub-frame
latency and zero app installs.

### Added

#### Streaming Core

- Browser loopback capture via `getDisplayMedia` with system audio (Chromium on Windows).
- Optional native capture path: `wifora-audio.exe` WASAPI shared-mode loopback helper
  (C++20), streaming framed Float32 PCM (`WFR1` header) over stdout into a
  localhost-only WebSocket relay.
- Studio DSP chain: 20 Hz high-pass, dialogue presence EQ, soft-knee peak limiter,
  with three runtime modes (`clarity`, `pure`, `voice`).
- Opus 48 kHz stereo encoding with SDP tuning: `ptime=20`, always-on in-band FEC,
  DTX disabled, per-tier `maxaveragebitrate`, CBR for the low-latency profile.
- Direct peer-to-peer WebRTC transport over LAN (`iceServers: []`), mandatory
  DTLS-SRTP media encryption, no STUN/TURN/cloud relays.

#### Adaptive Quality & Synchronization

- ANAE adaptive quality engine: five quality tiers (96–256 kbps) driven by RTT,
  jitter and packet-loss telemetry with asymmetric anti-flapping hysteresis
  (2 samples to degrade, 5 consecutive samples to recover one tier).
- Manual transmission profiles: `adaptive` (256k ceiling), `lowlatency`
  (160k CBR, 10 ms framing), `hifi` (384k), `eco` (96k).
- Receiver-side elastic AudioWorklet playout buffer: 240 ms ring capacity, 80 ms
  target, 45 ms priming, hold-and-fade concealment (no clicks on packet loss),
  bounded micro-rate correction against clock drift.
- Dynamic WebRTC jitter buffer targets (22 / 35 / 50 / 65 ms) with adaptive mode
  switching (`ultraLow`, `balanced`, `stable`, `recovery`).
- NTP-style four-timestamp clock synchronization (probe/reply/report) with drift
  estimation and clamped correction (+/-100 ppm).

#### Server & Infrastructure

- Node.js signaling server (`ws`) with 8-character room codes, host reconnection
  grace (8 s), listener disconnect grace (5 s), room cleanup grace (60 s).
- Constant-time authentication for host keys (256-bit base64url) and optional
  listener tokens (128-bit base64url) via `crypto.timingSafeEqual`.
- Per-IP sliding-window rate limiters: connections (30/10 s), room misses
  (8/30 s), auth failures (10/30 s); 24 KB signaling payload cap.
- Hardened HTTP layer: strict Content-Security-Policy (no inline scripts/styles),
  Origin allow-list for WebSocket upgrades, double-check path-traversal defense,
  MIME whitelist, security headers on every response.
- Optional HTTPS/WSS mode via `WIFORA_TLS_CERT` / `WIFORA_TLS_KEY`.
- Bonjour/mDNS service advertisement (`_wifora._tcp.local`) with version,
  transport and capability TXT records.
- Server-side QR code endpoint (`/qr`) and LAN address enumeration (`/api/network`).
- Host features: live listener list with per-device telemetry (ping, jitter,
  buffer, sync offset, bitrate, loss), device kick, local session recording
  (WebM/M4A via MediaRecorder), volume control with VU meter, QR/share panel,
  session persistence across page reloads (12 h sessionStorage TTL).
- Listener experience: installable PWA (manifest + network-first service worker),
  Screen Wake Lock toggle, iOS AudioSession playback routing, MediaSession
  integration, autoplay resume prompt, connection HUD with Wi-Fi quality badges.

#### Tooling & Operations

- Web Control Center daemon (loopback-only, default port 3976): start/stop/restart
  the streaming server, change port, free occupied ports, view logs and connected
  devices, QR pairing card, network adapter overview.
- Interactive CLI menu (`npm run menu`) with live log dashboard and shortcuts.
- Windows launchers: `Avvia-Wifora.bat`, `Controllo-Wifora.bat`,
  `Termina-Wifora.bat` (process sweep + port verification for 3975/3976).
- Structured leveled logging (DEBUG/INFO/WARN/ERROR/SILENT) with ANSI colors and
  child tags; secrets never logged.
- Internationalization: Italian and English (168 keys per language).
- Device detection: iPad/iPhone model classification, Android vendor model mapping
  via Client Hints with UA fallback.
- Automated test suite: 17 suites (~56 tests) covering protocol validation, HTTP
  surface, WebSocket signaling, WASAPI frame decoding, audio engine, adaptive
  policy, jitter control, playout core, clock sync, discovery and transports.
- Reproducible benchmark harness (`npm run benchmark`) producing
  `benchmarks/results.csv` and `benchmarks/benchmark-summary.json`.
- CI matrix (Ubuntu + Windows, Node 18/20/22): lint, format check, tests;
  weekly `npm audit` high-severity gate; Dependabot for npm and GitHub Actions.
- Documentation: architecture deep-dive, performance benchmarks, security model.

[Unreleased]: https://github.com/GabryOsas/Wifora/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/GabryOsas/Wifora/releases/tag/v1.0.0
