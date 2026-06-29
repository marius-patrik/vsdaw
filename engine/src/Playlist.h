#pragma once

#include "Types.h"

#include <nlohmann/json.hpp>

#include <mutex>
#include <string>
#include <unordered_map>

namespace singularity {

class Playlist {
public:
    Playlist();

    void addClip(const nlohmann::json& clipJson);
    void removeClip(const std::string& clipId);

    nlohmann::json getClips() const;

private:
    mutable std::mutex mutex_;
    std::unordered_map<std::string, nlohmann::json> clips_;
};

} // namespace singularity
