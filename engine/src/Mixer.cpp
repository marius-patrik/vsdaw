#include "Mixer.h"

#include <algorithm>
#include <cmath>

namespace singularity {

Mixer::Mixer() = default;

void Mixer::addOrUpdateInsert(const std::string& insertId, const nlohmann::json& /*insertJson*/) {
    std::lock_guard<std::mutex> lock(mutex_);
    inserts_.emplace(insertId, InsertState{});
}

void Mixer::setInsertVolume(const std::string& insertId, float volumeDb) {
    std::lock_guard<std::mutex> lock(mutex_);
    inserts_[insertId].volumeDb = volumeDb;
}

void Mixer::setInsertPan(const std::string& insertId, float pan) {
    std::lock_guard<std::mutex> lock(mutex_);
    inserts_[insertId].pan = std::clamp(pan, -1.0f, 1.0f);
}

void Mixer::setInsertMute(const std::string& insertId, bool mute) {
    std::lock_guard<std::mutex> lock(mutex_);
    inserts_[insertId].mute = mute;
}

void Mixer::setInsertSolo(const std::string& insertId, bool solo) {
    std::lock_guard<std::mutex> lock(mutex_);
    inserts_[insertId].solo = solo;
}

InsertState Mixer::getInsertState(const std::string& insertId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = inserts_.find(insertId);
    if (it != inserts_.end()) {
        return it->second;
    }
    return InsertState{};
}

void Mixer::processBlock(juce::AudioBuffer<float>& buffer) {
    // Foundation shell: mixer passes audio through. Per-insert DSP, routing,
    // pan/volume law, mute, and solo logic will be implemented in Spec 29.
    juce::ignoreUnused(buffer);
}

} // namespace singularity
