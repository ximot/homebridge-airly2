# homebridge-airly2

**Homebridge plugin retrieving information about air quality from the Airly website using API version 2**

[![NPM Version](https://img.shields.io/npm/v/homebridge-airly2.svg)](https://www.npmjs.com/package/homebridge-airly2)

## Requirements
- Homebridge 1.6+ or 2.0-beta+
- Node.js 20.7+


Project is based on [homebridge-airly](https://github.com/beniaminrychter/homebridge-airly).

## Installation
### Standalone
1. Install Homebridge using: `(sudo) npm install -g --unsafe-perm homebridge`.
2. Install this plugin using: `(sudo) npm install -g homebridge-airly2`.

### Using hb-service
2. Install this plugin using: `hb-service add homebridge-airly2`

### Get access API key
3. Get **API Key** from Airly. Login here <https://developer.airly.eu/login> and generate it.
4. Find out your coordinates (latitude and longitude). Based on that information Airly will show measurements from nearest sensor. You can use this page <https://www.latlong.net/>.
5. Update your configuration file like the example below.

###
6. Add the configuration through the plugin settings or create the configuration section manually.

### Configuration
Set in config.json file

```json
"accessories": [
    {
          "accessory": "Air2",
          "apikey": "YOUR_API_KEY",
          "latitude": "YOUR_LATITUDE",
          "longitude": "YOUR_LONGITUDE",
          "maxdistance": 3,
          "refreshinterval": 15,
          "name": "Airly Air Quality"
    }
```

### Description config file
Fields:
- `accessory` Defines the name of the plugin. The name Air2 must be provided. (required).
- `apikey` API key from Airly Developers  (required).
- `latitude` String with your latitude e.g. `"50.3910761"` (required).
- `longitude` String with your longitude e.g. `"18.94962214"` (required).
- `maxdistance` The maximum distance (in km) from which the measurement will be read. Default: 3 km, max: 50 km. (optional)
- `refreshinterval` Polling frequency in minutes. Minimum/default is 15 minutes to stay within the 100 requests/day Airly quota. (optional)

## Development

```bash
# Install dependencies
npm install

# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## License

GPL-3.0
