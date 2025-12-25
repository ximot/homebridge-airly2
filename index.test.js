const https = require('https');
const { EventEmitter } = require('events');

// Mock https module
jest.mock('https');

// Import the plugin module
const pluginInit = require('./index');

// Mock Homebridge API
const createMockHomebridgeApi = () => {
    const mockCharacteristic = {
        AirQuality: 'AirQuality',
        PM2_5Density: 'PM2_5Density',
        PM10Density: 'PM10Density',
        StatusFault: 'StatusFault',
        Manufacturer: 'Manufacturer',
        Model: 'Model',
        SerialNumber: 'SerialNumber',
    };

    const mockService = {
        AccessoryInformation: jest.fn().mockImplementation(() => ({
            setCharacteristic: jest.fn().mockReturnThis(),
        })),
        AirQualitySensor: jest.fn().mockImplementation(() => ({
            getCharacteristic: jest.fn().mockReturnValue({
                onGet: jest.fn(),
                on: jest.fn(),
            }),
            addCharacteristic: jest.fn(),
            setCharacteristic: jest.fn(),
        })),
    };

    return {
        version: 2.0,
        hap: {
            Service: mockService,
            Characteristic: mockCharacteristic,
            HapStatusError: class HapStatusError extends Error {
                constructor(status) {
                    super('HAP Status Error');
                    this.status = status;
                }
            },
            HAPStatus: { SERVICE_COMMUNICATION_FAILURE: -70402 },
        },
        registerAccessory: jest.fn(),
        on: jest.fn(),
    };
};

// Initialize plugin to get AirAccessory class
let AirAccessory;
const mockApi = createMockHomebridgeApi();
pluginInit(mockApi);
AirAccessory = mockApi.registerAccessory.mock.calls[0][2];

// Mock logger
const createMockLog = () => {
    const log = jest.fn();
    log.info = jest.fn();
    log.warn = jest.fn();
    log.error = jest.fn();
    log.debug = jest.fn();
    return log;
};

// Mock this context for prototype methods
const createMockThis = (overrides = {}) => ({
    latitude: 52.2297,
    longitude: 21.0122,
    maxDistance: 5,
    apikey: 'test-api-key',
    log: createMockLog(),
    airService: {
        setCharacteristic: jest.fn(),
    },
    cache: null,
    refreshPromise: null,
    ...overrides,
});

