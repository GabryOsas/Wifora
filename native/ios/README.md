# Wifora Native iOS Receiver Kit (`WiforaReceiverKit`)

The `WiforaReceiverKit` Swift package provides a native iOS receiver client for the Wifora real-time audio platform.

---

## Features

- **`WiforaAudioSession`**: Native `AVAudioSession` setup with `.playback` category, low-latency 10 ms buffer preference, background audio support, interruption handling, and AirPods/headphone route monitoring.
- **`WiforaSignalingClient`**: WebSocket client adhering to **Wifora Control Protocol v1** (`{ type, version, sessionId, deviceId, timestamp, payload }`), candidate buffering, and automatic reconnection.
- **`WiforaClockSync`**: 4-timestamp NTP-style clock synchronization engine with EWMA drift smoothing and bounded micro-rate playout corrections.

---

## iOS Capabilities & Setup

1. Add `WiforaReceiverKit` to your Xcode project via **Swift Package Manager**.
2. In your iOS App Target, enable **Background Modes**:
   - Check `Audio, AirPlay, and Picture in Picture` (`UIBackgroundModes: ["audio"]`).
3. Ensure network permissions in `Info.plist`:
   - `NSLocalNetworkUsageDescription`: `"Wifora requires local network access to stream PC system audio."`
   - `NSBonjourServices`: `["_wifora._tcp"]`

---

## Sample Swift Usage

```swift
import WiforaReceiverKit

// 1. Activate background audio session
try? WiforaAudioSession.shared.activate()

// 2. Connect signaling
let serverURL = URL(string: "ws://192.168.1.50:3975/signal")!
let client = WiforaSignalingClient(serverURL: serverURL, roomId: "ROOM1234", token: "listenerTokenHere")
client.connect()

// 3. Clock Sync probe loop
Timer.scheduledTimer(withTimeInterval: 5.0, repeats: true) { _ in
    client.sendClockProbe()
}
```
