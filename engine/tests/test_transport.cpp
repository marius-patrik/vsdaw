#include "Transport.h"

#include <catch2/catch_test_macros.hpp>

using namespace singularity;

TEST_CASE("Transport starts stopped", "[transport]") {
    Transport transport;
    REQUIRE(transport.getState() == TransportState::stopped);
    REQUIRE(transport.getPosition().samples == 0);
}

TEST_CASE("Transport play advances position", "[transport]") {
    Transport transport;
    transport.prepare(48000.0);
    transport.play(false);
    transport.advance(480);
    REQUIRE(transport.getState() == TransportState::playing);
    REQUIRE(transport.getPosition().samples == 480);
}

TEST_CASE("Transport stop with rewind resets position", "[transport]") {
    Transport transport;
    transport.prepare(48000.0);
    transport.play(false);
    transport.advance(48000);
    transport.stop(true);
    REQUIRE(transport.getState() == TransportState::stopped);
    REQUIRE(transport.getPosition().samples == 0);
}

TEST_CASE("Transport stop without rewind preserves position", "[transport]") {
    Transport transport;
    transport.prepare(48000.0);
    transport.play(false);
    transport.advance(48000);
    transport.stop(false);
    REQUIRE(transport.getState() == TransportState::stopped);
    REQUIRE(transport.getPosition().samples == 48000);
}

TEST_CASE("Transport pause preserves position", "[transport]") {
    Transport transport;
    transport.prepare(48000.0);
    transport.play(false);
    transport.advance(24000);
    transport.pause();
    transport.advance(24000);
    REQUIRE(transport.getState() == TransportState::paused);
    REQUIRE(transport.getPosition().samples == 24000);
}

TEST_CASE("Transport seek to sample", "[transport]") {
    Transport transport;
    transport.prepare(48000.0);
    transport.seekToSamples(12345);
    REQUIRE(transport.getPosition().samples == 12345);
}

TEST_CASE("Transport loop wraps position", "[transport]") {
    Transport transport;
    transport.prepare(48000.0);
    transport.setLoop(true, 0, 4800);
    transport.play(false);
    transport.advance(6000);
    REQUIRE(transport.getPosition().samples == 1200);
}

TEST_CASE("Transport tempo changes tick-to-sample rate", "[transport]") {
    Transport transport;
    transport.prepare(48000.0);
    transport.setTempo(120.0);
    transport.seekToTicks(kDefaultPPQN);
    const auto pos120 = transport.getPosition();

    transport.setTempo(240.0);
    transport.seekToTicks(kDefaultPPQN);
    const auto pos240 = transport.getPosition();

    REQUIRE(pos240.samples * 2 == pos120.samples);
}
