#include "Project.h"

namespace singularity {

Project::Project() = default;

void Project::load(const nlohmann::json& projectJson) {
    std::lock_guard<std::mutex> lock(mutex_);
    projectJson_ = projectJson;
    patterns_.clear();

    if (projectJson_.contains("patterns") && projectJson_["patterns"].is_array()) {
        for (const auto& pat : projectJson_["patterns"]) {
            if (pat.contains("id") && pat["id"].is_string()) {
                const auto id = pat["id"].get<std::string>();
                patterns_[id] = std::make_unique<Pattern>(id);
            }
        }
    }

    if (projectJson_.contains("channels") && projectJson_["channels"].is_array()) {
        for (const auto& ch : projectJson_["channels"]) {
            channelRack_.addOrUpdateChannel(ch);
        }
    }

    if (projectJson_.contains("mixer") && projectJson_["mixer"].contains("inserts")) {
        for (const auto& insert : projectJson_["mixer"]["inserts"]) {
            if (insert.contains("id") && insert["id"].is_string()) {
                mixer_.addOrUpdateInsert(insert["id"].get<std::string>(), insert);
            }
        }
    }

    if (projectJson_.contains("playlist") && projectJson_["playlist"].contains("clips")) {
        for (const auto& clip : projectJson_["playlist"]["clips"]) {
            playlist_.addClip(clip);
        }
    }
}

void Project::unload() {
    std::lock_guard<std::mutex> lock(mutex_);
    projectJson_ = nlohmann::json::object();
    patterns_.clear();
}

void Project::processBlock(juce::AudioBuffer<float>& buffer, juce::MidiBuffer& /*midiBuffer*/, const TransportPosition& /*position*/) {
    // Foundation shell: project model executes in-memory structure but renders
    // silence. Real instrument/effect processing and plugin hosting are added
    // in later specs.
    channelRack_.processBlock(buffer, {});
    mixer_.processBlock(buffer);
}

Pattern* Project::getPattern(const std::string& id) {
    std::lock_guard<std::mutex> lock(mutex_);
    auto it = patterns_.find(id);
    if (it != patterns_.end()) {
        return it->second.get();
    }
    return nullptr;
}

} // namespace singularity
