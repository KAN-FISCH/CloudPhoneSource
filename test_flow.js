const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function runTestFlow() {
    console.log('🚀 Memulai Test Flow WS-ADB-WEB...\n');

    try {
        // 1. REGISTER
        console.log('1️⃣ Mencoba Register...');
        let cookie = '';
        try {
            const regRes = await axios.post(`${BASE_URL}/api/auth/register`, {
                email: 'test@example.com',
                password: 'password123',
                name: 'Tester'
            });
            console.log('✅ Register berhasil:', regRes.data);
            if (regRes.headers['set-cookie']) {
                cookie = regRes.headers['set-cookie'][0];
            }
        } catch (e) {
            if (e.response && e.response.status === 400 && e.response.data.error === 'User already exists') {
                console.log('ℹ️ User sudah ada, lanjut ke Login.');
            } else {
                throw e;
            }
        }

        // 2. LOGIN
        console.log('\n2️⃣ Mencoba Login...');
        const loginRes = await axios.post(`${BASE_URL}/api/auth/login`, {
            email: 'test@example.com',
            password: 'password123'
        });
        console.log('✅ Login berhasil:', loginRes.data);
        cookie = loginRes.headers['set-cookie'][0];

        // 3. PURCHASE (Pilih plan)
        console.log('\n3️⃣ Membuat order / Checkout (Plan: 1_hour)...');
        const purchaseRes = await axios.post(`${BASE_URL}/api/payment/purchase`, {
            plan: '1_hour'
        }, { headers: { Cookie: cookie } });

        console.log('✅ Order Payment Link (Dummy Checkout URL):', purchaseRes.data.paymentUrl);

        // Ambil order_id dari dummy url param
        const url = new URL(purchaseRes.data.paymentUrl);
        const orderId = url.searchParams.get('order_id');
        console.log(`📌 Order ID: ${orderId}`);

        // 4. SIMULASI BAYAR SUCCESS
        console.log('\n4️⃣ Simulasi User Membayar via Payment Gateway...');
        // Kita panggil dummy endpoint yang otomatis merubah statusnya
        await axios.get(`${BASE_URL}/api/payment/dummy-checkout?order_id=${orderId}`, {
            maxRedirects: 0, validateStatus: () => true
        });
        console.log('✅ Status transaksi berhasil diupdate menjadi SUCCESS.');

        // 5. ALLOCATE DEVICE
        console.log('\n5️⃣ Mengalokasikan Device ADB untuk transaksi ini...');
        try {
            const allocateRes = await axios.post(`${BASE_URL}/api/device/allocate`, {
                order_id: orderId
            }, { headers: { Cookie: cookie } });

            console.log('✅ Device Berhasil Dialokasikan!');
            console.log('🎉 Data Alokasi:', allocateRes.data);
            console.log(`\n🔗 LINK AKSES DEVICE ANDA:`);
            console.log(`${BASE_URL}${allocateRes.data.streamUrl}`);
        } catch (allocError) {
            if (allocError.response) {
                console.error('❌ Gagal mengalokasikan: Server merespon', allocError.response.data);
                console.error('💡 NOTE: Pastikan ada minimal 1 HP/Device Android yang tertancap di PC Desktop/Server hosting Anda.');
            } else {
                console.error('❌ Error saat mengalokasikan:', allocError.message);
            }
        }

    } catch (error) {
        if (error.response) {
            console.error('❌ Terjadi Error di Server:', error.response.status, error.response.data);
        } else {
            console.error('❌ Gagal menjalankan test:', error.message);
        }
    }
}

runTestFlow();
