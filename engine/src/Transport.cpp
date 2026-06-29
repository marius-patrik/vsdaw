#include "Transport.h"

#include <algorithm>
#include <cmath>

namespace singularity {

Transport::Transport() = default;

void Transport::prepare(double sampleRate) {
    sampleRate_.store(sampleRate, std::memory_order_relaxed);
}

void Transport::play(bool fromStart) {
    if (fromStart) {
        samples_.store(0, std::memory_order_relaxed);
    }
    state_.store(TransportState::playing, std::memory_order_relaxed);
}

void Transport::stop(bool rewind) {
    state_.store(TransportState::stopped, std::memory_order_relaxed);
    if (rewind) {
        samples_.store(0, std::memory_order_relaxed);
    }
}

void Transport::pause() {
    state_.store(TransportState::paused, std::memory_order_relaxed);
}

void Transport::record(bool fromStart) {
    if (fromStart) {
        samples_.store(0, std::memory_order_relaxed);
    }
    state_.store(TransportState::recording, std::memory_order_relaxed);
}

void Transport::seekToSamples(int64_t samples) {
    samples_.store(std::max<int64_t>(0, samples), std::memory_order_relaxed);
}

void Transport::seekToTicks(int64_t ticks) {
    const double sr = sampleRate_.load(std::memory_order_relaxed);
    const double bpm = bpm_.load(std::memory_order_relaxed);
    const double samples = static_cast<double>(ticks) * 60.0 * sr / (static_cast<double>(kDefaultPPQN) * bpm);
    seekToSamples(static_cast<int64_t>(std::llround(samples)));
}

void Transport::setLoop(bool enabled, int64_t startSamples, int64_t endSamples) {
    loopEnabled_.store(enabled, std::memory_order_relaxed);
    loopStart_.store(std::max<int64_t>(0, startSamples), std::memory_order_relaxed);
    loopEnd_.store(std::max<int64_t>(startSamples, endSamples), std::memory_order_relaxed);
}

void Transport::setTempo(double bpm) {
    bpm_.store(std::clamp(bpm, 1.0, 999.0), std::memory_order_relaxed);
}

void Transport::setTimeSignature(int numerator, int denominator) {
    if (numerator > 0 && denominator > 0) {
        numerator_.store(numerator, std::memory_order_relaxed);
        denominator_.store(denominator, std::memory_order_relaxed);
    }
}

void Transport::setSongMode(bool songMode) {
    songMode_.store(songMode, std::memory_order_relaxed);
}

TransportState Transport::getState() const noexcept {
    return state_.load(std::memory_order_acquire);
}

TransportPosition Transport::getPosition() const noexcept {
    return positionFromSamples(samples_.load(std::memory_order_acquire));
}

TransportPosition Transport::positionFromSamples(int64_t samples) const noexcept {
    const double sr = sampleRate_.load(std::memory_order_relaxed);
    const double bpm = bpm_.load(std::memory_order_relaxed);
    const int num = numerator_.load(std::memory_order_relaxed);
    const int den = denominator_.load(std::memory_order_relaxed);

    TransportPosition pos;
    pos.samples = samples;

    if (sr > 0.0 && bpm > 0.0) {
        const double totalBeats = static_cast<double>(samples) * bpm / (60.0 * sr);
        const int ticksPerBeat = (kDefaultPPQN * 4) / den;
        const double ticks = totalBeats * static_cast<double>(ticksPerBeat);
        pos.ticks = static_cast<int64_t>(std::llround(ticks));
        pos.ticksInBeat = static_cast<int>(pos.ticks % static_cast<int64_t>(ticksPerBeat));

        const int totalBeatsInt = static_cast<int>(std::floor(totalBeats));
        pos.beats = totalBeatsInt % num;
        pos.bars = totalBeatsInt / num;

        const int ticksPerSixteenth = ticksPerBeat / 4;
        if (ticksPerSixteenth > 0) {
            pos.sixteenths = (pos.ticksInBeat / ticksPerSixteenth) % 4;
        }
    }

    return pos;
}

void Transport::advance(int numSamples) noexcept {
    const auto state = state_.load(std::memory_order_relaxed);
    if (state != TransportState::playing && state != TransportState::recording) {
        return;
    }

    const auto next = samples_.load(std::memory_order_relaxed) + static_cast<int64_t>(numSamples);
    samples_.store(next, std::memory_order_relaxed);

    if (loopEnabled_.load(std::memory_order_relaxed)) {
        const auto end = loopEnd_.load(std::memory_order_relaxed);
        const auto start = loopStart_.load(std::memory_order_relaxed);
        if (end > start && next >= end) {
            const auto wrapped = start + ((next - start) % (end - start));
            samples_.store(wrapped, std::memory_order_relaxed);
        }
    }
}

} // namespace singularity
