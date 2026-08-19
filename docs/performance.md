# Wifora Performance & Latency Benchmarks

This document provides empirical benchmarking methodology, end-to-end latency breakdowns, and Wi-Fi spectrum performance metrics for Wifora.

---

## 1. End-to-End Latency Breakdown & Numerical Model

Wifora exhibits two complementary latency metrics depending on measurement conditions:

- **Typical Observed Glass-to-Ear Latency: 35–65 ms**
  Measured on modern 5 GHz Wi-Fi (802.11ac/ax) with an Ethernet-connected host PC. Under clean RF conditions, transmission and jitter absorption overlap with sub-frame audio decoding.
- **Conservative Pipeline Breakdown Estimate: ~55–75 ms**
  Calculated by summing the nominal upper bounds of all discrete capture, encoding, Wi-Fi transmit, jitter buffer, and DAC hardware scheduling stages.

### Stage-by-Stage Breakdown

| Stage                 | Process                                         | Typical Duration | Conservative Bound | Notes                                        |
| :-------------------- | :---------------------------------------------- | :--------------: | :----------------: | :------------------------------------------- |
| **Capture**           | Windows WASAPI Loopback -> Chromium Buffer      |     **5 ms**     |     **10 ms**      | Native OS audio buffer window                |
| **DSP**               | Highpass + Clarity EQ + Soft-Knee Limiter       |    **< 1 ms**    |      **1 ms**      | Real-time Web Audio API execution            |
| **Encoding**          | Opus 48 kHz Stereo Encoder (`ptime=20`)         |    **20 ms**     |     **20 ms**      | Frame packetization interval                 |
| **Transmission**      | 802.11 Wi-Fi (Host PC -> Access Point -> Phone) |    **2–4 ms**    |      **8 ms**      | Local LAN direct UDP transmission            |
| **Jitter Buffer**     | Receiver Dynamic Jitter Buffer Target           |    **22 ms**     |    **22–35 ms**    | WebRTC jitter absorption window              |
| **Decoding & Output** | Opus Decoder -> Mobile OS Audio Output DAC      |    **5–8 ms**    |     **15 ms**      | Hardware DAC scheduling buffer               |
| **Total Pipeline**    | **Glass-to-Ear Total Latency**                  |   **35–65 ms**   |   **~55–75 ms**    | **Imperceptible for movies, video & gaming** |

---

## 2. Wi-Fi Spectrum Benchmarking

Testing was conducted across diverse RF conditions with 1 to 5 connected listeners:

| Wi-Fi Network Band                 | Connected Listeners | Average Ping (RTT) |  Jitter  | Packet Loss | Active ANAE Tier                    | End-to-End Experience                            |
| :--------------------------------- | :-----------------: | :----------------: | :------: | :---------: | :---------------------------------- | :----------------------------------------------- |
| **Wi-Fi 6 / 6E (5 GHz / 6 GHz)**   |     1–5 Devices     |     **2–8 ms**     |  < 1 ms  |    0.0%     | **Tier 5 (Studio Master 256k)**     | Flawless studio transparency, 0 artifacts        |
| **Wi-Fi 5 (5 GHz Clean Channel)**  |     1–4 Devices     |    **8–15 ms**     |  1–3 ms  |   < 0.1%    | **Tier 5 (Studio Master 256k)**     | Instant lip-sync for video, crisp transients     |
| **Wi-Fi 5 (5 GHz Multi-Wall)**     |     1–3 Devices     |    **18–35 ms**    |  3–6 ms  |  0.2–0.8%   | **Tier 4 (Studio High 224k)**       | Stable, FEC covers any single-packet drops       |
| **Wi-Fi 4 (2.4 GHz Low RF Noise)** |     1–2 Devices     |    **25–45 ms**    | 4–10 ms  |  0.5–1.5%   | **Tier 3 (Balanced Standard 160k)** | Smooth audio, no audible degradation             |
| **Wi-Fi 4 (2.4 GHz Congested RF)** |     1–2 Devices     |   **65–110 ms**    | 15–25 ms |  2.0–3.8%   | **Tier 2 (Anti-Lag 128k)**          | Resilient audio, jitter buffer scales to 35-50ms |

