#include "MeteringBus.h"

#include <catch2/catch_test_macros.hpp>

#include <cmath>
#include <vector>

using namespace singularity;

namespace {

std::vector<float> makeSineWave(double sampleRate, double frequency, double durationSeconds, float amplitude) {
    const int numSamples = static_cast<int>(sampleRate * durationSeconds);
    std::vector<float> samples(static_cast<size_t>(numSamples));
    for (int i = 0; i < numSamples; ++i) {
        samples[static_cast<size_t>(i)] = amplitude * std::sin(2.0 * M_PI * frequency * static_cast<double>(i) / sampleRate);
    }
    return samples;
}

} // namespace

TEST_CASE("MeteringBus registers inserts and returns silence by default", "[metering]") {
    MeteringBus bus;
    bus.registerInsert("master");
    auto meters = bus.snapshot();
    REQUIRE(meters.size() == 1);
    REQUIRE(meters[0].insertId == "master");
    REQUIRE(meters[0].peakDb < -90.0f);
    REQUIRE(meters[0].rmsDb < -90.0f);
    REQUIRE_FALSE(meters[0].clipped);
}

TEST_CASE("MeteringBus measures sine wave peak and RMS", "[metering]") {
    constexpr double sampleRate = 48000.0;
    constexpr float amplitude = 0.5f;
    auto samples = makeSineWave(sampleRate, 440.0, 0.1, amplitude);

    MeteringBus bus(sampleRate);
    bus.registerInsert("master");
    bus.pushSamples("master", samples.data(), static_cast<int>(samples.size()));

    auto meters = bus.snapshot();
    REQUIRE(meters.size() == 1);
    REQUIRE(meters[0].insertId == "master");

    // Peak of a sine wave equals its amplitude.
    const float expectedPeakDb = 20.0f * std::log10(amplitude);
    REQUIRE(std::abs(meters[0].peakDb - expectedPeakDb) < 0.1f);

    // RMS of a sine wave equals amplitude / sqrt(2).
    const float expectedRmsDb = 20.0f * std::log10(amplitude / std::sqrt(2.0f));
    REQUIRE(std::abs(meters[0].rmsDb - expectedRmsDb) < 0.5f);
    REQUIRE_FALSE(meters[0].clipped);
}

TEST_CASE("MeteringBus detects clipping", "[metering]") {
    constexpr double sampleRate = 48000.0;
    MeteringBus bus(sampleRate);
    bus.registerInsert("master");

    std::vector<float> samples(static_cast<size_t>(sampleRate * 0.01), 1.1f);
    bus.pushSamples("master", samples.data(), static_cast<int>(samples.size()));

    auto meters = bus.snapshot();
    REQUIRE(meters[0].clipped);
}
