
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { WebSocketServer, WebSocket } from 'ws';
import { AdbServerClient } from './lib/adb-server';
import { createConnection, Socket } from 'net';
import { exec, spawn } from 'child_process';
import util from 'util';
import path from 'path';
import fs from 'fs';
import { config } from './config';

const execPromise = util.promisify(exec);

// --- Clipboard Keyboard Constants ---
const KEYBOARD_APK = path.join(process.cwd(), 'app-debug.apk');
const KEYBOARD_PKG = 'com.example.keyboardadb';
const KEYBOARD_IME = `${KEYBOARD_PKG}/.ClipboardSyncKeyboardService`;
const ADB_HOST = config.ADB_HOST;
const ADB_PORT = config.ADB_PORT;

// Map: serial → Set<WebSocket>  (clients listening to that device's clipboard)
const clipboardClients = new Map<string, Set<WebSocket>>();
// Map: serial → ChildProcess   (running logcat processes)
const logcatProcs = new Map<string, ReturnType<typeof spawn>>();

// --- ADB CLI helpers (use system adb pointing at remote server) ---
const adbCmd = (serial: string, ...args: string[]) =>
    ['adb', '-H', ADB_HOST, '-P', String(ADB_PORT), '-s', serial, ...args];

async function adbExec(serial: string, ...args: string[]): Promise<string> {
    const cmd = adbCmd(serial, ...args).join(' ');
    try {
        const { stdout } = await execPromise(cmd, { timeout: 30000 });
        return stdout.trim();
    } catch (e: any) {
        return e.stderr?.trim() || e.message;
    }
}

// --- Setup Clipboard Keyboard on a device ---
async function setupClipboardKeyboard(serial: string) {
    console.log(`[ClipboardKB] Setting up keyboard on ${serial}...`);
    const adbClient = new AdbServerClient();

    try {
        // 1. Check if APK exists on disk
        if (!fs.existsSync(KEYBOARD_APK)) {
            console.warn(`[ClipboardKB] APK not found at ${KEYBOARD_APK}, skipping install.`);
        } else {
            // 2. Check if already installed using AdbServerClient.shell()
            const installed = await adbClient.shell(serial, `pm list packages ${KEYBOARD_PKG}`);
            if (!installed.includes(KEYBOARD_PKG)) {
                console.log(`[ClipboardKB] Installing APK on ${serial}...`);
                // For install we still need adb CLI (sync push + install)
                await adbExec(serial, 'install', '-r', KEYBOARD_APK);
                console.log(`[ClipboardKB] APK installed on ${serial}.`);
                // Give device a moment to register the new package
                await new Promise(r => setTimeout(r, 1500));
            } else {
                console.log(`[ClipboardKB] APK already installed on ${serial}.`);
            }
        }

        // 3. Enable IME — using AdbServerClient.shell() which is proven reliable
        const enableResult = await adbClient.shell(serial, `ime enable ${KEYBOARD_IME}`);
        console.log(`[ClipboardKB] ime enable on ${serial}: ${enableResult.trim()}`);

        // 4. Set as active IME
        const setResult = await adbClient.shell(serial, `ime set ${KEYBOARD_IME}`);
        console.log(`[ClipboardKB] ime set on ${serial}: ${setResult.trim()}`);

        // Also disable other keyboards to ensure ours is used
        const disableOthersCmd = `ime list -s | grep -v "${KEYBOARD_PKG}" | while read line; do pkg=$(echo $line | cut -d/ -f1); pm disable-user --user 0 $pkg; done`;
        await adbClient.shell(serial, disableOthersCmd).catch(() => { });
        console.log(`[ClipboardKB] Disabled competing keyboards on ${serial}`);

    } catch (err: any) {
        console.error(`[ClipboardKB] Setup failed on ${serial}:`, err.message);
    }

    // 5. Start logcat listener (skip if already running)
    startClipboardLogcat(serial);
}


