#pragma once

#include <cstdint>
#include <string>
#include <vector>

namespace singularity {

constexpr int kDefaultPPQN = 960;
constexpr int kMeterBroadcastRateHz = 30;
constexpr double kDefaultBPM = 120.0;
constexpr int kMaxCommandQueueSize = 4096;
constexpr uint32_t kMaxFrameBytes = 16 * 1024 * 1024;

struct TimeSignature {
    int numerator = 4;
    int denominator = 4;
};

struct TransportPosition {
    int64_t samples = 0;
    int64_t ticks = 0;
    int bars = 0;
    int beats = 0;
    int sixteenths = 0;
    int ticksInBeat = 0;
};

struct MeterSample {
    std::string insertId;
    float peakDb = -96.0f;
    float rmsDb = -96.0f;
    bool clipped = false;
};

struct AudioDeviceInfo {
    std::string id;
    std::string name;
    std::string type; // "input", "output", or "duplex"
    std::vector<int> sampleRates;
    std::vector<int> bufferSizes;
    int defaultSampleRate = 0;
    int inputChannels = 0;
    int outputChannels = 0;
};

struct AudioDeviceConfig {
    std::string deviceId;
    double sampleRate = 48000.0;
    int bufferSize = 512;
};

enum class TransportState { stopped, playing, recording, paused };

inline const char* transportStateToString(TransportState state) noexcept {
    switch (state) {
        case TransportState::stopped: return "stopped";
        case TransportState::playing: return "playing";
        case TransportState::recording: return "recording";
        case TransportState::paused: return "paused";
    }
    return "stopped";
}

} // namespace singularity
