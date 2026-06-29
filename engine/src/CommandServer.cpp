#include "CommandServer.h"

#include "Engine.h"

#include <nlohmann/json.hpp>

#include <array>
#include <string>

namespace singularity {

namespace {
    bool isRealtimeCommand(const std::string& type) {
        return type.rfind("transport.", 0) == 0 ||
               type.rfind("project.", 0) == 0 ||
               type.rfind("mixer.", 0) == 0 ||
               type.rfind("channel.", 0) == 0 ||
               type.rfind("pattern.", 0) == 0 ||
               type.rfind("playlist.", 0) == 0;
    }
}

CommandServer::CommandServer(Engine& engine, uint16_t port)
    : juce::Thread("Singularity Command Server"), engine_(engine), requestedPort_(port) {
}

CommandServer::~CommandServer() {
    signalStop();
    stopThread(2000);
}

void CommandServer::signalStop() {
    stopRequested_.store(true, std::memory_order_release);
    // Connecting to the listener unblocks waitForNextConnection so the thread
    // can observe the stop request and exit cleanly.
    const auto port = boundPort_.load(std::memory_order_acquire);
    if (port != 0) {
        auto unblock = std::make_unique<juce::StreamingSocket>();
        unblock->connect("127.0.0.1", port, 100);
    }
}

void CommandServer::broadcast(const nlohmann::json& event) {
    std::lock_guard<std::mutex> lock(outgoingMutex_);
    outgoing_.push_back(event);
}

void CommandServer::run() {
    auto listener = std::make_unique<juce::StreamingSocket>();
    if (!listener->createListener(requestedPort_, "127.0.0.1")) {
        juce::Logger::writeToLog("CommandServer: failed to bind to port " + juce::String(requestedPort_));
        return;
    }
    boundPort_.store(static_cast<uint16_t>(listener->getBoundPort()), std::memory_order_release);

    while (!stopRequested_.load(std::memory_order_acquire)) {
        auto* client = listener->waitForNextConnection();
        if (client == nullptr) {
            continue;
        }

        while (client->isConnected() && !stopRequested_.load(std::memory_order_acquire)) {
            const int ready = client->waitUntilReady(true, 10);
            if (ready > 0) {
                nlohmann::json cmd;
                if (!readFrame(client, cmd)) {
                    break;
                }
                handleCommand(cmd, client);
            } else if (ready < 0) {
                break;
            }
            flushOutgoing(client);
        }

        flushOutgoing(client);
        delete client;
    }

    boundPort_.store(0, std::memory_order_release);
}

bool CommandServer::readFrame(juce::StreamingSocket* socket, nlohmann::json& frame) {
    std::array<uint8_t, 4> header{};
    int got = socket->read(header.data(), static_cast<int>(header.size()), true);
    if (got != static_cast<int>(header.size())) {
        return false;
    }

    const uint32_t length = (static_cast<uint32_t>(header[0]) << 24) |
                            (static_cast<uint32_t>(header[1]) << 16) |
                            (static_cast<uint32_t>(header[2]) << 8) |
                            static_cast<uint32_t>(header[3]);

    if (length == 0 || length > kMaxFrameBytes) {
        return false;
    }

    std::string payload;
    payload.resize(length);
    got = socket->read(payload.data(), static_cast<int>(length), true);
    if (got != static_cast<int>(length)) {
        return false;
    }

    frame = nlohmann::json::parse(payload, nullptr, false);
    return !frame.is_discarded();
}

bool CommandServer::writeFrame(juce::StreamingSocket* socket, const nlohmann::json& frame) {
    const std::string payload = frame.dump();
    if (payload.size() > kMaxFrameBytes) {
        return false;
    }
    const uint32_t length = static_cast<uint32_t>(payload.size());
    std::array<uint8_t, 4> header{ static_cast<uint8_t>((length >> 24) & 0xFF),
                                   static_cast<uint8_t>((length >> 16) & 0xFF),
                                   static_cast<uint8_t>((length >> 8) & 0xFF),
                                   static_cast<uint8_t>(length & 0xFF) };

    const int written = socket->write(header.data(), static_cast<int>(header.size())) +
                        socket->write(payload.data(), static_cast<int>(payload.size()));
    return written == static_cast<int>(header.size() + payload.size());
}

void CommandServer::flushOutgoing(juce::StreamingSocket* socket) {
    std::deque<nlohmann::json> batch;
    {
        std::lock_guard<std::mutex> lock(outgoingMutex_);
        batch.swap(outgoing_);
    }
    for (const auto& event : batch) {
        if (!writeFrame(socket, event)) {
            break;
        }
    }
}

void CommandServer::handleCommand(const nlohmann::json& cmd, juce::StreamingSocket* socket) {
    const std::string type = cmd.value("type", "");
    if (isRealtimeCommand(type)) {
        if (!engine_.getCommandQueue().push(cmd)) {
            nlohmann::json response = {
                {"id", cmd.value("id", "")},
                {"type", type},
                {"payload", {{"error", "command queue full"}}}
            };
            writeFrame(socket, response);
        }
    } else {
        const nlohmann::json response = engine_.handleImmediateCommand(cmd);
        writeFrame(socket, response);
    }
}

} // namespace singularity
