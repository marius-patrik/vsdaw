#include "Playlist.h"

namespace singularity {

Playlist::Playlist() = default;

void Playlist::addClip(const nlohmann::json& clipJson) {
    std::lock_guard<std::mutex> lock(mutex_);
    if (clipJson.contains("id") && clipJson["id"].is_string()) {
        clips_[clipJson["id"].get<std::string>()] = clipJson;
    }
}

void Playlist::removeClip(const std::string& clipId) {
    std::lock_guard<std::mutex> lock(mutex_);
    clips_.erase(clipId);
}

nlohmann::json Playlist::getClips() const {
    std::lock_guard<std::mutex> lock(mutex_);
    nlohmann::json result = nlohmann::json::array();
    for (const auto& [id, clip] : clips_) {
        result.push_back(clip);
    }
    return result;
}

} // namespace singularity
