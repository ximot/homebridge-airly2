# Testing Guide

This document describes how to test the homebridge-airly2 plugin locally before publishing.

## Prerequisites

- Node.js 20.7+
- Homebridge installed locally or via hb-service
- Airly API key (get one at https://developer.airly.eu)

## 1. Unit Tests

Run automated tests before any manual testing:

```bash
# Run all tests
npm test

# Run tests with coverage report
npm run test:coverage
```

All 53 tests should pass before proceeding to manual testing.

## 2. Local Installation

### Option A: Using npm link (recommended for development)

```bash
# In the plugin directory
cd /path/to/homebridge-airly2
npm install
npm link

# In your Homebridge installation directory
cd ~/.homebridge  # or wherever your Homebridge is installed
npm link homebridge-airly2
```

### Option B: Install directly from local path

```bash
# In Homebridge directory
npm install /path/to/homebridge-airly2
```

### Option C: Using hb-service

```bash
# Stop Homebridge service first
sudo hb-service stop

# Link the plugin
cd /path/to/homebridge-airly2
npm link
sudo hb-service link homebridge-airly2

# Restart Homebridge
sudo hb-service start
```

## 3. Configuration

Add the accessory to your `config.json`:

```json
{
  "accessories": [
    {
      "accessory": "Air2",
      "name": "Test Air Quality",
      "apikey": "YOUR_AIRLY_API_KEY",
      "latitude": "52.2297",
      "longitude": "21.0122",
      "maxdistance": 5,
      "refreshinterval": 15
    }
  ]
}
```

**Test coordinates examples:**
- Warsaw, Poland: `52.2297, 21.0122`
- Krakow, Poland: `50.0647, 19.9450`
- Use https://www.latlong.net to find coordinates near Airly sensors

## 4. Running Homebridge

### Standalone (debug mode)

```bash
# Run with debug output
DEBUG=* homebridge -D -U ~/.homebridge

# Or just run normally
homebridge -U ~/.homebridge
```

### Using hb-service

```bash
# View logs
sudo hb-service logs

# Or follow logs in real-time
sudo hb-service logs -f
```

## 5. What to Verify

### Startup Checks
- [ ] Plugin loads without errors
- [ ] Log shows: `Airly API v2 accessory initialized`
- [ ] Log shows polling interval: `Polling Airly every X minutes`

### API Communication
- [ ] First measurement is fetched successfully
- [ ] Log shows: `Parsed Airly measurement AIRLY_CAQI=XX`
- [ ] No `StatusFault` errors in HomeKit

### HomeKit Integration
- [ ] Accessory appears in Home app
- [ ] Air Quality value is displayed (1-5 scale)
- [ ] PM2.5 and PM10 values are shown in accessory details

### Error Handling
- [ ] Invalid API key shows clear error message
- [ ] Invalid coordinates show validation error
- [ ] Network timeout is handled gracefully (30s timeout)

## 6. Testing Edge Cases

### Invalid Configuration

Test that these configurations fail with clear error messages:

```json
// Missing API key - should throw error
{ "accessory": "Air2", "latitude": "52.2297", "longitude": "21.0122" }

// Invalid latitude - should throw error
{ "accessory": "Air2", "apikey": "xxx", "latitude": "999", "longitude": "21.0122" }

// Invalid longitude - should throw error
{ "accessory": "Air2", "apikey": "xxx", "latitude": "52.2297", "longitude": "-999" }
```

### MaxDistance Validation

```json
// Should cap to 50km and log warning
{ "accessory": "Air2", "apikey": "xxx", "latitude": "52.2297", "longitude": "21.0122", "maxdistance": 100 }
```

### No Sensors in Area

Test with coordinates far from any Airly sensors:
- Should log warning about no sensors
- Should return AQI = 0 (Unknown)

## 7. Cleanup After Testing

### Remove npm link

```bash
# In Homebridge directory
npm unlink homebridge-airly2

# In plugin directory
npm unlink
```

### Restore production plugin

```bash
npm install -g homebridge-airly2
```

## 8. Common Issues

### Plugin not loading
- Check Node.js version: `node -v` (must be 20.7+)
- Check Homebridge version: `homebridge -V` (must be 1.6+)
- Verify config.json syntax is valid JSON

### API errors
- Verify API key is valid at https://developer.airly.eu
- Check if you've exceeded 100 requests/day quota
- Verify coordinates are within Airly coverage area

### HomeKit not updating
- Wait for refresh interval (default 15 minutes)
- Check logs for polling errors
- Restart Homebridge to force immediate refresh

## 9. Before Merging

Checklist before merging changes to main branch:

- [ ] All unit tests pass (`npm test`)
- [ ] Manual testing completed in Homebridge
- [ ] Accessory works in Home app
- [ ] No errors in Homebridge logs
- [ ] Documentation updated if needed
