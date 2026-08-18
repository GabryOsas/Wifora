# Wifora Empirical Benchmarks & Hardware Methodology

This directory contains automated reproducible performance benchmarks, empirical datasets, and measurement harnesses for Wifora's server subsystem, SDP processing engine, and WebRTC signaling pipeline.

---

## 🖥️ Benchmark Environment & Test Rig Specifications

| Parameter                   | Specification                                                                     | Notes                                               |
| :-------------------------- | :-------------------------------------------------------------------------------- | :-------------------------------------------------- |
| **Host Operating System**   | Microsoft Windows 11 Pro 64-bit                                                   | Build 22631                                         |
| **Host CPU Architecture**   | x86_64 (Multi-Core AVX2)                                                          | High-resolution timer support (`performance.now()`) |
| **Runtime Environment**     | Node.js (V8 Engine)                                                               | v18.0.0+ / v20.x / v22.x / v24.x                    |
| **Host Network Interface**  | Wi-Fi 6 (Intel AX210 802.11ax 160MHz) / Gigabit Ethernet                          | Low-jitter local interface                          |
| **Mobile Client Receivers** | Apple iPhone 15 Pro (iOS 17.5 / Safari 17) & Google Pixel 8 (Android 14 / Chrome) | Hardware Opus DSP decoders                          |
| **Test Date**               | August 2026                                                                       | Automated CI / Local Test Harness                   |

---

## 📊 Benchmark Metrics Summary

Automated micro- and macro-benchmarks evaluated across 100 to 10,000 empirical samples:

| Test Harness                      | Iterations |     Mean     | Median (p50) | 95th % (p95) | 99th % (p99) |  Jitter  |
| :-------------------------------- | :--------: | :----------: | :----------: | :----------: | :----------: | :------: |
| **Timing-Safe Host Key Auth**     |   10,000   | **~0.7 µs**  |  **0.6 µs**  |    1.2 µs    |    2.9 µs    | < 0.3 µs |
| **Opus SDP Munging Engine**       |   10,000   | **~3.3 µs**  |  **2.7 µs**  |    4.4 µs    |   14.3 µs    | ~1.0 µs  |
| **WebSocket Signaling Relay**     |   1,000    | **~0.08 ms** | **0.07 ms**  |   0.12 ms    |   0.17 ms    | 0.01 ms  |
| **HTTP `/api/network` Discovery** |   1,000    | **~3.6 ms**  |  **3.5 ms**  |    4.3 ms    |    5.4 ms    |  0.4 ms  |
| **QR Code PNG Generation**        |    100     | **~12.8 ms** | **12.3 ms**  |   15.5 ms    |   30.5 ms    |  1.0 ms  |

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
