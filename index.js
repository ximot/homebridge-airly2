var request = require('request');
var Service, Characteristic, airService, Accessory;

module.exports = function (homebridge) {
    console.log("homebridge API version: " + homebridge.version);
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerAccessory("homebridge-airly2", "Air2", AirAccessory, true);
}

function AirAccessory(log, config) {
    log("Runing Air2");
    this.config = config;
    // Set configuration
    this.log = log;
    this.name = config['name'];
    this.apikey = config['key'];
    this.latitude = config['latitude'];
    this.longitude = config['longitude'];
    this.maxDistance = config['maxdistance'];


    // Check configuration
    if (!this.apikey) throw new Error("Configuration of apikay is missing. Check configuration file.");
    if (!this.latitude) throw new Error("Configuration od latitude is missing!. Check configuration file.");
    if (!this.longitude) throw new Error("Configuration od longitude is missing!. Check configuration file.");
    if (!this.maxDistance) { this.maxDistance = 3 } // Set default value of 3 km 

    this.lastupdate = 0;
    this.cache = undefined;
    this.log.info("Airly API v2 is working");

}

AirAccessory.prototype = {
    getAirData: function (callback) {
        var self = this;
        var aqi = 0;
        var url = 'https://airapi.airly.eu/v2/measurements/nearest?indexType=AIRLY_CAQI&lat=' + this.latitude + '&lng=' + this.longitude + '&maxDistanceKM=' + this.maxDistance;
    
    if (this.lastupdate === 0 || this.lastupdate + 600 < (new Date().getTime() / 1000) || this.cache === undefined) {
        request({
            url: url,
            json: true,
            headers: {
                'apikey': self.apikey
            }
        }, function(error, response, data) {
            if (!error && response.statusCode === 200){
                aqi = self.updateData(data, 'Fetch');
                callback(null, self.transformAQI(aqi));
            } else {
                airService.setCharacteristic(Characteristic.StatusFault, 1);
                self.log.error("Error reading data from Airly Network");
                callback(error);
            }
        
        });
    }
    else {
        aqi = self.updateData(self.cache, 'Cache');
        callback(null, self.transformAQI(aqi));
    }
    
    
    
    },

    updateData: function (data, type) {
        airService.setCharacteristic(Characteristic.StatusFault, 0);
        //console.log(data.current.values[1].value);
        airService.setCharacteristic(Characteristic.PM2_5Density, data.current.values[1].value);
        airService.setCharacteristic(Characteristic.PM10Density, data.current.values[2].value);
        var aqi = data.current.indexes[0].value;
        this.cache = data;

        if (type === 'Fetch') {
            this.lastupdate = new Date().getTime() / 1000;
        }
        return aqi;
    },


    transformAQI: function(aqi){
        if (!aqi) {
            return (0); // Error or unknown response
        } else if (aqi <= 25) {
            return (1); // Return EXCELLENT
        } else if (aqi > 25 && aqi <= 50) {
            return (2); // Return GOOD
        } else if (aqi > 50 && aqi <= 75) {
            return (3); // Return FAIR
        } else if (aqi > 75 && aqi <= 100) {
            return (4); // Return INFERIOR
        } else if (aqi > 100) {
            return (5); // Return POOR (Homekit only goes to cat 5, so combined the last two AQI cats of Very Unhealty and Hazardous.
        } else {
            return (0); // Error or unknown response.
        }
    },
    getServices: function () {
        var services = [];

        /**
         * Informations
         */
        var informationService = new Service.AccessoryInformation();
        informationService
            .setCharacteristic(Characteristic.Manufacturer, "Airly")
            .setCharacteristic(Characteristic.Model, "API v2")
            .setCharacteristic(Characteristic.SerialNumber, "123-456");
        services.push(informationService);

        /**
         * AirService
         */
        airService = new Service.AirQualitySensor(this.name);

        airService
            .getCharacteristic(Characteristic.AirQuality)
            .on('get', this.getAirData.bind(this));

        airService.addCharacteristic(Characteristic.StatusFault);
        airService.addCharacteristic(Characteristic.PM2_5Density);
        airService.addCharacteristic(Characteristic.PM10Density);
        services.push(airService);


        return services;
    }
};