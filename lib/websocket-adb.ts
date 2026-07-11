
import { AdbPacketData, AdbPacketInit } from '@yume-chan/adb';
import { ReadableStream, WritableStream, Consumable, WritableStreamDefaultController } from '@yume-chan/stream-extra';

// Helper to manually serialize AdbPacketInit to Uint8Array/ArrayBuffer for sending over WS
function serializePacket(packet: AdbPacketInit): ArrayBuffer {
    const payload = packet.payload || new Uint8Array(0);
    const header = new DataView(new ArrayBuffer(24));

    header.setUint32(0, packet.command, true);
    header.setUint32(4, packet.arg0, true);
    header.setUint32(8, packet.arg1, true);
    header.setUint32(12, payload.byteLength, true);

    // Checksum
    let sum = 0;
    for (let i = 0; i < payload.length; i++) sum += payload[i];
    header.setUint32(16, sum, true);

    // Magic
    header.setUint32(20, packet.command ^ 0xFFFFFFFF, true);

    // Combine
    if (payload.byteLength === 0) return header.buffer;

    const result = new Uint8Array(24 + payload.byteLength);
    result.set(new Uint8Array(header.buffer), 0);
    result.set(payload, 24);
    return result.buffer;
}

// Simple Ring Buffer / Accumulator for parsing
class PacketParser {
    private buffer: Uint8Array = new Uint8Array(0);

    // Helper to read N bytes from the front of buffer
    private consume(n: number): Uint8Array | null {
        if (this.buffer.length < n) return null;
        const chunk = this.buffer.slice(0, n);
        this.buffer = this.buffer.slice(n);
        return chunk;
    }

    public push(chunk: Uint8Array) {
        // Efficient concat? For small ADB packets this is fine.
        const newBuffer = new Uint8Array(this.buffer.length + chunk.length);
        newBuffer.set(this.buffer);
        newBuffer.set(chunk, this.buffer.length);
        this.buffer = newBuffer;
    }

    public tryReadPacket(): AdbPacketData | null {
        // Need at least header (24 bytes)
        if (this.buffer.length < 24) return null;

        // Peek header
        const headerView = new DataView(this.buffer.buffer, this.buffer.byteOffset, 24);
        const payloadLen = headerView.getUint32(12, true);

        // Check if we have full packet (header + payload)
        if (this.buffer.length < 24 + payloadLen) return null;

        // Consume Header
        this.consume(24);

        // Consume Payload
        // Important: AdbPacketData payload is Uint8Array
        const payload = this.consume(payloadLen)!;

        // Construct Packet
        return {
            command: headerView.getUint32(0, true),
            arg0: headerView.getUint32(4, true),
            arg1: headerView.getUint32(8, true),
            payload: payload,
        };
    }
}

export class WebSocketAdbConnection {
    public serial: string;
    private url: string;
    private socket: WebSocket | null = null;

    // The streams expected by AdbDaemonTransport
    public readable: ReadableStream<AdbPacketData>;
    public writable: WritableStream<Consumable<AdbPacketInit>>;

    private _parser = new PacketParser();
    private _readableController!: ReadableStreamDefaultController<AdbPacketData>;

    constructor(serial: string, baseUrl: string) {
        this.serial = serial;
        const protocol = typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';

        let url = `${protocol}//${host}${baseUrl}?serial=${serial}`;
        if (typeof window !== 'undefined') {
            const params = new URLSearchParams(window.location.search);
            const token = params.get('token');
            if (token) {
                url += `&token=${token}`;
            }
        }
        this.url = url;

        // 1. Packet Stream (Source)
        this.readable = new ReadableStream<AdbPacketData>({
            start: (controller) => {
                this._readableController = controller;
            }
        });

        // 2. Outgoing Stream (Packets -> Bytes -> WS)
        this.writable = new WritableStream<Consumable<AdbPacketInit>>({
            write: async (consumable) => {
                try {
                    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
                        const buffer = serializePacket(consumable.value);
                        this.socket.send(buffer);
                        consumable.consume();
                    } else {
                        throw new Error("WebSocket not open");
                    }
                } catch (e) {
                    console.error("WS Write Error", e);
                    throw e;
                }
            }
        });
    }

    async connect(): Promise<void> {
        return new Promise((resolve, reject) => {
            this.socket = new WebSocket(this.url);
            this.socket.binaryType = 'arraybuffer';

            this.socket.onopen = () => {
                resolve();
            };

            this.socket.onmessage = (event) => {
                const chunk = new Uint8Array(event.data as ArrayBuffer);
                this._parser.push(chunk);

                // Process as many packets as possible
                let packet;
                while ((packet = this._parser.tryReadPacket())) {
                    this._readableController.enqueue(packet);
                }
            };

            this.socket.onclose = () => {
                console.log("WS Closed");
                try { this._readableController.close(); } catch { }
            };

            this.socket.onerror = (e) => {
                console.error("WS Error", e);
                reject(e);
            };
        });
    }
}
