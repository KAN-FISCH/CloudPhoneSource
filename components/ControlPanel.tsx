'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
    ChevronLeft, Circle, Square, // Nav
    Power, Volume2, Volume1, RotateCw, Camera,
    Settings2, Copy, Clipboard, Monitor, Wifi,
    FileUp, AppWindow
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useDevice } from '@/context/DeviceContext';
import { AndroidKeyCode } from '@yume-chan/scrcpy';
import { Consumable } from '@yume-chan/stream-extra';
import { createPortal } from 'react-dom';

const ControlButton = ({ icon: Icon, label, active = false, onClick }: any) => (
    <button
        onClick={onClick}
        className={`p-2 md:p-3 rounded-xl backdrop-blur-md transition-all duration-200 group relative
      ${active ? 'bg-primary text-black shadow-[0_0_20px_rgba(56,189,248,0.4)]' : 'bg-secondary/40 text-muted-foreground hover:bg-white/10 hover:text-white border border-white/5'}
    `}
    >
        <Icon size={18} className="md:w-5 md:h-5" strokeWidth={1.5} />
        <span className="absolute right-full mr-3 top-1/2 -translate-y-1/2 bg-black/80 px-2 py-1 rounded text-xs whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-white/10 z-50">
            {label}
        </span>
    </button>
);

const NetworkIndicator = ({ latency, quality }: { latency: number | null, quality: string }) => {
    const getColor = () => {
        if (!latency) return 'text-slate-500';
        if (quality === 'excellent') return 'text-green-400';
        if (quality === 'good') return 'text-blue-400';
        if (quality === 'fair') return 'text-yellow-400';
        return 'text-red-400';
    };

    return (
        <div className="flex flex-col items-center gap-1 p-2 rounded-lg bg-black/20 border border-white/5">
            <Wifi size={16} className={`${getColor()} transition-colors`} />
            <span className={`text-[10px] font-mono ${getColor()}`}>
                {latency ? `${latency}ms` : '--'}
            </span>
        </div>
    );
};

