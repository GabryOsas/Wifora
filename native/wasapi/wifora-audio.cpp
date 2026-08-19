#include <windows.h>
#include <mmdeviceapi.h>
#include <audioclient.h>
#include <functiondiscoverykeys_devpkey.h>
#include <propvarutil.h>

#include <algorithm>
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

bool isFloatFormat(const WAVEFORMATEX* format) {
  if (format->wFormatTag == WAVE_FORMAT_IEEE_FLOAT) return true;
  if (format->wFormatTag != WAVE_FORMAT_EXTENSIBLE || format->cbSize < 22) return false;
  const auto* extensible = reinterpret_cast<const WAVEFORMATEXTENSIBLE*>(format);
  return extensible->SubFormat == KSDATAFORMAT_SUBTYPE_IEEE_FLOAT;
}

float sampleAt(const BYTE* source, uint32_t frame, uint16_t channel, const WAVEFORMATEX* format) {
  const uint16_t selected = std::min<uint16_t>(channel, format->nChannels - 1);
  const BYTE* input = source + frame * format->nBlockAlign + selected * (format->wBitsPerSample / 8);
  if (isFloatFormat(format) && format->wBitsPerSample == 32) {
    float value; std::memcpy(&value, input, sizeof(value)); return value;
  }
  if (format->wBitsPerSample == 16) {
    int16_t value; std::memcpy(&value, input, sizeof(value)); return static_cast<float>(value) / 32768.0f;
  }
  if (format->wBitsPerSample == 32) {
    int32_t value; std::memcpy(&value, input, sizeof(value)); return static_cast<float>(value) / 2147483648.0f;
  }
  return 0.0f;
}

void writeFrame(const BYTE* source, uint32_t sourceFrames, const WAVEFORMATEX* inputFormat, uint32_t& sequence, uint64_t& timestamp) {
  if (sourceFrames == 0) return;
  const double sourcePerOutput = static_cast<double>(inputFormat->nSamplesPerSec) / kOutputRate;
  const uint32_t outputFrames = std::max(1u, static_cast<uint32_t>(sourceFrames / sourcePerOutput));
  std::vector<float> output(static_cast<size_t>(outputFrames) * kOutputChannels);
  for (uint32_t destination = 0; destination < outputFrames; ++destination) {
    const uint32_t sourceFrame = std::min(sourceFrames - 1, static_cast<uint32_t>(destination * sourcePerOutput));
    output[destination * 2] = sampleAt(source, sourceFrame, 0, inputFormat);
    output[destination * 2 + 1] = sampleAt(source, sourceFrame, inputFormat->nChannels > 1 ? 1 : 0, inputFormat);
  }
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
  uint32_t sequence = 0; uint64_t timestamp = 0;
  HRESULT result = CoCreateInstance(__uuidof(MMDeviceEnumerator), nullptr, CLSCTX_ALL, __uuidof(IMMDeviceEnumerator), reinterpret_cast<void**>(&enumerator));
  if (FAILED(result) || FAILED(getDevice(enumerator, deviceId, &device)) || FAILED(device->Activate(__uuidof(IAudioClient), CLSCTX_ALL, nullptr, reinterpret_cast<void**>(&client))) || FAILED(client->GetMixFormat(&format))) goto failure;
  eventHandle = CreateEvent(nullptr, FALSE, FALSE, nullptr);
  if (!eventHandle || FAILED(client->Initialize(AUDCLNT_SHAREMODE_SHARED, AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK, 0, 0, format, nullptr)) || FAILED(client->SetEventHandle(eventHandle)) || FAILED(client->GetService(__uuidof(IAudioCaptureClient), reinterpret_cast<void**>(&captureClient))) || FAILED(client->Start())) { if (eventHandle) { CloseHandle(eventHandle); eventHandle = nullptr; } goto failure; }
  for (;;) {
    if (WaitForSingleObject(eventHandle, 2000) != WAIT_OBJECT_0) continue;
    UINT32 packets = 0; if (FAILED(captureClient->GetNextPacketSize(&packets))) break;
    while (packets) {
      BYTE* data = nullptr; UINT32 frames = 0, flags = 0;
      if (FAILED(captureClient->GetBuffer(&data, &frames, &flags, nullptr, nullptr))) break;
      if (flags & AUDCLNT_BUFFERFLAGS_SILENT) { std::vector<BYTE> silence(static_cast<size_t>(frames) * format->nBlockAlign); writeFrame(silence.data(), frames, format, sequence, timestamp); }
      else writeFrame(data, frames, format, sequence, timestamp);
      captureClient->ReleaseBuffer(frames);
      if (FAILED(captureClient->GetNextPacketSize(&packets))) { packets = 0; }
    }
  }
  client->Stop(); CloseHandle(eventHandle); CoTaskMemFree(format); release(captureClient); release(client); release(device); release(enumerator); return 0;
failure:
  if (eventHandle) CloseHandle(eventHandle);
  if (format) CoTaskMemFree(format); release(captureClient); release(client); release(device); release(enumerator); std::cerr << "Unable to start WASAPI loopback capture\n"; return 1;
}
}  // namespace

int wmain(int argc, wchar_t** argv) {
  if (FAILED(CoInitializeEx(nullptr, COINIT_MULTITHREADED))) return 1;
  int result = 0;
  if (argc == 2 && std::wstring(argv[1]) == L"--list-devices") result = listDevices();
  else if (argc >= 2 && std::wstring(argv[1]) == L"--stdout") result = capture(argc >= 4 && std::wstring(argv[2]) == L"--device" ? argv[3] : nullptr);
  else { std::cerr << "Usage: wifora-audio --list-devices | --stdout [--device DEVICE_ID]\n"; result = 2; }
  CoUninitialize(); return result;
}
