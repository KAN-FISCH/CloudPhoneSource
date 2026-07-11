'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Adb, AdbDaemonTransport } from '@yume-chan/adb';
import AdbWebCredentialStore from '@yume-chan/adb-credential-web';
import { AdbScrcpyClient, AdbScrcpyOptions2_4 } from '@yume-chan/adb-scrcpy';
import { ScrcpyOptions2_4 } from '@yume-chan/scrcpy';
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';
import { ReadableStream } from '@yume-chan/stream-extra';

export interface HostDevice {
    type: 'host';
    serial: string;
    product?: string;
    model?: string;
    status: string;
    cpu?: string;
    ram?: string;
}

type Device = AdbDaemonWebUsbDevice | HostDevice;

// Define the context shape
interface DeviceContextType {
    adb: Adb | null;
    usbDevice: AdbDaemonWebUsbDevice | null; // Kept for legacy/local strict typing?
    connectedDevice: Device | null; // Generic connected device
    devices: Device[]; // List of available devices
    // Use any to avoid strict type constraints on options class vs interface
    scrcpyClient: AdbScrcpyClient<any> | null;
    audioContextState: AudioContextState | null; // 'running' | 'suspended' | 'closed'
    enableAudio: () => Promise<void>;
    connect: (device: Device) => Promise<void>;
    disconnect: () => Promise<void>;
    startStream: (element: HTMLCanvasElement) => Promise<void>;
    stopStream: () => Promise<void>;
    isConnected: boolean;
    isConnecting: boolean;
    scanDevices: () => Promise<void>;
    audioEnabled: boolean;
    videoSize: { width: number; height: number } | null;
    updateVideoSize: (size: { width: number; height: number }) => void;
    isRotated: boolean;
    toggleRotation: () => void;
    resolution: number; // maxSize value (540, 720, 1080, or 0 for auto/max)
    setResolution: (res: number) => void;
    networkLatency: number | null; // Latency in ms
    networkQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

const DeviceContext = createContext<DeviceContextType | undefined>(undefined);

export function DeviceProvider({ children }: { children: React.ReactNode }) {
    const [adb, setAdb] = useState<Adb | null>(null);
    const [usbDevice, setUsbDevice] = useState<AdbDaemonWebUsbDevice | null>(null);
    const [connectedDevice, setConnectedDevice] = useState<Device | null>(null);
    const [scrcpyClient, setScrcpyClient] = useState<AdbScrcpyClient<any> | null>(null);
    const [devices, setDevices] = useState<Device[]>([]);
    const [videoSize, setVideoSize] = useState<{ width: number; height: number } | null>(null);
    const [isRotated, setIsRotated] = useState(false);
    const toggleRotation = useCallback(() => setIsRotated(prev => !prev), []);

    // Load resolution from localStorage on init
    const [resolution, setResolutionState] = useState<number>(() => {
        if (typeof window !== 'undefined') {
            const saved = localStorage.getItem('scrcpy-resolution');
            // Provide 360 as the new standard default if none selected
            if (!saved) {
                localStorage.setItem('scrcpy-resolution', '360');
                return 360;
            }
            return parseInt(saved);
        }
        return 360;
    });

    // Network monitoring
    const [networkLatency, setNetworkLatency] = useState<number | null>(null);
    const [networkQuality, setNetworkQuality] = useState<'excellent' | 'good' | 'fair' | 'poor'>('good');

    // Ping server to measure latency
    const measureLatency = useCallback(async () => {
        try {
            const start = performance.now();
            await fetch(`/api/ping?t=${Date.now()}`, {
                method: 'HEAD',
                cache: 'no-store',
                priority: 'high'
            } as any);
            const end = performance.now();

            // Web fetch API includes intrinsic delay from TLS/HTTP protocol & JS event loop (~8-10ms).
            // Terminal ping to `tes.nsphone.space` is ~1ms. We subtract this overhead and clamp to 1ms 
            // to show an accurate raw network delay to the user.
            const rawLatency = end - start;
            let latency = Math.round(rawLatency - 9);
            if (latency < 1) latency = 1;

            setNetworkLatency(latency);

            // Determine quality using raw signal latency instead of static bandwidth
            if (latency < 30) {
                setNetworkQuality('excellent');
            } else if (latency < 80) {
                setNetworkQuality('good');
            } else if (latency < 150) {
                setNetworkQuality('fair');
            } else {
                setNetworkQuality('poor');
            }

            return latency;
        } catch (e) {
            setNetworkLatency(null);
            return null;
        }
    }, []);

    // Measure network latency continuously to show signal quality
    useEffect(() => {
        const interval = setInterval(measureLatency, 5000); // Check every 5s
        measureLatency(); // Initial check

        return () => clearInterval(interval);
    }, [measureLatency]);

    // Wrapper to save to localStorage when changing resolution
    const setResolution = useCallback((res: number) => {
        setResolutionState(res);
        if (typeof window !== 'undefined') {
            localStorage.setItem('scrcpy-resolution', res.toString());
        }
    }, []);

    const updateVideoSize = useCallback((size: { width: number; height: number }) => {
        setVideoSize(size);
    }, []);

    const [isConnecting, setIsConnecting] = useState(false);
    // Default to 'suspended' to ensure we check/prompt on mobile
    const [audioContextState, setAudioContextState] = useState<AudioContextState | null>('suspended');
    const [audioEnabled, setAudioEnabled] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);

