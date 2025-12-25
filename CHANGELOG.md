# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2025-12-25
### Added
- Configurable refresh interval (defaults to ~15 minutes) respecting Airly's 100 requests/day quota
- Coordinate validation with range checks (-90/90 for latitude, -180/180 for longitude)
- MaxDistance validation with 50km cap and warning log
- HTTP request timeout (30 seconds) to prevent hanging requests
- Unique serial number generation based on location coordinates
- Polling error logging for easier debugging
- Jest unit tests with 88% code coverage (53 test cases)

### Changed
- Use URLSearchParams for safer API URL construction
- License corrected to GPL-3.0
- Minimum Homebridge version updated to 1.6+ or 2.0-beta+

### Security
- Input validation prevents invalid coordinates from being sent to API
- URL parameters properly encoded to prevent injection


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
