#pragma once

#include "Types.h"

#include <juce_audio_basics/juce_audio_basics.h>
#include <nlohmann/json.hpp>

#include <mutex>
#include <string>
#include <unordered_map>

namespace singularity {

struct InsertState {
    float volumeDb = 0.0f;
    float pan = 0.0f; // -1 (L) to 1 (R)
    bool mute = false;
    bool solo = false;
};

class Mixer {
public:
    Mixer();

    void addOrUpdateInsert(const std::string& insertId, const nlohmann::json& insertJson);
    void setInsertVolume(const std::string& insertId, float volumeDb);
    void setInsertPan(const std::string& insertId, float pan);
    void setInsertMute(const std::string& insertId, bool mute);
    void setInsertSolo(const std::string& insertId, bool solo);

    InsertState getInsertState(const std::string& insertId) const;
    void processBlock(juce::AudioBuffer<float>& buffer);

private:
    mutable std::mutex mutex_;
    std::unordered_map<std::string, InsertState> inserts_;
};

} // namespace singularity