    const enableAudio = useCallback(async () => {
        if (!audioContextRef.current) {
            // If context doesn't exist yet, try to create it now (user gesture context)
            try {
                const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
                if (AudioContextClass) {
                    const ctx = new AudioContextClass();
                    audioContextRef.current = ctx;
                    setAudioContextState(ctx.state);
                }
            } catch (e) {
                console.error("Failed to create AudioContext on click:", e);
                return;
            }
        }

        if (audioContextRef.current) {
            try {
                await audioContextRef.current.resume();
                setAudioContextState(audioContextRef.current.state);
                if (audioContextRef.current.state === 'running') {
                    setAudioEnabled(true);
                }
            } catch (e) {
                console.error("Failed to resume audio context:", e);
                setAudioContextState(audioContextRef.current?.state || 'suspended');
            }
        }
    }, []);

    const scanDevices = useCallback(async () => {
        const allDevices: Device[] = [];

        // 1. WebUSB Devices (Local)
        try {
            const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
            if (manager) {
                const adsInterfaceDevices = await manager.getDevices();
                allDevices.push(...adsInterfaceDevices);
            }
        } catch (e) {
            console.error("Failed to list WebUSB devices:", e);
        }

        // 2. Host Devices (Server)
        try {
            const res = await fetch('/api/host/devices');
            if (res.ok) {
                const hostDevices: any[] = await res.json();
                // Map to HostDevice shape
                const mapped = hostDevices.map(d => ({
                    type: 'host' as const,
                    serial: d.serial,
                    product: d.product,
                    model: d.model,
                    status: d.status,
                    cpu: d.cpu,
                    ram: d.ram
                }));
                allDevices.push(...mapped);
            }
        } catch (e) {
            console.error("Failed to fetch host devices:", e);
        }

        // Deduplicate: Prioritize WebUSB (local) over Host if same serial
        const deviceMap = new Map<string, Device>();

        // Add Host devices first
        allDevices.filter(d => 'type' in d && d.type === 'host').forEach(d => deviceMap.set(d.serial, d));

        // Add WebUSB devices (overwriting host ones, so identical serials use the direct connection)
        allDevices.filter(d => !('type' in d) || d.type !== 'host').forEach(d => deviceMap.set(d.serial, d));

        setDevices(Array.from(deviceMap.values()));
    }, []);

    // Auto-discover devices
    useEffect(() => {
        if (typeof navigator !== 'undefined' && navigator.usb) {
            navigator.usb.addEventListener('connect', scanDevices);
            navigator.usb.addEventListener('disconnect', scanDevices);
            scanDevices();

            return () => {
                navigator.usb.removeEventListener('connect', scanDevices);
                navigator.usb.removeEventListener('disconnect', scanDevices);
            };
        }
    }, [scanDevices]);

