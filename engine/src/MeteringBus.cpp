#include "MeteringBus.h"

#include <algorithm>
#include <cmath>
#include <mutex>
#include <thread>

namespace singularity {

namespace {
constexpr double kWindowDurationSeconds = 0.05;
constexpr float kMinAmplitude = 1.0e-9f;
constexpr float kMinDb = -96.0f;
} // namespace

MeteringBus::MeteringBus(double sampleRate) {
    prepare(sampleRate);
}

MeteringBus::~MeteringBus() {
    stopBroadcast();
}

void MeteringBus::prepare(double sampleRate) {
    sampleRate_.store(sampleRate, std::memory_order_relaxed);
    const int size = static_cast<int>(std::llround(sampleRate * kWindowDurationSeconds));
    windowSize_.store(std::max(1, size), std::memory_order_relaxed);

    std::lock_guard<std::mutex> lock(insertsMutex_);
    for (auto& [id, state] : inserts_) {
        state->squaredWindow.assign(static_cast<size_t>(windowSize_.load()), 0.0f);
        state->writePos = 0;
        state->filled = 0;
        state->windowSum = 0.0f;
        state->peak.store(0.0f, std::memory_order_relaxed);
        state->rms.store(0.0f, std::memory_order_relaxed);
        state->clipped.store(false, std::memory_order_relaxed);
    }
}

void MeteringBus::reset() {
    std::lock_guard<std::mutex> lock(insertsMutex_);
    inserts_.clear();
}

void MeteringBus::registerInsert(const std::string& insertId) {
    std::lock_guard<std::mutex> lock(insertsMutex_);
    if (inserts_.find(insertId) != inserts_.end()) {
        return;
    }
    auto state = std::make_unique<InsertState>();
    state->id = insertId;
    state->squaredWindow.assign(static_cast<size_t>(windowSize_.load()), 0.0f);
    inserts_.emplace(insertId, std::move(state));
}

void MeteringBus::unregisterInsert(const std::string& insertId) {
    std::lock_guard<std::mutex> lock(insertsMutex_);
    inserts_.erase(insertId);
}

void MeteringBus::pushSamples(const std::string& insertId, const float* data, int numSamples) {
    InsertState* state = nullptr;
    {
        std::lock_guard<std::mutex> lock(insertsMutex_);
        auto it = inserts_.find(insertId);
        if (it == inserts_.end()) {
            return;
        }
        state = it->second.get();
    }

    const size_t windowSize = state->squaredWindow.size();
    if (windowSize == 0 || data == nullptr || numSamples <= 0) {
        return;
    }

    float localPeak = 0.0f;
    bool localClipped = false;
    float localSum = state->windowSum;
    size_t localFilled = state->filled;
    size_t localPos = state->writePos;

    for (int i = 0; i < numSamples; ++i) {
        const float s = data[i];
        const float absS = std::abs(s);
        if (absS > localPeak) {
            localPeak = absS;
        }
        if (absS > 1.0f) {
            localClipped = true;
        }

        const float sq = s * s;
        if (localFilled == windowSize) {
            localSum -= state->squaredWindow[localPos];
        } else {
            ++localFilled;
        }
        localSum += sq;
        state->squaredWindow[localPos] = sq;
        localPos = (localPos + 1) % windowSize;
    }

    state->windowSum = localSum;
    state->filled = localFilled;
    state->writePos = localPos;

    float expectedPeak = state->peak.load(std::memory_order_relaxed);
    while (localPeak > expectedPeak &&
           !state->peak.compare_exchange_weak(expectedPeak, localPeak, std::memory_order_relaxed)) {
    }

    const float meanSquare = (localFilled > 0) ? localSum / static_cast<float>(localFilled) : 0.0f;
    state->rms.store(std::sqrt(meanSquare), std::memory_order_relaxed);

    if (localClipped) {
        state->clipped.store(true, std::memory_order_relaxed);
    }
}

void MeteringBus::startBroadcast(BroadcastCallback callback) {
    stopBroadcast();
    callback_ = std::move(callback);
    stopRequested_.store(false, std::memory_order_relaxed);
    broadcasting_.store(true, std::memory_order_release);
    broadcastThread_ = std::thread(&MeteringBus::runBroadcastThread, this);
}

void MeteringBus::stopBroadcast() {
    broadcasting_.store(false, std::memory_order_release);
    stopRequested_.store(true, std::memory_order_release);
    if (broadcastThread_.joinable()) {
        broadcastThread_.join();
    }
    callback_ = nullptr;
}

std::vector<MeterSample> MeteringBus::snapshot() {
    std::lock_guard<std::mutex> lock(insertsMutex_);
    std::vector<MeterSample> result;
    result.reserve(inserts_.size());
    for (const auto& [id, state] : inserts_) {
        MeterSample sample;
        sample.insertId = state->id;
        sample.peakDb = amplitudeToDb(state->peak.exchange(0.0f, std::memory_order_relaxed));
        sample.rmsDb = amplitudeToDb(state->rms.load(std::memory_order_relaxed));
        sample.clipped = state->clipped.exchange(false, std::memory_order_relaxed);
        result.push_back(sample);
    }
    return result;
}

void MeteringBus::runBroadcastThread() {
    using namespace std::chrono_literals;
    const auto interval = std::chrono::milliseconds(1000 / kMeterBroadcastRateHz);

    while (!stopRequested_.load(std::memory_order_acquire)) {
        const auto next = std::chrono::steady_clock::now() + interval;
        if (callback_) {
            auto meters = snapshot();
            if (!meters.empty()) {
                callback_(meters);
            }
        }
        std::this_thread::sleep_until(next);
    }
}

float MeteringBus::amplitudeToDb(float amplitude) noexcept {
    if (amplitude <= kMinAmplitude) {
        return kMinDb;
    }
    return 20.0f * std::log10(amplitude);
}

} // namespace singularity
