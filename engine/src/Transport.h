#pragma once

#include "Types.h"

#include <atomic>
#include <cstdint>

namespace singularity {

class Transport {
public:
    Transport();

    void prepare(double sampleRate);

    void play(bool fromStart);
    void stop(bool rewind);
    void pause();
    void record(bool fromStart);
    void seekToSamples(int64_t samples);
    void seekToTicks(int64_t ticks);
    void setLoop(bool enabled, int64_t startSamples, int64_t endSamples);
    void setTempo(double bpm);
    void setTimeSignature(int numerator, int denominator);
    void setSongMode(bool songMode);

    TransportState getState() const noexcept;
    TransportPosition getPosition() const noexcept;
    TransportPosition positionFromSamples(int64_t samples) const noexcept;

    void advance(int numSamples) noexcept;

    double getSampleRate() const noexcept { return sampleRate_.load(std::memory_order_relaxed); }
    double getTempo() const noexcept { return bpm_.load(std::memory_order_relaxed); }
    TimeSignature getTimeSignature() const noexcept {
        return {numerator_.load(std::memory_order_relaxed), denominator_.load(std::memory_order_relaxed)};
    }
    bool getSongMode() const noexcept { return songMode_.load(std::memory_order_relaxed); }
    bool getLoopEnabled() const noexcept { return loopEnabled_.load(std::memory_order_relaxed); }
    int64_t getLoopStart() const noexcept { return loopStart_.load(std::memory_order_relaxed); }
    int64_t getLoopEnd() const noexcept { return loopEnd_.load(std::memory_order_relaxed); }

private:
    std::atomic<double> sampleRate_{48000.0};
    std::atomic<double> bpm_{kDefaultBPM};
    std::atomic<int> numerator_{4};
    std::atomic<int> denominator_{4};
    std::atomic<bool> songMode_{false};

    std::atomic<TransportState> state_{TransportState::stopped};
    std::atomic<int64_t> samples_{0};

    std::atomic<bool> loopEnabled_{false};
    std::atomic<int64_t> loopStart_{0};
    std::atomic<int64_t> loopEnd_{0};
};

} // namespace singularity
