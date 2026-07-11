'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { useDevice } from '@/context/DeviceContext';
import type { HostDevice } from '@/context/DeviceContext';
import DeviceScreen from '@/components/DeviceScreen';
import ControlPanel from '@/components/ControlPanel';
import Sidebar from '@/components/Sidebar';
import { ArrowLeft } from 'lucide-react';

export default function DevicePage() {
    const params = useParams();
    const router = useRouter();
    const searchParams = useSearchParams();

    const serial = params?.serial as string;
    const token = searchParams?.get('token') ?? undefined;

    const { devices, connect, scanDevices, isConnected, connectedDevice } = useDevice();
    const [connecting, setConnecting] = useState(true);
    const [errorMsg, setErrorMsg] = useState('');
    const [retryCount, setRetryCount] = useState(0);

    const tryConnect = useCallback(async () => {
        if (!serial) return;

        // Already connected to this device — done
        if (isConnected && connectedDevice?.serial === serial) {
            setConnecting(false);
            return;
        }

        console.log(`[Device Page] Attempting connection for: ${serial}, token: ${token}`);

        // If we have a token, build a HostDevice directly — skip device list scan
        if (token) {
            const hostDevice: HostDevice = {
                type: 'host',
                serial,
                status: 'device',
            };
            try {
                await connect(hostDevice);
                return;
            } catch (e) {
                console.error('[Device Page] Token-based connect failed:', e);
            }
        }

        // Otherwise look in devices list (may need a scan first)
        const found = devices.find(d => d.serial === serial);
        if (found) {
            try {
                await connect(found);
            } catch (e) {
                console.error('[Device Page] Device list connect failed:', e);
            }
        } else {
            // Trigger a scan and retry
            await scanDevices();
            setRetryCount(c => c + 1);
        }
    }, [serial, token, isConnected, connectedDevice, connect, scanDevices, devices]);

    // Run connect on mount and on retry
    useEffect(() => {
        if (connecting) {
            tryConnect();
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [retryCount]);

    // Watch isConnected — stop spinner when connected
    useEffect(() => {
        if (isConnected && connectedDevice?.serial === serial) {
            setConnecting(false);
            setErrorMsg('');
        }
    }, [isConnected, connectedDevice, serial]);

    // Timeout — give up after 10s
    useEffect(() => {
        const timeout = setTimeout(() => {
            if (!isConnected) {
                setConnecting(false);
                setErrorMsg(`Device ${serial} tidak merespons. Pastikan device menyala dan ADB aktif.`);
            }
        }, 10000);
        return () => clearTimeout(timeout);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    if (connecting) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#0E0E10] text-white">
                <div className="flex flex-col items-center gap-5">
                    <div className="w-10 h-10 rounded-full border-2 border-blue-500 border-t-transparent animate-spin" />
                    <div className="text-center">
                        <p className="font-semibold text-white">Menghubungkan ke perangkat…</p>
                        <p className="text-sm text-gray-500 mt-1 font-mono">{serial}</p>
                    </div>
                </div>
            </div>
        );
    }

    if (!isConnected) {
        return (
            <div className="flex h-screen flex-col items-center justify-center bg-[#0E0E10] text-white gap-6">
                <div className="flex flex-col items-center gap-3 text-center max-w-xs">
                    <div className="w-14 h-14 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center text-2xl">📵</div>
                    <p className="font-bold text-white text-lg">Perangkat Tidak Terhubung</p>
                    <p className="text-sm text-gray-400 leading-relaxed">
                        {errorMsg || `Tidak dapat terhubung ke ${serial}. Pastikan ADB server aktif dan device sudah online.`}
                    </p>
                </div>
                <div className="flex gap-3">
                    <button
                        onClick={() => {
                            setConnecting(true);
                            setErrorMsg('');
                            setRetryCount(c => c + 1);
                        }}
                        className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-500 transition-colors text-sm"
                    >
                        Coba Lagi
                    </button>
                    <button
                        onClick={() => router.push('/')}
                        className="px-5 py-2.5 bg-white/5 text-white/70 rounded-xl font-semibold hover:bg-white/10 transition-colors text-sm"
                    >
                        Kembali
                    </button>
                </div>
            </div>
        );
    }

    // Render the dashboard view
    return (
        <main className="flex h-screen w-screen overflow-hidden bg-background text-foreground selection:bg-primary/30 touch-none">
            {/* Left Navigation - Hidden on mobile */}
            <div className="hidden md:block">
                <Sidebar />
            </div>

            <div className="flex-1 relative flex flex-row bg-[url('/grid-pattern.svg')] bg-center h-full">
                {/* Background Grid */}
                <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none" />

                {/* Device Screen + Bottom Nav - Integrated */}
                <div className="flex-1 relative min-h-0 flex flex-col items-center justify-center bg-black overflow-hidden">
                    {/* Floating Back Button */}
                    <button
                        onClick={() => router.push('/')}
                        className="absolute top-4 left-4 z-[60] p-3 rounded-full bg-black/50 hover:bg-black/80 border border-white/10 text-white transition-all backdrop-blur-md group"
                        title="Kembali ke Dashboard"
                    >
                        <ArrowLeft size={20} className="group-hover:-translate-x-0.5 transition-transform" />
                    </button>

                    {/* Device Viewport - Flexible height, shrinks if needed */}
                    <div className="flex-1 w-full min-h-0 flex items-center justify-center relative">
                        <DeviceScreen />
                    </div>
                </div>

                {/* Right Controls - Always on the right */}
                <div className="relative w-12 md:w-20 h-full border-l border-white/5 bg-secondary/10 backdrop-blur-sm flex-shrink-0">
                    <ControlPanel />
                </div>
            </div>
        </main>
    );
}
