# Wifora Empirical Benchmarks & Hardware Methodology

This directory contains automated reproducible performance benchmarks, empirical datasets, and measurement harnesses for Wifora's server subsystem, SDP processing engine, and WebRTC signaling pipeline.

---

## 🖥️ Benchmark Environment & Test Rig Specifications

| Parameter                   | Specification                                                                     | Notes                                               |
| :-------------------------- | :-------------------------------------------------------------------------------- | :-------------------------------------------------- |
| **Host Operating System**   | Microsoft Windows 11 Pro 64-bit                                                   | Build 22631                                         |
| **Host CPU Architecture**   | x86_64 (Multi-Core AVX2)                                                          | High-resolution timer support (`performance.now()`) |
| **Runtime Environment**     | Node.js (V8 Engine)                                                               | v18.0.0+ required • CI verifies 18.x / 20.x / 22.x  |
| **Host Network Interface**  | Wi-Fi 6 (Intel AX210 802.11ax 160MHz) / Gigabit Ethernet                          | Low-jitter local interface                          |
| **Mobile Client Receivers** | Apple iPhone 15 Pro (iOS 17.5 / Safari 17) & Google Pixel 8 (Android 14 / Chrome) | Hardware Opus DSP decoders                          |
| **Test Date**               | August 2026                                                                       | Automated CI / Local Test Harness                   |

---

## 📊 Benchmark Metrics Summary

Automated micro- and macro-benchmarks evaluated across 100 to 10,000 empirical samples:

| Test Harness                      | Iterations |     Mean     | Median (p50) | 95th % (p95) | 99th % (p99) |  Jitter  |
| :-------------------------------- | :--------: | :----------: | :----------: | :----------: | :----------: | :------: |
| **Timing-Safe Host Key Auth**     |   10,000   | **~0.9 µs**  |  **0.6 µs**  |    1.4 µs    |    4.4 µs    | < 0.5 µs |
| **Opus SDP Munging Engine**       |   10,000   | **~3.5 µs**  |  **2.8 µs**  |    5.2 µs    |   14.6 µs    | ~1.1 µs  |
| **WebSocket Signaling Relay**     |   1,000    | **~0.08 ms** | **0.07 ms**  |   0.13 ms    |   0.24 ms    | 0.01 ms  |
| **HTTP `/api/network` Discovery** |   1,000    | **~3.6 ms**  |  **3.5 ms**  |    4.4 ms    |    5.3 ms    |  0.4 ms  |
| **QR Code PNG Generation**        |    100     | **~12.7 ms** | **12.1 ms**  |   14.6 ms    |   27.5 ms    |  1.0 ms  |

_Metrics reflect the latest recorded run (`benchmark-summary.json`, 2026-08-19); see [`results.csv`](results.csv) for full distributions._

---

## 📁 Artifacts

- [`results.csv`](results.csv) — Raw CSV table containing min, mean, p50, p95, p99, max, standard deviation, and jitter for all benchmarks.
- [`benchmark-summary.json`](benchmark-summary.json) — Structured JSON artifact with test timestamps and quantitative outputs for CI integration.

---

## 🚀 How to Reproduce

Run the automated benchmark suite anytime:

```bash
# Run benchmark via npm script
npm run benchmark

# Or invoke directly via node
node benchmarks/run-benchmark.mjs
```
