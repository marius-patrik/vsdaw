#include "CommandQueue.h"

namespace singularity {

CommandQueue::CommandQueue() : fifo_(static_cast<int>(kCapacity)) {
    buffer_.fill(nlohmann::json::object());
}

bool CommandQueue::push(const nlohmann::json& command) noexcept {
    int start1 = 0;
    int size1 = 0;
    int start2 = 0;
    int size2 = 0;
    fifo_.prepareToWrite(1, start1, size1, start2, size2);
    if (size1 + size2 < 1) {
        return false;
    }
    const int index = (size1 > 0) ? start1 : start2;
    buffer_[static_cast<size_t>(index)] = command;
    fifo_.finishedWrite(1);
    return true;
}

bool CommandQueue::pop(nlohmann::json& command) noexcept {
    int start1 = 0;
    int size1 = 0;
    int start2 = 0;
    int size2 = 0;
    fifo_.prepareToRead(1, start1, size1, start2, size2);
    if (size1 + size2 < 1) {
        return false;
    }
    const int index = (size1 > 0) ? start1 : start2;
    command = std::move(buffer_[static_cast<size_t>(index)]);
    buffer_[static_cast<size_t>(index)] = nlohmann::json::object();
    fifo_.finishedRead(1);
    return true;
}

size_t CommandQueue::available() const noexcept {
    return static_cast<size_t>(fifo_.getNumReady());
}

bool CommandQueue::isEmpty() const noexcept {
    return fifo_.getNumReady() == 0;
}

} // namespace singularity
