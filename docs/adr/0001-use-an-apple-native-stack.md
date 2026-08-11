# Use an Apple-native stack

The Initial Release will use Swift with Metal and an AppKit or SwiftUI application shell rather than an emulator, compatibility layer, cross-platform framework, or general-purpose game engine. This keeps the shipped application native to macOS and gives the remake direct control over its wireframe renderer and host-platform behaviour, at the cost of portability to non-Apple platforms.
