#pragma once

#include "Types.h"

#include <juce_core/juce_core.h>

#include <nlohmann/json.hpp>

#include <atomic>
#include <deque>
#include <mutex>

namespace singularity {

class Engine;

class CommandServer : public juce::Thread {
public:
    explicit CommandServer(Engine& engine, uint16_t port);
    ~CommandServer() override;

    void run() override;

    void broadcast(const nlohmann::json& event);
    uint16_t getBoundPort() const noexcept { return boundPort_.load(std::memory_order_acquire); }

    void signalStop();

private:
    Engine& engine_;
    const uint16_t requestedPort_;
    std::atomic<uint16_t> boundPort_{0};
    std::atomic<bool> stopRequested_{false};

    std::mutex outgoingMutex_;
    std::deque<nlohmann::json> outgoing_;

    bool readFrame(juce::StreamingSocket* socket, nlohmann::json& frame);
    bool writeFrame(juce::StreamingSocket* socket, const nlohmann::json& frame);
    void flushOutgoing(juce::StreamingSocket* socket);
    void handleCommand(const nlohmann::json& cmd, juce::StreamingSocket* socket);
};

} // namespace singularity
