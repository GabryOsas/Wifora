#include <windows.h>
#include <avrt.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>
#include <ksmedia.h>
#include <propvarutil.h>

#include <fcntl.h>
#include <io.h>

#include <algorithm>
#include <cmath>
#include <cstdint>
#include <cstring>
#include <iostream>
#include <string>
#include <vector>

namespace {
constexpr uint32_t kOutputRate = 48000;
constexpr uint16_t kOutputChannels = 2;

#pragma pack(push, 1)
struct FrameHeader {
  char magic[4] = {'W', 'F', 'R', '1'};
  uint16_t version = 1;
  uint16_t channels = kOutputChannels;
  uint32_t sampleRate = kOutputRate;
  uint32_t samplesPerChannel = 0;
  uint32_t sequence = 0;
  uint32_t reserved = 0;
  uint64_t timestamp = 0;
};
#pragma pack(pop)
static_assert(sizeof(FrameHeader) == 32);

template <typename T> void release(T*& value) { if (value) { value->Release(); value = nullptr; } }

// stdout is a byte stream protocol, not a console.  In particular, Windows'
// default text mode expands every 0x0A byte to 0x0D 0x0A.  PCM naturally
// contains 0x0A often, so leaving stdout in text mode corrupts the frame
// payload and makes every following frame appear as noise to the receiver.
bool setBinaryStdout() {
  return _setmode(_fileno(stdout), _O_BINARY) != -1;
}

float sanitizeSample(float value) {
  if (!std::isfinite(value)) return 0.0f;
  return std::clamp(value, -1.0f, 1.0f);
}

bool isFloatFormat(const WAVEFORMATEX* format) {
  if (format->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) return true;
  if (format->wFormatTag != WAVE_FORMAT_EXTENSIBLE || format->cbSize < 22) return false;
  const auto* extensible = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(format);
  return extensible->SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;
}

float sampleAt(const BYTE* source, uint32_t frame, uint16_t channel, const WAVEFORMATEX* format) {
  const uint16_t selected = std::min<uint16_t>(channel, format->nChannels - 1);
  const uint16_t bytesPerSample = format->nBlockAlign / format->nChannels;
  const BYTE* input = source + frame * format->nBlockAlign + selected * bytesPerSample;
  if (isFloatFormat(format) && format->wBitsPerSample == 32) {
    float value; std::memcpy(&value, input, sizeof(value)); return sanitizeSample(value);
  }
  if (format->wBitsPerSample == 16) {
    int16_t value; std::memcpy(&value, input, sizeof(value)); return sanitizeSample(static_cast<float>(value) / 32768.0f);
  }
  if (format->wBitsPerSample == 24) {
    int32_t value = static_cast<int32_t>(input[0]) | (static_cast<int32_t>(input[1]) << 8) | (static_cast<int32_t>(input[2]) << 16);
    if (value & 0x00800000) value |= ~0x00ffffff;
    return sanitizeSample(static_cast<float>(value) / 8388608.0f);
  }
  if (format->wBitsPerSample == 32) {
    int32_t value; std::memcpy(&value, input, sizeof(value)); return sanitizeSample(static_cast<float>(value) / 2147483648.0f);
  }
  if (format->wBitsPerSample == 8) return sanitizeSample((static_cast<float>(*input) - 128.0f) / 128.0f);
  return 0.0f;
}

struct ResamplerState {
  uint32_t inputRate = 0;
  double sourcePosition = 0.0;
};

void writeFrame(const BYTE* source, uint32_t sourceFrames, const WAVEFORMATEX* inputFormat, uint32_t& sequence, uint64_t& timestamp, ResamplerState& resampler) {
  if (sourceFrames == 0) return;
  if (inputFormat->nChannels == 0 || inputFormat->nBlockAlign == 0 || inputFormat->wBitsPerSample == 0) return;
  const double sourcePerOutput = static_cast<double>(inputFormat->nSamplesPerSec) / kOutputRate;
  if (resampler.inputRate != inputFormat->nSamplesPerSec) {
    resampler = {inputFormat->nSamplesPerSec, 0.0};
  }
  std::vector<float> output;
  output.reserve(static_cast<size_t>(sourceFrames / sourcePerOutput + 2) * kOutputChannels);
  while (resampler.sourcePosition < sourceFrames) {
    const uint32_t lower = std::min(sourceFrames - 1, static_cast<uint32_t>(resampler.sourcePosition));
    const uint32_t upper = std::min(sourceFrames - 1, lower + 1);
    const float fraction = static_cast<float>(resampler.sourcePosition - lower);
    for (uint16_t channel = 0; channel < kOutputChannels; ++channel) {
      const float before = sampleAt(source, lower, channel, inputFormat);
      const float after = sampleAt(source, upper, channel, inputFormat);
      output.push_back(before + (after - before) * fraction);
    }
    resampler.sourcePosition += sourcePerOutput;
  }
  resampler.sourcePosition -= sourceFrames;
  const uint32_t outputFrames = static_cast<uint32_t>(output.size() / kOutputChannels);
  if (outputFrames == 0) return;
  FrameHeader header;
  header.samplesPerChannel = outputFrames;
  header.sequence = sequence++;
  header.timestamp = timestamp;
  timestamp += outputFrames;
  std::cout.write(reinterpret_cast<const char*>(&header), sizeof(header));
  std::cout.write(reinterpret_cast<const char*>(output.data()), static_cast<std::streamsize>(output.size() * sizeof(float)));
  std::cout.flush();
}

HRESULT getDevice(IMMDeviceEnumerator* enumerator, const wchar_t* deviceId, IMMDevice** device) {
  return deviceId ? enumerator->GetDevice(deviceId, device)
                  : enumerator->GetDefaultAudioEndpoint(eRender, eConsole, device);
}

int listDevices() {
  IMMDeviceEnumerator* enumerator = nullptr; IMMDeviceCollection* devices = nullptr;
  HRESULT result = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), reinterpret_cast<void**>(&enumerator));
  if (FAILED(result)) return 1;
  result = enumerator->EnumAudioEndpoints(eRender, DEVICE_STATE_ACTIVE, &devices);
  if (FAILED(result)) { release(enumerator); return 1; }
  UINT count = 0; devices->GetCount(&count);
  for (UINT index = 0; index < count; ++index) {
    IMMDevice* device = nullptr; IPropertyStore* properties = nullptr; LPWSTR id = nullptr; PROPVARIANT name; PropVariantInit(&name);
    if (SUCCEEDED(devices->Item(index, &device)) && SUCCEEDED(device->GetId(&id)) && SUCCEEDED(device->OpenPropertyStore(STGM_READ, &properties))) {
      properties->GetValue(PKEY_Device_FriendlyName, &name);
      std::wcout << id << L"\t" << (name.pwszVal ? name.pwszVal : L"Unknown device") << L"\n";
    }
    PropVariantClear(&name); if (id) CoTaskMemFree(id); release(properties); release(device);
  }
  release(devices); release(enumerator); return 0;
}

