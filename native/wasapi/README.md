# Wifora WASAPI helper

This optional Windows executable captures an output endpoint with shared-mode WASAPI loopback and writes 48 kHz stereo Float32 PCM to stdout. It has no network access. Its stdout is explicitly opened in binary mode: this is essential on Windows, where text-mode newline conversion would otherwise corrupt PCM and produce noise.

## Build

Open a Developer PowerShell for Visual Studio and run:

```powershell
cmake -S native/wasapi -B native/wasapi/build
cmake --build native/wasapi/build --config Release
```

Set `WIFORA_WASAPI_HELPER` to the resulting `wifora-audio.exe` for an integration that uses `selectCaptureSource()`. A normal CMake Release build is also discovered automatically at `native/wasapi/build/Release/wifora-audio.exe`; if neither executable is present, the selector returns the supplied browser-capture source unchanged.

The source queue is bounded (8 frames by default) and drops the oldest frame under back-pressure, prioritizing current audio over a growing latency backlog. The browser-side worklet keeps a two-packet (~20 ms) startup buffer and caps its backlog at roughly 60 ms.

## IPC frame layout

Each stdout frame is a 32-byte little-endian header followed by interleaved Float32 PCM samples:

| Offset | Field                           |
| ------ | ------------------------------- |
| 0      | `WFR1` magic                    |
| 4      | protocol version (UInt16, `1`)  |
| 6      | channels (UInt16, normally `2`) |
| 8      | sample rate (UInt32, `48000`)   |
| 12     | samples per channel (UInt32)    |
| 16     | sequence (UInt32)               |
| 24     | sample timestamp (UInt64)       |

Use `--list-devices` to enumerate output endpoint IDs, or `--stdout [--device ID]` to capture the default/selected endpoint.
