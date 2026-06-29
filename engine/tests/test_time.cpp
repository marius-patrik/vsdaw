#include "Transport.h"

#include <catch2/catch_test_macros.hpp>

#include <cmath>

using namespace singularity;

TEST_CASE("Tick-to-sample conversion at default 120 BPM 48 kHz", "[time]") {
    Transport transport;
    transport.prepare(48000.0);

    // One beat = 960 ticks. One bar (4 beats) = 3840 ticks.
    transport.seekToTicks(3840);
    const auto pos = transport.getPosition();

    const double expectedSamples = 3840.0 * 60.0 * 48000.0 / (kDefaultPPQN * 120.0);
    REQUIRE(pos.samples == static_cast<int64_t>(std::llround(expectedSamples)));
    REQUIRE(pos.bars == 1);
    REQUIRE(pos.beats == 0);
}

TEST_CASE("Sample-to-tick conversion rounds trip", "[time]") {
    Transport transport;
    transport.prepare(44100.0);
    transport.setTempo(140.0);

    transport.seekToTicks(960);
    const auto pos = transport.getPosition();
    REQUIRE(pos.ticks == 960);

    const double expectedSamples = 960.0 * 60.0 * 44100.0 / (kDefaultPPQN * 140.0);
    REQUIRE(pos.samples == static_cast<int64_t>(std::llround(expectedSamples)));
}

TEST_CASE("Bars and sixteenths are derived correctly", "[time]") {
    Transport transport;
    transport.prepare(48000.0);
    transport.setTimeSignature(3, 4);
    transport.setTempo(120.0);

    // Two bars, beat 1, tick 240 (one sixteenth) at 960 PPQN -> ticksInBeat=240, sixteenths=1
    transport.seekToTicks(2 * 3 * kDefaultPPQN + kDefaultPPQN / 4);
    const auto pos = transport.getPosition();
    REQUIRE(pos.bars == 2);
    REQUIRE(pos.beats == 0);
    REQUIRE(pos.sixteenths == 1);
    REQUIRE(pos.ticksInBeat == 240);
}