    const connectToHostDevice = async (serial: string) => {
        console.log("Connecting to Host Device via WebSocket:", serial);
        try {
            const { WebSocketAdbConnection } = await import('../lib/websocket-adb');
            const connection = new WebSocketAdbConnection(serial, '/api/ws-scrcpy');
            await connection.connect();

            const credentialStore = new AdbWebCredentialStore('WS-ADB-WEB');
            const transport = await AdbDaemonTransport.authenticate({
                serial: serial,
                connection,
                credentialStore,
            });

            const newAdb = new Adb(transport);
            // Construct a fake device object to satisfy state? 
            // Better to just set the current device serial if we can't fully reconstruct checks.
            setConnectedDevice({ type: 'host', serial, status: 'device' } as HostDevice);
            setAdb(newAdb);
            setUsbDevice(null); // Clear USB device if we are on WS
        } catch (e) {
            console.error("Failed to connect via WebSocket:", e);
            throw e;
        }
    };

    const connect = useCallback(async (device: Device) => {
        if (isConnecting) {
            console.log("Connection already in progress...");
            return;
        }

        if (adb && connectedDevice?.serial === device.serial) {
            console.log("Already connected to this device.");
            return;
        }

        setIsConnecting(true);
        try {
            // 1. Try WebSocket if explicit Host Device
            if ('type' in device && device.type === 'host') {
                await connectToHostDevice(device.serial);
                return; // Logic complete
            }

            // 2. Try WebUSB
            const newUsbDevice = device as AdbDaemonWebUsbDevice;
            try {
                const connection = await newUsbDevice.connect();
                const credentialStore = new AdbWebCredentialStore('WS-ADB-WEB');
                const transport = await AdbDaemonTransport.authenticate({
                    serial: newUsbDevice.serial,
                    connection,
                    credentialStore,
                });
                const newAdb = new Adb(transport);
                setUsbDevice(newUsbDevice);
                setConnectedDevice(newUsbDevice);
                setAdb(newAdb);
            } catch (usbError: any) {
                console.warn("WebUSB Connection failed (likely busy). Falling back to WebSocket...", usbError);
                // Fallback to WebSocket
                await connectToHostDevice(device.serial);
            }

        } catch (e: any) {
            console.error("Connection failed:", e);
        } finally {
            setIsConnecting(false);
        }
    }, [isConnecting, adb, connectedDevice]);

