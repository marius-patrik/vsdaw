#pragma once

#include "Pattern.h"
#include "Types.h"

#include <juce_audio_basics/juce_audio_basics.h>
#include <nlohmann/json.hpp>

#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>
#include <vector>

namespace singularity {

class ChannelRack {
public:
    ChannelRack();

    void addOrUpdateChannel(const nlohmann::json& channelJson);
    void setChannelOutput(const std::string& channelId, const std::string& targetId);

    void processBlock(const juce::AudioBuffer<float>& buffer, const TransportPosition& position);

private:
    mutable std::mutex mutex_;
    std::unordered_map<std::string, nlohmann::json> channels_;
    std::unordered_map<std::string, std::string> channelOutputs_;
};

} // namespace singularity
