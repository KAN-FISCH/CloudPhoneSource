## Pakasir Payment Integration - Temporary Solution

**Status:** Pakasir Sandbox Check Status API tidak work (return 404)

**Temporary Solution untuk Testing:**

1. **Auto-mark pending as success** saat user kembali dari payment page
2. Setelah bayar via simulator Pakasir, cukup:
   - Close popup Pakasir
   - Refresh dashboard
   - All pending transactions akan di-mark sebagai SUCCESS

**Cara Kerja:**
- Dashboard auto-check pending transactions setiap 10 detik
- Panggil `/api/fix-pending` yang akan mark semua pending sebagai success (sandbox mode)
- Show notification "✅ Payment Success!"
- Auto-reload page

**Production Implementation (TODO):**
- Implement Pakasir SNAP Check Status API dengan proper access token
- Endpoint: `POST /orders/v1.0/transfer-va/status` dengan SNAP signature
- Requires access token dari `/v1/access-token`
