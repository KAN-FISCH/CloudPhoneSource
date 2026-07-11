'use client';

import React, { useEffect, useRef, useState } from 'react';
import { useDevice } from '@/context/DeviceContext';
import { AndroidMotionEventAction, AndroidMotionEventButton } from '@yume-chan/scrcpy';

export default function DeviceScreen() {
    const {
        isConnected, startStream, stopStream,
        scrcpyClient, audioContextState, enableAudio,
        videoSize, updateVideoSize,
        isRotated, toggleRotation,
        resolution,
    } = useDevice();

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const [canvasStyle, setCanvasStyle] = useState<React.CSSProperties>({});

    // ─── Stable refs (used inside native event listeners without stale closures) ─
    const scrcpyRef = useRef(scrcpyClient);
    const isRotatedRef = useRef(isRotated);
    useEffect(() => { scrcpyRef.current = scrcpyClient; }, [scrcpyClient]);
    useEffect(() => { isRotatedRef.current = isRotated; }, [isRotated]);

    // Maps browser pointerId → sequential scrcpy pointerId (0, 1, 2...)
    // Server-side scrcpy reconstructs proper POINTER_DOWN/UP from these sequential IDs
    const browserToScrcpyId = useRef<Map<number, number>>(new Map());
    const usedScrcpyIds = useRef<Set<number>>(new Set());
    // Watchdog
    const lastActivityRef = useRef<number>(0);
    const watchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Assigns next available sequential ID to a browser pointer
    const acquireId = (browserId: number): number => {
        if (browserToScrcpyId.current.has(browserId)) {
            return browserToScrcpyId.current.get(browserId)!;
        }
        let id = 0;
        while (usedScrcpyIds.current.has(id)) id++;
        browserToScrcpyId.current.set(browserId, id);
        usedScrcpyIds.current.add(id);
        return id;
    };

    // Releases the scrcpy ID for a browser pointer, returns the ID that was used
    const releaseId = (browserId: number): number => {
        const id = browserToScrcpyId.current.get(browserId) ?? 0;
        browserToScrcpyId.current.delete(browserId);
        usedScrcpyIds.current.delete(id);
        return id;
    };

    // ─── Stream Lifecycle ──────────────────────────────────────────────────────
    useEffect(() => {
        if (isConnected && canvasRef.current && !scrcpyClient) {
            startStream(canvasRef.current);
        }
        return () => {
            if (scrcpyClient) stopStream();
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isConnected]);

    // ─── Audio Auto-Unlock (browser policy) ───────────────────────────────────
    useEffect(() => {
        if (!enableAudio) return;
        const tryUnlock = () => {
            if (audioContextState === 'suspended') enableAudio().catch(() => { });
        };
        window.addEventListener('pointerdown', tryUnlock, { capture: true });
        window.addEventListener('keydown', tryUnlock, { capture: true });
        return () => {
            window.removeEventListener('pointerdown', tryUnlock, { capture: true });
            window.removeEventListener('keydown', tryUnlock, { capture: true });
        };
    }, [audioContextState, enableAudio]);

    // ─── Canvas Dimension Observer (for auto-rotation) ─────────────────────────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !updateVideoSize) return;
        const mo = new MutationObserver(() => {
            if (canvas.width > 0 && canvas.height > 0)
                updateVideoSize({ width: canvas.width, height: canvas.height });
        });
        mo.observe(canvas, { attributes: true });
        return () => mo.disconnect();
    }, [updateVideoSize, isConnected]);

    // ─── Auto-Rotation (portrait container + landscape video → rotate) ─────────
    useEffect(() => {
        if (!containerRef.current || !videoSize) return;
        const { clientWidth: cW, clientHeight: cH } = containerRef.current;
        const { width: vW, height: vH } = videoSize;
        const shouldRotate = vW > vH && cH > cW;
        if (shouldRotate !== isRotated) toggleRotation();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [videoSize]);

    // ─── Canvas Style / Layout (landscape rotate CSS) ──────────────────────────
    useEffect(() => {
        const update = () => {
            if (!containerRef.current) return;
            const cW = containerRef.current.clientWidth;
            const cH = containerRef.current.clientHeight;

            if (isRotated) {
                const PAD = 30;
                const avail = cH - PAD;
                let cssW: number, cssH: number, visW: number, visH: number;

                if (videoSize && videoSize.width > 0 && videoSize.height > 0) {
                    const { width: vW, height: vH } = videoSize;
                    const scale = Math.min(cW / vH, avail / vW);
                    visW = vH * scale; visH = vW * scale;
                    cssW = visH; cssH = visW;
                } else {
                    const r = 16 / 9;
                    if (cW / avail > r) { visH = avail; visW = avail * r; }
                    else { visW = cW; visH = cW / r; }
                    cssW = visH; cssH = visW;
                }

                setCanvasStyle({
                    display: 'block', width: `${cssW}px`, height: `${cssH}px`,
                    maxWidth: 'none', maxHeight: 'none',
                    position: 'absolute', left: '50%',
                    top: `${visH / 2 + PAD}px`,
                    transform: 'translate(-50%, -50%) rotate(90deg)',
                });
            } else {
                setCanvasStyle({});
            }
        };

        const ro = new ResizeObserver(update);
        if (containerRef.current) ro.observe(containerRef.current);
        update();
        return () => ro.disconnect();
    }, [isRotated, videoSize]);

    // ─── Fast coordinate translator (uses live canvas rect + buffer dims) ──────
    const toDevice = (clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return null;
        const bW = canvas.width, bH = canvas.height;
        if (bW === 0 || bH === 0) return null;

        const r = canvas.getBoundingClientRect();
        const lx = clientX - r.left, ly = clientY - r.top;
        const vW = r.width, vH = r.height;

        let dX: number, dY: number;
        if (isRotatedRef.current) {
            dX = (ly / vH) * bW;
            dY = (1 - lx / vW) * bH;
        } else {
            const er = vW / vH, br = bW / bH;
            let dW = vW, dH = vH, sX = 0, sY = 0;
            if (er > br) { dH = vH; dW = vH * br; sX = (vW - dW) / 2; }
            else { dW = vW; dH = vW / br; sY = (vH - dH) / 2; }
            dX = ((lx - sX) / dW) * bW;
            dY = ((ly - sY) / dH) * bH;
        }

        return {
            x: Math.max(0, Math.min(Math.round(dX), bW)),
            y: Math.max(0, Math.min(Math.round(dY), bH)),
            bW, bH,
        };
    };

    // ─── Low-level inject (fire-and-forget) ────────────────────────────────────
    // For multi-touch: buttons MUST be 0 for finger touch (not mouse click)
    const inject = (action: AndroidMotionEventAction, pid: number, x: number, y: number, bW: number, bH: number) => {
        const c = scrcpyRef.current?.controller;
        if (!c) return;
        const isUp = action === AndroidMotionEventAction.Up
            || action === AndroidMotionEventAction.PointerUp
            || action === AndroidMotionEventAction.Cancel;
        c.injectTouch({
            action, pointerId: BigInt(pid),
            pointerX: x, pointerY: y,
            videoWidth: bW, videoHeight: bH,
            pressure: isUp ? 0 : 1,
            actionButton: 0,
            buttons: 0,  // 0 = finger touch (not AndroidMotionEventButton.Primary which is mouse)
        }).catch(() => { });
    };


    // ─── Force-reset all active pointers ──────────────────────────────────────
    const forceResetAllPointers = () => {
        const c = scrcpyRef.current?.controller;
        browserToScrcpyId.current.forEach((scrcpyId: number) => {
            if (c) {
                c.injectTouch({
                    action: AndroidMotionEventAction.Cancel,
                    pointerId: BigInt(scrcpyId),
                    pointerX: 0, pointerY: 0,
                    videoWidth: 1, videoHeight: 1,
                    pressure: 0, actionButton: 0,
                    buttons: 0,
                }).catch(() => { });
            }
        });
        browserToScrcpyId.current.clear();
        usedScrcpyIds.current.clear();
    };

    // ─── Native DOM Pointer Listeners (bypass React synthetic event layer) ─────
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Watchdog: if pointers stuck for > 3s without activity, force-reset
        watchdogRef.current = setInterval(() => {
            if (browserToScrcpyId.current.size > 0) {
                const now = Date.now();
                if (now - lastActivityRef.current > 3000) {
                    console.warn('[Touch] Watchdog: stuck pointers, force-resetting.');
                    forceResetAllPointers();
                }
            }
        }, 1000);

        const onDown = (e: PointerEvent) => {
            e.preventDefault();
            lastActivityRef.current = Date.now();
            try { canvas.setPointerCapture(e.pointerId); } catch (_) { }
            const d = toDevice(e.clientX, e.clientY);
            if (!d) return;
            // Always ACTION_DOWN — scrcpy server handles multi-touch reconstruction from pointerId
            const scrcpyId = acquireId(e.pointerId);
            inject(AndroidMotionEventAction.Down, scrcpyId, d.x, d.y, d.bW, d.bH);
        };

        const onMove = (e: PointerEvent) => {
            if (!browserToScrcpyId.current.has(e.pointerId)) return;
            e.preventDefault();
            lastActivityRef.current = Date.now();
            // Inject IMMEDIATELY — no RAF batching, so fast swipes are smooth and accurate
            const scrcpyId = browserToScrcpyId.current.get(e.pointerId)!;
            const d = toDevice(e.clientX, e.clientY);
            if (d) inject(AndroidMotionEventAction.Move, scrcpyId, d.x, d.y, d.bW, d.bH);
        };

        const onUp = (e: PointerEvent) => {
            if (!browserToScrcpyId.current.has(e.pointerId)) return;
            e.preventDefault();
            lastActivityRef.current = Date.now();
            // Release ID and inject ACTION_UP — scrcpy server handles POINTER_UP if needed
            const scrcpyId = releaseId(e.pointerId);
            const d = toDevice(e.clientX, e.clientY);
            if (d) inject(AndroidMotionEventAction.Up, scrcpyId, d.x, d.y, d.bW, d.bH);
            try { canvas.releasePointerCapture(e.pointerId); } catch (_) { }
        };

        const onCancel = (e: PointerEvent) => {
            if (!browserToScrcpyId.current.has(e.pointerId)) return;
            lastActivityRef.current = Date.now();
            const scrcpyId = releaseId(e.pointerId);
            const d = toDevice(e.clientX, e.clientY);
            if (d) inject(AndroidMotionEventAction.Up, scrcpyId, d.x, d.y, d.bW, d.bH);
            try { canvas.releasePointerCapture(e.pointerId); } catch (_) { }
        };

        const blockCtx = (e: Event) => { e.preventDefault(); e.stopPropagation(); };
        const blockTouchScroll = (e: TouchEvent) => { if (e.cancelable) e.preventDefault(); };

        canvas.addEventListener('pointerdown',   onDown,           { passive: false });
        canvas.addEventListener('pointermove',   onMove,           { passive: false });
        canvas.addEventListener('pointerup',     onUp,             { passive: false });
        canvas.addEventListener('pointercancel', onCancel,         { passive: false });
        canvas.addEventListener('contextmenu',   blockCtx);
        canvas.addEventListener('touchmove',     blockTouchScroll, { passive: false });

        return () => {
            canvas.removeEventListener('pointerdown',   onDown);
            canvas.removeEventListener('pointermove',   onMove);
            canvas.removeEventListener('pointerup',     onUp);
            canvas.removeEventListener('pointercancel', onCancel);
            canvas.removeEventListener('contextmenu',   blockCtx);
            canvas.removeEventListener('touchmove',     blockTouchScroll);
            if (watchdogRef.current !== null) { clearInterval(watchdogRef.current); watchdogRef.current = null; }
            browserToScrcpyId.current.clear();
            usedScrcpyIds.current.clear();
        };
    }, [isConnected]); // Re-bind when stream connects/disconnects

    // ─── JSX ───────────────────────────────────────────────────────────────────
    return (
        <div
            ref={containerRef}
            style={{ touchAction: 'none' }}
            className={`relative w-full h-full min-h-0 flex flex-col items-center justify-start bg-black overflow-hidden ${isRotated ? '' : 'p-1'}`}
        >
            {/* Resolution badge */}
            {isConnected && (
                <div className={`w-full flex justify-center ${!isRotated ? 'mb-2' : 'absolute top-3 left-1/2 -translate-x-1/2 z-50'}`}>
                    <div className="bg-black/60 backdrop-blur-md px-3 py-1 rounded-md border border-white/20">
                        <span className="text-[11px] font-medium text-white/90">
                            {resolution === 0 ? 'Auto' : `${resolution}p`}
                        </span>
                    </div>
                </div>
            )}

            {/* Canvas / Connecting spinner */}
            <div className={`relative flex items-center justify-center ${!isRotated ? 'flex-1 w-full min-h-0' : 'w-full h-full absolute inset-0'}`}>
                {isConnected ? (
                    <canvas
                        ref={canvasRef}
                        style={{
                            ...canvasStyle,
                            userSelect: 'none',
                            WebkitUserSelect: 'none',
                            // @ts-ignore
                            WebkitTouchCallout: 'none',
                        }}
                        className={`object-contain touch-none ${!isRotated ? 'w-full h-full max-w-full max-h-full' : ''}`}
                    />
                ) : (
                    <div className="absolute inset-0 bg-slate-900 flex flex-col items-center justify-center w-full h-full">
                        <div className="animate-pulse flex flex-col items-center gap-4">
                            <div className="w-16 h-16 rounded-full border-2 border-slate-800 border-t-primary animate-spin" />
                            <span className="font-mono text-sm tracking-widest text-slate-500 uppercase">Waiting...</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
