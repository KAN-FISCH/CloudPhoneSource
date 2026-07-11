# CloudPhone Web Client and Gateway

A web-based Android streaming and rental platform. This system enables users to rent Android devices, control them in the browser via low-latency screen sharing (powered by Scrcpy and WebRTC/WebSockets), make automated payments using the Pakasir Payment Gateway, and redeem custom vouchers.

---

## 1. System Architecture

The project is split into two primary components: the **Go Gateway & Billing Backend** and the **Next.js & Node.js Streaming Client**.

### Architecture Diagram
```mermaid
graph TD
    User([Browser Client]) -->|HTTP / WebRTC| NextJS[Next.js Frontend & Node.js Server]
    User -->|OAuth / Checkout| GoBackend[Go API Gateway & Billing]
    NextJS -->|ADB / Websocket| ADB[ADB Daemon]
    ADB -->|TCP / Scrcpy| Android[Android Devices]
    GoBackend -->|GORM / SQLite| DB[(webapp.db)]
    GoBackend -->|Webhooks| Pakasir[Pakasir Payment Gateway]
```

### Component Details
| Component | Directory | Port | Technology Stack | Key Responsibilities |
| :--- | :--- | :--- | :--- | :--- |
| **Go Backend Gateway** | `/frontend` | `8080` | Go, SQLite (GORM), Gorilla Sessions, Goth | User sessions, Google OAuth authentication, billing gateway API, voucher redemption logic |
| **Next.js Client** | `/app`, `/components` | `3000` | Next.js, React, TailwindCSS, Framer Motion | Modern dashboard UI, device specs view, device rent/interaction page |
| **Node.js ADB Proxy** | `/server.ts`, `/lib` | `8000` | Node.js, WebSockets, `@yume-chan/scrcpy` | ADB daemon communication, WebSocket proxy for Scrcpy stream, screen control translation |

---

## 2. Key Features

- **Low-Latency Screen Streaming**: High-quality video feed using WebRTC or Webcodecs decoding directly inside the browser window.
- **Interactive Device Control**: Mouse, touch, scroll, and keyboard events are translated and sent to the remote Android device. Includes full clipboard synchronization.
- **Automated Payment Integration**: Immediate checkout flow integrated with the Pakasir API (QRIS, bank transfers, etc.).
- **Voucher Redemption System**: A system to rent devices or extend current subscriptions by hardware tier (4GB, 6GB, 8GB RAM).
- **Secure Authentication**: Google OAuth integrated via the Go Goth library.

---

## 3. Installation and Setup

### Prerequisites
The following software must be installed on the host system:
- **Node.js** (Version 18 or higher)
- **Go** (Version 1.20 or higher)
- **Android SDK Platform Tools** (with `adb` executable added to the system PATH)
- **SQLite 3**

### Step-by-Step Configuration

#### Step 1: Environment Variables Setup
Create a `.env` file in the root directory (and also copy it into the `frontend/` directory). This file is configured in `.gitignore` and will not be pushed to Git:
```env
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
GOOGLE_CLIENT_SECRET="your-google-oauth-client-secret"
```

#### Step 2: Go Gateway Setup
Navigate to the `frontend/` directory, install Go dependencies, and run the backend gateway:
```bash
cd frontend
go mod tidy
go run .
```
The Go backend services will be available at `http://localhost:8080`.

#### Step 3: Next.js and Node.js Server Setup
From the project root directory, install npm dependencies and run the Next.js/Node.js development server:
```bash
npm install
npm run dev
```
- The Next.js frontend client will run on `http://localhost:3000`.
- The Node.js WebSocket ADB proxy will run on `http://localhost:8000`.

---

## 4. API Reference

### Voucher Generation API
- **Endpoint**: `POST /api/redemption/generate`
- **Content-Type**: `application/json`
- **Parameters**:
  | Parameter | Type | Required | Description |
  | :--- | :--- | :--- | :--- |
  | `tier` | String | Yes | Hardware tier: `ram4gb`, `ram6gb`, `ram8gb` |
  | `duration` | String | Yes | Session duration: `7h`, `24h`, `7d`, `30d` |
  | `type` | String | Yes | Code category: `new` (create new device) or `extend` (renew) |

- **Request Example**:
  ```json
  {
    "tier": "ram4gb",
    "duration": "7h",
    "type": "new"
  }
  ```
- **Response Example**:
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

### Voucher Redemption API (New Device)
- **Endpoint**: `POST /api/redemption/redeem/new`
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "code": "YOUR_REDEMPTION_CODE"
  }
  ```
- **Response Example**:
  ```json
  {
    "success": true,
    "message": "Kode penukaran berhasil! Ponsel Cloud baru telah ditambahkan",
    "device": "DEVICE-UDID",
    "streamUrl": "http://127.0.0.1:8000/?token=TOKEN",
    "expiresAt": "2025-12-21T15:00:00Z"
  }
  ```

### Voucher Extension API (Extend Device Subscription)
- **Endpoint**: `POST /api/redemption/redeem/extend`
- **Content-Type**: `application/json`
- **Request Body**:
  ```json
  {
    "code": "YOUR_REDEMPTION_CODE",
    "device_udid": "DEVICE_SERIAL_UDID"
  }
  ```

---

## 5. Deployment and Security Standards

1. **Credentials Management**: Hardcoded API keys, database secrets, or Google OAuth keys must never be committed to Git. Always load secrets via `os.Getenv` or `process.env`.
2. **Ignored Patterns**: Ensure binary files (`.exe`, `.apk`, target build directories) and SQLite database files (`*.db`, `*.sqlite`) are listed in `.gitignore`.
3. **Database Security**: Keep the SQLite production database protected and verify write/read permissions on the server hosting `webapp.db`.

---

## 6. License
This software and documentation are proprietary and confidential. Unauthorized distribution is prohibited.