function startClipboardLogcat(serial: string) {
    if (logcatProcs.has(serial)) return;

    const args = ['-H', ADB_HOST, '-P', String(ADB_PORT), '-s', serial, 'logcat', '-s', 'CLIPBOARD_SYNC', '-v', 'raw'];
    const proc = spawn('adb', args, { stdio: ['ignore', 'pipe', 'ignore'] });
    logcatProcs.set(serial, proc);
    console.log(`[ClipboardKB] Logcat listener started for ${serial} (pid=${proc.pid}).`);

    let buf = '';
    proc.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString();
        const lines = buf.split('\n');
        buf = lines.pop() ?? '';
        for (const line of lines) {
            const match = line.match(/CLIPBOARD_TEXT:\s*(.+)/);
            if (!match) continue;
            const text = match[1].trim();
            if (!text) continue;
            // Broadcast to all WS clients for this device
            const clients = clipboardClients.get(serial);
            if (clients) {
                const msg = JSON.stringify({ type: 'clipboard', text, serial });
                for (const ws of clients) {
                    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
                }
            }
            console.log(`[ClipboardKB] [${serial}] Clipboard: ${text.substring(0, 60)}`);
        }
    });

    proc.on('exit', (code) => {
        logcatProcs.delete(serial);
        console.log(`[ClipboardKB] Logcat exited for ${serial} (code=${code}). Will restart on next setup call.`);
    });
    proc.on('error', (err) => {
        logcatProcs.delete(serial);
        console.error(`[ClipboardKB] Logcat error for ${serial}:`, err.message);
    });
}

const dev = process.env.NODE_ENV !== 'production';
const hostname = '0.0.0.0'; // Allow external access if needed
const port = 3000;

import { getSubscriptionByToken, getAllActiveSubscriptions, getAllAllocatedSubscriptions, getUserById, deactivateSubscription } from './lib/db';
import jwt from 'jsonwebtoken';

const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