export default function ControlPanel() {
    const [localAudioEnabled, setLocalAudioEnabled] = useState(true);
    const [showSettings, setShowSettings] = useState(false);
    const [showResolution, setShowResolution] = useState(false);
    const [showClipboard, setShowClipboard] = useState(false);
    const [clipboardText, setClipboardText] = useState('');
    const [mounted, setMounted] = useState(false);
    // Clipboard Keyboard sync
    const [clipboardHasNew, setClipboardHasNew] = useState(false);
    const [deviceClipboardLog, setDeviceClipboardLog] = useState<string[]>([]);
    const clipboardWsRef = useRef<WebSocket | null>(null);
    const { scrcpyClient, toggleRotation, isRotated, resolution, setResolution, stopStream, startStream, networkLatency, networkQuality, adb, connectedDevice } = useDevice();

    useEffect(() => {
        setMounted(true);
    }, []);

    // --- Device Clipboard WebSocket listener ---
    useEffect(() => {
        if (!connectedDevice?.serial) return;
        // Close existing WS if serial changed
        clipboardWsRef.current?.close();

        const proto = window.location.protocol === 'https:' ? 'wss' : 'ws';
        // Use token from URL if present (same auth as ws-scrcpy), fallback to serial
        const urlParams = new URLSearchParams(window.location.search);
        const token = urlParams.get('token');
        const authParam = token
            ? `token=${encodeURIComponent(token)}`
            : `serial=${encodeURIComponent(connectedDevice.serial)}`;
        const wsUrl = `${proto}://${window.location.host}/api/ws-clipboard?${authParam}`;
        const ws = new WebSocket(wsUrl);
        clipboardWsRef.current = ws;

        ws.onmessage = (evt) => {
            try {
                const data = JSON.parse(evt.data);
                if (data.type === 'clipboard' && data.text) {
                    const text: string = data.text;
                    // Auto-populate textarea
                    setClipboardText(text);
                    // Add to log (keep last 10)
                    setDeviceClipboardLog((prev: string[]) => [text, ...prev].slice(0, 10));
                    // Mark as new if panel is not open
                    setClipboardHasNew(true);
                    // Auto-copy to browser clipboard
                    navigator.clipboard.writeText(text).catch(() => { });
                }
            } catch (_) { }
        };

        ws.onerror = () => console.warn('[ClipboardKB] WS error');
        ws.onclose = () => console.log('[ClipboardKB] WS closed');

        return () => {
            ws.close();
        };
    }, [connectedDevice?.serial]);

    const injectKey = async (code: AndroidKeyCode) => {
        // ... existing
        if (!scrcpyClient || !scrcpyClient.controller) return;
        try {
            await scrcpyClient.controller.injectKeyCode({ action: 0, keyCode: code, repeat: 0, metaState: 0 });
            await scrcpyClient.controller.injectKeyCode({ action: 1, keyCode: code, repeat: 0, metaState: 0 });
        } catch (e) {
            console.error("Input failed:", e);
        }
    };

    const fileInputRef = useRef<HTMLInputElement>(null);
    const apkInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !adb) return;

        try {
            const sync = await adb.sync();
            const stream = file.stream().pipeThrough(new TransformStream({
                transform(chunk, controller) {
                    controller.enqueue(new Consumable(chunk));
                }
            }));

            // @ts-ignore
            await sync.write({
                filename: `/sdcard/Download/${file.name}`,
                // @ts-ignore
                file: stream,
                mtime: Math.floor(file.lastModified / 1000)
            });
            sync.dispose();
            alert(`File uploaded to /sdcard/Download/${file.name}`);
        } catch (err: any) {
            console.error(err);
            alert('Upload failed: ' + err.message);
        }
        e.target.value = '';
    };

    const handleInstallApk = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file || !adb) return;

        try {
            alert('Uploading and Installing ' + file.name + '...');
            const sync = await adb.sync();
            const tempPath = `/data/local/tmp/${file.name}`;

            const stream = file.stream().pipeThrough(new TransformStream({
                transform(chunk, controller) {
                    controller.enqueue(new Consumable(chunk));
                }
            }));

            // @ts-ignore
            await sync.write({
                filename: tempPath,
                // @ts-ignore
                file: stream,
                mode: 0o644
            });
            sync.dispose();

            // Use Raw Socket for Install
            // 'pm install' writes to stdout/stderr
            const socket = await adb.createSocket(`shell:pm install -r "${tempPath}"`);
            const reader = socket.readable.getReader();
            let output = '';
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;
                    output += new TextDecoder().decode(value);
                }
            } finally {
                socket.close();
            }

            if (output.includes('Success')) {
                alert('Installed Successfully!');
            } else {
                alert('Install Failed: ' + output);
            }

            // Cleanup: rm temp file
            try {
                const s = await adb.createSocket(`shell:rm "${tempPath}"`);
                s.close();
            } catch (e) { }

        } catch (err: any) {
            console.error(err);
            alert('Install Failed: ' + err.message);
        }
        e.target.value = '';
    };

    const handleSendToDevice = async () => {
        if (!scrcpyClient?.controller || !clipboardText.trim()) return;
        try {
            const controller = scrcpyClient.controller;
            // Split by newline so multi-line scripts (e.g. Roblox executor scripts) work correctly.
            // injectText() does NOT send Enter/newline — we must send KEYCODE_ENTER (66) manually
            // between lines.
            const lines = clipboardText.split('\n');
            for (let i = 0; i < lines.length; i++) {
                const line = lines[i];
                // Only inject non-empty lines (or inject empty string to preserve blank lines)
                if (line.length > 0) {
                    await controller.injectText(line);
                }
                // Send ENTER after each line except the very last one
                // (so we don't add an extra newline at the end)
                if (i < lines.length - 1) {
                    // KEYCODE_ENTER = 66
                    await controller.injectKeyCode({ action: 0, keyCode: 66, repeat: 0, metaState: 0 });
                    await controller.injectKeyCode({ action: 1, keyCode: 66, repeat: 0, metaState: 0 });
                    // Small delay to ensure the device processes the Enter before next line
                    await new Promise(resolve => setTimeout(resolve, 50));
                }
            }
            alert('Text sent to device!');
            setShowClipboard(false);
        } catch (e) {
            console.error("Failed to send text:", e);
            alert('Failed to send text to device');
        }
    };



    const handlePasteFromBrowser = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setClipboardText(text);
        } catch (e) {
            console.error("Failed to paste from browser:", e);
            alert('Failed to read from browser clipboard');
        }
    };

    const handleCopyToBrowser = async () => {
        if (!clipboardText.trim()) return;
        try {
            await navigator.clipboard.writeText(clipboardText);
            alert('Copied to browser clipboard!');
        } catch (e) {
            console.error("Failed to copy to browser:", e);
            alert('Failed to copy to browser clipboard');
        }
    };

    const handleResolutionChange = async (newResolution: number) => {
        setResolution(newResolution);
        setShowResolution(false);

        // Restart stream if currently streaming
        if (scrcpyClient) {
            try {
                await stopStream();
                // Small delay to ensure clean stop
                await new Promise(resolve => setTimeout(resolve, 500));
                // Stream will auto-restart via DeviceScreen component
                window.location.reload(); // Force complete restart for now
            } catch (e) {
                console.error("Failed to restart stream:", e);
            }
        }
    };

    const ResolutionOption = ({ label, value }: { label: string, value: number }) => {
        const isActive = value === resolution;
        return (
            <button
                onClick={() => handleResolutionChange(value)}
                className={`w-full text-left px-3 py-2 text-sm rounded-lg transition-colors flex items-center justify-between group ${isActive ? 'bg-primary/20 text-primary' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                    }`}
            >
                <span>{label}</span>
                {isActive && <span className="text-[10px] bg-primary/30 text-primary px-1.5 py-0.5 rounded font-medium">Active</span>}
            </button>
        );
    };

    // Right panel - action controls only
    return (
        <div className="h-full w-full flex flex-col justify-center items-center py-4 px-0 gap-4 md:gap-4 lg:gap-6 relative z-50 overflow-y-auto scrollbar-none">

            {/* Network Status Indicator */}
            <NetworkIndicator latency={networkLatency} quality={networkQuality} />

            {/* Action Controls */}
            <div className="flex flex-col gap-2 md:gap-3 w-full items-center">


                {/* Resolution Control */}
                <div className="relative flex items-center justify-center">
                    <ControlButton
                        icon={Monitor}
                        label="Resolution"
                        active={showResolution}
                        onClick={() => {
                            setShowResolution(!showResolution);
                            setShowSettings(false);
                        }}
                    />
                </div>

                {/* Portal for Resolution Modal */}
                {mounted && showResolution && createPortal(
                    <AnimatePresence mode="wait">
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 touch-none"
                            onClick={() => setShowResolution(false)}
                        >
                            <motion.div
                                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                                animate={{ scale: 1, opacity: 1, y: 0 }}
                                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                                onClick={(e) => e.stopPropagation()}
                                className="bg-slate-900 border border-white/10 p-6 rounded-2xl shadow-[0_0_50px_rgba(0,0,0,0.5)] w-full max-w-xs relative overflow-hidden"
                            >
                                {/* Decorative top gradient */}
                                <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

                                <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2 mt-2">
                                    <Monitor size={20} className="text-primary" />
                                    Stream Quality
                                </h3>
                                <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                                    Adjusting resolution helps with bandwidth. Stream will restart automatically.
                                </p>

                                <div className="space-y-2.5">
                                    <ResolutionOption label="Auto" value={0} />
                                    <ResolutionOption label="720p (HD)" value={720} />
                                    <ResolutionOption label="480p (SD)" value={480} />
                                    <ResolutionOption label="360p (Normal)" value={360} />
                                    <ResolutionOption label="240p (Low)" value={240} />
                                </div>

                                <button
                                    onClick={() => setShowResolution(false)}
                                    className="mt-6 w-full py-3 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-sm font-medium transition-colors"
                                >
                                    Cancel
                                </button>
                            </motion.div>
                        </motion.div>
                    </AnimatePresence>,
                    document.body
                )}

                <ControlButton icon={ChevronLeft} label="Back" onClick={() => injectKey(AndroidKeyCode.AndroidBack)} />
                <ControlButton icon={Circle} label="Home" onClick={() => injectKey(AndroidKeyCode.AndroidHome)} />
                <ControlButton icon={Square} label="Recent Apps" onClick={() => injectKey(AndroidKeyCode.AndroidAppSwitch)} />
                <div className="w-8 h-px bg-white/10 my-1" />

                <ControlButton icon={Volume2} label="Volume Up" onClick={() => injectKey(AndroidKeyCode.VolumeUp)} />
                <ControlButton icon={Volume1} label="Volume Down" onClick={() => injectKey(AndroidKeyCode.VolumeDown)} />
                <ControlButton icon={RotateCw} label="Rotate" active={isRotated} onClick={toggleRotation} />
                <ControlButton icon={Camera} label="Screenshot" onClick={() => { }} />
                {/* Clipboard button with NEW badge */}
                <div className="relative flex items-center justify-center">
                    <ControlButton
                        icon={Clipboard}
                        label="Clipboard"
                        active={showClipboard}
                        onClick={() => {
                            setShowClipboard(!showClipboard);
                            setShowSettings(false);
                            setShowResolution(false);
                            setClipboardHasNew(false);
                        }}
                    />
                    {/* Animated green badge when new clipboard arrives */}
                    {clipboardHasNew && !showClipboard && (
                        <span className="absolute -top-1 -right-1 flex h-3 w-3 pointer-events-none">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                            <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500" />
                        </span>
                    )}
                </div>
            </div>

            {/* Extra Controls: File/APK */}
            <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} />
            <input type="file" ref={apkInputRef} className="hidden" accept=".apk" onChange={handleInstallApk} />

            <div className="flex flex-col gap-2 md:gap-3 w-full items-center mt-2">
                <div className="w-8 h-px bg-white/10" />
                <ControlButton icon={FileUp} label="Upload File" onClick={() => fileInputRef.current?.click()} />
                <ControlButton icon={AppWindow} label="Install APK" onClick={() => apkInputRef.current?.click()} />
            </div>

            {/* Clipboard Sync Modal */}
            {mounted && showClipboard && createPortal(
                <AnimatePresence mode="wait">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
                        onClick={() => setShowClipboard(false)}
                    >
                        <motion.div
                            initial={{ scale: 0.9, y: 20 }}
                            animate={{ scale: 1, y: 0 }}
                            exit={{ scale: 0.9, y: 20 }}
                            onClick={(e) => e.stopPropagation()}
                            className="bg-slate-900 border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl"
                        >
                            <div className="flex items-center gap-3 mb-1">
                                <Clipboard size={24} className="text-primary" />
                                <h3 className="text-lg font-semibold text-white">Clipboard Sync</h3>
                                {/* Live dot */}
                                {connectedDevice?.serial && (
                                    <span className="ml-auto flex items-center gap-1.5 text-[10px] text-green-400 font-mono">
                                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                                        LIVE
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-slate-500 mb-4">
                                Copy di HP → otomatis muncul di sini &amp; tersalin ke clipboard browser
                            </p>

                            {/* Device clipboard log */}
                            {deviceClipboardLog.length > 0 && (
                                <div className="mb-4">
                                    <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Riwayat Copy HP</p>
                                    <div className="flex flex-col gap-1 max-h-32 overflow-y-auto scrollbar-none">
                                        {deviceClipboardLog.map((item, i) => (
                                            <button
                                                key={i}
                                                onClick={() => setClipboardText(item)}
                                                className={`w-full text-left px-3 py-1.5 rounded-lg text-xs transition-colors truncate ${i === 0
                                                    ? 'bg-green-500/15 text-green-300 border border-green-500/20'
                                                    : 'bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 border border-white/5'
                                                    }`}
                                            >
                                                {i === 0 && <span className="text-green-400 mr-1.5">●</span>}
                                                {item}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            <p className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold mb-2">Send as Keys</p>
                            <textarea
                                value={clipboardText}
                                onChange={(e) => setClipboardText(e.target.value)}
                                placeholder="Enter or paste text here... (multi-line supported)"
                                className="w-full h-28 px-3 py-2 bg-slate-800 border border-white/10 rounded-lg text-white text-sm resize-none focus:outline-none focus:border-primary/50 mb-4 font-mono"
                            />

                            <div className="space-y-2">
                                <button
                                    onClick={handleSendToDevice}
                                    className="w-full py-2.5 px-4 bg-primary hover:bg-primary/90 text-black rounded-lg font-medium transition-colors text-sm"
                                >
                                    Send as Keys to Device
                                </button>

                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={handlePasteFromBrowser}
                                        className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors text-xs border border-white/10"
                                    >
                                        Paste from Browser
                                    </button>
                                    <button
                                        onClick={handleCopyToBrowser}
                                        className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg transition-colors text-xs border border-white/10"
                                    >
                                        Copy to Browser
                                    </button>
                                </div>

                                <button
                                    onClick={() => setShowClipboard(false)}
                                    className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg transition-colors text-sm mt-2"
                                >
                                    Close
                                </button>
                            </div>
                        </motion.div>
                    </motion.div>
                </AnimatePresence>,
                document.body
            )}

            {/* Stream Settings Trigger */}
            <div className="relative">
                <ControlButton
                    icon={Settings2}
                    label="Stream Options"
                    active={showSettings}
                    onClick={() => {
                        setShowSettings(!showSettings);
                        setShowResolution(false);
                    }}
                />

                {/* Settings Popover */}
                <AnimatePresence>
                    {showSettings && (
                        <motion.div
                            initial={{ opacity: 0, x: 20, scale: 0.95 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="absolute right-[130%] top-1/2 -translate-y-1/2 w-72 p-5 rounded-2xl bg-slate-900/95 border border-white/10 backdrop-blur-xl shadow-2xl z-50 origin-right"
                        >
                            {/* Arrow */}
                            <div className="absolute -right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 bg-slate-900/95 border-r border-t border-white/10 rotate-45 transform"></div>

                            <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2 pb-3 border-b border-white/5">
                                <Settings2 size={16} className="text-primary" />
                                Scrcpy Options
                            </h3>

                            {/* Audio Toggle */}
                            <div className="space-y-4">
                                <div className="flex items-center justify-between group cursor-pointer" onClick={() => setLocalAudioEnabled(!localAudioEnabled)}>
                                    <div className="flex flex-col">
                                        <span className="text-sm text-slate-200 font-medium group-hover:text-primary transition-colors">Audio Forwarding</span>
                                        <span className="text-[10px] text-slate-400">Default: true (Scrcpy 2.0+)</span>
                                    </div>
                                    <div
                                        className={`w-11 h-6 rounded-full p-1 transition-all duration-300 relative ${localAudioEnabled ? 'bg-primary shadow-[0_0_10px_rgba(56,189,248,0.3)]' : 'bg-slate-700'}`}
                                    >
                                        <motion.div
                                            animate={{ x: localAudioEnabled ? 20 : 0 }}
                                            className="w-4 h-4 rounded-full bg-white shadow-sm"
                                        />
                                    </div>
                                </div>

                                <div className="p-3 rounded-lg bg-black/40 border border-white/5 text-[11px] text-slate-400 leading-relaxed font-mono">
                                    <span className="text-primary block mb-1 font-sans font-bold text-[10px] uppercase tracking-wider">Info</span>
                                    Disables the audio socket, allowing a video-only mode when turned off.
                                </div>
                            </div>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="flex-1" />
        </div>
    );
}
