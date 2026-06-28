# Changelog

All notable changes to ESP Board Vault are documented in this file.

## 1.0.29

### Fixed

- Fixed missing Linux desktop panel icons ([#5](https://github.com/thelastoutpostworkshop/ESPVault/issues/5)).

## 1.0.28

### Fixed

- Build macOS DMG artifacts with an APFS filesystem to avoid HFS+ disk image
  mount failures on macOS Tahoe.
- Let the native macOS GitHub Actions matrix control x64 and arm64 packaging so
  each macOS job produces only its requested architecture.

## 1.0.27 - 2026-06-25

### Changed

- Recommend the macOS arm64 ZIP as the Apple Silicon download while DMG
  generation is under investigation.
- Validate macOS DMG artifacts in CI before uploading release assets, and omit a
  failing arm64 DMG while keeping the working arm64 ZIP available.

## 1.0.26 - 2026-06-25

### Fixed

- Generate macOS DMG artifacts with the `ULFO` disk image format to match the
  working ESPConnect macOS release packaging path.

## 1.0.25 - 2026-06-25

### Fixed

- Reset the ad-hoc macOS app signature after flipping Electron fuses so unsigned
  Apple Silicon builds are not killed by macOS code-signature validation.

## 1.0.24 - 2026-06-25

### Changed

- Build macOS x64 and arm64 release artifacts on separate native GitHub-hosted
  macOS runners to reduce architecture-specific packaging risk.
- Clarified macOS release architecture notes.
- Include the matching changelog section in generated GitHub release notes.

## 1.0.23 - 2026-06-22

### Added

- Added README support links, including the Buy Me a Coffee link.
- Added release update instructions for installing newer app versions over an
  existing install.

### Changed

- Refined README installation and release guidance.

## 1.0.22 - 2026-06-22

### Added

- Added README installation instructions and a clickable README banner.
- Added release install notes for desktop release assets.

### Changed

- Improved tooling descriptions.
- Updated npm dependencies.
- Moved board metadata fields higher in the editor for easier scan review.
- Show board location in the detail summary.
- Marked scan-detected board fields more clearly.

### Fixed

- Fixed serial scan permission handling for multi-port scan flows.

## 1.0.21 - 2026-06-14

### Changed

- Preferred Windows portable ZIP instructions in release documentation.
- Updated GitHub Actions release builds for newer Node runners.

## 1.0.20 - 2026-06-14

### Changed

- Linked release notes directly to installer assets.
