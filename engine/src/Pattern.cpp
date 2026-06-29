#include "Pattern.h"

namespace singularity {

Pattern::Pattern(std::string id) : id_(std::move(id)) {
    data_ = nlohmann::json::object();
}

void Pattern::setChannelData(const std::string& channelId, const nlohmann::json& data) {
    std::lock_guard<std::mutex> lock(mutex_);
    data_[channelId] = data;
}

nlohmann::json Pattern::getChannelData(const std::string& channelId) const {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = data_.find(channelId);
    if (it != data_.end()) {
        return *it;
    }
    return nlohmann::json::object();
}

} // namespace singularity
