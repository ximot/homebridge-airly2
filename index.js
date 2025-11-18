const https = require('https');

const PLUGIN_NAME = 'homebridge-airly2';
const ACCESSORY_NAME = 'Air2';
const REFRESH_INTERVAL_SECONDS = 600;

let Service;
let Characteristic;
let HapStatusError;
let HAPStatus;

module.exports = (api) => {
    console.log('homebridge API version: ' + api.version);
    Service = api.hap.Service;
    Characteristic = api.hap.Characteristic;
    HapStatusError = api.hap.HapStatusError;
    HAPStatus = api.hap.HAPStatus;
    api.registerAccessory(PLUGIN_NAME, ACCESSORY_NAME, AirAccessory);
};

function AirAccessory(log, config, api) {
    log('Running Air2');
    this.config = config;
    this.api = api;

    this.log = log;
    this.name = config.name || ACCESSORY_NAME;
    this.apikey = config.key || config.apikey;
    this.latitude = config.latitude;
    this.longitude = config.longitude;
    this.maxDistance = parseFloat(config.maxdistance);

    if (!this.apikey) {
        throw new Error('Configuration of apikey is missing. Check configuration file.');
    }
    if (!this.latitude) {
        throw new Error('Configuration of latitude is missing! Check configuration file.');
    }
    if (!this.longitude) {
        throw new Error('Configuration of longitude is missing! Check configuration file.');
    }
    if (Number.isNaN(this.maxDistance)) {
        this.maxDistance = 3;
    }

    this.lastupdate = 0;
    this.cache = undefined;
    this.airService = undefined;
    this.log.info('Airly API v2 accessory initialized');
}

AirAccessory.prototype = {
    getAirData: async function () {
        const url = `https://airapi.airly.eu/v2/measurements/nearest?indexType=AIRLY_CAQI&lat=${this.latitude}&lng=${this.longitude}&maxDistanceKM=${this.maxDistance}`;

        const shouldRefresh =
            this.lastupdate === 0 ||
            this.cache === undefined ||
            this.lastupdate + REFRESH_INTERVAL_SECONDS < Date.now() / 1000;

        if (shouldRefresh) {
            try {
                const data = await httpGetJson(url, {
                    apikey: this.apikey,
                    Accept: 'application/json',
                });
                const normalized = this.normalizeMeasurement(data);
                this.log.info(`Parsed Airly measurement AIRLY_CAQI=${this.getIndexValue(normalized)}`);
                const aqi = this.updateData(normalized, 'Fetch');
                return this.transformAQI(aqi);
            } catch (err) {
                if (this.airService) {
                    this.airService.setCharacteristic(Characteristic.StatusFault, 1);
                }
                this.log.error('Error reading data from Airly Network: ' + err.message);
                if (HapStatusError && HAPStatus) {
                    throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
                }
                throw err;
            }
        }

        this.log.info('Using cached Airly data');
        const aqi = this.updateData(this.cache, 'Cache');
        return this.transformAQI(aqi);
    },

    updateData: function (data, type) {
        const measurement = this.normalizeMeasurement(data);
        if (!measurement || !measurement.current) {
            this.log.warn('Airly response does not contain current measurement data');
            return 0;
        }

        if (this.airService) {
            this.airService.setCharacteristic(Characteristic.StatusFault, 0);
        }

        const pm25 = this.getSensorValue(measurement, 'PM25');
        const pm10 = this.getSensorValue(measurement, 'PM10');
        if (this.airService) {
            if (pm25 !== null) {
                this.airService.setCharacteristic(Characteristic.PM2_5Density, pm25);
            }
            if (pm10 !== null) {
                this.airService.setCharacteristic(Characteristic.PM10Density, pm10);
            }
        }
        const aqi = this.getIndexValue(measurement);
        this.cache = measurement;

        if (type === 'Fetch') {
            this.lastupdate = Date.now() / 1000;
        }
        return aqi;
    },

    transformAQI: function (aqi) {
        if (!aqi) {
            return 0; // Error or unknown response
        } else if (aqi <= 25) {
            return 1; // Return EXCELLENT
        } else if (aqi <= 50) {
            return 2; // Return GOOD
        } else if (aqi <= 75) {
            return 3; // Return FAIR
        } else if (aqi <= 100) {
            return 4;// Return INFERIOR
        } else if (aqi > 100) {
            return 5; // Return POOR (Homekit only goes to cat 5, so combined the last two AQI cats of Very Unhealty and Hazardous.
        }
        return 0;
    },

    getServices: function () {
        const services = [];

        const informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, 'Airly')
            .setCharacteristic(Characteristic.Model, 'API v2')
            .setCharacteristic(Characteristic.SerialNumber, '123-456');
        services.push(informationService);

        this.airService = new Service.AirQualitySensor(this.name);

        const airQualityCharacteristic = this.airService.getCharacteristic(Characteristic.AirQuality);
        if (typeof airQualityCharacteristic.onGet === 'function') {
            airQualityCharacteristic.onGet(this.getAirData.bind(this));
        } else {
            airQualityCharacteristic.on('get', (callback) => {
                this.getAirData()
                    .then((value) => callback(null, value))
                    .catch((err) => callback(err));
            });
        }

        this.airService.addCharacteristic(Characteristic.StatusFault);
        this.airService.addCharacteristic(Characteristic.PM2_5Density);
        this.airService.addCharacteristic(Characteristic.PM10Density);
        services.push(this.airService);

        return services;
    },

    getSensorValue: function (data, sensorName) {
        if (!data || !data.current || !Array.isArray(data.current.values)) {
            return null;
        }
        for (let i = 0; i < data.current.values.length; i++) {
            const sensor = data.current.values[i];
            if (sensor.name === sensorName && typeof sensor.value === 'number') {
                return sensor.value;
            }
        }
        return null;
    },

    getIndexValue: function (data) {
        if (!data || !data.current || !Array.isArray(data.current.indexes) || data.current.indexes.length === 0) {
            return 0;
        }
        const index = data.current.indexes[0];
        if (index && typeof index.value === 'number') {
            return index.value;
        }
        if (index && index.description && index.description.includes('There are no Airly sensors in this area yet.')) {
            this.log.warn(index.description);
        }
        return 0;
    },

    normalizeMeasurement: function (data) {
        if (!data) {
            return null;
        }
        if (Array.isArray(data)) {
            if (data.length === 0) {
                return null;
            }
            return this.normalizeMeasurement(data[0]);
        }
        if (data.data) {
            return this.normalizeMeasurement(data.data);
        }
        return data;
    },
};

function httpGetJson(url, headers) {
    return new Promise((resolve, reject) => {
        const request = https.request(
            url,
            {
                method: 'GET',
                headers,
            },
            (response) => {
                let raw = '';
                response.setEncoding('utf8');
                response.on('data', (chunk) => {
                    raw += chunk;
                });
                response.on('end', () => {
                    if (response.statusCode && (response.statusCode < 200 || response.statusCode >= 300)) {
                        const error = new Error('Airly API request failed with status ' + response.statusCode);
                        error.statusCode = response.statusCode;
                        error.body = raw;
                        reject(error);
                        return;
                    }
                    try {
                        const parsed = JSON.parse(raw);
                        resolve(parsed);
                    } catch (err) {
                        reject(err);
                    }
                });
            }
        );
        request.on('error', reject);
        request.end();
    });
}
