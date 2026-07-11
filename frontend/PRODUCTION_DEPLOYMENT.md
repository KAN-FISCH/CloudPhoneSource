# PAKASIR Production Deployment Checklist

## ✅ Pre-Deployment

### 1. Update Production URL
- [x] `AppBaseURL` sudah set ke `https://nsphone.space`
- [x] `callback_url` di PAKASIR request: `AppBaseURL + "/api/pakasir/callback"`

### 2. Webhook Handler Ready
- [x] Route `/api/pakasir/callback` registered
- [x] Handle GET (redirect user to dashboard)
- [x] Handle POST (webhook notification dari PAKASIR)
- [x] Parse webhook JSON dan update transaction status

### 3. PAKASIR Dashboard Configuration
**PENTING! Konfigurasi di https://dashboard.doku.com**:

1. Login ke PAKASIR Dashboard (Sandbox)
2. Go to Settings → Webhook/Notification URL
3. Set webhook URL: `https://nsphone.space/api/pakasir/callback`
4. Enable notifications untuk:
   - ✅ Payment Success
   - ✅ Payment Failed  
   - ✅ Payment Expired

### 4. Known Iss ues (Localhost vs Production)
❌ **Localhost**: Webhook TIDAK work (PAKASIR server can't reach localhost)
✅ **Production**: Webhook WORK (PAKASIR can reach nsphone.space)

## 🚀 Deployment Steps

### Step 1: Build & Upload
```bash
cd "c:/Users/Admin/Documents/backend-ws-scracpy_frontend - Copy/frontend"

# Build for Linux (jika server Linux)
$env:GOOS="linux"
$env:GOARCH="amd64"
go build -o webapp-linux

# Upload ke server
scp webapp-linux user@nsphone.space:/path/to/app/
scp -r templates user@nsphone.space:/path/to/app/
scp -r static user@nsphone.space:/path/to/app/
scp webapp.db user@nsphone.space:/path/to/app/
```

### Step 2: Restart Service di Server
```bash
ssh user@nsphone.space
cd /path/to/app
./stop.sh  # atau systemctl stop webapp
./webapp-linux &  # atau systemctl start webapp
```

### Step 3: Test Production
1. Buka `https://nsphone.space/dashboard`
2. Create payment baru
3. Bayar via PAKASIR Simulator
4. Setelah success, PAKASIR akan kirim webhook ke backend
5. Check logs: `tail -f /var/log/webapp.log`
6. Status di dashboard harusnya auto-update ke "success"

## 📋 Webhook Payload dari PAKASIR

PAKASIR akan POST ke `/api/pakasir/callback` dengan body:
```json
{
  "order": {
    "invoice_number": "INV-xxx",
    "amount": 24000
  },
  "transaction": {
    "status": "SUCCESS"  // or "FAILED", "EXPIRED"
  }
}
```

Backend akan:
1. Parse JSON
2. Find transaction by `invoice_number`
3. Update `status` field
4. Return HTTP 200 OK

## 🔍 Troubleshooting

### Jika status tidak update setelah bayar:
1. Check server logs untuk webhook POST
2. Pastikan webhook URL di PAKASIR dashboard benar
3. Test webhook manual:
```bash
curl -X POST https://nsphone.space/api/pakasir/callback \
  -H "Content-Type: application/json" \
  -d '{"order":{"invoice_number":"INV-test"},"transaction":{"status":"SUCCESS"}}'
```

### Jika error di production:
- Check file permissions
- Check port 80/443 terbuka
- Check reverse proxy (nginx/caddy) config
- Check SSL certificate valid

## ✨ Success Criteria
- ✅ User bisa create payment
- ✅ PAKASIR popup muncul
- ✅ User bisa bayar
- ✅ Webhook diterima backend
- ✅ Status auto-update di dashboard
- ✅ Tidak ada error di logs
