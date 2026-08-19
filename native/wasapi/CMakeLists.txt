cmake_minimum_required(VERSION 3.20)
project(wifora_audio LANGUAGES CXX)

add_executable(wifora-audio wifora-audio.cpp)
target_compile_features(wifora-audio PRIVATE cxx_std_20)
target_compile_definitions(wifora-audio PRIVATE UNICODE _UNICODE NOMINMAX)
target_link_libraries(wifora-audio PRIVATE ole32 avrt)
