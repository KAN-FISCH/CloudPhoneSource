# Redemption Code API Documentation

## Overview
The redemption code system allows you to generate and redeem codes for cloud phone devices.

## API Endpoints

### 1. Generate Redemption Code
**Endpoint:** `POST http://localhost:8080/api/redemption/generate`

**Description:** Generates a unique redemption code for a specific tier and duration.

**Request Body:**
```json
{
  "tier": "ram4gb",     // Options: ram4gb, ram6gb, ram8gb
  "duration": "7h",     // Examples: 7h (7 hours), 24h (24 hours), 7d (7 days)
  "type": "new"         // Options: "new" (for new device) or "extend" (for extending existing)
}
```

**Example cURL:**
```bash
# Generate code for 4GB RAM, 7 hours, new device
curl -X POST http://localhost:8080/api/redemption/generate \
  -H "Content-Type: application/json" \
  -d '{"tier":"ram4gb","duration":"7h","type":"new"}'

# Generate code for 6GB RAM, 24 hours
curl -X POST http://localhost:8080/api/redemption/generate \
  -H "Content-Type: application/json" \
  -d '{"tier":"ram6gb","duration":"24h","type":"new"}'

# Generate code for extension (7 days)
curl -X POST http://localhost:8080/api/redemption/generate \
  -H "Content-Type: application/json" \
  -d '{"tier":"ram4gb","duration":"7d","type":"extend"}'
```

**Response:**
```json
{
  "success": true,
  "code": "A1B2C3D4E5F6G7H8",
  "tier": "ram4gb",
  "duration": "7h",
  "type": "new",
  "expires": "2025-01-20T10:30:00Z"
}
```

### 2. Redeem Code for New Device
**Endpoint:** `POST http://localhost:8080/api/redemption/redeem/new`

**Description:** Redeem a code to get a new cloud phone device.

**Request Body:**
```json
{
  "code": "A1B2C3D4E5F6G7H8"
}
```

**Example cURL:**
```bash
curl -X POST http://localhost:8080/api/redemption/redeem/new \
  -H "Content-Type: application/json" \
  -H "Cookie: auth-session=YOUR_SESSION_COOKIE" \
  -d '{"code":"A1B2C3D4E5F6G7H8"}'
```

**Response:**
```json
{
  "success": true,
  "message": "Kode penukaran berhasil! Ponsel Cloud baru telah ditambahkan",
  "device": "DEVICE-UDID",
  "streamUrl": "http://127.0.0.1:8000/?token=TOKEN",
  "expiresAt": "2025-12-21T15:00:00Z"
}
```

### 3. Redeem Code to Extend Device
**Endpoint:** `POST http://localhost:8080/api/redemption/redeem/extend`

**Description:** Redeem a code to extend an existing device subscription.

**Request Body:**
```json
{
  "code": "A1B2C3D4E5F6G7H8",
  "device_udid": "DEVICE-UDID"
}
```

**Example cURL:**
```bash
curl -X POST http://localhost:8080/api/redemption/redeem/extend \
  -H "Content-Type: application/json" \
  -H "Cookie: auth-session=YOUR_SESSION_COOKIE" \
  -d '{"code":"A1B2C3D4E5F6G7H8","device_udid":"NERO"}'
```

**Response:**
```json
{
  "success": true,
  "message": "Perangkat NERO berhasil diperpanjang!",
  "expiresAt": "2025-12-28T15:00:00Z"
}
```

## Quick Examples

### Generate Code for 4GB RAM, 7 hours
```bash
curl -X POST http://localhost:8080/api/redemption/generate \
  -H "Content-Type: application/json" \
  -d '{"tier":"ram4gb","duration":"7h","type":"new"}'
```

### Generate Code for 8GB RAM, 1 day
```bash
curl -X POST http://localhost:8080/api/redemption/generate \
  -H "Content-Type: application/json" \
  -d '{"tier":"ram8gb","duration":"24h","type":"new"}'
```

## Error Responses

**Invalid Code:**
```json
{
  "success": false,
  "message": "Kode penukaran tidak valid atau tidak ditemukan"
}
```

**Code Already Used:**
```json
{
  "success": false,
  "message": "Kode penukaran sudah digunakan"
}
```

**Code Expired:**
```json
{
  "success": false,
  "message": "Kode penukaran sudah kadaluarsa"
}
```

**No Devices Available:**
```json
{
  "success": false,
  "message": "Gagal mengalokasikan perangkat: no devices available"
}
```

## Duration Format
- `7h` = 7 hours
- `24h` = 24 hours
- `7d` = 7 days
- `30d` = 30 days

## Tier Options
- `ram4gb` = 4GB RAM device
- `ram6gb` = 6GB RAM device
- `ram8gb` = 8GB RAM device

## Code Properties
- **Unique**: Each code is generated uniquely
- **Expiry**: Codes expire 30 days after generation
- **Single Use**: Each code can only be used once
- **Type-Specific**: Codes are either for "new" devices or "extend" existing ones
