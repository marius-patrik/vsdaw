#pragma once

#include "Types.h"

#include <nlohmann/json.hpp>

#include <atomic>
#include <mutex>
#include <string>

namespace singularity {

class Pattern {
public:
    explicit Pattern(std::string id);

    void setChannelData(const std::string& channelId, const nlohmann::json& data);
    nlohmann::json getChannelData(const std::string& channelId) const;

    const std::string& getId() const noexcept { return id_; }

private:
    std::string id_;
    mutable std::mutex mutex_;
    nlohmann::json data_;
};

} // namespace singularity
