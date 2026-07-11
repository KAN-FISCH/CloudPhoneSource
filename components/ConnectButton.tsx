'use client';

import React from 'react';
import { AdbDaemonWebUsbDevice, AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';

interface ConnectButtonProps {
    onConnect: (connection: AdbDaemonWebUsbDevice) => void;
    className?: string;
}

export default function ConnectButton({ onConnect, className }: ConnectButtonProps) {
    const handleConnect = async () => {
        try {
            // Access the default WebUSB manager
            const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
            if (!manager) {
                alert('WebUSB is not supported in this browser.');
                return;
            }

            // Request a device (opens browser picker)
            const device = await manager.requestDevice();
            if (!device) return;

            // In this component we just pass the device back, 
            // the actual connection happens in the Context or Parent.
            // But props says onConnect takes connection.
            // Actually Context needs the device to create connection OR the connection itself.

            // Let's pass the DEVICE object, and Context will connect.
            onConnect(device);

        } catch (error) {
            console.error('Connection failed:', error);
            alert('Failed to connect to device. Make sure you have permission.');
        }
    };

    return (
        <button
            onClick={handleConnect}
            className={className}
        >
            Connect Device
        </button>
    );
}
