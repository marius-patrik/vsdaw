#include "ChannelRack.h"

namespace singularity {

ChannelRack::ChannelRack() = default;

void ChannelRack::addOrUpdateChannel(const nlohmann::json& channelJson) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (channelJson.contains("id") && channelJson["id"].is_string()) {
        channels_[channelJson["id"].get<std::string>()] = channelJson;
    }
}

void ChannelRack::setChannelOutput(const std::string& channelId, const std::string& targetId) {
    std::lock_guard<std::mutex> lock(mutex_);
    channelOutputs_[channelId] = targetId;
}

void ChannelRack::processBlock(const juce::AudioBuffer<float>& /*buffer*/, const TransportPosition& /*position*/) {
    // Foundation shell: channel rack currently renders silence. DSP will be
    // added when stock instruments and plugin hosting land (Specs 21/31).
}

} // namespace singularity