// --- Roblox Auto Rejoin Background Task ---
setInterval(async () => {
    try {
        const subscriptions = getAllActiveSubscriptions();
        if (subscriptions.length === 0) return;

        const adb = new AdbServerClient();
        for (const sub of subscriptions) {
            if (sub.roblox_private_server_url) {
                try {
                    let isRobloxForeground = false;
                    const actRaw = await adb.shell(sub.device_udid, 'dumpsys activity activities');
                    const actMatch = actRaw.match(/mResumedActivity: ActivityRecord\{[0-9a-f]+ u\d+ ([^/]+)\//);

                    if (actMatch && actMatch[1] && actMatch[1].includes('com.roblox.client')) {
                        isRobloxForeground = true;
                    } else if (!actMatch) {
                        const winRaw = await adb.shell(sub.device_udid, 'dumpsys window windows');
                        const focusMatch = winRaw.match(/mCurrentFocus=Window\{[0-9a-f]+ u\d+ ([^/}]+)/);
                        if (focusMatch && focusMatch[1] && focusMatch[1].includes('com.roblox.client')) {
                            isRobloxForeground = true;
                        }
                    }

                    let isDisconnected = false;
                    if (isRobloxForeground) {
                        const logRaw = await adb.shell(sub.device_udid, 'logcat -d -t 100 -s Roblox');
                        const lowLog = logRaw.toLowerCase();
                        if (lowLog.includes('disconnect') || lowLog.includes('error 277') || lowLog.includes('connection lost') || lowLog.includes('leavegame')) {
                            isDisconnected = true;
                        }
                    }

                    if (!isRobloxForeground || isDisconnected) {
                        console.log(`[Auto-Rejoin] Device ${sub.device_udid} needs rejoin.`);
                        await adb.shell(sub.device_udid, 'logcat -c').catch(() => { });
                        await adb.shell(sub.device_udid, 'am force-stop com.roblox.client');

                        if (sub.roblox_auto_execute_script) {
                            try {
                                const b64 = Buffer.from(sub.roblox_auto_execute_script).toString('base64');
                                const executors = "Delta Fluxus Codex arceusx hydrogen TrigonEvo Ronix";
                                const shellCmd = `for d in ${executors}; do mkdir -p "/sdcard/$d/AutoExecute"; echo '${b64}' | base64 -d > "/sdcard/$d/AutoExecute/shieldRejoin.txt"; done`;
                                await adb.shell(sub.device_udid, shellCmd);
                            } catch (err: any) {
                                console.error(`[Auto-Rejoin Error] Failed to write auto execute script:`, err.message);
                            }
                        }

                        await adb.shell(sub.device_udid, `am start -a android.intent.action.VIEW -d "${sub.roblox_private_server_url}" com.roblox.client`);
                    }
                } catch (err: any) {
                    console.error(`[Auto-Rejoin Error] Device ${sub.device_udid}: `, err.message);
                }
            }
        }
    } catch (e) {
        console.error('[Auto-Rejoin Error] Loop failed:', e);
    }
}, 30000);

// --- ADB Packet Logic ---
const A_SYNC = 0x434e5953;
const A_CNXN = 0x4e584e43;
const A_OPEN = 0x4e45504f;
const A_OKAY = 0x59414b4f;
const A_CLSE = 0x45534c43;
const A_WRTE = 0x45545257;

interface AdbPacket {
    command: number;
    arg0: number;
    arg1: number;
    payload: Buffer;
    magic: number;
}

function serializePacket(command: number, arg0: number, arg1: number, payload: Buffer): Buffer {
    const header = Buffer.alloc(24);
    header.writeUInt32LE(command >>> 0, 0);
    header.writeUInt32LE(arg0 >>> 0, 4);
    header.writeUInt32LE(arg1 >>> 0, 8);
    header.writeUInt32LE(payload.length >>> 0, 12);
    let checksum = 0;
    for (const byte of payload) checksum = (checksum + byte) >>> 0;
    header.writeUInt32LE(checksum >>> 0, 16);
    header.writeUInt32LE((command ^ 0xFFFFFFFF) >>> 0, 20);
    if (payload.length === 0) return header;
    return Buffer.concat([header, payload]);
}

class ServerPacketParser {
    private buffer = Buffer.alloc(0);
    public push(chunk: Buffer) { this.buffer = Buffer.concat([this.buffer, chunk]); }
    public tryRead(): AdbPacket | null {
        if (this.buffer.length < 24) return null;
        const payloadLen = this.buffer.readUInt32LE(12);
        if (this.buffer.length < 24 + payloadLen) return null;
        const header = this.buffer.subarray(0, 24);
        const payload = this.buffer.subarray(24, 24 + payloadLen);
        this.buffer = this.buffer.subarray(24 + payloadLen);
        return {
            command: header.readUInt32LE(0),
            arg0: header.readUInt32LE(4),
            arg1: header.readUInt32LE(8),
            payload: payload,
            magic: header.readUInt32LE(20)
        };
    }
}

app.prepare().then(async () => {
    // --- Auto-setup clipboard keyboard on all active subscriptions at startup ---
    try {
        const subs = getAllActiveSubscriptions();
        console.log(`[ClipboardKB] Auto-setup for ${subs.length} active subscription(s)...`);
        for (const sub of subs) {
            setupClipboardKeyboard(sub.device_udid).catch(() => { });
        }
    } catch (e) {
        console.error('[ClipboardKB] Startup setup error:', e);
    }
    const server = createServer(async (req, res) => {
        // ULTRA-FAST PING: Absolute bypass for latency measurement
        if (req.url?.startsWith('/api/ping')) {
            if (res.socket) res.socket.setNoDelay(true);

            // Allow ping from any origin (CORS) to support direct IP measurement
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            res.setHeader('Access-Control-Allow-Headers', '*');

            if (req.method === 'OPTIONS') {
                res.writeHead(204);
                res.end();
                return;
            }

            // For latency measurement, HEAD + 204 No Content is the absolute fastest possible HTTP path
            res.writeHead(req.method === 'HEAD' ? 204 : 200, {
                'Content-Type': 'application/json',
                'Connection': 'keep-alive',
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'X-Content-Type-Options': 'nosniff'
            });
            res.end(req.method === 'HEAD' ? undefined : '{"status":"ok"}');
            return;
        }

        try {
            const parsedUrl = parse(req.url!, true);
            const { pathname } = parsedUrl;

            // Handle API routes before Next.js
            if (pathname === '/api/host/devices') {
                const adb = new AdbServerClient();
                const allDevices = await adb.getDevices();
                const activeSubscriptions = getAllAllocatedSubscriptions();
                const allocatedSerials = new Set(activeSubscriptions.map(s => s.device_udid));
                const devices = allDevices.filter(d => !allocatedSerials.has(d.serial));

                const enriched = await Promise.all(devices.map(async (dev) => {
                    let cpu = 'S845', ram = '6GB';
                    if (dev.status === 'device') {
                        try {
                            const cpuRaw = (await adb.shell(dev.serial, 'getprop ro.board.platform')).trim().toLowerCase();
                            if (cpuRaw.includes('625') || cpuRaw.includes('msm8953')) cpu = 'S625';
                            else if (cpuRaw.includes('845')) cpu = 'S845';
                            else if (cpuRaw.includes('855')) cpu = 'S855';
                            else if (cpuRaw.includes('865')) cpu = 'S865';
                            else if (cpuRaw.includes('888')) cpu = 'S888';
                            const meminfo = await adb.shell(dev.serial, 'cat /proc/meminfo');
                            const memMatch = meminfo.match(/MemTotal:\s+(\d+)\s+kB/);
                            if (memMatch) {
                                const gb = Math.round(parseInt(memMatch[1], 10) / (1024 * 1024));
                                ram = gb <= 4 ? '4GB' : gb <= 6 ? '6GB' : gb <= 8 ? '8GB' : gb <= 12 ? '12GB' : '16GB';
                            }
                        } catch { }
                    }
                    return { ...dev, cpu, ram };
                }));
                res.setHeader('Content-Type', 'application/json');
                res.end(JSON.stringify(enriched));
                return;
            }

            if (pathname === '/api/admin/device/delete' && req.method === 'POST') {
                let body = '';
                req.on('data', chunk => body += chunk.toString());
                req.on('end', () => {
                    try {
                        const cookies = req.headers.cookie || '';
                        const match = cookies.match(/auth_token=([^;]+)/);
                        const token = match ? match[1] : null;

                        if (!token) {
                            res.statusCode = 401;
                            res.end(JSON.stringify({ error: 'Unauthorized' }));
                            return;
                        }

                        const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';
                        const decoded = jwt.verify(token, JWT_SECRET) as { userId: number; email: string };

                        const user = getUserById(decoded.userId);
                        if (!user || user.role !== 'admin') {
                            res.statusCode = 403;
                            res.end(JSON.stringify({ error: 'Forbidden' }));
                            return;
                        }

                        const data = JSON.parse(body);
                        if (!data.subscriptionId) {
                            res.statusCode = 400;
                            res.end(JSON.stringify({ error: 'Subscription ID is required' }));
                            return;
                        }

                        deactivateSubscription(data.subscriptionId);

                        res.setHeader('Content-Type', 'application/json');
                        res.statusCode = 200;
                        res.end(JSON.stringify({ message: 'Device deleted successfully' }));
                    } catch (err: any) {
                        res.statusCode = 500;
                        res.end(JSON.stringify({ error: 'Internal Server Error' }));
                    }
                });
                return;
            }

            // Fallback to Next.js
            await handle(req, res, parsedUrl);
        } catch (err) {
            console.error('Server error:', err);
            if (!res.headersSent) {
                res.statusCode = 500;
                res.end('internal server error');
            }
        }
    });

    const wss = new WebSocketServer({ noServer: true });
    const wssClipboard = new WebSocketServer({ noServer: true });

    server.on('upgrade', (request, socket, head) => {
        const { pathname, query } = parse(request.url || '', true);

        // ---- Clipboard WebSocket (/api/ws-clipboard?serial=xxx or ?token=xxx) ----
        if (pathname === '/api/ws-clipboard') {
            const serial = (query.token
                ? getSubscriptionByToken(query.token as string)?.device_udid
                : query.serial as string);
            if (!serial) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }
            wssClipboard.handleUpgrade(request, socket, head, (ws) => {
                // Register client
                if (!clipboardClients.has(serial)) clipboardClients.set(serial, new Set());
                clipboardClients.get(serial)!.add(ws);
                console.log(`[ClipboardKB] Web client connected for ${serial}.`);

                // Ensure logcat is running (setup without re-installing if already done)
                startClipboardLogcat(serial);

                ws.on('close', () => {
                    clipboardClients.get(serial)?.delete(ws);
                    console.log(`[ClipboardKB] Web client disconnected for ${serial}.`);
                });
            });
            return;
        }

        if (pathname === '/api/ws-scrcpy') {
            const serial = (query.token ? getSubscriptionByToken(query.token as string)?.device_udid : query.serial as string);
            if (!serial) {
                socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
                socket.destroy();
                return;
            }

            wss.handleUpgrade(request, socket, head, (ws) => {
                const parser = new ServerPacketParser();
                const sockets = new Map<number, Socket>();
                let nextRemoteId = 1;

                const send = (cmd: number, arg0: number, arg1: number, payload: Buffer = Buffer.alloc(0)) => {
                    if (ws.readyState === WebSocket.OPEN) ws.send(serializePacket(cmd, arg0, arg1, payload));
                };

                ws.on('message', (data) => {
                    parser.push(data as Buffer);
                    let packet;
                    while ((packet = parser.tryRead())) {
                        const { command, arg0, arg1, payload } = packet;
                        if (command === A_CNXN) {
                            send(A_CNXN, 0x01000001, 1024 * 1024, Buffer.from("device::WS-ADB\0"));
                        } else if (command === A_OPEN) {
                            const localId = arg0;
                            let dest = payload.toString().replace(/\0/g, '');
                            const remoteId = nextRemoteId++;
                            const adbSocket = createConnection({ port: ADB_PORT, host: ADB_HOST });
                            adbSocket.setNoDelay(true);
                            adbSocket.on('connect', () => {
                                const tPayload = `host:transport:${serial}`;
                                adbSocket.write(tPayload.length.toString(16).padStart(4, '0').toUpperCase() + tPayload);
                            });

                            let step = 0;
                            adbSocket.on('data', (data) => {
                                let curr = data;
                                while (curr.length > 0) {
                                    if (step === 0) {
                                        if (curr.length >= 4 && curr.subarray(0, 4).toString() === 'OKAY') {
                                            step = 1; curr = curr.subarray(4);
                                            const sLen = Buffer.byteLength(dest).toString(16).padStart(4, '0').toUpperCase();
                                            adbSocket.write(sLen + dest);
                                        } else if (curr.length >= 4) {
                                            send(A_CLSE, 0, localId); adbSocket.end(); return;
                                        } else break;
                                    } else if (step === 1) {
                                        if (curr.length >= 4 && curr.subarray(0, 4).toString() === 'OKAY') {
                                            step = 2; sockets.set(localId, adbSocket);
                                            send(A_OKAY, remoteId, localId); curr = curr.subarray(4);
                                        } else if (curr.length >= 4) {
                                            send(A_CLSE, 0, localId); adbSocket.end(); return;
                                        } else break;
                                    }
                                    if (step === 2 && curr.length > 0) {
                                        send(A_WRTE, remoteId, localId, curr);
                                        curr = Buffer.alloc(0);
                                    }
                                }
                            });
                            adbSocket.on('close', () => { send(A_CLSE, 0, localId); sockets.delete(localId); });
                            adbSocket.on('error', () => { send(A_CLSE, 0, localId); sockets.delete(localId); });
                        } else if (command === A_WRTE) {
                            const socket = sockets.get(arg1);
                            if (socket) { socket.write(payload); send(A_OKAY, arg0, arg1); }
                        } else if (command === A_CLSE) {
                            const socket = sockets.get(arg1);
                            if (socket) { socket.end(); sockets.delete(arg1); }
                        }
                    }
                });
                ws.on('close', () => { for (const s of sockets.values()) s.destroy(); sockets.clear(); });
            });
        }
    });

    server.on('connection', (socket: any) => { socket.setNoDelay(true); });
    server.listen(port, () => console.log(`> Server ready on http://${hostname}:${port}`));
});