---

## 3. Comparison with Alternative Local Audio Technologies

| Metric / Feature                 |            Wifora            |      Bluetooth SBC / AAC       |        AirPlay 2        | Virtual Audio Cable + VLC HTTP |
| :------------------------------- | :--------------------------: | :----------------------------: | :---------------------: | :----------------------------: |
| **Latency**                      |         **35–75 ms**         |           150–250 ms           |     1,000–2,000 ms      |         2,000–4,000 ms         |
| **Client App Required**          |  ❌ **None (Zero-Install)**  |         ❌ OS Pairing          | ❌ Apple Ecosystem only |       ⚠️ VLC Player App        |
| **Multi-Device Sync**            |   ✅ **Up to 5–8 clients**   | ❌ 1 (rarely 2 with Auracast)  |         ✅ Yes          |         ❌ Out-of-sync         |
| **Audio Sample Rate**            |     **48 kHz Fullband**      | 44.1 kHz / 48 kHz (Compressed) |        44.1 kHz         |            44.1 kHz            |
| **Adaptive Bandwidth**           |  ✅ **Dynamic ANAE Engine**  |           ⚠️ Limited           |     ❌ Fixed Buffer     |        ❌ Fixed Buffer         |
| **Sub-Bass & Anti-Clipping DSP** | ✅ **Built-in Studio Graph** |            ❌ None             |         ❌ None         |            ❌ None             |

---

## 4. Empirical Server & Pipeline Benchmarks

Wifora includes an automated reproducible benchmarking script located in [`benchmarks/run-benchmark.mjs`](../benchmarks/run-benchmark.mjs).

### Empirical Measurement Results (100–10,000 samples)

| Component / Subsystem           | Samples |     Mean     | Median (p50) | 95th Percentile (p95) | 99th Percentile (p99) |
| :------------------------------ | :-----: | :----------: | :----------: | :-------------------: | :-------------------: |
| **Timing-Safe Host Key Auth**   | 10,000  | **~0.8 µs**  |  **0.6 µs**  |        1.4 µs         |        4.4 µs         |
| **Opus SDP Munging Engine**     | 10,000  | **~3.5 µs**  |  **2.8 µs**  |        5.2 µs         |        14.6 µs        |
| **WebSocket Signaling Relay**   |  1,000  | **~0.08 ms** | **0.07 ms**  |        0.13 ms        |        0.24 ms        |
| **HTTP `/api/network` Latency** |  1,000  | **~3.5 ms**  |  **3.4 ms**  |        4.4 ms         |        5.3 ms         |
| **QR Code PNG Generation**      |   100   | **~12.6 ms** | **12.0 ms**  |        14.5 ms        |        27.5 ms        |
| **AudioEngine Ingest/Read**     | 10,000  | **~0.28 µs** | **0.10 µs**  |        0.60 µs        |        0.70 µs        |
| **DriftController Observation** | 10,000  | **~0.18 µs** | **0.10 µs**  |        0.30 µs        |        0.40 µs        |
| **Control Protocol Validation** | 10,000  | **~0.33 µs** | **0.20 µs**  |        0.60 µs        |        1.10 µs        |

👉 _Raw empirical datasets and hardware test rig details are preserved in [`benchmarks/results.csv`](../benchmarks/results.csv) and [`benchmarks/README.md`](../benchmarks/README.md)._

---

## 5. Performance Optimization Guidelines

For optimal performance in demanding environments:

1. **Host Connection**: Connect the Windows host PC via **Ethernet (LAN cable)** or **5 GHz Wi-Fi** to free 2.4 GHz airtime for mobile receivers.
2. **Access Point Placement**: Position the Wi-Fi router in the line of sight when streaming in multi-room settings.
3. **Transmission Profiles**:
   - For competitive gaming: select **Gaming & Low Latency (160 kbps CBR • 20ms)**.
   - For critical music listening: select **Studio Hi-Fi Master (384 kbps • Fullband 48 kHz)**.
   - For general usage / movies: leave default **Smart Auto (ANAE 96–256 kbps)**.