describe('homebridge-airly2', () => {
    afterEach(() => {
        jest.clearAllTimers();
        jest.clearAllMocks();
    });

    describe('Plugin initialization', () => {
        it('should register accessory with correct name', () => {
            expect(mockApi.registerAccessory).toHaveBeenCalledWith(
                'homebridge-airly2',
                'Air2',
                expect.any(Function)
            );
        });
    });

    describe('transformAQI', () => {
        const transform = AirAccessory.prototype.transformAQI;

        it('should return 0 for falsy values', () => {
            expect(transform(0)).toBe(0);
            expect(transform(null)).toBe(0);
            expect(transform(undefined)).toBe(0);
        });

        it('should return 1 (Excellent) for AQI 1-25', () => {
            expect(transform(1)).toBe(1);
            expect(transform(25)).toBe(1);
        });

        it('should return 2 (Good) for AQI 26-50', () => {
            expect(transform(26)).toBe(2);
            expect(transform(50)).toBe(2);
        });

        it('should return 3 (Fair) for AQI 51-75', () => {
            expect(transform(51)).toBe(3);
            expect(transform(75)).toBe(3);
        });

        it('should return 4 (Inferior) for AQI 76-100', () => {
            expect(transform(76)).toBe(4);
            expect(transform(100)).toBe(4);
        });

        it('should return 5 (Poor) for AQI > 100', () => {
            expect(transform(101)).toBe(5);
            expect(transform(200)).toBe(5);
        });
    });

    describe('validateCoordinates', () => {
        const validate = AirAccessory.prototype.validateCoordinates;

        it('should throw error when latitude is missing', () => {
            expect(() => validate(undefined, 21)).toThrow('latitude is missing');
            expect(() => validate(null, 21)).toThrow('latitude is missing');
            expect(() => validate('', 21)).toThrow('latitude is missing');
        });

        it('should throw error when longitude is missing', () => {
            expect(() => validate(52, undefined)).toThrow('longitude is missing');
            expect(() => validate(52, null)).toThrow('longitude is missing');
            expect(() => validate(52, '')).toThrow('longitude is missing');
        });

        it('should throw error for invalid latitude range', () => {
            expect(() => validate(-91, 21)).toThrow('Invalid latitude');
            expect(() => validate(91, 21)).toThrow('Invalid latitude');
            expect(() => validate('abc', 21)).toThrow('Invalid latitude');
        });

        it('should throw error for invalid longitude range', () => {
            expect(() => validate(52, -181)).toThrow('Invalid longitude');
            expect(() => validate(52, 181)).toThrow('Invalid longitude');
            expect(() => validate(52, 'abc')).toThrow('Invalid longitude');
        });

        it('should accept valid coordinates', () => {
            const result = validate(52.2297, 21.0122);
            expect(result).toEqual({ latitude: 52.2297, longitude: 21.0122 });
        });

        it('should accept boundary values', () => {
            expect(validate(-90, -180)).toEqual({ latitude: -90, longitude: -180 });
            expect(validate(90, 180)).toEqual({ latitude: 90, longitude: 180 });
        });

        it('should parse string coordinates', () => {
            const result = validate('52.2297', '21.0122');
            expect(result).toEqual({ latitude: 52.2297, longitude: 21.0122 });
        });
    });

    describe('validateMaxDistance', () => {
        const validate = AirAccessory.prototype.validateMaxDistance;

        it('should return default 3 for invalid values', () => {
            const mockThis = createMockThis();
            expect(validate.call(mockThis, undefined)).toBe(3);
            expect(validate.call(mockThis, null)).toBe(3);
            expect(validate.call(mockThis, 'abc')).toBe(3);
            expect(validate.call(mockThis, 0)).toBe(3);
            expect(validate.call(mockThis, -5)).toBe(3);
        });

        it('should cap at 50km and log warning', () => {
            const mockThis = createMockThis();
            expect(validate.call(mockThis, 100)).toBe(50);
            expect(mockThis.log.warn).toHaveBeenCalledWith(expect.stringContaining('capped at 50km'));
        });

        it('should accept valid values', () => {
            const mockThis = createMockThis();
            expect(validate.call(mockThis, 5)).toBe(5);
            expect(validate.call(mockThis, 10)).toBe(10);
            expect(validate.call(mockThis, 50)).toBe(50);
        });

        it('should parse string values', () => {
            const mockThis = createMockThis();
            expect(validate.call(mockThis, '15')).toBe(15);
        });
    });

    describe('normalizeMeasurement', () => {
        const createNormalizeMockThis = () => {
            const mockThis = createMockThis();
            mockThis.normalizeMeasurement = AirAccessory.prototype.normalizeMeasurement;
            return mockThis;
        };

        it('should return null for null/undefined', () => {
            const mockThis = createNormalizeMockThis();
            expect(mockThis.normalizeMeasurement(null)).toBe(null);
            expect(mockThis.normalizeMeasurement(undefined)).toBe(null);
        });

        it('should return null for empty array', () => {
            const mockThis = createNormalizeMockThis();
            expect(mockThis.normalizeMeasurement([])).toBe(null);
        });

        it('should return first element of array', () => {
            const mockThis = createNormalizeMockThis();
            const data = [{ current: { values: [] } }, { other: 'data' }];
            expect(mockThis.normalizeMeasurement(data)).toEqual({ current: { values: [] } });
        });

        it('should unwrap nested data property', () => {
            const mockThis = createNormalizeMockThis();
            const data = { data: { current: { values: [] } } };
            expect(mockThis.normalizeMeasurement(data)).toEqual({ current: { values: [] } });
        });

        it('should return object as-is when no wrapping', () => {
            const mockThis = createNormalizeMockThis();
            const data = { current: { values: [] } };
            expect(mockThis.normalizeMeasurement(data)).toEqual({ current: { values: [] } });
        });
    });

    describe('getSensorValue', () => {
        const getSensor = AirAccessory.prototype.getSensorValue;
        const mockThis = createMockThis();

        it('should return null for invalid data', () => {
            expect(getSensor.call(mockThis, null, 'PM25')).toBe(null);
            expect(getSensor.call(mockThis, {}, 'PM25')).toBe(null);
            expect(getSensor.call(mockThis, { current: {} }, 'PM25')).toBe(null);
            expect(getSensor.call(mockThis, { current: { values: 'not-array' } }, 'PM25')).toBe(null);
        });

        it('should return null when sensor not found', () => {
            const data = { current: { values: [{ name: 'PM10', value: 50 }] } };
            expect(getSensor.call(mockThis, data, 'PM25')).toBe(null);
        });

        it('should return sensor value when found', () => {
            const data = {
                current: {
                    values: [
                        { name: 'PM25', value: 25 },
                        { name: 'PM10', value: 50 },
                    ],
                },
            };
            expect(getSensor.call(mockThis, data, 'PM25')).toBe(25);
            expect(getSensor.call(mockThis, data, 'PM10')).toBe(50);
        });

        it('should return null if value is not a number', () => {
            const data = { current: { values: [{ name: 'PM25', value: 'invalid' }] } };
            expect(getSensor.call(mockThis, data, 'PM25')).toBe(null);
        });
    });

    describe('getIndexValue', () => {
        const getIndex = AirAccessory.prototype.getIndexValue;

        it('should return 0 for invalid data', () => {
            const mockThis = createMockThis();
            expect(getIndex.call(mockThis, null)).toBe(0);
            expect(getIndex.call(mockThis, {})).toBe(0);
            expect(getIndex.call(mockThis, { current: {} })).toBe(0);
            expect(getIndex.call(mockThis, { current: { indexes: [] } })).toBe(0);
        });

        it('should return index value when found', () => {
            const mockThis = createMockThis();
            const data = { current: { indexes: [{ value: 75 }] } };
            expect(getIndex.call(mockThis, data)).toBe(75);
        });

        it('should log warning for no sensors in area', () => {
            const mockThis = createMockThis();
            const data = {
                current: {
                    indexes: [{ description: 'There are no Airly sensors in this area yet.' }],
                },
            };
            expect(getIndex.call(mockThis, data)).toBe(0);
            expect(mockThis.log.warn).toHaveBeenCalled();
        });
    });

    describe('generateSerialNumber', () => {
        const generate = AirAccessory.prototype.generateSerialNumber;

        it('should generate serial number with correct format', () => {
            const mockThis = createMockThis({ latitude: 52.2297, longitude: 21.0122 });
            const serial = generate.call(mockThis);
            expect(serial).toMatch(/^AIR2-[0-9A-F]{8}$/);
        });

        it('should generate different serials for different locations', () => {
            const mockThis1 = createMockThis({ latitude: 52.2297, longitude: 21.0122 });
            const mockThis2 = createMockThis({ latitude: 50.0647, longitude: 19.9450 });
            const serial1 = generate.call(mockThis1);
            const serial2 = generate.call(mockThis2);
            expect(serial1).not.toBe(serial2);
        });

        it('should generate same serial for same location', () => {
            const mockThis1 = createMockThis({ latitude: 52.2297, longitude: 21.0122 });
            const mockThis2 = createMockThis({ latitude: 52.2297, longitude: 21.0122 });
            expect(generate.call(mockThis1)).toBe(generate.call(mockThis2));
        });
    });

    describe('buildApiUrl', () => {
        const buildUrl = AirAccessory.prototype.buildApiUrl;

        it('should build correct URL with parameters', () => {
            const mockThis = createMockThis({
                latitude: 52.2297,
                longitude: 21.0122,
                maxDistance: 5,
            });
            const url = buildUrl.call(mockThis);
            expect(url).toBe(
                'https://airapi.airly.eu/v2/measurements/nearest?indexType=AIRLY_CAQI&lat=52.2297&lng=21.0122&maxDistanceKM=5'
            );
        });

        it('should properly encode special characters', () => {
            const mockThis = createMockThis({
                latitude: 52.2297,
                longitude: 21.0122,
                maxDistance: 5,
            });
            const url = buildUrl.call(mockThis);
            expect(url).toContain('lat=52.2297');
            expect(url).toContain('lng=21.0122');
        });
    });

    describe('AirAccessory constructor', () => {
        let mockLog;
        let mockConfig;
        let mockHbApi;

        beforeEach(() => {
            mockLog = createMockLog();
            mockConfig = {
                name: 'Test Air Sensor',
                apikey: 'test-api-key',
                latitude: 52.2297,
                longitude: 21.0122,
                maxdistance: 5,
                refreshinterval: 15,
            };
            mockHbApi = createMockHomebridgeApi();
            // Reinitialize to set up HAP globals
            pluginInit(mockHbApi);
        });

        it('should throw error when apikey is missing', () => {
            delete mockConfig.apikey;
            expect(() => new AirAccessory(mockLog, mockConfig, mockHbApi)).toThrow('apikey is missing');
        });

        it('should throw error when latitude is missing', () => {
            delete mockConfig.latitude;
            expect(() => new AirAccessory(mockLog, mockConfig, mockHbApi)).toThrow('latitude is missing');
        });

        it('should throw error when longitude is missing', () => {
            delete mockConfig.longitude;
            expect(() => new AirAccessory(mockLog, mockConfig, mockHbApi)).toThrow('longitude is missing');
        });

        it('should use default name when not provided', () => {
            delete mockConfig.name;
            const accessory = new AirAccessory(mockLog, mockConfig, mockHbApi);
            expect(accessory.name).toBe('Air2');
        });

        it('should use default maxDistance when invalid', () => {
            delete mockConfig.maxdistance;
            const accessory = new AirAccessory(mockLog, mockConfig, mockHbApi);
            expect(accessory.maxDistance).toBe(3);
        });

        it('should initialize with correct values', () => {
            const accessory = new AirAccessory(mockLog, mockConfig, mockHbApi);
            expect(accessory.name).toBe('Test Air Sensor');
            expect(accessory.apikey).toBe('test-api-key');
            expect(accessory.latitude).toBe(52.2297);
            expect(accessory.longitude).toBe(21.0122);
            expect(accessory.maxDistance).toBe(5);
        });

        it('should accept key as alias for apikey', () => {
            delete mockConfig.apikey;
            mockConfig.key = 'alt-api-key';
            const accessory = new AirAccessory(mockLog, mockConfig, mockHbApi);
            expect(accessory.apikey).toBe('alt-api-key');
        });
    });

    describe('Polling', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        it('should stop polling when stopPolling is called', () => {
            const mockThis = createMockThis({
                refreshTimer: setInterval(() => {}, 1000),
            });
            AirAccessory.prototype.stopPolling.call(mockThis);
            expect(mockThis.refreshTimer).toBeUndefined();
        });

        it('should clear existing timer when startPolling is called again', () => {
            const mockThis = createMockThis({
                refreshIntervalSeconds: 900,
                refreshTimer: setInterval(() => {}, 1000),
                api: { on: jest.fn() },
            });
            mockThis.refreshMeasurement = jest.fn().mockResolvedValue();

            AirAccessory.prototype.startPolling.call(mockThis);
            expect(mockThis.refreshMeasurement).toHaveBeenCalled();
        });

        it('should register shutdown handler', () => {
            const onMock = jest.fn();
            const mockThis = createMockThis({
                refreshIntervalSeconds: 900,
                api: { on: onMock },
            });
            mockThis.refreshMeasurement = jest.fn().mockResolvedValue();

            AirAccessory.prototype.startPolling.call(mockThis);
            expect(onMock).toHaveBeenCalledWith('shutdown', expect.any(Function));
        });
    });

    describe('getAirData', () => {
        it('should return 0 and trigger refresh when no cache', async () => {
            const mockThis = createMockThis({ cache: null });
            mockThis.refreshMeasurement = jest.fn().mockResolvedValue();
            mockThis.getIndexValue = jest.fn();
            mockThis.transformAQI = jest.fn();

            const result = await AirAccessory.prototype.getAirData.call(mockThis);

            expect(result).toBe(0);
            expect(mockThis.refreshMeasurement).toHaveBeenCalled();
            expect(mockThis.airService.setCharacteristic).toHaveBeenCalled();
        });

        it('should return transformed AQI when cache exists', async () => {
            const mockThis = createMockThis({
                cache: { current: { indexes: [{ value: 50 }] } },
            });
            mockThis.getIndexValue = AirAccessory.prototype.getIndexValue;
            mockThis.transformAQI = AirAccessory.prototype.transformAQI;

            const result = await AirAccessory.prototype.getAirData.call(mockThis);

            expect(result).toBe(2); // 50 AQI = Good
        });
    });

    describe('httpGetJson (via refreshMeasurement)', () => {
        beforeEach(() => {
            jest.clearAllMocks();
        });

        it('should make HTTPS request with correct headers', async () => {
            const mockResponse = new EventEmitter();
            mockResponse.statusCode = 200;
            mockResponse.setEncoding = jest.fn();

            const mockRequest = new EventEmitter();
            mockRequest.end = jest.fn();
            mockRequest.setTimeout = jest.fn();

            https.request.mockImplementation((url, options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });

            const mockThis = createMockThis({
                refreshPromise: null,
            });
            mockThis.buildApiUrl = AirAccessory.prototype.buildApiUrl;
            mockThis.normalizeMeasurement = AirAccessory.prototype.normalizeMeasurement;
            mockThis.getIndexValue = AirAccessory.prototype.getIndexValue;
            mockThis.updateData = jest.fn();

            const refreshPromise = AirAccessory.prototype.refreshMeasurement.call(mockThis);

            // Simulate response
            mockResponse.emit('data', JSON.stringify({ current: { indexes: [{ value: 50 }] } }));
            mockResponse.emit('end');

            await refreshPromise;

            expect(https.request).toHaveBeenCalled();
            const callArgs = https.request.mock.calls[0];
            expect(callArgs[1].headers.apikey).toBe('test-api-key');
        });

        it('should handle HTTP errors', async () => {
            const mockResponse = new EventEmitter();
            mockResponse.statusCode = 500;
            mockResponse.setEncoding = jest.fn();

            const mockRequest = new EventEmitter();
            mockRequest.end = jest.fn();
            mockRequest.setTimeout = jest.fn();

            https.request.mockImplementation((url, options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });

            const mockHbApi = createMockHomebridgeApi();
            pluginInit(mockHbApi);

            const mockThis = createMockThis({
                refreshPromise: null,
            });
            mockThis.buildApiUrl = AirAccessory.prototype.buildApiUrl;

            const refreshPromise = AirAccessory.prototype.refreshMeasurement.call(mockThis);

            mockResponse.emit('data', 'Internal Server Error');
            mockResponse.emit('end');

            await expect(refreshPromise).rejects.toThrow();
            expect(mockThis.log.error).toHaveBeenCalled();
        });

        it('should deduplicate concurrent requests', async () => {
            const mockResponse = new EventEmitter();
            mockResponse.statusCode = 200;
            mockResponse.setEncoding = jest.fn();

            const mockRequest = new EventEmitter();
            mockRequest.end = jest.fn();
            mockRequest.setTimeout = jest.fn();

            https.request.mockImplementation((url, options, callback) => {
                callback(mockResponse);
                return mockRequest;
            });

            const mockThis = createMockThis({
                refreshPromise: null,
            });
            mockThis.buildApiUrl = AirAccessory.prototype.buildApiUrl;
            mockThis.normalizeMeasurement = AirAccessory.prototype.normalizeMeasurement;
            mockThis.getIndexValue = AirAccessory.prototype.getIndexValue;
            mockThis.updateData = jest.fn();

            // Start first request - this sets refreshPromise
            const promise1 = AirAccessory.prototype.refreshMeasurement.call(mockThis);

            // refreshPromise should now be set
            expect(mockThis.refreshPromise).not.toBeNull();
            const storedPromise = mockThis.refreshPromise;

            // Start second request - should return existing promise from refreshPromise
            const promise2 = AirAccessory.prototype.refreshMeasurement.call(mockThis);

            // refreshPromise should still be the same object (not replaced)
            expect(mockThis.refreshPromise).toBe(storedPromise);

            mockResponse.emit('data', JSON.stringify({ current: { indexes: [{ value: 50 }] } }));
            mockResponse.emit('end');

            await Promise.all([promise1, promise2]);

            // Should only make one HTTP request (deduplication worked)
            expect(https.request).toHaveBeenCalledTimes(1);

            // refreshPromise should be cleared after completion
            expect(mockThis.refreshPromise).toBeNull();
        });
    });

    describe('updateData', () => {
        it('should return 0 for invalid measurement', () => {
            const mockThis = createMockThis();
            mockThis.normalizeMeasurement = AirAccessory.prototype.normalizeMeasurement;

            const result = AirAccessory.prototype.updateData.call(mockThis, null, 'Fetch');
            expect(result).toBe(0);
            expect(mockThis.log.warn).toHaveBeenCalled();
        });

        it('should update cache and characteristics', () => {
            const mockThis = createMockThis();
            mockThis.normalizeMeasurement = AirAccessory.prototype.normalizeMeasurement;
            mockThis.getSensorValue = AirAccessory.prototype.getSensorValue;
            mockThis.getIndexValue = AirAccessory.prototype.getIndexValue;

            const data = {
                current: {
                    values: [
                        { name: 'PM25', value: 25 },
                        { name: 'PM10', value: 50 },
                    ],
                    indexes: [{ value: 75 }],
                },
            };

            const result = AirAccessory.prototype.updateData.call(mockThis, data, 'Fetch');

            expect(result).toBe(75);
            expect(mockThis.cache).toEqual(data);
            expect(mockThis.airService.setCharacteristic).toHaveBeenCalled();
        });

        it('should update lastupdate only on Fetch', () => {
            const mockThis = createMockThis({ lastupdate: 0 });
            mockThis.normalizeMeasurement = AirAccessory.prototype.normalizeMeasurement;
            mockThis.getSensorValue = AirAccessory.prototype.getSensorValue;
            mockThis.getIndexValue = AirAccessory.prototype.getIndexValue;

            const data = { current: { values: [], indexes: [{ value: 50 }] } };

            AirAccessory.prototype.updateData.call(mockThis, data, 'Fetch');
            expect(mockThis.lastupdate).toBeGreaterThan(0);

            mockThis.lastupdate = 0;
            AirAccessory.prototype.updateData.call(mockThis, data, 'Cache');
            expect(mockThis.lastupdate).toBe(0);
        });
    });
});
