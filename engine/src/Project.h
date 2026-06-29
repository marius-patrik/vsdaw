#pragma once

#include "ChannelRack.h"
#include "Mixer.h"
#include "Pattern.h"
#include "Playlist.h"
#include "Types.h"

#include <juce_audio_basics/juce_audio_basics.h>

#include <memory>
#include <mutex>
#include <string>
#include <unordered_map>

namespace singularity {

class Project {
public:
    Project();

    void load(const nlohmann::json& projectJson);
    void unload();

    void processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& midiBuffer, const TransportPosition& position);

    Mixer& getMixer() noexcept { return mixer_; }
    ChannelRack& getChannelRack() noexcept { return channelRack_; }
    Playlist& getPlaylist() noexcept { return playlist_; }

    Pattern* getPattern(const std::string& id);

private:
    mutable std::mutex mutex_;
    nlohmann::json projectJson_;

    ChannelRack channelRack_;
    Playlist playlist_;
    Mixer mixer_;
    std::unordered_map<std::string, std::unique_ptr<Pattern>> patterns_;
};

} // namespace singularity
