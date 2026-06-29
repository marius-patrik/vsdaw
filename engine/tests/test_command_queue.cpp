#include "CommandQueue.h"

#include <catch2/catch_test_macros.hpp>

#include <atomic>
#include <thread>
#include <vector>

using namespace singularity;

TEST_CASE("CommandQueue push and pop single item", "[commandqueue]") {
    CommandQueue queue;
    nlohmann::json cmd = {{"type", "transport.play"}, {"payload", nlohmann::json::object()}};
    REQUIRE(queue.push(cmd));
    REQUIRE(queue.available() == 1);

    nlohmann::json out;
    REQUIRE(queue.pop(out));
    REQUIRE(out["type"] == "transport.play");
    REQUIRE(queue.available() == 0);
}

TEST_CASE("CommandQueue returns false when empty", "[commandqueue]") {
    CommandQueue queue;
    nlohmann::json out;
    REQUIRE_FALSE(queue.pop(out));
}

TEST_CASE("CommandQueue producer-consumer stress", "[commandqueue]") {
    CommandQueue queue;
    constexpr int kTotal = 10000;
    std::atomic<int> consumed{0};

    std::thread producer([&]() {
        for (int i = 0; i < kTotal; ++i) {
            nlohmann::json cmd = {{"id", i}, {"type", "transport.seek"}, {"payload", {{"samples", i}}}};
            while (!queue.push(cmd)) {
                std::this_thread::yield();
            }
        }
    });

    std::thread consumer([&]() {
        int count = 0;
        while (count < kTotal) {
            nlohmann::json out;
            if (queue.pop(out)) {
                REQUIRE(out["id"] == count);
                ++count;
            } else {
                std::this_thread::yield();
            }
        }
        consumed.store(count);
    });

    producer.join();
    consumer.join();
    REQUIRE(consumed.load() == kTotal);
    REQUIRE(queue.isEmpty());
}
