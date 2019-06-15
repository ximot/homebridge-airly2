# homebridge-airly2

**Homebridge plugin retrieving information about air quality from the Airly website using API version 2**

[![NPM Version](https://img.shields.io/npm/v/homebridge-airly2.svg)](https://www.npmjs.com/package/homebridge-airly2)



Project is based on [homebridge-airly](https://github.com/beniaminrychter/homebridge-airly).

## Instalation
1. Install Homebridge using: `(sudo) npm install -g --unsafe-perm homebridge`.
1. Install this plugin using: `(sudo) npm install -g homebridge-airly2`.
1. Get **API Key** from Airly. Login here <https://developer.airly.eu/login> and generate it.
1. Find out your coordinates (latitude and longitude). Based on that information Airly will show measurements from nearest sensor. You can use this page <https://www.latlong.net/>.
1. Update your configuration file like the example below.

### Configuration
Set in config.json file

```json
"accessories": [
    {
          "accessory": "Air2",
          "key": "YOUR_API_KEY",
          "latitude": "YOUR_LATITUDE",
          "longitude": "YOUR_LONGITUDE",
          "maxdistance": 3,
          "name": "Airly Air Quality"
    }
```

### Description config file
Fields:
- `accessory` Defines the name of the plugin. The name Air2 must be provided. (required).
- `apikey` API key from Airly Developers  (required).
- `latitude` String with your latitude e.g. `"50.3910761"` (required).
- `longitude` String with your longitude e.g. `"18.94962214"` (required).
- `maxdistance` The maximum distance from which the measurement will be read from the coordinate point. The default value is 3 km. (required)