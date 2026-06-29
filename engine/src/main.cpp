#include "Engine.h"

#include <juce_core/juce_core.h>

#include <chrono>
#include <cstdlib>
#include <iostream>
#include <string>
#include <thread>

int main(int argc, char* argv[]) {
    juce::ScopedJuceInitialiser_GUI guiInitialiser;
    juce::MessageManager::getInstance()->setCurrentThreadAsMessageThread();

    uint16_t port = 0;
    for (int i = 1; i < argc; ++i) {
        const std::string arg(argv[i]);
        if ((arg == "--port" || arg == "-p") && i + 1 < argc) {
            port = static_cast<uint16_t>(std::atoi(argv[++i]));
        }
    }

    singularity::Engine engine;
    if (!engine.initialize(port)) {
        std::cerr << "Failed to initialize engine" << std::endl;
        return 1;
    }

    std::cout << "SINGULARITY_PORT=" << engine.getCommandServerPort() << std::endl;

    while (engine.isRunning()) {
        juce::MessageManager::getInstance()->runDispatchLoopUntil(100);
    }

    engine.shutdown();

    // Allow JUCE message loop and background threads to wind down cleanly.
    std::this_thread::sleep_for(std::chrono::milliseconds(200));
    return 0;
}
