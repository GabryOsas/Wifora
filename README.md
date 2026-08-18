<div align="center">

<img src="public/wifora-logo.png" alt="Wifora Logo" width="120" style="border-radius: 20px; margin-bottom: 14px;" />

# Wifora
### Low-Latency Local Wi-Fi Audio Streaming • Zero App Required

[![CI](https://github.com/GabryOsas/Wifora/actions/workflows/ci.yml/badge.svg)](https://github.com/GabryOsas/Wifora/actions)
[![Node.js](https://img.shields.io/badge/Node.js-%3E%3D18.0.0-339933?style=flat-square&logo=node.js&logoColor=white)](https://nodejs.org)
[![WebRTC](https://img.shields.io/badge/WebRTC-Opus%2048kHz%20Stereo-007ACC?style=flat-square&logo=webrtc&logoColor=white)](https://webrtc.org)
[![Platform](https://img.shields.io/badge/Host-Windows%2010%2F11-0078D4?style=flat-square&logo=windows&logoColor=white)](#)
[![Client](https://img.shields.io/badge/Client-Pure%20Web%20Browser-555555?style=flat-square)](#)
[![License](https://img.shields.io/badge/License-MIT-blue.svg?style=flat-square)](LICENSE)
[![Buy Me A Coffee](https://img.shields.io/badge/Support-Buy%20Me%20A%20Coffee-FFDD00?style=flat-square&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/gabryosas)

<p align="center">
  <strong>Wifora</strong> is a high-performance, open-source audio streaming server that instantly broadcasts your Windows PC system audio to any smartphone, tablet, or secondary computer (iPhone, iPad, Android, Mac, Linux) over your local Wi-Fi with sub-frame latency (~35–65 ms) and studio-grade 48 kHz stereo quality — requiring <strong>zero application installations</strong> on receiving devices.
</p>

</div>

---

## ⚡ Features

- **Zero App Required**: Scan a QR code or enter an 8-character room code on any mobile browser (Safari iOS, Chrome, Edge, Firefox) to start listening immediately.
- **Ultra-Low Latency**: End-to-end glass-to-ear latency of **35–65 ms** on modern 5 GHz Wi-Fi — perfectly in sync for movies, gaming, YouTube, and monitoring.
- **Studio-Grade 48 kHz Stereo**: Fullband Opus audio codec with dynamic bitrates from 96 kbps to 384 kbps.
- **20 ms Framing & In-Band FEC**: Optimized 20 ms packetization (`ptime=20`) with Forward Error Correction (`useinbandfec=1`) and disabled DTX (`usedtx=0`) to eliminate Wi-Fi packet collisions and prevent audio dropouts.
- **ANAE Adaptive Quality Engine**: Real-time telemetry monitoring (RTT, jitter, differential packet loss) with anti-flapping hysteresis automatically adjusts bitrate across 5 dynamic quality tiers (96–256 kbps).
- **Studio DSP Chain**: Integrated Web Audio processing including a 20 Hz sub-rumble high-pass filter, dialogue presence booster, and transparent lookahead peak limiter (-0.5 dBFS threshold, soft knee).
- **100% Local Privacy**: All media and signaling traffic remain strictly within your local LAN. Zero cloud servers, no STUN/TURN relays, and no third-party tracking.
- **Mobile-Optimized Experience**: Dynamic WebRTC Jitter Buffer (22–50 ms), Screen Wake Lock API, and native iOS `AudioSession` routing (preventing call speaker playback).

---

## 🚀 Quick Start

Get Wifora running in 10 seconds:

### 1. Prerequisites
- **Host PC**: Windows 10 or Windows 11 with Google Chrome or Microsoft Edge.
- **Runtime**: [Node.js](https://nodejs.org) (v18.0.0 or higher).
- **Network**: Host PC and mobile receivers connected to the **same Wi-Fi or Ethernet network**.

### 2. Installation & Launch
```bash
# Clone the repository
git clone https://github.com/GabryOsas/Wifora.git
cd Wifora

# Install dependencies
npm install

# Start Wifora
npm start
```

*Tip (Windows): You can also double-click `Avvia-Wifora.bat` or run `npm run menu` for the interactive CLI menu.*

### 3. Start Streaming
1. Open `http://localhost:3975` in Chrome or Edge on your PC.
2. Click **Start Audio Broadcast**, select **Entire Screen**, and ensure **"Share system audio"** is checked.
3. Scan the displayed **QR code** with your iPhone or Android camera to start listening!

---

## 🌐 Browser Compatibility Matrix

Wifora has been rigorously tested across modern operating systems and web browsers:

| Platform / Browser | Host (Streamer) | Listener (Receiver) | Tested & Verified | Notes |
| :--- | :---: | :---: | :---: | :--- |
| **Google Chrome (Windows)** | ✅ **Supported** | ✅ **Supported** | ✅ **Tested** | Full system-audio capture & WebRTC streaming |
| **Microsoft Edge (Windows)** | ✅ **Supported** | ✅ **Supported** | ✅ **Tested** | Full system-audio capture & WebRTC streaming |
| **Apple Safari (iOS / iPadOS 15+)** | — | ✅ **Supported** | ✅ **Tested** | Native Opus, AudioSession media routing, WakeLock |
| **Google Chrome (Android)** | — | ✅ **Supported** | ✅ **Tested** | JitterBufferTarget API, Web Audio level meter |
| **Mozilla Firefox (Windows / Linux / Mac)** | ⚠️ Limited | ✅ **Supported** | ✅ **Tested** | Listener fully verified; Host lacks loopback audio on non-Windows |
| **Apple Safari (macOS)** | — | ✅ **Supported** | ✅ **Tested** | Listener verified for secondary Mac audio output |

> **Host Requirement**: The host broadcasting PC requires Chromium (Chrome / Edge) on Windows to capture system loopback audio natively without third-party virtual audio cables.

---

## 🔍 How It Works

```
[ Windows PC (WASAPI Loopback) ]
               │
               ▼
[ Web Audio Studio DSP ] ──> Highpass (20Hz) + Peaking EQ + Peak Limiter (-0.5 dB)
               │
               ▼
[ Opus Encoder (48 kHz) ] ──> 20 ms Framing (`ptime=20`) + In-Band FEC (`useinbandfec=1`)
               │
               ▼  (Local Wi-Fi Network • DTLS-SRTP)
[ Mobile Device (Receiver) ] ──> Adaptive JitterBuffer (22-50ms) ──> AudioSession Output DAC
```

1. **Capture**: Chromium captures Windows audio output via WASAPI loopback.
2. **DSP Mastering**: Real-time Web Audio API cleans DC rumble and prevents digital clipping.
3. **Opus Encoding**: Negotiated with 20 ms framing, in-band FEC, and 48 kHz stereo.
4. **Local Transport**: Direct WebRTC peer connection over LAN with WebSocket signaling.
5. **Adaptive Playback**: Mobile receiver dynamically manages jitter buffer targets (22 ms, 35 ms, 50 ms) according to instantaneous RF packet loss.

---

## 📊 Performance & Latency

| Wi-Fi Network Band | Connected Listeners | Typical RTT | Jitter | Packet Loss | Active ANAE Tier | Quality Profile |
| :--- | :---: | :---: | :---: | :---: | :--- | :--- |
| **Wi-Fi 6 / 6E (5 GHz / 6 GHz)** | 1–5 Devices | **2–8 ms** | < 1 ms | 0.0% | **Tier 5 (256 kbps)** | Studio Master |
| **Wi-Fi 5 (5 GHz Clean Channel)** | 1–4 Devices | **8–15 ms** | 1–3 ms | < 0.1% | **Tier 5 (256 kbps)** | Studio Master |
| **Wi-Fi 5 (5 GHz Multi-Wall)** | 1–3 Devices | **18–35 ms** | 3–6 ms | 0.2–0.8% | **Tier 4 (224 kbps)** | Studio High |
| **Wi-Fi 4 (2.4 GHz Congested)** | 1–2 Devices | **65–110 ms** | 15–25 ms | 2.0–3.8% | **Tier 2 (128 kbps)** | Anti-Lag Resilient |

👉 *For in-depth mathematical formulations and latency benchmarks, see [docs/performance.md](docs/performance.md).*

---

## 🔒 Security & Privacy

- **100% Zero-Cloud**: Media and signaling remain strictly local on your private subnet.
- **Empty ICE Relays**: `iceServers: []` guarantees no audio packets traverse public STUN/TURN servers.
- **Constant-Time Auth**: Host keys validated via `crypto.timingSafeEqual` to eliminate timing attacks.
- **HTTP Hardening**: Strict Content Security Policy (CSP), Origin verification, and path-traversal prevention.

👉 *For complete security architecture and threat models, see [docs/security.md](docs/security.md).*

---

## ⚠️ Known Limitations

To maintain full engineering transparency, the following technical boundaries apply:

- **Windows Host Loopback**: System-wide audio capture via `getDisplayMedia` with system audio support is a feature of Chromium on Windows. macOS and Linux browsers currently do not support OS-wide system loopback capture without virtual audio cable drivers.
- **Local Area Network Only**: Wifora is intentionally designed for direct LAN streaming. It does not provide internet streaming or cloud tunneling to prioritize privacy and sub-frame latency.
- **Listener Capacity**: Designed for 1–8 simultaneous local listeners (default max 5, configurable via `WIFORA_MAX_LISTENERS`). Beyond 8–10 concurrent high-bitrate WebRTC streams, typical residential 2.4 GHz Wi-Fi access points experience RF airtime contention.
- **Network Dependence**: Performance directly reflects local Wi-Fi quality. A 5 GHz Wi-Fi router or wired Ethernet host PC is recommended for the best experience.

---

## ⚙️ Configuration & Environment Variables

| Variable | Default | Description |
| :--- | :---: | :--- |
| `PORT` | `3975` | Port number for HTTP server and WebSocket signaling. |
| `WIFORA_MAX_LISTENERS` | `5` | Maximum concurrent listener connections per room (clamped between 1 and 32). |
| `LOG_LEVEL` | `INFO` | Server logging verbosity (`DEBUG`, `INFO`, `WARN`, `ERROR`, `SILENT`). |

Example:
```bash
PORT=8080 WIFORA_MAX_LISTENERS=8 LOG_LEVEL=DEBUG npm start
```

---

## 🛠️ Development & Testing

Wifora includes an automated test suite covering HTTP endpoints, security headers, timing-safe auth, origin verification, and WebSocket signaling lifecycles:

```bash
# Run automated tests
npm test

# Run tests in watch mode
npm run test:watch
```

---

## 📖 Deep-Dive Documentation

- [Architecture & DSP Pipeline](docs/architecture.md) — Detailed DSP node graph, ANAE state machine, and Opus SDP negotiation.
- [Performance & Latency Benchmarks](docs/performance.md) — Glass-to-ear latency breakdown and Wi-Fi spectrum benchmarks.
- [Security Model & Privacy](docs/security.md) — Constant-time authentication, CSP headers, and network isolation.

---

## 📄 License

This project is licensed under the MIT License — see the [LICENSE](LICENSE) file for details.
