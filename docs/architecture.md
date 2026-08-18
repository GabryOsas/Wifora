# Wifora Architecture & Engineering Deep-Dive

This document details the internal architecture, mathematical formulations, signaling protocols, and audio processing pipelines powering Wifora.

---

## 1. System Overview

Wifora is a local WebRTC audio application with a Node.js signaling server and browser-side audio processing:

- **Host (Windows PC)**: Uses the browser's `getDisplayMedia({ audio: true, systemAudio: 'include' })` capture path for system audio, applies browser-side Web Audio processing, and sends the resulting Opus track through a WebRTC peer connection.
- **Signaling Hub (Node.js Server)**: Serves the static UI and QR endpoint, then relays WebSocket signaling messages for room registration, authentication, ICE candidates, and SDP offers/answers. Media does not pass through the server.
- **Listener (Mobile / Secondary Device)**: Receives the peer-to-peer Opus RTP stream in the browser, plays it through an HTML5 Audio element, optionally adjusts `RTCRtpReceiver.jitterBufferTarget`, and displays Web Audio telemetry.

```mermaid
flowchart TD
    subgraph HostPC ["Windows PC (Host)"]
        WASAPI["Windows Audio Engine"] --> Capture["getDisplayMedia\n(systemAudio: include)"]
        Capture --> DSP["Web Audio DSP Chain\n(High-pass + EQ + Limiter)"]
        DSP --> Peer["RTCPeerConnection (Opus 48kHz Stereo)"]
    end

    subgraph Server ["Node.js Local Server"]
        WS["WebSocket Signaling (/signal)"]
        HTTP["Static HTTP & QR Endpoint (:3975)"]
    end

    subgraph Listener ["Mobile / Tablet (Listener)"]
        WebRTC["WebRTC Inbound RTP (Opus Decoder)"]
        JB["Optional Jitter Buffer Target\n(22 / 35 / 50 ms)"]
        AudioOut["HTML5 Audio Element / AudioSession Playback"]
        WebRTC --> JB --> AudioOut
    end

    Peer <-->|Peer-to-peer WebRTC Media| WebRTC
    HostPC <-->|WebSocket Signaling| WS
    Listener <-->|WebSocket Signaling| WS
    Peer -.->|RTCP stats| HostPC
```

---

## 2. Web Audio DSP Pipeline

Before transmission, the captured audio stream passes through a specialized Web Audio DSP graph running at 48 kHz:

```
[System Audio Input]
        │
        ▼
[BiquadFilterNode: Highpass (20 Hz, Q=0.707)]  ──> Eliminates DC offset & sub-audible mechanical rumble
        │
        ▼
[BiquadFilterNode: Peaking EQ (3.2 kHz, 0 dB default, Q=1.0)] ──> Optional voice-mode presence boost
        │
        ▼
[DynamicsCompressorNode: Studio Peak Limiter]   ──> Transparent compressor (threshold -1 dB, knee 3 dB, ratio 12:1)
        │
        ├───> [GainNode (Volume/Mute)] ───> [MediaStreamAudioDestinationNode] ───> WebRTC RTP Sender
        │
        └───> [AnalyserNode (FFT Size 128)] ───> requestAnimationFrame UI Level Meter
```

### Limiter Specification

- **Default clarity mode**: threshold `-1.0 dBFS`, knee `3 dB`, ratio `12:1`
- **Voice mode**: threshold `-1.5 dBFS`, knee `2.5 dB`, ratio `8:1`, with an `80 Hz` high-pass and `+3.5 dB` presence boost
- **Pure mode**: high-pass moved to `1 Hz`, EQ gain `0 dB`, compressor effectively bypassed with threshold `0 dB` and ratio `1:1`
- **Attack Time**: `1 ms` (Instantaneous transient catching)
- **Release Time**: `40 ms` in clarity/pure mode and `50 ms` in voice mode

---

## 3. WebRTC Opus SDP Configuration

Wifora programmatically customizes the WebRTC Session Description Protocol (SDP) `a=fmtp` attributes for the Opus payload:

```text
a=fmtp:111 minptime=10;ptime=20;maxptime=20;useinbandfec=1;usedtx=0;stereo=1;sprop-stereo=1;maxaveragebitrate=256000;maxplaybackrate=48000
```

