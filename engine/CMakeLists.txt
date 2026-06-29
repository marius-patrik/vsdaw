cmake_minimum_required(VERSION 3.28)
project(singularity-engine VERSION 1.0.0 LANGUAGES C CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

if(NOT CMAKE_BUILD_TYPE AND NOT CMAKE_CONFIGURATION_TYPES)
    set(CMAKE_BUILD_TYPE Release CACHE STRING "Build type" FORCE)
endif()

list(APPEND CMAKE_MODULE_PATH "${CMAKE_CURRENT_SOURCE_DIR}/cmake")

include(FetchContent)

# -----------------------------------------------------------------------------
# nlohmann/json – bundled single-header for reliability and fast offline builds.
# -----------------------------------------------------------------------------
set(JSON_INCLUDE_DIR "${CMAKE_CURRENT_SOURCE_DIR}/third_party")
add_library(nlohmann_json INTERFACE)
add_library(nlohmann_json::nlohmann_json ALIAS nlohmann_json)
target_include_directories(nlohmann_json INTERFACE "${JSON_INCLUDE_DIR}")

# -----------------------------------------------------------------------------
# Catch2 – fetched at configure time.
# -----------------------------------------------------------------------------
FetchContent_Declare(
    Catch2
    GIT_REPOSITORY https://github.com/catchorg/Catch2.git
    GIT_TAG v3.8.0
    GIT_SHALLOW TRUE
)
FetchContent_MakeAvailable(Catch2)

# -----------------------------------------------------------------------------
# JUCE 8 – prefer the Git submodule; fall back to FetchContent if absent.
# -----------------------------------------------------------------------------
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/third_party/JUCE/CMakeLists.txt")
    message(STATUS "Using JUCE from engine/third_party/JUCE submodule")
    add_subdirectory(third_party/JUCE)
else()
    message(STATUS "JUCE submodule not found; fetching JUCE 8.0.4 via FetchContent")
    FetchContent_Declare(
        JUCE
        GIT_REPOSITORY https://github.com/juce-framework/JUCE.git
        GIT_TAG 8.0.4
        GIT_SHALLOW TRUE
    )
    FetchContent_MakeAvailable(JUCE)
endif()

# -----------------------------------------------------------------------------
# Main engine executable.
# -----------------------------------------------------------------------------
juce_add_console_app(singularity-engine
    PRODUCT_NAME "Singularity Engine"
    VERSION "${PROJECT_VERSION}"
    COMPANY_NAME "Singularity"
)

target_sources(singularity-engine PRIVATE
    src/main.cpp
    src/CommandServer.cpp
    src/CommandQueue.cpp
    src/Transport.cpp
    src/Engine.cpp
    src/Project.cpp
    src/ChannelRack.cpp
    src/Pattern.cpp
    src/Playlist.cpp
    src/Mixer.cpp
    src/MeteringBus.cpp
)

target_compile_definitions(singularity-engine PRIVATE
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_MODAL_LOOPS_PERMITTED=1
    JUCE_APPLICATION_NAME_STRING="Singularity Engine"
    JUCE_APPLICATION_VERSION_STRING="${PROJECT_VERSION}"
)

target_link_libraries(singularity-engine PRIVATE
    juce::juce_core
    juce::juce_audio_basics
    juce::juce_audio_devices
    nlohmann_json::nlohmann_json
)

if(MSVC)
    target_compile_options(singularity-engine PRIVATE /W4)
else()
    target_compile_options(singularity-engine PRIVATE -Wall -Wextra -Wpedantic)
endif()

juce_generate_juce_header(singularity-engine)

# -----------------------------------------------------------------------------
# Unit tests.
# -----------------------------------------------------------------------------
add_executable(singularity-engine-tests
    tests/test_main.cpp
    tests/test_time.cpp
    tests/test_transport.cpp
    tests/test_command_queue.cpp
    tests/test_metering.cpp
    src/CommandQueue.cpp
    src/Transport.cpp
    src/MeteringBus.cpp
)

target_compile_features(singularity-engine-tests PRIVATE cxx_std_20)
target_include_directories(singularity-engine-tests PRIVATE src "${JSON_INCLUDE_DIR}")
target_compile_definitions(singularity-engine-tests PRIVATE
    JUCE_WEB_BROWSER=0
    JUCE_USE_CURL=0
    JUCE_MODAL_LOOPS_PERMITTED=1
)

target_link_libraries(singularity-engine-tests PRIVATE
    juce::juce_core
    juce::juce_audio_basics
    nlohmann_json::nlohmann_json
    Catch2::Catch2WithMain
)

if(MSVC)
    target_compile_options(singularity-engine-tests PRIVATE /W4)
else()
    target_compile_options(singularity-engine-tests PRIVATE -Wall -Wextra -Wpedantic)
endif()

# -----------------------------------------------------------------------------
# CTest integration.
# -----------------------------------------------------------------------------
include(CTest)
include(Catch)
catch_discover_tests(singularity-engine-tests)

# -----------------------------------------------------------------------------
# Install rule for packaging as Tauri sidecar.
# -----------------------------------------------------------------------------
install(TARGETS singularity-engine RUNTIME DESTINATION bin)
