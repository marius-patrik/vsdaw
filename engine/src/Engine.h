#pragma once

#include "CommandQueue.h"
#include "CommandServer.h"
#include "MeteringBus.h"
#include "Project.h"
#include "Transport.h"
#include "Types.h"

#include <juce_audio_devices/juce_audio_devices.h>

#include <atomic>
#include <memory>
#include <thread>

namespace singularity {

class Engine : public juce::AudioIODeviceCallback {
public:
    Engine();
    ~Engine() override;

    bool initialize(uint16_t commandPort);
    void shutdown();
    bool isRunning() const noexcept { return running_.load(std::memory_order_acquire); }
    uint16_t getCommandServerPort() const noexcept;

    // AudioIODeviceCallback
    void audioDeviceIOCallbackWithContext(
        const float* const* inputChannelData,
        int numInputChannels,
        float* const* outputChannelData,
        int numOutputChannels,
        int numSamples,
        const juce::AudioIODeviceCallbackContext& context) override;
    void audioDeviceAboutToStart(juce::AudioIODevice* device) override;
    void audioDeviceStopped() override;

    std::vector<AudioDeviceInfo> enumerateDevices() const;
    bool setDevice(const AudioDeviceConfig& config);
    bool startAudio();
    bool stopAudio();

    void loadProject(const nlohmann::json& projectJson);
    void unloadProject();

    CommandQueue& getCommandQueue() noexcept { return *commandQueue_; }

    nlohmann::json handleImmediateCommand(const nlohmann::json& cmd);
    void broadcastEvent(const nlohmann::json& event);
    void onMeterBatch(const std::vector<MeterSample>& meters);

private:
    std::unique_ptr<juce::AudioDeviceManager> deviceManager_;
    std::unique_ptr<CommandServer> commandServer_;
    std::unique_ptr<CommandQueue> commandQueue_;
    std::unique_ptr<Transport> transport_;
    std::unique_ptr<Project> project_;
    std::unique_ptr<MeteringBus> meteringBus_;
    std::unique_ptr<std::thread> broadcasterThread_;

    std::atomic<bool> running_{false};
    std::atomic<bool> shutdownRequested_{false};
    std::atomic<bool> shutdownStarted_{false};
    std::atomic<bool> shutdownComplete_{false};
    std::atomic<int> xrunCount_{0};
    std::atomic<double> cpuPercent_{0.0};
    std::atomic<int64_t> lastBroadcastedSamples_{-1};
    std::atomic<int> lastBroadcastedXruns_{-1};

    void runBroadcaster();
    void processCommands();

    nlohmann::json makeReply(const nlohmann::json& cmd, bool success, const nlohmann::json& payload) const;
    nlohmann::json makeErrorReply(const nlohmann::json& cmd, const std::string& code, const std::string& message) const;
    nlohmann::json makeEvent(const std::string& topic, const nlohmann::json& payload) const;
    void broadcastError(const std::string& code, const std::string& message);

    nlohmann::json handleEnginePing(const nlohmann::json& cmd);
    nlohmann::json handleEngineShutdown(const nlohmann::json& cmd);
    nlohmann::json handleEngineGetStats(const nlohmann::json& cmd);
    nlohmann::json handleAudioEnumerateDevices(const nlohmann::json& cmd);
    nlohmann::json handleAudioGetCurrentDevice(const nlohmann::json& cmd);
    nlohmann::json handleAudioSetDevice(const nlohmann::json& cmd);
    nlohmann::json handleAudioStart(const nlohmann::json& cmd);
    nlohmann::json handleAudioStop(const nlohmann::json& cmd);
};

} // namespace singularity