| Parameter                 | Value            | Rationale                                                                                                                                                     |
| :------------------------ | :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ptime` / `maxptime`      | `20`             | 20 ms framing halves packet overhead compared to 10 ms framing, dramatically reducing 802.11 MAC contention while maintaining sub-frame latency.              |
| `minptime`                | `10`             | Permits 10 ms lower bound if receiver requests it.                                                                                                            |
| `useinbandfec`            | `1`              | Forward Error Correction embeds redundant lower-bitrate payload for the previous frame inside each packet, correcting isolated RF drops without NACK latency. |
| `usedtx`                  | `0`              | Discontinuous Transmission is disabled to eliminate the 20–40 ms attack delay when music resumes after silence.                                               |
| `stereo` / `sprop-stereo` | `1`              | Full two-channel stereo spatial encoding.                                                                                                                     |
| `maxaveragebitrate`       | `96000`–`384000` | Adaptive mode ranges from 96–256 kbps; manual profiles can select 96, 160, or 384 kbps.                                                                       |
| `maxplaybackrate`         | `48000`          | Native 48 kHz fullband sampling rate.                                                                                                                         |

---

## 4. ANAE (Adaptive Network & Audio Engine)

The host ANAE loop monitors each peer every 1,000 ms using standard WebRTC `getStats()` metrics. The listener runs a separate 1,000 ms telemetry loop for its display and jitter-buffer target.

### Differential Packet Loss Formulation

The host compares outbound packets sent with the remote inbound `packetsLost` counter over the last sampling window $\Delta t = 1\,\text{s}$:

$$\Delta\text{PacketsReceived} = \text{PacketsReceived}_t - \text{PacketsReceived}_{t-1}$$

$$\Delta\text{PacketsLost} = \text{PacketsLost}_t - \text{PacketsLost}_{t-1}$$

$$
\text{InstantLoss}_{host} =
\begin{cases}
\dfrac{\Delta\text{PacketsLost}}{\Delta\text{PacketsSent}} \times 100\% & \text{if } \Delta\text{PacketsSent} > 0 \\
\text{stale / unavailable} & \text{otherwise}
\end{cases}
$$

The listener has both received and lost counters, so it uses the more conventional received-plus-lost denominator:

$$
\text{InstantLoss}_{listener} =
\begin{cases}
\dfrac{\Delta\text{PacketsLost}}{\Delta\text{PacketsReceived} + \Delta\text{PacketsLost}} \times 100\% & \text{if } \Delta\text{PacketsReceived} + \Delta\text{PacketsLost} > 0 \\
\text{unavailable} & \text{otherwise}
\end{cases}
$$

### EWMA Telemetry Smoothing

Transient RF interference is filtered using Exponentially Weighted Moving Averages (EWMA):

$$\text{SmoothedRTT}_t = \alpha_{\text{RTT}} \cdot \text{RTT}_t + (1 - \alpha_{\text{RTT}}) \cdot \text{SmoothedRTT}_{t-1} \quad (\alpha_{\text{RTT}} = 0.3)$$

$$\text{SmoothedLoss}_t = \alpha_{\text{Loss}} \cdot \text{InstantLoss}_t + (1 - \alpha_{\text{Loss}}) \cdot \text{SmoothedLoss}_{t-1} \quad (\alpha_{\text{Loss}} = 0.4)$$

RTT and jitter use the same smoothing helper with weight `0.3`; packet loss uses `0.4`.

### Dynamic Quality Tiers

| Tier  | Profile Name       | Bitrate  | Max Target RTT | Max Loss Rate | Max Jitter  |
| :---: | :----------------- | :------: | :------------: | :-----------: | :---------: |
| **5** | Studio Master      | 256 kbps |    < 25 ms     |    < 0.2%     |   < 4 ms    |
| **4** | Studio High        | 224 kbps |    < 50 ms     |    < 0.8%     |   < 8 ms    |
| **3** | Balanced Standard  | 160 kbps |    < 85 ms     |    < 1.8%     |   < 15 ms   |
| **2** | Anti-Lag Resilient | 128 kbps |    < 120 ms    |    < 4.0%     |   < 25 ms   |
| **1** | Ultra-Resilient    | 96 kbps  | Fallback        | Fallback       | Fallback    |

### Anti-Flapping Hysteresis State Machine

- **Fast-Down (Degradation)**: An RTT of at least 200 ms or an instantaneous loss of at least 10% is treated as severe and drops the tier immediately. Other downward changes require 2 consecutive samples targeting the same lower tier.
- **Smooth-Up (Recovery)**: Step-up to higher bitrates requires **5 consecutive stable cycles** (5 seconds) to ensure the Wi-Fi link has genuinely recovered.
- **Initial state**: Adaptive mode starts at Tier 3 (160 kbps) and can move one tier upward after each 5-cycle recovery step.

---

## 5. Receiver Jitter Buffer & Lifecycle Watchdog

1. **Dynamic Jitter Buffer Target**: On browsers supporting `RTCRtpReceiver.jitterBufferTarget`, the listener targets **22 ms** by default, **35 ms** when smoothed jitter exceeds `8 ms` or loss exceeds `0.7%`, and **50 ms** when jitter exceeds `15 ms` or loss exceeds `2%`. Unsupported browsers leave the browser default unchanged.
2. **Tab Visibility & Standby Recovery**: `visibilitychange`, `pageshow` (bfcache), `online`, and `focus` events wake up the WebRTC track, resume suspended `AudioContext` instances, and verify WebSocket heartbeat liveliness.
3. **iOS Audio Routing**: Sets `navigator.audioSession.type = 'playback'` to prevent iOS from routing playback through the telephony earpiece.
4. **Screen Wake Lock**: Activates the Screen Wake Lock API to prevent mobile displays from sleeping while streaming.