int capture(const wchar_t* deviceId) {
  IMMDeviceEnumerator* enumerator = nullptr; IMMDevice* device = nullptr; IAudioClient* client = nullptr; IAudioCaptureClient* captureClient = nullptr; WAVEFORMATEX* format = nullptr;
  HANDLE eventHandle = nullptr;
  DWORD mmcssTaskIndex = 0;
  HANDLE mmcssHandle = nullptr;
  uint32_t sequence = 0; uint64_t timestamp = 0;
  ResamplerState resampler;
  HRESULT result = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), reinterpret_cast<void**>(&enumerator));
  if (FAILED(result) || FAILED(getDevice(enumerator, deviceId, &device)) || FAILED(device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(&client))) || FAILED(client->GetMixFormat(&format))) goto failure;
  eventHandle = CreateEvent(nullptr, FALSE, FALSE, nullptr);
  if (!eventHandle || format->nChannels == 0 || format->nBlockAlign == 0 || FAILED(client->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK, 0, 0, format, nullptr)) || FAILED(client->SetEventHandle(eventHandle)) || FAILED(client->GetService(__uuidof(IAudioCaptureClient), reinterpret_cast<void**>(&captureClient))) || FAILED(client->Start())) { if (eventHandle) { CloseHandle(eventHandle); eventHandle = nullptr; } goto failure; }
  // Give the capture loop a multimedia scheduling class when Windows permits
  // it. Failure is harmless, but success reduces packet starvation under CPU
  // pressure without changing the endpoint's shared-mode format.
  mmcssHandle = AvSetMmThreadCharacteristicsW(L"Pro Audio", &mmcssTaskIndex);
  for (;;) {
    if (WaitForSingleObject(eventHandle, 2000) != WAIT_OBJECT_0) continue;
    UINT32 packets = 0; if (FAILED(captureClient->GetNextPacketSize(&packets))) break;
    while (packets) {
      BYTE* data = nullptr; UINT32 frames = 0; DWORD flags = 0;
      if (FAILED(captureClient->GetBuffer(&data, &frames, &flags, nullptr, nullptr))) break;
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) { std::vector<BYTE> silence(static_cast<size_t>(frames) * format->nBlockAlign); writeFrame(silence.data(), frames, format, sequence, timestamp, resampler); }
      else writeFrame(data, frames, format, sequence, timestamp, resampler);
      captureClient->ReleaseBuffer(frames);
      if (FAILED(captureClient->GetNextPacketSize(&packets))) { packets = 0; }
    }
  }
  client->Stop(); if (mmcssHandle) AvRevertMmThreadCharacteristics(mmcssHandle); CloseHandle(eventHandle); CoTaskMemFree(format); release(captureClient); release(client); release(device); release(enumerator); return 0;
failure:
  if (mmcssHandle) AvRevertMmThreadCharacteristics(mmcssHandle);
  if (eventHandle) CloseHandle(eventHandle);
  if (format) CoTaskMemFree(format); release(captureClient); release(client); release(device); release(enumerator); std::cerr << "Unable to start WASAPI loopback capture\n"; return 1;
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (FAILED(CoInitializeEx(nullptr, COINIT_MULTITHREADED))) return 1;
  int result = 0;
  if (argc == 2 && std::wstring(argv[1]) == L"--list-devices") result = listDevices();
  else if (argc >= 2 && std::wstring(argv[1]) == L"--stdout") {
    if (!setBinaryStdout()) {
      std::cerr << "Unable to configure binary stdout\n";
      result = 1;
    } else {
      result = capture(argc >= 4 && std::wstring(argv[2]) == L"--device" ? argv[3] : nullptr);
    }
  }
  else { std::cerr << "Usage: wifora-audio --list-devices | --stdout [--device DEVICE_ID]\n"; result = 2; }
  CoUninitialize(); return result;
}
