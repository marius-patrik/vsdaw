#pragma once

#include "Types.h"

#include <juce_core/juce_core.h>
#include <nlohmann/json.hpp>

#include <array>
#include <atomic>
#include <optional>

namespace singularity {

class CommandQueue {
public:
    static constexpr size_t kCapacity = kMaxCommandQueueSize;

    CommandQueue();

    bool push(const nlohmann::json& command) noexcept;
    bool pop(nlohmann::json& command) noexcept;
    size_t available() const noexcept;
    bool isEmpty() const noexcept;

private:
    juce::AbstractFifo fifo_;
    std::array<nlohmann::json, kCapacity> buffer_;
};

} // namespace singularity
