#pragma once

#include "Types.h"

#include <atomic>
#include <functional>
#include <memory>
#include <mutex>
#include <string>
#include <thread>
#include <unordered_map>
#include <vector>

namespace singularity {

class MeteringBus {
public:
    using BroadcastCallback = std::function<void(const std::vector<MeterSample>&)>;

    explicit MeteringBus(double sampleRate = 48000.0);
    ~MeteringBus();

    void prepare(double sampleRate);
    void reset();

    void registerInsert(const std::string& insertId);
    void unregisterInsert(const std::string& insertId);

    void pushSamples(const std::string& insertId, const float* data, int numSamples);

    void startBroadcast(BroadcastCallback callback);
    void stopBroadcast();

    std::vector<MeterSample> snapshot();

private:
    struct InsertState {
        std::string id;
        std::vector<float> squaredWindow;
        size_t writePos = 0;
        size_t filled = 0;
        float windowSum = 0.0f;

        std::atomic<float> peak{0.0f};
        std::atomic<float> rms{0.0f};
        std::atomic<bool> clipped{false};
    };

    void runBroadcastThread();
    static float amplitudeToDb(float amplitude) noexcept;

    std::atomic<double> sampleRate_{48000.0};
    std::atomic<int> windowSize_{2400}; // 50 ms at 48 kHz

    std::unordered_map<std::string, std::unique_ptr<InsertState>> inserts_;
    std::mutex insertsMutex_;

    std::atomic<bool> broadcasting_{false};
    std::atomic<bool> stopRequested_{false};
    BroadcastCallback callback_;
    std::thread broadcastThread_;
};

} // namespace singularity