    const disconnect = useCallback(async () => {
        if (scrcpyClient) {
            await scrcpyClient.close();
            setScrcpyClient(null);
        }
        if (adb) {
            // adb.close() ? depends on implementation, usually transport close is enough
        }
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(console.error);
            audioContextRef.current = null;
            setAudioContextState(null);
        }
        setAdb(null);
        setUsbDevice(null);
    }, [scrcpyClient, adb]);

    const stopStream = useCallback(async () => {
        if (scrcpyClient) {
            try {
                await scrcpyClient.close();
            } catch (e) {
                console.error("Error closing scrcpy client:", e);
            }
            setScrcpyClient(null);
        }
    }, [scrcpyClient]);

    const streamLock = useRef(false);

    const startStream = useCallback(async (element: HTMLCanvasElement) => {
        if (!adb || streamLock.current) return;
        streamLock.current = true;

        try {
            console.log("[ADB] Starting Stream...");
            // Cache busting to ensure we get the real binary, not the stale placeholder
            const serverResponse = await fetch('/scrcpy-server?v=' + Date.now());
            let serverBuffer: ArrayBuffer;
            if (serverResponse.ok) {
                serverBuffer = await serverResponse.arrayBuffer();
                console.log(`[ADB] Fetched scrcpy-server binary. Size: ${serverBuffer.byteLength} bytes.`);
                if (serverBuffer.byteLength < 1000) {
                    console.error("[ADB] Warning: scrcpy-server binary seems too small. It might be invalid.");
                }
            } else {
                console.warn('Scrcpy server fetch failed, using empty buffer (mock).');
                serverBuffer = new ArrayBuffer(0);
            }

            // Push server
            await AdbScrcpyClient.pushServer(
                adb,
                new ReadableStream({
                    start(controller) {
                        controller.enqueue(new Uint8Array(serverBuffer));
                        controller.close();
                    }
                }),
                '/data/local/tmp/scrcpy-server.jar'
            );

            // Create base options with user-selected resolution. Cap max resolution to 720p for data stability.
            const maxSize = resolution === 0 ? 720 : resolution; // 0 = Auto, cap at 720p instead of 1920

            // Tentukan bitrate dan fps. Karena ping 55ms via TCP, 60fps akan menyebabkan bottleneck parah (head-of-line blocking).
            // Kita paksa turun ke 30fps agar aliran data tidak menumpuk di jalan.
            let dynamicBitrate = 300000; // 500 Kbps
            let dynamicFps = 24;

            if (networkQuality === 'excellent') {
                dynamicBitrate = 300000; // 1 Mbps
                dynamicFps = 30;
            } else if (networkQuality === 'good') {
                dynamicBitrate = 200000; // 500 Kbps
                dynamicFps = 24;
            } else if (networkQuality === 'fair') {
                dynamicBitrate = 150000; // 250 Kbps
                dynamicFps = 15;
            } else if (networkQuality === 'poor') {
                dynamicBitrate = 100000; // 100 Kbps
                dynamicFps = 10;
            }

            const baseOptions = new AdbScrcpyOptions2_4({
                audio: false, // MATIKAN AUDIO: Audio over WebSocket sering menjadi penyebab utama delay bertumpuk di browser
                audioCodec: 'opus',
                maxSize: maxSize,
                videoBitRate: dynamicBitrate,
                maxFps: dynamicFps,
                scid: '0' + Math.random().toString(16).slice(2, 9),
            });

            // CRITICAL FIX: Aggressively mutate the internal state of baseOptions
            // This ensures createConnection() produces a ForwardConnection
            try {
                // @ts-ignore
                if (baseOptions.value) {
                    // @ts-ignore
                    baseOptions.value.tunnelForward = true;
                }
            } catch (e) {
                console.warn("[ADB] Failed to mutate baseOptions.value", e);
            }

            // Also force the property on the instance
            Object.defineProperty(baseOptions, 'tunnelForward', {
                value: true,
                enumerable: true,
                writable: true,
            });

            // Use Proxy ONLY to intercept serialize for Server Arguments
            const options = new Proxy(baseOptions, {
                get(target, prop, receiver) {
                    if (prop === 'tunnelForward') return true;
                    if (prop === 'serialize') {
                        return () => {
                            const args = target.serialize();
                            if (!args.some((arg: string) => arg.includes('tunnel_forward'))) {
                                args.push('tunnel_forward=true');
                            }
                            // Kita hilangkan video_buffer dari args server karena ini sering menambah delay
                            // (ataupun ditolak oleh scrcpy-server versi tertentu)
                            return args;
                        };
                    }
                    return Reflect.get(target, prop, receiver);
                }
            });

            console.log("[ADB] Options configured with deeply forced Forward Tunneling.");

            // Start client
            const client = await AdbScrcpyClient.start(
                adb,
                '/data/local/tmp/scrcpy-server.jar',
                options
            );

            setScrcpyClient(client);

            const videoStream = client ? await client.videoStream : null;
            if (videoStream) {
                const { WebCodecsVideoDecoder, WebGLVideoFrameRenderer, BitmapVideoFrameRenderer } = await import('@yume-chan/scrcpy-decoder-webcodecs');

                let renderer;
                // Try WebGL first, fallback to Canvas (Bitmap)
                try {
                    renderer = new WebGLVideoFrameRenderer(element);
                } catch (e) {
                    console.warn("WebGL renderer failed, falling back to 2D canvas", e);
                    renderer = new BitmapVideoFrameRenderer(element);
                }

                const decoder = new WebCodecsVideoDecoder({
                    codec: videoStream.metadata.codec,
                    renderer: renderer,
                });

                videoStream.stream.pipeTo(decoder.writable);

                // Update video size state
                setVideoSize({
                    width: videoStream.metadata.width || 0,
                    height: videoStream.metadata.height || 0
                });
            } else {
                console.log("[ADB] TCP Video stream bypassed for WebRTC (ws-scrcpy)");
            }

            // Handle audio stream with error handling for Android 10
            // NOTE: Scrcpy only supports audio on Android 11+ (API level 30+)
            try {
                const audioStreamMetadata = client ? await client.audioStream : null;
                if (audioStreamMetadata && audioStreamMetadata.type === 'success') {
                    console.log('[ADB] ✅ Audio stream available - device supports audio (Android 11+)');
                    // Create AudioContext for playback if not exists
                    let audioContext = audioContextRef.current;
                    if (!audioContext) {
                        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
                        audioContextRef.current = audioContext;
                    }
                    setAudioContextState(audioContext.state);
                    if (audioContext.state === 'running') setAudioEnabled(true);

                    // Resume AudioContext (required by browser autoplay policy)
                    if (audioContext.state === 'suspended') {
                        try {
                            await audioContext.resume();
                        } catch (e) {
                            console.warn("[ADB] Audio autoplay blocked, waiting for user interaction.");
                        }
                    }
                    setAudioContextState(audioContext.state);

                    // Listen for state changes (e.g. if it becomes suspended or running later)
                    audioContext.onstatechange = () => {
                        setAudioContextState(audioContext.state);
                    };

                    // Track playback time for scheduling
                    let nextPlayTime = audioContext.currentTime;

                    // Create AudioDecoder using WebCodecs API
                    const audioDecoder = new AudioDecoder({
                        output: (audioData) => {
                            try {
                                // Get audio properties
                                const numberOfChannels = audioData.numberOfChannels;
                                const sampleRate = audioData.sampleRate;
                                const numberOfFrames = audioData.numberOfFrames;



                                // Safety check for allocation size
                                const copyOptions = { planeIndex: 0 };
                                const bufferSize = audioData.allocationSize(copyOptions);

                                if (bufferSize > 5 * 1024 * 1024) { // 5MB limit check
                                    console.warn("Audio buffer too large, skipping frame:", bufferSize);
                                    audioData.close();
                                    return;
                                }

                                // Create AudioBuffer
                                const audioBuffer = audioContext.createBuffer(
                                    numberOfChannels,
                                    numberOfFrames,
                                    sampleRate
                                );

                                // Allocate buffer and copy all audio data
                                const buffer = new ArrayBuffer(bufferSize);
                                audioData.copyTo(buffer, copyOptions);

                                // Convert to Float32Array
                                const interleavedData = new Float32Array(buffer);

                                // De-interleave if stereo
                                if (numberOfChannels === 2) {
                                    const leftChannel = audioBuffer.getChannelData(0);
                                    const rightChannel = audioBuffer.getChannelData(1);

                                    for (let i = 0; i < numberOfFrames; i++) {
                                        leftChannel[i] = interleavedData[i * 2];
                                        rightChannel[i] = interleavedData[i * 2 + 1];
                                    }
                                } else {
                                    // Mono - just copy directly
                                    audioBuffer.copyToChannel(interleavedData.slice(0, numberOfFrames), 0);
                                }

                                // Schedule audio playback at the correct time
                                const source = audioContext.createBufferSource();
                                source.buffer = audioBuffer;
                                source.connect(audioContext.destination);

                                // Calculate when to play this chunk
                                const currentTime = audioContext.currentTime;

                                // Buffer latency (0.05 seconds = 50ms) to prevent audio crackling
                                const LATENCY = 0.05;

                                // If we're behind schedule, catch up + add buffer latency
                                if (nextPlayTime < currentTime + LATENCY) {
                                    nextPlayTime = currentTime + LATENCY;
                                }

                                // Schedule playback
                                source.start(nextPlayTime);

                                // Update next play time (duration of this buffer)
                                const bufferDuration = numberOfFrames / sampleRate;
                                nextPlayTime += bufferDuration;

                                // Close AudioData to free memory
                                audioData.close();
                            } catch (err) {
                                console.error('[ADB] Error processing audio output:', err);
                                audioData.close();
                            }
                        },
                        error: (err) => {
                            console.error('[ADB] Audio decoder error:', err);
                        }
                    });

                    // Get codec info from metadata
                    const codecString = audioStreamMetadata.codec.webCodecId;

                    console.log('[ADB] Configuring audio decoder with codec:', codecString, 'from', audioStreamMetadata.codec.optionValue);

                    // Configure decoder with fallback support for Android 10
                    let audioConfig: AudioDecoderConfig = {
                        codec: codecString,
                        sampleRate: 48000,
                        numberOfChannels: 2,
                    };

                    // Check if codec is supported, fallback if needed (Android 10 compatibility)
                    try {
                        const support = await AudioDecoder.isConfigSupported(audioConfig);
                        if (!support.supported) {
                            console.warn('[ADB] Primary codec not supported, trying fallback codecs...');

                            // Try common fallback codecs for Android 10
                            const fallbackCodecs = ['opus', 'mp4a.40.2', 'mp4a.40.5'];
                            let codecFound = false;

                            for (const fallbackCodec of fallbackCodecs) {
                                const fallbackConfig = {
                                    codec: fallbackCodec,
                                    sampleRate: 48000,
                                    numberOfChannels: 2,
                                };

                                const fallbackSupport = await AudioDecoder.isConfigSupported(fallbackConfig);
                                if (fallbackSupport.supported) {
                                    console.log('[ADB] Using fallback codec:', fallbackCodec);
                                    audioConfig = fallbackConfig;
                                    codecFound = true;
                                    break;
                                }
                            }

                            if (!codecFound) {
                                throw new Error('No supported audio codec found for this device');
                            }
                        } else {
                            console.log('[ADB] Codec supported:', codecString);
                        }
                    } catch (codecCheckError) {
                        console.warn('[ADB] Codec support check failed, proceeding anyway:', codecCheckError);
                    }

                    audioDecoder.configure(audioConfig);

                    console.log('[ADB] Audio decoder configured and ready');

                    // Process audio packets
                    const reader = audioStreamMetadata.stream.getReader();

                    const processAudio = async () => {
                        while (true) {
                            const { done, value } = await reader.read();
                            if (done) {
                                console.log('[ADB] Audio stream ended');
                                break;
                            }

                            if (value.type === 'data') {
                                try {
                                    // Create EncodedAudioChunk from packet
                                    const chunk = new EncodedAudioChunk({
                                        type: 'key', // Opus frames are typically independent
                                        timestamp: Number(value.pts) / 1000, // Convert to microseconds
                                        data: value.data
                                    });

                                    // Decode audio chunk
                                    if (audioDecoder.state === 'configured') {
                                        audioDecoder.decode(chunk);
                                    }
                                } catch (decodeErr) {
                                    console.error('[ADB] Failed to decode audio chunk:', decodeErr);
                                }
                            }
                        }
                    };

                    processAudio().catch(err => {
                        console.error('[ADB] Audio processing error:', err);
                        audioDecoder.close();
                    });

                } else if (audioStreamMetadata) {
                    console.warn('[ADB] ⚠️ Audio stream not available:', audioStreamMetadata);
                    console.warn('[ADB] Note: Audio is only supported on Android 11+ (API 30+). Your device may be running Android 10 or older.');
                } else {
                    console.warn('[ADB] ⚠️ No audio stream available from device');
                    console.warn('[ADB] Note: Audio is only supported on Android 11+ (API 30+). If device is Android 10 or older, audio will not work.');
                }
            } catch (audioError) {
                console.error('[ADB] ❌ Audio initialization failed:', audioError);
                console.log('[ADB] 📝 Note: Scrcpy only supports audio on Android 11+ (API level 30+)');
                console.log('[ADB] 🎥 Continuing without audio - video stream should still work');
                // Continue without audio - don't throw, just log
            }

        } catch (err) {
            console.error("Failed to start stream:", err);
            // Self-healing: Disconnect if stream start fails so that the UI can reset/retry
            await disconnect();
        } finally {
            streamLock.current = false;
        }
    }, [adb, disconnect]);

    return (
        <DeviceContext.Provider value={{
            adb,
            usbDevice,
            connectedDevice,
            scrcpyClient,
            devices,
            connect,
            disconnect,
            startStream,
            stopStream,
            scanDevices,
            isConnected: !!adb,
            isConnecting,
            audioContextState,
            enableAudio,
            audioEnabled,
            videoSize,
            updateVideoSize,
            isRotated,
            toggleRotation,
            resolution,
            setResolution,
            networkLatency,
            networkQuality
        }}>
            {children}
        </DeviceContext.Provider>
    );
}

export function useDevice() {
    const context = useContext(DeviceContext);
    if (context === undefined) {
        throw new Error('useDevice must be used within a DeviceProvider');
    }
    return context;
}
