const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.resolve(process.cwd(), 'database.sqlite');
const db = new Database(dbPath);

console.log('Resetting all device stocks...');
const result = db.prepare('UPDATE subscriptions SET active = 0 WHERE active > 0').run();
console.log(`Successfully restored stock for ${result.changes} devices!`);
