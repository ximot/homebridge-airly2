const https = require('https');

const PLUGIN_NAME = 'homebridge-airly2';
const ACCESSORY_NAME = 'Air2';
const API_REQUESTS_PER_DAY = 100;
const SECONDS_PER_DAY = 24 * 60 * 60;
const MIN_REFRESH_INTERVAL_SECONDS = Math.ceil(SECONDS_PER_DAY / API_REQUESTS_PER_DAY);

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

    if (!this.apikey) {
        throw new Error('Configuration of apikey is missing. Check configuration file.');
    }

    // Validate coordinates
    const coords = this.validateCoordinates(config.latitude, config.longitude);
    this.latitude = coords.latitude;
    this.longitude = coords.longitude;

    // Validate maxDistance
    this.maxDistance = this.validateMaxDistance(config.maxdistance);

    // Generate unique serial number based on location
    this.serialNumber = this.generateSerialNumber();

    const defaultRefreshMinutes = Math.ceil(MIN_REFRESH_INTERVAL_SECONDS / 60);
    const configuredRefreshMinutes = parseFloat(config.refreshinterval);
    const refreshMinutes = Number.isNaN(configuredRefreshMinutes)
        ? defaultRefreshMinutes
        : configuredRefreshMinutes;
    this.refreshIntervalSeconds = Math.max(
        MIN_REFRESH_INTERVAL_SECONDS,
        Math.round(refreshMinutes * 60)
    );
    this.refreshTimer = undefined;
    this.refreshPromise = null;

    this.lastupdate = 0;
    this.cache = undefined;
    this.airService = undefined;
    this.log.info('Airly API v2 accessory initialized');
    this.log.info(
        `Polling Airly every ${Math.round(
            this.refreshIntervalSeconds / 60
        )} minutes (API limit: ${Math.ceil(MIN_REFRESH_INTERVAL_SECONDS / 60)} minutes)`
    );

    this.startPolling();
}

AirAccessory.prototype = {
    getAirData: async function () {
        if (!this.cache) {
            this.refreshMeasurement().catch(() => {});
            if (this.airService) {
                this.airService.setCharacteristic(Characteristic.StatusFault, 1);
            }
            return 0;
        }

        return this.transformAQI(this.getIndexValue(this.cache));
    },

    startPolling: function () {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
        }

        const handleError = (err) => {
            this.log.debug('Polling refresh failed: ' + (err?.message || 'Unknown error'));
        };

        this.refreshMeasurement().catch(handleError);
        this.refreshTimer = setInterval(() => {
            this.refreshMeasurement().catch(handleError);
        }, this.refreshIntervalSeconds * 1000);

        if (this.api && typeof this.api.on === 'function') {
            this.api.on('shutdown', () => this.stopPolling());
        }
    },

    stopPolling: function () {
        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = undefined;
        }
    },

    refreshMeasurement: async function () {
        if (this.refreshPromise) {
            return this.refreshPromise;
        }

        const url = this.buildApiUrl();

        this.refreshPromise = (async () => {
            try {
                const data = await httpGetJson(url, {
                    apikey: this.apikey,
                    Accept: 'application/json',
                });
                const normalized = this.normalizeMeasurement(data);
                this.log.info(`Parsed Airly measurement AIRLY_CAQI=${this.getIndexValue(normalized)}`);
                this.updateData(normalized, 'Fetch');
            } catch (err) {
                if (this.airService) {
                    this.airService.setCharacteristic(Characteristic.StatusFault, 1);
                }
                this.log.error('Error reading data from Airly Network: ' + err.message);
                if (HapStatusError && HAPStatus) {
                    throw new HapStatusError(HAPStatus.SERVICE_COMMUNICATION_FAILURE);
                }
                throw err;
            } finally {
                this.refreshPromise = null;
            }
        })();

        return this.refreshPromise;
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
            .setCharacteristic(Characteristic.SerialNumber, this.serialNumber);
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

    validateCoordinates: function (lat, lng) {
        if (lat === undefined || lat === null || lat === '') {
            throw new Error('Configuration of latitude is missing! Check configuration file.');
        }
        if (lng === undefined || lng === null || lng === '') {
            throw new Error('Configuration of longitude is missing! Check configuration file.');
        }

        const latitude = parseFloat(lat);
        const longitude = parseFloat(lng);

        if (Number.isNaN(latitude) || latitude < -90 || latitude > 90) {
            throw new Error(`Invalid latitude: ${lat}. Must be a number between -90 and 90.`);
        }
        if (Number.isNaN(longitude) || longitude < -180 || longitude > 180) {
            throw new Error(`Invalid longitude: ${lng}. Must be a number between -180 and 180.`);
        }

        return { latitude, longitude };
    },

    validateMaxDistance: function (maxDistance) {
        const parsed = parseFloat(maxDistance);
        if (Number.isNaN(parsed) || parsed <= 0) {
            return 3;
        }
        if (parsed > 50) {
            this.log.warn('maxDistance capped at 50km (was ' + parsed + ')');
            return 50;
        }
        return parsed;
    },

    generateSerialNumber: function () {
        const locationKey = `${this.latitude}_${this.longitude}`;
        let hash = 0;
        for (let i = 0; i < locationKey.length; i++) {
            const char = locationKey.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash;
        }
        return `AIR2-${Math.abs(hash).toString(16).toUpperCase().padStart(8, '0')}`;
    },

    buildApiUrl: function () {
        const baseUrl = 'https://airapi.airly.eu/v2/measurements/nearest';
        const params = new URLSearchParams({
            indexType: 'AIRLY_CAQI',
            lat: String(this.latitude),
            lng: String(this.longitude),
            maxDistanceKM: String(this.maxDistance),
        });
        return `${baseUrl}?${params.toString()}`;
    },
};

const HTTP_TIMEOUT_MS = 30000;

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
        request.setTimeout(HTTP_TIMEOUT_MS, () => {
            request.destroy();
            reject(new Error('Request timeout after ' + (HTTP_TIMEOUT_MS / 1000) + ' seconds'));
        });
        request.on('error', reject);
        request.end();
    });
}
