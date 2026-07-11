const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(__dirname, 'database.sqlite');
const db = new Database(dbPath);

const emailToPromote = process.argv[2] || 'shieldteamid@gmail.com';

try {
    const result = db.prepare("UPDATE users SET role = 'admin' WHERE email = ?").run(emailToPromote);
    if (result.changes > 0) {
        console.log(`✅ Berhasil mengangkat user ${emailToPromote} menjadi Admin!`);
        console.log(`Silakan buka web dan login kembali. Area Local Devices sekarang akan terbuka.`);
    } else {
        console.log(`❌ User dengan email ${emailToPromote} tidak ditemukan di database.`);
    }
} catch (e) {
    console.error("Error:", e.message);
}
