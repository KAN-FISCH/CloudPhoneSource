'use client';

import React from 'react';
import { Smartphone, AppWindow, Folder, Terminal, Settings, Cast, Menu, Link2, Link2Off } from 'lucide-react';
import { cn } from '@/lib/utils';
import { motion } from 'framer-motion';
import { useDevice } from '@/context/DeviceContext';
import ConnectButton from './ConnectButton';

const navItems = [
    { icon: Smartphone, label: 'Device' },
    { icon: AppWindow, label: 'Apps' },
    { icon: Folder, label: 'Files' },
    { icon: Terminal, label: 'Shell' },
    { icon: Settings, label: 'Settings' },
];

export default function Sidebar() {
    const [active, setActive] = React.useState('Device');
    const { isConnected, connect, disconnect } = useDevice();

    return (
        <div className="h-screen w-20 flex flex-col items-center py-6 bg-secondary/20 border-r border-white/5 backdrop-blur-md z-50 overflow-y-auto scrollbar-none">
            <div className={cn(
                "mb-8 p-3 rounded-xl transition-all duration-500",
                isConnected ? "bg-green-500/20 text-green-400" : "bg-primary/20 text-primary animate-pulse"
            )}>
                <Cast size={24} />
            </div>

            <nav className="flex-1 flex flex-col gap-6 w-full px-2">
                {navItems.map((item) => (
                    <button
                        key={item.label}
                        onClick={() => setActive(item.label)}
                        className={cn(
                            "p-3 rounded-xl flex flex-col items-center justify-center gap-1 transition-all duration-300 relative group",
                            active === item.label
                                ? "bg-primary/20 text-primary shadow-[0_0_15px_rgba(56,189,248,0.3)]"
                                : "text-muted-foreground hover:text-white hover:bg-white/5"
                        )}
                        disabled={!isConnected && item.label !== 'Device'} // Disable other tabs if not connected?
                    >
                        <item.icon size={22} strokeWidth={1.5} />
                        <span className="text-[10px] font-medium opacity-0 group-hover:opacity-100 absolute -bottom-3 transition-opacity">
                            {item.label}
                        </span>
                        {active === item.label && (
                            <motion.div
                                layoutId="active-indicator"
                                className="absolute inset-0 rounded-xl border border-primary/50"
                                transition={{ duration: 0.3 }}
                            />
                        )}
                    </button>
                ))}
            </nav>

            {/* Connection Control */}
            <div className="flex flex-col gap-4 mb-4">
                {isConnected ? (
                    <button
                        onClick={disconnect}
                        className="p-3 text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded-xl transition-colors"
                        title="Disconnect"
                    >
                        <Link2Off size={20} />
                    </button>
                ) : (
                    <ConnectButton
                        onConnect={connect}
                        className="p-3 text-primary hover:text-white hover:bg-primary/20 rounded-xl transition-colors animate-bounce"
                    />
                )}
            </div>

            <button className="p-3 text-muted-foreground hover:text-white transition-colors">
                <Menu size={20} />
            </button>
        </div>
    );
}
