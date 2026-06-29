#include "Engine.h"

#include <juce_core/juce_core.h>

#include <algorithm>
#include <chrono>
#include <cmath>
#include <thread>

namespace singularity {

namespace {

nlohmann::json positionToJson(const TransportPosition& pos) {
    return {
        {"samples", pos.samples},
        {"ticks", pos.ticks},
        {"bars", pos.bars},
        {"beats", pos.beats},
        {"sixteenths", pos.sixteenths},
        {"ticksInBeat", pos.ticksInBeat}
    };
}

std::string generateId() {
    return juce::Uuid().toString().toStdString();
}

} // namespace

Engine::Engine() = default;

Engine::~Engine() {
    shutdown();
}

bool Engine::initialize(uint16_t commandPort) {
    commandQueue_ = std::make_unique<CommandQueue>();
    transport_ = std::make_unique<Transport>();
    project_ = std::make_unique<Project>();
    meteringBus_ = std::make_unique<MeteringBus>();
    meteringBus_->registerInsert("master");

    deviceManager_ = std::make_unique<juce::AudioDeviceManager>();
    const juce::String err = deviceManager_->initialise(0, 2, nullptr, false, {}, nullptr);
    if (err.isNotEmpty()) {
        juce::Logger::writeToLog("AudioDeviceManager initialisation warning: " + err);
    }
    deviceManager_->addAudioCallback(this);

    commandServer_ = std::make_unique<CommandServer>(*this, commandPort);
    commandServer_->startThread();

    for (int i = 0; i < 200 && commandServer_->getBoundPort() == 0; ++i) {
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    }
    if (commandServer_->getBoundPort() == 0) {
        return false;
    }

    meteringBus_->startBroadcast([this](const std::vector<MeterSample>& meters) { onMeterBatch(meters); });

    running_.store(true, std::memory_order_release);
    broadcasterThread_ = std::make_unique<std::thread>(&Engine::runBroadcaster, this);

    return true;
}

uint16_t Engine::getCommandServerPort() const noexcept {
    return commandServer_ ? commandServer_->getBoundPort() : 0;
}

void Engine::shutdown() {
    if (shutdownStarted_.exchange(true, std::memory_order_acq_rel)) {
        // Shutdown already in progress; wait for it to finish.
        while (!shutdownComplete_.load(std::memory_order_acquire)) {
            std::this_thread::sleep_for(std::chrono::milliseconds(5));
        }
        return;
    }

    running_.store(false, std::memory_order_release);
    shutdownRequested_.store(true, std::memory_order_release);
    stopAudio();

    if (meteringBus_) {
        meteringBus_->stopBroadcast();
    }

    if (commandServer_) {
        commandServer_->signalStop();
    }

    if (broadcasterThread_ && broadcasterThread_->joinable()) {
        broadcasterThread_->join();
    }

    if (commandServer_) {
        commandServer_->stopThread(2000);
    }

    if (deviceManager_) {
        deviceManager_->removeAudioCallback(this);
        deviceManager_->closeAudioDevice();
        deviceManager_.reset();
    }

    shutdownComplete_.store(true, std::memory_order_release);
}

void Engine::runBroadcaster() {
    using namespace std::chrono_literals;
    while (!shutdownRequested_.load(std::memory_order_acquire)) {
        const auto pos = transport_->getPosition();
        const int64_t samples = pos.samples;
        const int64_t last = lastBroadcastedSamples_.load(std::memory_order_relaxed);
        if (samples != last) {
            lastBroadcastedSamples_.store(samples, std::memory_order_relaxed);
            broadcastEvent(makeEvent("transport", {{"position", positionToJson(pos)}}));
        }

        const int xruns = xrunCount_.load(std::memory_order_relaxed);
        const int lastXruns = lastBroadcastedXruns_.load(std::memory_order_relaxed);
        if (xruns != lastXruns) {
            lastBroadcastedXruns_.store(xruns, std::memory_order_relaxed);
            broadcastEvent(makeEvent("error", {{"count", xruns}}));
        }

        std::this_thread::sleep_for(33ms);
    }
}

void Engine::broadcastEvent(const nlohmann::json& event) {
    if (commandServer_) {
        commandServer_->broadcast(event);
    }
}

void Engine::onMeterBatch(const std::vector<MeterSample>& meters) {
    nlohmann::json meterArray = nlohmann::json::array();
    for (const auto& m : meters) {
        meterArray.push_back({
            {"insertId", m.insertId},
            {"peakDb", m.peakDb},
            {"rmsDb", m.rmsDb},
            {"clipped", m.clipped}
        });
    }
    broadcastEvent(makeEvent("meter", {
        {"meters", meterArray},
        {"timestampSamples", transport_->getPosition().samples}
    }));
}

nlohmann::json Engine::makeReply(const nlohmann::json& cmd, bool success, const nlohmann::json& payload) const {
    nlohmann::json reply = {
        {"id", generateId()},
        {"inReplyTo", cmd.value("id", "")},
        {"success", success}
    };
    if (!payload.is_null()) {
        reply["payload"] = payload;
    }
    return reply;
}

nlohmann::json Engine::makeErrorReply(const nlohmann::json& cmd, const std::string& code, const std::string& message) const {
    return {
        {"id", generateId()},
        {"inReplyTo", cmd.value("id", "")},
        {"success", false},
        {"error", {{"code", code}, {"message", message}}}
    };
}

nlohmann::json Engine::makeEvent(const std::string& topic, const nlohmann::json& payload) const {
    return {
        {"id", generateId()},
        {"type", "event"},
        {"topic", topic},
        {"payload", payload}
    };
}

void Engine::broadcastError(const std::string& code, const std::string& message) {
    broadcastEvent(makeEvent("error", {{"code", code}, {"message", message}}));
}

nlohmann::json Engine::handleImmediateCommand(const nlohmann::json& cmd) {
    const std::string type = cmd.value("type", "");
    if (type == "engine.ping") return handleEnginePing(cmd);
    if (type == "engine.shutdown") return handleEngineShutdown(cmd);
    if (type == "engine.getStats") return handleEngineGetStats(cmd);
    if (type == "audio.enumerateDevices") return handleAudioEnumerateDevices(cmd);
    if (type == "audio.getCurrentDevice") return handleAudioGetCurrentDevice(cmd);
    if (type == "audio.setDevice") return handleAudioSetDevice(cmd);
    if (type == "audio.start") return handleAudioStart(cmd);
    if (type == "audio.stop") return handleAudioStop(cmd);
    return makeErrorReply(cmd, "ERR_UNKNOWN_TYPE", "unknown command type");
}

nlohmann::json Engine::handleEnginePing(const nlohmann::json& cmd) {
    return makeReply(cmd, true, {
        {"version", "1.0.0"},
        {"build", "juce-8.0.4"}
    });
}

nlohmann::json Engine::handleEngineShutdown(const nlohmann::json& cmd) {
    // Defer full teardown to the thread that owns the message loop; do not
    // call shutdown() from the CommandServer thread because that would try to
    // join the current thread.
    shutdownRequested_.store(true, std::memory_order_release);
    running_.store(false, std::memory_order_release);
    return makeReply(cmd, true, {{"ok", true}});
}

nlohmann::json Engine::handleEngineGetStats(const nlohmann::json& cmd) {
    return makeReply(cmd, true, {
        {"cpuPercent", std::round(cpuPercent_.load(std::memory_order_relaxed) * 100.0) / 100.0},
        {"xruns", xrunCount_.load(std::memory_order_relaxed)}
    });
}

nlohmann::json Engine::handleAudioEnumerateDevices(const nlohmann::json& cmd) {
    const auto devices = enumerateDevices();
    nlohmann::json array = nlohmann::json::array();
    for (const auto& d : devices) {
        array.push_back({
            {"id", d.id},
            {"name", d.name},
            {"type", d.type},
            {"sampleRates", d.sampleRates},
            {"bufferSizes", d.bufferSizes},
            {"defaultSampleRate", d.defaultSampleRate},
            {"inputChannels", d.inputChannels},
            {"outputChannels", d.outputChannels}
        });
    }
    return makeReply(cmd, true, {{"devices", array}});
}

nlohmann::json Engine::handleAudioGetCurrentDevice(const nlohmann::json& cmd) {
    auto* device = deviceManager_->getCurrentAudioDevice();
    if (device == nullptr) {
        return makeReply(cmd, true, nullptr);
    }
    const double latencyMs = device->getOutputLatencyInSamples() / device->getCurrentSampleRate() * 1000.0;
    return makeReply(cmd, true, {
        {"config", {
            {"deviceId", device->getName().toStdString()},
            {"sampleRate", device->getCurrentSampleRate()},
            {"bufferSize", device->getCurrentBufferSizeSamples()}
        }},
        {"latencyMs", latencyMs}
    });
}

nlohmann::json Engine::handleAudioSetDevice(const nlohmann::json& cmd) {
    const auto& payload = cmd.value("payload", nlohmann::json::object());
    const auto& configJson = payload.value("config", nlohmann::json::object());
    AudioDeviceConfig config;
    config.deviceId = configJson.value("deviceId", "");
    config.sampleRate = configJson.value("sampleRate", 48000.0);
    config.bufferSize = configJson.value("bufferSize", 512);

    if (config.deviceId.empty()) {
        return makeErrorReply(cmd, "ERR_INVALID_MESSAGE", "missing deviceId");
    }

    if (!setDevice(config)) {
        broadcastError("ERR_INTERNAL", "failed to set audio device");
        return makeErrorReply(cmd, "ERR_INTERNAL", "failed to set device");
    }

    auto* device = deviceManager_->getCurrentAudioDevice();
    const double latencyMs = (device != nullptr)
                                 ? device->getOutputLatencyInSamples() / device->getCurrentSampleRate() * 1000.0
                                 : 0.0;
    return makeReply(cmd, true, {{"ok", true}, {"latencyMs", latencyMs}});
}

nlohmann::json Engine::handleAudioStart(const nlohmann::json& cmd) {
    const bool ok = startAudio();
    if (!ok) {
        broadcastError("ERR_INTERNAL", "failed to start audio");
    }
    return makeReply(cmd, ok, {{"ok", ok}});
}

nlohmann::json Engine::handleAudioStop(const nlohmann::json& cmd) {
    return makeReply(cmd, true, {{"ok", stopAudio()}});
}

std::vector<AudioDeviceInfo> Engine::enumerateDevices() const {
    std::vector<AudioDeviceInfo> result;
    auto* deviceType = deviceManager_->getCurrentDeviceTypeObject();
    if (deviceType == nullptr) {
        return result;
    }

    const auto outputNames = deviceType->getDeviceNames(false);
    for (const auto& name : outputNames) {
        std::unique_ptr<juce::AudioIODevice> device(deviceType->createDevice(name, ""));
        if (device == nullptr) {
            continue;
        }
        AudioDeviceInfo info;
        info.id = name.toStdString();
        info.name = name.toStdString();
        info.type = "output";
        for (const auto r : device->getAvailableSampleRates()) {
            info.sampleRates.push_back(static_cast<int>(r));
        }
        for (const auto b : device->getAvailableBufferSizes()) {
            info.bufferSizes.push_back(static_cast<int>(b));
        }
        info.defaultSampleRate = static_cast<int>(device->getCurrentSampleRate());
        if (info.defaultSampleRate == 0 && !info.sampleRates.empty()) {
            info.defaultSampleRate = info.sampleRates.front();
        }
        info.inputChannels = device->getInputChannelNames().size();
        info.outputChannels = device->getOutputChannelNames().size();
        result.push_back(std::move(info));
    }
    return result;
}

bool Engine::setDevice(const AudioDeviceConfig& config) {
    juce::AudioDeviceManager::AudioDeviceSetup setup;
    setup.outputDeviceName = config.deviceId;
    setup.sampleRate = config.sampleRate;
    setup.bufferSize = config.bufferSize;
    setup.inputDeviceName = "";

    const juce::String err = deviceManager_->setAudioDeviceSetup(setup, true);
    if (err.isNotEmpty()) {
        juce::Logger::writeToLog("setDevice error: " + err);
        return false;
    }

    if (deviceManager_->getCurrentAudioDevice() == nullptr) {
        deviceManager_->restartLastAudioDevice();
    }

    auto* device = deviceManager_->getCurrentAudioDevice();
    if (device != nullptr) {
        const double sr = device->getCurrentSampleRate();
        transport_->prepare(sr);
        meteringBus_->prepare(sr);
    }
    return device != nullptr;
}

bool Engine::startAudio() {
    if (deviceManager_->getCurrentAudioDevice() != nullptr) {
        return true;
    }
    deviceManager_->restartLastAudioDevice();
    return deviceManager_->getCurrentAudioDevice() != nullptr;
}

bool Engine::stopAudio() {
    deviceManager_->closeAudioDevice();
    return true;
}

void Engine::loadProject(const nlohmann::json& projectJson) {
    if (project_) {
        project_->load(projectJson);
    }
}

void Engine::unloadProject() {
    if (project_) {
        project_->unload();
    }
}

void Engine::audioDeviceAboutToStart(juce::AudioIODevice* device) {
    const double sr = device->getCurrentSampleRate();
    transport_->prepare(sr);
    meteringBus_->prepare(sr);
}

void Engine::audioDeviceStopped() {
    // No-op.
}

void Engine::audioDeviceIOCallbackWithContext(
    const float* const* /*inputChannelData*/,
    int /*numInputChannels*/,
    float* const* outputChannelData,
    int numOutputChannels,
    int numSamples,
    const juce::AudioIODeviceCallbackContext& /*context*/) {

    const auto startTicks = juce::Time::getHighResolutionTicks();

    processCommands();
    transport_->advance(numSamples);

    juce::AudioBuffer<float> buffer(outputChannelData, numOutputChannels, numSamples);
    juce::MidiBuffer midi;
    if (project_) {
        project_->processBlock(buffer, midi, transport_->getPosition());
    } else {
        buffer.clear();
    }

    if (numOutputChannels > 0) {
        meteringBus_->pushSamples("master", buffer.getReadPointer(0), numSamples);
    }

    const auto endTicks = juce::Time::getHighResolutionTicks();
    const double elapsedSeconds = juce::Time::highResolutionTicksToSeconds(endTicks - startTicks);
    const double bufferSeconds = transport_->getSampleRate() > 0.0
                                     ? static_cast<double>(numSamples) / transport_->getSampleRate()
                                     : 0.0;
    if (bufferSeconds > 0.0) {
        const double percent = (elapsedSeconds / bufferSeconds) * 100.0;
        cpuPercent_.store(percent, std::memory_order_relaxed);
        if (elapsedSeconds > bufferSeconds) {
            xrunCount_.fetch_add(1, std::memory_order_relaxed);
        }
    }
}

void Engine::processCommands() {
    nlohmann::json cmd;
    while (commandQueue_->pop(cmd)) {
        const std::string type = cmd.value("type", "");
        const auto& payload = cmd.value("payload", nlohmann::json::object());

        nlohmann::json reply;

        auto broadcastState = [this](TransportState state) {
            broadcastEvent(makeEvent("transport", {{"state", transportStateToString(state)}}));
        };

        if (type == "transport.play") {
            transport_->play(payload.value("fromStart", false));
            reply = makeReply(cmd, true, {{"state", transportStateToString(transport_->getState())}});
            broadcastState(transport_->getState());
        } else if (type == "transport.stop") {
            transport_->stop(payload.value("rewind", false));
            reply = makeReply(cmd, true, {
                {"state", transportStateToString(transport_->getState())},
                {"position", positionToJson(transport_->getPosition())}
            });
            broadcastState(transport_->getState());
        } else if (type == "transport.pause") {
            transport_->pause();
            reply = makeReply(cmd, true, {{"state", transportStateToString(transport_->getState())}});
            broadcastState(transport_->getState());
        } else if (type == "transport.record") {
            transport_->record(payload.value("fromStart", false));
            reply = makeReply(cmd, true, {{"state", transportStateToString(transport_->getState())}});
            broadcastState(transport_->getState());
        } else if (type == "transport.seek") {
            if (payload.contains("samples")) {
                transport_->seekToSamples(payload["samples"].get<int64_t>());
            } else if (payload.contains("ticks")) {
                transport_->seekToTicks(payload["ticks"].get<int64_t>());
            }
            reply = makeReply(cmd, true, {{"position", positionToJson(transport_->getPosition())}});
        } else if (type == "transport.setLoop") {
            transport_->setLoop(
                payload.value("enabled", false),
                payload.value("startSamples", 0),
                payload.value("endSamples", 0));
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "transport.setTempo") {
            transport_->setTempo(payload.value("bpm", kDefaultBPM));
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "transport.setTimeSignature") {
            transport_->setTimeSignature(payload.value("numerator", 4), payload.value("denominator", 4));
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "transport.setSongMode") {
            transport_->setSongMode(payload.value("songMode", false));
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "project.load") {
            if (payload.contains("project")) {
                loadProject(payload["project"]);
            }
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "project.unload") {
            unloadProject();
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "mixer.setInsertVolume") {
            if (project_) {
                project_->getMixer().setInsertVolume(payload.value("insertId", ""), payload.value("volumeDb", 0.0f));
            }
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "mixer.setInsertPan") {
            if (project_) {
                project_->getMixer().setInsertPan(payload.value("insertId", ""), payload.value("pan", 0.0f));
            }
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "mixer.setInsertMute") {
            if (project_) {
                project_->getMixer().setInsertMute(payload.value("insertId", ""), payload.value("mute", false));
            }
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "mixer.setInsertSolo") {
            if (project_) {
                project_->getMixer().setInsertSolo(payload.value("insertId", ""), payload.value("solo", false));
            }
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "channel.setOutput") {
            if (project_) {
                project_->getChannelRack().setChannelOutput(payload.value("channelId", ""), payload.value("targetId", ""));
            }
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "pattern.setChannelData") {
            if (project_ && payload.contains("patternId")) {
                auto* pattern = project_->getPattern(payload["patternId"].get<std::string>());
                if (pattern != nullptr && payload.contains("channelId") && payload.contains("data")) {
                    pattern->setChannelData(payload["channelId"].get<std::string>(), payload["data"]);
                }
            }
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "playlist.addClip") {
            if (project_ && payload.contains("clip")) {
                project_->getPlaylist().addClip(payload["clip"]);
            }
            reply = makeReply(cmd, true, {{"ok", true}});
        } else if (type == "playlist.removeClip") {
            if (project_) {
                project_->getPlaylist().removeClip(payload.value("clipId", ""));
            }
            reply = makeReply(cmd, true, {{"ok", true}});
        } else {
            reply = makeErrorReply(cmd, "ERR_UNKNOWN_TYPE", "unknown realtime command");
        }

        broadcastEvent(reply);
    }
}

} // namespace singularity
