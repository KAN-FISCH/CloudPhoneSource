import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'database.sqlite');
const db = new Database(dbPath, { verbose: console.log });

// Initialize tables
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    name TEXT,
    password TEXT,
    role TEXT DEFAULT 'user',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    order_id TEXT UNIQUE,
    amount INTEGER,
    plan TEXT,
    status TEXT,
    is_allocated BOOLEAN DEFAULT 0,
    renew_sub_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS subscriptions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    device_udid TEXT,
    order_id TEXT,
    token TEXT,
    stream_url TEXT,
    expires_at DATETIME,
    active BOOLEAN DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    roblox_private_server_url TEXT,
    FOREIGN KEY(user_id) REFERENCES users(id)
  );
`);

try {
    db.exec('ALTER TABLE subscriptions ADD COLUMN roblox_private_server_url TEXT;');
} catch (e) {
    // Ignore if column already exists
}

try {
    db.exec('ALTER TABLE transactions ADD COLUMN renew_sub_id INTEGER;');
} catch (e) { }

try {
    db.exec('ALTER TABLE subscriptions ADD COLUMN roblox_auto_execute_script TEXT;');
} catch (e) {
    // Ignore if column already exists
}

export interface User {
    id: number;
    email: string;
    name: string;
    password?: string;
    role: string;
}

export interface Transaction {
    id: number;
    user_id: number;
    order_id: string;
    amount: number;
    plan: string;
    status: string;
    is_allocated: number;
    renew_sub_id?: number;
    qris_url?: string;
    payment_url?: string;
}

export interface Subscription {
    id: number;
    user_id: number;
    device_udid: string;
    order_id: string;
    token: string;
    stream_url: string;
    expires_at: string;
    active: number;
    roblox_private_server_url?: string;
    roblox_auto_execute_script?: string;
}

// User Methods
export function getUserByEmail(email: string): User | undefined {
    return db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User;
}

export function getUserById(id: number): User | undefined {
    return db.prepare('SELECT * FROM users WHERE id = ?').get(id) as User;
}

export function createUser(email: string, name: string, passwordHash: string): number | bigint {
    const result = db.prepare('INSERT INTO users (email, name, password) VALUES (?, ?, ?)')
        .run(email, name, passwordHash);
    return result.lastInsertRowid;
}

// Transaction Methods
export function createTransaction(userId: number, orderId: string, amount: number, plan: string, renewSubId?: number): number | bigint {
    const result = db.prepare('INSERT INTO transactions (user_id, order_id, amount, plan, status, renew_sub_id) VALUES (?, ?, ?, ?, ?, ?)')
        .run(userId, orderId, amount, plan, 'PENDING', renewSubId || null);
    return result.lastInsertRowid;
}

export function updateTransactionStatus(orderId: string, status: string): void {
    db.prepare('UPDATE transactions SET status = ? WHERE order_id = ?').run(status, orderId);
}

export function getTransactionByOrderId(orderId: string): Transaction | undefined {
    return db.prepare('SELECT * FROM transactions WHERE order_id = ?').get(orderId) as Transaction;
}

export function getPendingTransactionByUserId(userId: number): Transaction | undefined {
    return db.prepare('SELECT * FROM transactions WHERE user_id = ? AND status = ? ORDER BY created_at DESC').get(userId, 'PENDING') as Transaction;
}

export function getAllTransactionsByUserId(userId: number): Transaction[] {
    return db.prepare('SELECT * FROM transactions WHERE user_id = ? ORDER BY created_at DESC').all(userId) as Transaction[];
}

export function updateTransactionPaymentUrls(orderId: string, qrisUrl: string, paymentUrl: string): void {
    db.prepare('UPDATE transactions SET qris_url = ?, payment_url = ? WHERE order_id = ?').run(qrisUrl, paymentUrl, orderId);
}

export function markTransactionAllocated(orderId: string): void {
    db.prepare('UPDATE transactions SET is_allocated = 1 WHERE order_id = ?').run(orderId);
}

// Subscription Methods
export function createSubscription(userId: number, deviceUdid: string, orderId: string, token: string, streamUrl: string, expiresAt: string): number | bigint {
    const result = db.prepare('INSERT INTO subscriptions (user_id, device_udid, order_id, token, stream_url, expires_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(userId, deviceUdid, orderId, token, streamUrl, expiresAt);
    return result.lastInsertRowid;
}

export function getSubscriptionByToken(token: string): Subscription | undefined {
    return db.prepare("SELECT * FROM subscriptions WHERE token = ? AND active = 1 AND datetime(expires_at) > datetime('now')").get(token) as Subscription;
}

export function getSubscriptionById(id: number): Subscription | undefined {
    return db.prepare("SELECT * FROM subscriptions WHERE id = ?").get(id) as Subscription;
}

export function deactivateSubscription(id: number): void {
    db.prepare("UPDATE subscriptions SET active = 0 WHERE id = ?").run(id);
}

export function getActiveSubscriptionsByUserId(userId: number): Subscription[] {
    return db.prepare("SELECT * FROM subscriptions WHERE user_id = ? AND active = 1 AND datetime(expires_at) > datetime('now') ORDER BY created_at DESC").all(userId) as Subscription[];
}

export function getAllActiveSubscriptions(): Subscription[] {
    return db.prepare("SELECT * FROM subscriptions WHERE active = 1 AND datetime(expires_at) > datetime('now')").all() as Subscription[];
}

export function getAllAllocatedSubscriptions(): Subscription[] {
    return db.prepare("SELECT * FROM subscriptions WHERE active >= 1 AND datetime(expires_at) > datetime('now')").all() as Subscription[];
}

export function createPendingSubscription(userId: number, deviceUdid: string, orderId: string, token: string, streamUrl: string, expiresAt: string): number | bigint {
    const result = db.prepare('INSERT INTO subscriptions (user_id, device_udid, order_id, token, stream_url, expires_at, active) VALUES (?, ?, ?, ?, ?, ?, 2)')
        .run(userId, deviceUdid, orderId, token, streamUrl, expiresAt);
    return result.lastInsertRowid;
}

export function getSubscriptionByOrderId(orderId: string): Subscription | undefined {
    return db.prepare('SELECT * FROM subscriptions WHERE order_id = ?').get(orderId) as Subscription;
}

export function activateSubscriptionByOrderId(orderId: string, expiresAt: string): void {
    db.prepare('UPDATE subscriptions SET active = 1, expires_at = ? WHERE order_id = ?').run(expiresAt, orderId);
}

export function extendSubscription(id: number, days: number): void {
    // Add days to the current expires_at
    db.prepare("UPDATE subscriptions SET expires_at = datetime(expires_at, '+' || ? || ' days') WHERE id = ?").run(days, id);
}

export function updateSubscriptionRobloxSettings(id: number, url: string | null, script: string | null): void {
    db.prepare('UPDATE subscriptions SET roblox_private_server_url = ?, roblox_auto_execute_script = ? WHERE id = ?').run(url, script, id);
}

export default db;
