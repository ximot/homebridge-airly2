# Changelog

All notable changes to this project will be documented in this file.

## [0.1.3] - 2025-11-18
### Changed
- Bumped the plugin version to 0.1.3 and removed the committed `package-lock.json` so the published package reflects the current metadata (`package.json`, `package-lock.json`).

## [0.1.2] - 2025-11-18
### Added
- Introduced `config.schema.json`, enabling Homebridge Config UI X users to create the accessory directly from the UI (`config.schema.json`).
- Documented how to add the accessory configuration through the plugin settings (`README.md`).
### Changed
- Raised the minimum supported Node.js version to 20.7 to match modern Homebridge requirements (`package.json`, `README.md`).
- Clarified the configuration example by correcting the `apikey` property and improving installation steps (`README.md`).

## [0.1.1] - 2025-11-18
### Added
- Added `.npmignore` so git metadata and the lockfile are not packed into the npm release (`.npmignore`).
### Changed
- Reworked the installation section to spell out standalone and `hb-service` installation paths and highlight how to obtain the API key (`README.md`).

## [0.1.0] - 2019-06-08
### Added
- Initial release of the plugin exposing Airly CAQI measurements to Homebridge (`index.js`).
