
const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'database.sqlite');
const db = new Database(dbPath);

const orderId = process.argv[2];

if (!orderId) {
    console.error('Silakan masukkan Order ID. Contoh: node pay_order.js ORD-xxxx');
    process.exit(1);
}

try {
    const transaction = db.prepare('SELECT * FROM transactions WHERE order_id = ?').get(orderId);
    
    if (!transaction) {
        console.error(`Order ID ${orderId} tidak ditemukan.`);
        process.exit(1);
    }

    // Update status ke SUCCESS
    db.prepare('UPDATE transactions SET status = ? WHERE order_id = ?').run('SUCCESS', orderId);
    
    console.log(`✅ Sukses! Order ${orderId} sekarang berstatus SUCCESS.`);
    console.log(`Silakan kembali ke website dan klik 'Check Payment' atau refresh halaman.`);
} catch (error) {
    console.error('Terjadi kesalahan:', error.message);
} finally {
    db.close();
}
