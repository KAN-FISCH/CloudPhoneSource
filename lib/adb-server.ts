
import net from 'net';
import { config } from '../config';

export interface AdbDevice {
    serial: string;
    status: string;
    product?: string;
    model?: string;
    device?: string;
}

export class AdbServerClient {
    private host: string;
    private port: number;

    constructor(host = config.ADB_HOST, port = config.ADB_PORT) {
        this.host = host;
        this.port = port;
    }

    private async connect(): Promise<net.Socket> {
        return new Promise((resolve, reject) => {
            console.log(`[ADB] Connecting to ${this.host}:${this.port}...`);
            const socket = net.createConnection({ port: this.port, host: this.host });
            socket.setTimeout(5000); // 5 seconds timeout
            socket.on('connect', () => {
                console.log(`[ADB] Connected to ${this.host}:${this.port}`);
                resolve(socket);
            });
            socket.on('error', (err) => {
                console.error(`[ADB] Connection failed to ${this.host}:${this.port}:`, err.message);
                reject(err);
            });
            socket.on('timeout', () => {
                console.error(`[ADB] Connection timeout to ${this.host}:${this.port}`);
                socket.destroy();
                reject(new Error('Connection timeout'));
            });
        });
    }

    private parseLength(str: string): number {
        return parseInt(str, 16);
    }

    private readExact(socket: net.Socket, len: number): Promise<Buffer> {
        return new Promise((resolve, reject) => {
            // Simplified reading for this use case
            // In production, robust buffering is needed
            socket.once('data', (data) => resolve(data));
        });
    }

    // ADB Protocol: length (4 hex) + payload
    private encodePacket(payload: string): Buffer {
        const len = payload.length.toString(16).padStart(4, '0').toUpperCase();
        return Buffer.from(len + payload);
    }

    public async getDevices(): Promise<AdbDevice[]> {
        return new Promise(async (resolve, reject) => {
            try {
                const socket = await this.connect();

                // Send host:temp_build:devices-l for detailed list
                socket.write(this.encodePacket('host:devices-l'));

                let data = Buffer.alloc(0);
                socket.on('data', (chunk) => {
                    data = Buffer.concat([data, chunk]);
                });

                socket.on('end', () => {
                    // Response: "OKAY" + length(4) + list
                    const str = data.toString();
                    if (!str.startsWith('OKAY')) {
                        resolve([]);
                        return;
                    }

                    // The payload starts after OKAY + 4 bytes of length
                    // Actually, ADB sometimes behaves differently. 
                    // Standard: OKAY [4-byte-len] [payload]

                    const payload = str.substring(8);
                    const lines = payload.split('\n');
                    const devices: AdbDevice[] = [];

                    for (const line of lines) {
                        if (!line.trim()) continue;
                        // Serial state product:X model:Y device:Z transport_id:N
                        const parts = line.split(/\s+/);
                        const serial = parts[0];
                        const status = parts[1];

                        const device: AdbDevice = { serial, status };

                        for (let i = 2; i < parts.length; i++) {
                            if (parts[i].startsWith('product:')) device.product = parts[i].split(':')[1];
                            if (parts[i].startsWith('model:')) device.model = parts[i].split(':')[1];
                            if (parts[i].startsWith('device:')) device.device = parts[i].split(':')[1];
                        }
                        devices.push(device);
                    }

                    resolve(devices);
                    socket.destroy();
                });

                socket.on('error', (e) => {
                    console.error("ADB Socket error:", e);
                    resolve([]);
                });

            } catch (e) {
                console.error("Failed to connect to ADB server:", e);
                resolve([]);
            }
        });
    }

    public async shell(serial: string, command: string): Promise<string> {
        return Promise.race([
            new Promise<string>(async (resolve) => {
                try {
                    const socket = await this.connect();
                    socket.write(this.encodePacket(`host:transport:${serial}`));

                    let phase = 0;
                    let output = '';

                    socket.on('data', (data) => {
                        let str = data.toString();
                        if (phase === 0) {
                            if (str.startsWith('OKAY')) {
                                phase = 1;
                                str = str.substring(4);
                                socket.write(this.encodePacket(`shell:${command}`));
                            } else {
                                socket.destroy();
                                resolve('');
                                return;
                            }
                        }
                        if (phase === 1) {
                            if (str.startsWith('OKAY')) {
                                phase = 2;
                                str = str.substring(4);
                            }
                        }
                        if (phase === 2) {
                            output += str;
                        }
                    });

                    socket.on('end', () => {
                        resolve(output);
                    });
                    socket.on('error', () => {
                        resolve('');
                    });
                } catch (e) {
                    resolve('');
                }
            }),
            new Promise<string>((resolve) => setTimeout(() => resolve(''), 5000))
        ]);
    }
}
