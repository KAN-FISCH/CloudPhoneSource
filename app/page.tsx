'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useDevice } from '@/context/DeviceContext';
import { useAuth } from '@/context/AuthContext';
import {
  Smartphone, Wrench, Compass, User, Plus, Loader2, Play,
  Settings, Power, ShieldCheck, ChevronRight, X, UserCircle,
  MapPin, CheckCircle2, RotateCcw, CreditCard, Lock, Wifi, PenTool,
  Cog, Box
} from 'lucide-react';
import { AdbDaemonWebUsbDeviceManager } from '@yume-chan/adb-daemon-webusb';
import AuthModal from '@/components/AuthModal';

interface CloudDevice {
  id: number;
  device_udid: string;
  order_id: string;
  token: string;
  stream_url: string;
  expires_at: string;
  current_game?: string; // New feature!
  roblox_private_server_url?: string;
  cpu?: string;
  ram?: string;
}

interface Transaction {
  id: number;
  order_id: string;
  amount: number;
  plan: string;
  status: string;
  is_allocated: number;
  created_at: string;
}

const CPU_OPTIONS = [
  { id: 'S625', label: 'Snapdragon 625', basePrice: 17000, hint: 'Fisch CPU: 33-40ms' },
  { id: 'S636', label: 'Snapdragon 636', basePrice: 20000 },
  { id: 'S845', label: 'Snapdragon 845', basePrice: 37000, hint: 'Fisch CPU: ~16ms' },
  { id: 'S855', label: 'Snapdragon 855', basePrice: 37000, hint: 'Fisch CPU: ~16ms' },
  { id: 'S865', label: 'Snapdragon 865', basePrice: 37000, hint: 'Fisch CPU: ~16ms' },
  { id: 'S888', label: 'Snapdragon 888', basePrice: 37000, hint: 'Fisch CPU: ~16ms' }
];

// RAM add-on price: total = CPU basePrice + RAM addPrice
const RAM_OPTIONS = [
  { id: '3GB', label: '3GB RAM', addPrice: 0 },
  { id: '4GB', label: '4GB RAM', addPrice: 0 },
  { id: '6GB', label: '6GB RAM', addPrice: 0 },
  { id: '8GB', label: '8GB RAM', addPrice: 5000 },
  { id: '12GB', label: '12GB RAM', addPrice: 10000 },
  { id: '16GB', label: '16GB RAM', addPrice: 20000 }
];

export default function RedfingerHomepage() {
  const { devices, scanDevices } = useDevice();
  const { user, logout, isLoading: authLoading } = useAuth();

  const [activeTab, setActiveTab] = useState<'cloud' | 'tools' | 'discover' | 'me'>('cloud');
  const [authModalOpen, setAuthModalOpen] = useState(false);

  const [myDevices, setMyDevices] = useState<CloudDevice[]>([]);
  const [fetchingMyDevices, setFetchingMyDevices] = useState(false);

  // Purchase Modal State
  const [purchaseModalOpen, setPurchaseModalOpen] = useState(false);
  const [availableStock, setAvailableStock] = useState<Record<string, Record<string, number>> | null>(null);
  const [planCpu, setPlanCpu] = useState('');
  const [planRam, setPlanRam] = useState('');
  const [serverLoc, setServerLoc] = useState('ID');
  const [loadingPurchase, setLoadingPurchase] = useState(false);
  const [renewSubId, setRenewSubId] = useState<number | null>(null);
  const [pendingPayment, setPendingPayment] = useState<{ order_id: string, qrisUrl: string, amount: number, paymentUrl: string, expiresAt?: string } | null>(null);
  const [qrisTimeRemaining, setQrisTimeRemaining] = useState<string>('');
  // Roblox Auto Rejoin Modal
  const [robloxModalOpen, setRobloxModalOpen] = useState(false);
  const [activeRobloxDev, setActiveRobloxDev] = useState<CloudDevice | null>(null);
  const [robloxUrlInput, setRobloxUrlInput] = useState('');
  const [robloxScriptInput, setRobloxScriptInput] = useState('');
  const [savingRobloxUrl, setSavingRobloxUrl] = useState(false);

  // History Modal State
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [transactionHistory, setTransactionHistory] = useState<Transaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const handleDeleteDevice = (id: number) => {
    if (!confirm('Are you sure you want to end this session and delete this device subscription?')) return;
    
    fetch('/api/admin/device/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscriptionId: id })
    })
    .then(async res => {
      const isJson = res.headers.get('content-type')?.includes('application/json');
      if (!res.ok) {
        if (isJson) {
            const data = await res.json();
            throw new Error(data.error || `Server returned ${res.status}`);
        } else {
            throw new Error(`Server returned ${res.status} (Endpoint might not be built yet)`);
        }
      }
      return res.json();
    })
    .then(data => {
      alert('Device deleted successfully');
      // Refresh the list
      fetch('/api/device/my')
        .then(res => res.json())
        .then(data => data.devices && setMyDevices(data.devices))
        .catch(() => {});
    })
    .catch(e => alert(e.message));
  };

  // Price Calculation
  const currentCpu = CPU_OPTIONS.find(c => c.id === planCpu);
  const currentRam = RAM_OPTIONS.find(r => r.id === planRam);
  const totalPrice = (currentCpu?.basePrice || 0) + (currentRam?.addPrice || 0);

  // Fetch available stock when purchase modal opens
  useEffect(() => {
    if (purchaseModalOpen) {
      fetch('/api/device/available')
        .then(res => res.json())
        .then(data => {
          if (data) {
            setAvailableStock(data);
          }
        })
        .catch(() => { });
    }
  }, [purchaseModalOpen]);

  // Auto-claim payment success handler
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('payment') === 'success' && params.get('order_id')) {
        const orderId = params.get('order_id');
        window.history.replaceState({}, document.title, window.location.pathname);

        fetch('/api/device/allocate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ order_id: orderId })
        })
          .then(res => res.json())
          .then(data => {
            if (!data.error) {
              alert('Pembayaran berhasil! Perangkat telah ditambahkan ke akun Anda.');
            }
          })
          .catch(() => { });
      }
    }
  }, []);

  // Poll for devices every 5 seconds if on cloud tab to update the "Currently Playing" state
  useEffect(() => {
    if (user && activeTab === 'cloud') {
      const fetchDevs = () => {
        setFetchingMyDevices(true);
        fetch('/api/device/my')
          .then(res => res.json())
          .then(data => data.devices && setMyDevices(data.devices))
          .finally(() => setFetchingMyDevices(false));
      };
      fetchDevs();
      const interval = setInterval(fetchDevs, 10000);
      return () => clearInterval(interval);
    } else {
      setMyDevices([]);
    }
  }, [user, activeTab]);

  const handlePurchaseAttempt = () => {
    if (!planCpu || !planRam) {
      alert("Pilih Processor dan RAM terlebih dahulu!");
      return;
    }
    if (!user) {
      setPurchaseModalOpen(false);
      setAuthModalOpen(true);
      return;
    }
    setLoadingPurchase(true);
    // We set plan to '7_days' to show correctly in transaction history
    fetch('/api/payment/purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plan: '7_days', cpu: planCpu, ram: planRam, renewSubId })
    })
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          alert(`Pembelian gagal: ${data.error}`);
        } else if (data.qrisUrl) {
          setPendingPayment(data);
          setPurchaseModalOpen(false);
        } else if (data.paymentUrl) {
          window.location.href = data.paymentUrl;
        } else {
          alert('Terjadi kesalahan yang tidak diketahui.');
        }
      })
      .catch(e => alert(e.message))
      .finally(() => setLoadingPurchase(false));
  };

  // Polling for payment status
  useEffect(() => {
    if (!pendingPayment) return;

    let timerInterval: NodeJS.Timeout;
    if (pendingPayment.expiresAt) {
      timerInterval = setInterval(() => {
        const diff = new Date(pendingPayment.expiresAt as string).getTime() - new Date().getTime();
        if (diff <= 0) {
          setQrisTimeRemaining('Expired');
          setPendingPayment(null);
          clearInterval(timerInterval);
        } else {
          const m = Math.floor(diff / 60000);
          const s = Math.floor((diff % 60000) / 1000);
          setQrisTimeRemaining(`${m}:${s.toString().padStart(2, '0')}`);
        }
      }, 1000);
    }

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/payment/status?order_id=${pendingPayment.order_id}`);
        const data = await res.json();

        if (data.status === 'SUCCESS' || data.status === 'PAID' || data.status === 'COMPLETED') {
          clearInterval(interval);
          if (timerInterval) clearInterval(timerInterval);

          // Allocate device
          const allocRes = await fetch('/api/device/allocate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ order_id: pendingPayment.order_id })
          });
          const allocData = await allocRes.json();
          if (allocData.streamUrl) {
            alert('Pembayaran berhasil! Perangkat telah ditambahkan ke akun Anda.');
            setPendingPayment(null);
          } else {
            alert(allocData.error || 'Allocation failed after payment');
            setPendingPayment(null);
          }
        } else if (data.status === 'FAILED' || data.status === 'CANCELED' || data.status === 'EXPIRED') {
          clearInterval(interval);
          if (timerInterval) clearInterval(timerInterval);
          alert('Payment failed or expired.');
          setPendingPayment(null);
        }
      } catch (e) {
        // ignore network errors during polling
      }
    }, 3000);

    return () => {
      clearInterval(interval);
      if (timerInterval) clearInterval(timerInterval);
    };
  }, [pendingPayment]);

  const handleSaveRobloxUrl = async () => {
    if (!activeRobloxDev) return;
    setSavingRobloxUrl(true);
    try {
      const res = await fetch('/api/device/roblox-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: activeRobloxDev.id, url: robloxUrlInput, script: robloxScriptInput })
      });
      if (res.ok) {
        setMyDevices(prev => prev.map(d => d.id === activeRobloxDev.id ? { ...d, roblox_private_server_url: robloxUrlInput, roblox_auto_execute_script: robloxScriptInput } : d));
        setRobloxModalOpen(false);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save URL');
      }
    } catch (e: any) {
      alert(e.message);
    } finally {
      setSavingRobloxUrl(false);
    }
  };

  const fetchTransactionHistory = () => {
    setLoadingHistory(true);
    fetch('/api/user/transactions')
      .then(res => res.json())
      .then(data => {
        if (data.transactions) setTransactionHistory(data.transactions);
      })
      .catch(err => console.error('Failed to load history', err))
      .finally(() => setLoadingHistory(false));
  };

  const getTimeRemaining = (expiresAt: string) => {
    const diff = new Date(expiresAt).getTime() - new Date().getTime();
    if (diff <= 0) return 'Expired';
    const h = Math.floor(diff / (1000 * 60 * 60));
    const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    if (h > 24) return `${Math.floor(h / 24)} Days`;
    return `${h}h ${m}m`;
  };

  return (
    <div className="min-h-screen bg-[#0E0E10] text-gray-200 font-sans selection:bg-blue-500/30 flex justify-center touch-pan-y">
      {/* Mobile Constraint Container */}
      <div className="w-full max-w-md bg-[#0E0E10] min-h-screen relative shadow-2xl overflow-x-hidden flex flex-col touch-pan-y">


        {/* --- TAB: CLOUD PHONE --- */}
        {activeTab === 'cloud' && (
          <div className="flex-1 px-5 pt-2 pb-24 overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-white tracking-tight">
                  {user?.role === 'admin' ? 'All User Devices (Admin)' : 'My Cloud Phones'}
                </h1>
                <span className="bg-white/10 text-white/70 px-2 py-0.5 rounded-full text-xs font-semibold">
                  {myDevices.length} Active
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* 1. Add Device Card */}
              <button
                onClick={() => {
                  setRenewSubId(null);
                  setPurchaseModalOpen(true);
                }}
                className="aspect-[4/7] bg-[#141518] border border-white/5 rounded-2xl flex flex-col items-center justify-center gap-3 hover:bg-[#1a1b1f] transition-all group"
              >
                <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500 group-hover:scale-110 transition-transform">
                  <Plus size={24} />
                </div>
                <span className="text-blue-500 text-sm font-medium w-24 text-center leading-tight">
                  Purchase Cloud Phone
                </span>
              </button>

              {/* 2. Active Cloud Devices */}
              {!user && !authLoading && (
                <div className="aspect-[4/7] border border-dashed border-white/10 rounded-2xl flex flex-col items-center justify-center text-center p-4">
                  <Lock size={24} className="text-white/20 mb-2" />
                  <p className="text-xs text-white/40">Sign in to view your devices</p>
                </div>
              )}

              {myDevices.map((dev) => {
                const appLogo = (dev as any).app_logo as string || '';
                const appUptime = (dev as any).app_uptime as string || '';
                const catColor = (dev as any).app_category === 'game' ? 'text-orange-400 bg-orange-500/10 border-orange-500/20'
                  : (dev as any).app_category === 'social' ? 'text-blue-400 bg-blue-500/10 border-blue-500/20'
                    : (dev as any).app_category === 'media' ? 'text-purple-400 bg-purple-500/10 border-purple-500/20'
                      : 'text-gray-400 bg-white/5 border-white/10';
                const isActive = dev.current_game && dev.current_game !== 'Standby' && dev.current_game !== 'Beranda' && dev.current_game !== 'Offline';
                return (
                  <Link
                    href={dev.stream_url}
                    key={dev.id}
                    className="aspect-[4/7] bg-[#141518] rounded-2xl border border-white/5 relative flex flex-col overflow-hidden hover:border-blue-500/40 transition-all group"
                  >
                    {/* Phone Screen Preview */}
                    <div className="flex-1 bg-[#0c0c0f] relative overflow-hidden">
                      <div className={`absolute inset-0 bg-gradient-to-b ${isActive ? 'from-orange-900/20' : 'from-blue-900/20'} via-[#0c0c0f] to-[#0c0c0f]`} />
                      {/* Fake status bar */}
                      <div className="absolute top-0 inset-x-0 flex items-center justify-between px-2.5 pt-1.5">
                        <span className="text-[8px] text-white/60 font-medium">9:41 AM</span>
                        <div className="w-3 h-1.5 border border-white/40 rounded-[1px] relative">
                          <div className="absolute inset-0.5 bg-green-400 rounded-[1px] w-2/3" />
                        </div>
                      </div>
                      {/* Active / Live badge */}
                      <div className="absolute top-6 left-2">
                        {isActive
                          ? <span className="bg-orange-500/90 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-sm tracking-wider flex items-center gap-1">
                            <span className="w-1 h-1 rounded-full bg-white animate-pulse inline-block" />AKTIF
                          </span>
                          : <span className="bg-green-500/90 text-black text-[8px] font-bold px-1.5 py-0.5 rounded-sm tracking-wider">LIVE</span>
                        }
                      </div>
                      {/* Center: App Logo or Play Icon */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        {appLogo ? (
                          <div className="flex flex-col items-center gap-2 group-hover:scale-105 transition-transform">
                            <img
                              src={appLogo}
                              alt={dev.current_game || ''}
                              className="w-14 h-14 rounded-2xl object-cover"
                              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 rounded-full bg-blue-500/20 border border-blue-500/30 flex items-center justify-center group-hover:scale-110 transition-transform">
                            <Play className="text-blue-400 w-5 h-5 ml-0.5" fill="currentColor" />
                          </div>
                        )}
                      </div>
                      {/* Bottom: App info panel */}
                      <div className="absolute bottom-2 inset-x-2">
                        <div className="bg-black/70 backdrop-blur-md rounded-lg p-2 border border-white/10">
                          <p className="text-[8px] text-blue-400 font-bold uppercase tracking-widest truncate mb-1.5">
                            {dev.device_udid.substring(0, 12)}
                          </p>
                          {/* App name badge */}
                          <div className={`flex items-center gap-1.5 px-1.5 py-1 rounded-md border text-[9px] font-bold ${catColor}`}>
                            {isActive && <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse flex-shrink-0" />}
                            <span className="truncate">{dev.current_game || 'Standby'}</span>
                          </div>
                          {/* Uptime */}
                          {isActive && appUptime && appUptime !== '0d' && (
                            <p className="text-[8px] text-white/40 mt-1 text-center">
                              ⏱ Bermain {appUptime}
                            </p>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Card Footer */}
                    <div className="p-2.5">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 w-0">
                          <p className="text-[11px] font-bold text-white leading-tight truncate">{dev.current_game || 'Cloud Phone'}</p>
                          <p className="text-[9px] text-gray-500 mt-0.5">{getTimeRemaining(dev.expires_at)} left</p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setActiveRobloxDev(dev);
                            setRobloxUrlInput(dev.roblox_private_server_url || '');
                            setRobloxScriptInput((dev as any).roblox_auto_execute_script || '');
                            setRobloxModalOpen(true);
                          }}
                          className="bg-white/5 border border-white/10 hover:bg-white/10 text-gray-400 hover:text-white p-1 rounded-md transition-colors z-20 flex-shrink-0 ml-1"
                          title="Auto Rejoin Settings"
                        >
                          <Settings size={14} />
                        </button>
                      </div>
                      <div className="flex gap-1.5 mt-2">
                        <div className="flex-1 bg-blue-600/90 text-white text-[10px] font-bold text-center py-1.5 rounded-lg group-hover:bg-blue-500 transition-colors pointer-events-none">
                          Tap to Stream
                        </div>
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            // Auto-select specs from the device data for renewal
                            if (dev.cpu) setPlanCpu(dev.cpu);
                            if (dev.ram) setPlanRam(dev.ram);
                            
                            setRenewSubId(dev.id);
                            setPurchaseModalOpen(true);
                          }}
                          className="px-3 bg-white/5 border border-white/10 hover:bg-white/10 text-white text-[10px] font-bold py-1.5 rounded-lg transition-colors z-20"
                        >
                          Renew
                        </button>
                        {user?.role === 'admin' && (
                          <button
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleDeleteDevice(dev.id);
                            }}
                            className="px-3 bg-rose-500/10 border border-rose-500/20 hover:bg-rose-500/20 text-rose-400 text-[10px] font-bold py-1.5 rounded-lg transition-colors z-20"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </Link>
                );
              })}

            </div>
          </div>
        )}

        {/* --- TAB: TOOLS --- */}
        {activeTab === 'tools' && (
          <div className="flex-1 px-5 pt-8 pb-24 overflow-y-auto">
            <h1 className="text-2xl font-bold text-white tracking-tight mb-6">Tools</h1>

            <div className="bg-[#141518] border border-white/5 rounded-3xl p-2 flex flex-col">
              {[
                { icon: ShieldCheck, label: 'Tingkatkan (Upgrade)', color: 'text-rose-400', bg: 'bg-rose-500/10' },
                { icon: PenTool, label: 'Kustomisasi', color: 'text-blue-400', bg: 'bg-blue-500/10' },
                { icon: RotateCcw, label: 'Mulai ulang dalam batch', color: 'text-orange-400', bg: 'bg-orange-500/10' },
                { icon: RotateCcw, label: 'Reset dalam batch', color: 'text-cyan-400', bg: 'bg-cyan-500/10' },
              ].map((item, i) => (
                <button key={i} className="flex items-center justify-between p-4 hover:bg-white/5 rounded-2xl transition-colors">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl ${item.bg} flex items-center justify-center`}>
                      <item.icon size={20} className={item.color} />
                    </div>
                    <span className="text-sm font-semibold text-gray-200">{item.label}</span>
                  </div>
                  <ChevronRight size={18} className="text-gray-600" />
                </button>
              ))}

              {/* Root Toggle */}
              <div className="flex items-center justify-between p-4 hover:bg-white/5 rounded-2xl transition-colors">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-xl bg-green-500/10 flex items-center justify-center">
                    <Cog size={20} className="text-green-400" />
                  </div>
                  <span className="text-sm font-semibold text-gray-200">Root</span>
                </div>
                <div className="w-12 h-6 bg-white/20 rounded-full p-1 flex justify-start cursor-pointer transition-colors">
                  <div className="w-4 h-4 rounded-full bg-white shadow-sm" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* --- TAB: DISCOVER --- */}
        {activeTab === 'discover' && (
          <div className="flex-1 px-5 pt-8 pb-24 flex flex-col items-center justify-center">
            <Compass size={48} className="text-blue-500/20 mb-4" />
            <h2 className="text-white font-bold mb-2">Explore Features</h2>
            <p className="text-gray-500 text-sm text-center">New tools and game features will be updated here soon.</p>
          </div>
        )}

        {/* --- TAB: ME --- */}
        {activeTab === 'me' && (
          <div className="flex-1 pb-24 overflow-y-auto">
            {/* Profile Header Block */}
            <div className="px-5 pt-8 pb-6 bg-[#141518] rounded-b-3xl border-b border-white/5">
              <div className="flex items-center justify-between mb-8">
                <div className="flex items-center gap-4">
                  <div className="w-16 h-16 rounded-full bg-white/10 flex items-center justify-center border-2 border-white/5">
                    <UserCircle size={40} className="text-gray-400" strokeWidth={1.5} />
                  </div>
                  <div>
                    <h2 className="text-xl font-bold text-white leading-tight">
                      {user ? user.name : 'Guest'}
                    </h2>
                    {user && user.role === 'admin' && (
                      <span className="text-red-400 text-[10px] font-bold uppercase tracking-widest border border-red-500/30 px-2 py-0.5 rounded-full mt-1 inline-block">Admin Role</span>
                    )}
                    <p className="text-xs text-gray-500 mt-1">
                      ID: {user ? user.id * 1087000 : '10870840'}
                    </p>
                  </div>
                </div>
                {!user ? (
                  <button onClick={() => setAuthModalOpen(true)} className="bg-blue-600 text-white font-bold text-sm px-5 py-2 rounded-full hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20">
                    Sign in
                  </button>
                ) : (
                  <button className="bg-blue-600 text-white font-bold text-sm px-5 py-2 rounded-full hover:bg-blue-500 transition-colors shadow-lg shadow-blue-500/20">
                    Check-in
                  </button>
                )}
              </div>

              {/* Quick Stats Grid */}
              <div className="grid grid-cols-4 gap-2 text-center relative z-10">
                {[{ n: '0', l: '0', ic: 'text-blue-500', isStar: true }, { n: 'Membeli', ic: 'text-blue-300' }, { n: 'Hadiah', ic: 'text-rose-400' }, { n: 'Pesanan', ic: 'text-emerald-500' }].map((s, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    {s.isStar ? <ShieldCheck size={20} className={s.ic} /> : <Box size={20} className={s.ic} />}
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">{s.n}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Profile Menu Actions */}
            <div className="px-5 py-4">
              <div className="flex flex-col gap-1">
                {[
                  { l: 'Manajemen otorisasi' },
                  { l: 'Kode penukaran prabayar' },
                  { l: 'Manajemen Langganan' },
                  { l: 'Riwayat Transaksi', isHistory: true },
                  { l: 'Pengaturan' },
                  { l: 'Deteksi Jaringan' }
                ].map((ac, i) => (
                  <button
                    key={i}
                    onClick={() => {
                      if (ac.isHistory) {
                        setHistoryModalOpen(true);
                        fetchTransactionHistory();
                      }
                    }}
                    className="flex items-center justify-between py-4 text-left border-b border-white/5 last:border-0 hover:bg-white/5 px-4 rounded-xl transition-all"
                  >
                    <span className="text-[14px] font-medium text-gray-300">{ac.l}</span>
                    <ChevronRight size={18} className="text-gray-600" />
                  </button>
                ))}

                {/* Switch/Logout */}
                {user && (
                  <button onClick={logout} className="flex items-center gap-3 py-4 text-left border-t border-white/5 hover:bg-white/5 px-4 rounded-xl transition-all mt-4">
                    <RotateCcw size={18} className="text-blue-500" />
                    <span className="text-[14px] font-medium text-gray-300">Ganti akun (Logout)</span>
                  </button>
                )}
              </div>

            </div>
          </div>
        )}

        {/* --- BOTTOM NAVIGATION BAR --- */}
        <div className="absolute bottom-0 inset-x-0 bg-[#0A0A0B]/95 backdrop-blur-xl border-t border-white/5 flex items-center justify-around pb-6 pt-2 z-40 relative">
          <button onClick={() => setActiveTab('cloud')} className="flex flex-col items-center gap-1.5 p-2 w-16 group outline-none">
            <Smartphone size={22} className={`transition-colors duration-300 ${activeTab === 'cloud' ? 'text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'text-gray-500 group-hover:text-gray-400'}`} />
            <span className={`text-[10px] font-medium transition-colors ${activeTab === 'cloud' ? 'text-blue-500' : 'text-gray-500'}`}>Cloud Phone</span>
          </button>
          <button onClick={() => setActiveTab('tools')} className="flex flex-col items-center gap-1.5 p-2 w-16 group outline-none">
            <Wrench size={22} className={`transition-colors duration-300 ${activeTab === 'tools' ? 'text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'text-gray-500 group-hover:text-gray-400'}`} />
            <span className={`text-[10px] font-medium transition-colors ${activeTab === 'tools' ? 'text-blue-500' : 'text-gray-500'}`}>Tools</span>
          </button>
          <button onClick={() => setActiveTab('discover')} className="flex flex-col items-center gap-1.5 p-2 w-16 group outline-none">
            <Compass size={22} className={`transition-colors duration-300 ${activeTab === 'discover' ? 'text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'text-gray-500 group-hover:text-gray-400'}`} />
            <span className={`text-[10px] font-medium transition-colors ${activeTab === 'discover' ? 'text-blue-500' : 'text-gray-500'}`}>Discover</span>
          </button>
          <button onClick={() => setActiveTab('me')} className="flex flex-col items-center gap-1.5 p-2 w-16 group outline-none">
            <User size={22} className={`transition-colors duration-300 ${activeTab === 'me' ? 'text-blue-500 drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]' : 'text-gray-500 group-hover:text-gray-400'}`} />
            <span className={`text-[10px] font-medium transition-colors ${activeTab === 'me' ? 'text-blue-500' : 'text-gray-500'}`}>Me</span>
          </button>
        </div>

        {/* --- PURCHASE MODAL (Redfinger Style) --- */}
        {purchaseModalOpen && (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm p-0 sm:p-4">
            <div className="w-full max-w-md bg-[#18181A] rounded-t-3xl sm:rounded-3xl flex flex-col max-h-[90vh] shadow-[0_-10px_40px_rgba(0,0,0,0.5)] overflow-hidden animate-in slide-in-from-bottom-5">
              {/* Modal Header */}
              <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
                <h2 className="text-lg font-bold text-white leading-tight">
                  {renewSubId ? 'Extend Subscription' : 'Purchase Cloud Phone'}
                </h2>
                <button onClick={() => setPurchaseModalOpen(false)} className="text-gray-400 hover:text-white transition-colors bg-white/5 p-1.5 rounded-full">
                  <X size={18} />
                </button>
              </div>

              <div className="p-5 flex-1 overflow-y-auto">
                {renewSubId ? (
                  /* --- SIMPLIFIED RENEW VIEW --- */
                  <div className="flex flex-col gap-6">
                    <div className="bg-blue-500/10 border border-blue-500/20 p-5 rounded-2xl">
                      <div className="flex justify-between items-start mb-4">
                        <div>
                          <p className="text-xs font-bold text-blue-400 uppercase tracking-wider mb-1">Renewing Device</p>
                          <h3 className="text-lg font-bold text-white">{myDevices.find(d => d.id === renewSubId)?.device_udid}</h3>
                        </div>
                        <div className="bg-blue-500 text-[10px] font-bold px-2 py-1 rounded-md text-white uppercase">7 Days Plan</div>
                      </div>
                      
                      <div className="flex flex-col gap-2 pt-3 border-t border-white/5">
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">Processor</span>
                          <span className="text-white font-semibold">{planCpu || 'Original Spec'}</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400">RAM</span>
                          <span className="text-white font-semibold">{planRam || 'Original Spec'}</span>
                        </div>
                      </div>
                    </div>

                    <div className="bg-[#141518] p-5 rounded-2xl border border-white/5">
                      <p className="text-xs font-bold text-gray-500 uppercase mb-3">Total Pembayaran</p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-3xl font-black text-white">Rp {totalPrice.toLocaleString('id-ID')}</span>
                        <span className="text-xs text-gray-500 font-bold">/ 7 Hari</span>
                      </div>
                    </div>

                    <p className="text-[10px] text-gray-500 text-center leading-relaxed px-4">
                      Dengan melanjutkan, masa aktif perangkat Anda akan otomatis bertambah 7 hari setelah pembayaran berhasil diverifikasi.
                    </p>
                  </div>
                ) : (
                  /* --- FULL PURCHASE VIEW --- */
                  <>
                    {/* Plan Tier Tabs */}
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">Processor (CPU)</h4>
                    <div className="flex gap-3 mb-6 overflow-x-auto scrollbar-none snap-x pb-2 pt-2">
                      {CPU_OPTIONS.map(cpu => (
                        <button
                          key={cpu.id}
                          onClick={() => setPlanCpu(cpu.id)}
                          className={`relative snap-start min-w-[100px] shrink-0 flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${planCpu === cpu.id ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'border-white/10 bg-[#141518] text-gray-400 hover:border-white/20'}`}
                        >
                          <span className={`font-bold uppercase tracking-wider mb-0.5 ${planCpu === cpu.id ? 'text-blue-400' : 'text-white'}`}>{cpu.id}</span>
                          <span className="text-[10px] font-medium mb-1.5">{cpu.label}</span>
                          {cpu.hint && <span className="text-[8px] text-blue-400/80 font-bold mb-1.5">{cpu.hint}</span>}
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${availableStock !== null && availableStock[cpu.id] && Object.values(availableStock[cpu.id]).reduce((a, b) => a + b, 0) > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-500'}`}>
                            {availableStock !== null ? (availableStock[cpu.id] ? `Stock: ${Object.values(availableStock[cpu.id]).reduce((a, b) => a + b, 0)}` : 'Habis') : '...'}
                          </span>
                        </button>
                      ))}
                    </div>

                    {/* Highlight Card */}
                    {planCpu && planRam && (
                      <div className="bg-gradient-to-br from-[#3b82f6] to-[#1e40af] p-5 rounded-2xl mb-8 relative overflow-hidden shadow-xl shadow-blue-500/20">
                        <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl pointer-events-none" />
                        <span className="bg-white/20 text-white text-[10px] font-bold px-3 py-1 rounded-full mb-3 inline-block shadow-sm">Selected Spec</span>
                        <h3 className="text-2xl font-bold text-white mb-1 shadow-sm">{planCpu} Cloud Phone</h3>
                        <p className="text-blue-100/80 text-xs font-medium">
                          {currentCpu?.label || 'High-end'} • {planRam} • Android 12
                        </p>
                      </div>
                    )}

                    {/* RAM Settings */}
                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">Memory (RAM)</h4>
                    <div className="flex gap-3 mb-8 overflow-x-auto scrollbar-none snap-x pb-2 pt-2">
                      {RAM_OPTIONS.map(ram => (
                        <button
                          key={ram.id}
                          onClick={() => setPlanRam(ram.id)}
                          className={`relative snap-start min-w-[80px] shrink-0 flex flex-col items-center justify-center p-3 rounded-2xl border transition-all ${planRam === ram.id ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_15px_rgba(59,130,246,0.15)]' : 'border-white/10 bg-[#141518] text-gray-400 hover:border-white/20'}`}
                        >
                          <span className={`font-bold tracking-wider mb-1 ${planRam === ram.id ? 'text-blue-400' : 'text-white'}`}>{ram.id}</span>
                          <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${availableStock !== null && planCpu && availableStock[planCpu] && availableStock[planCpu][ram.id] > 0 ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-500'}`}>
                            {availableStock !== null && planCpu ? (availableStock[planCpu] && availableStock[planCpu][ram.id] > 0 ? `Stock: ${availableStock[planCpu][ram.id]}` : 'Habis') : '...'}
                          </span>
                        </button>
                      ))}
                    </div>

                    <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 px-1">Server Location</h4>
                    <div className="flex flex-col gap-2.5 mb-8">
                      {[
                        { id: 'ID', name: 'Jakarta', ping: '14ms', c: 'text-green-400' }
                      ].map(s => (
                        <button
                          key={s.id}
                          onClick={() => setServerLoc(s.id)}
                          className={`flex items-center justify-between p-4 rounded-2xl border transition-all ${serverLoc === s.id ? 'border-blue-500 bg-blue-500/10' : 'border-white/5 bg-[#141518] hover:bg-white/5'}`}
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-[10px] font-bold text-gray-500 bg-black/50 px-2 py-1 rounded-md">{s.id}</span>
                            <span className="text-sm font-semibold text-gray-200">{s.name}</span>
                          </div>
                          <span className={`text-[11px] font-bold ${s.c} bg-black/30 px-2 py-1 rounded-lg`}>{s.ping}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Footer Checkout */}
              <div className="p-6 bg-[#18181A] border-t border-white/5 relative z-10 flex flex-col gap-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-400 font-medium">Plan Total</span>
                  <div className="flex items-baseline gap-1">
                    {planCpu && planRam ? (
                      <>
                        <span className="text-xs text-gray-400">Rp</span>
                        <span className="text-2xl font-bold text-white">
                          {totalPrice.toLocaleString('id-ID')}
                        </span>
                      </>
                    ) : (
                      <span className="text-sm font-medium text-gray-500">-</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={handlePurchaseAttempt}
                  disabled={loadingPurchase || !planCpu || !planRam || (!renewSubId && (availableStock === null || !availableStock[planCpu] || !(availableStock[planCpu][planRam] > 0)))}
                  className="w-full bg-[#1A73E8] hover:bg-[#1557B0] text-white font-bold py-4 rounded-xl transition-colors shadow-[0_5px_20px_rgba(26,115,232,0.4)] flex items-center justify-center gap-2 relative overflow-hidden group disabled:opacity-50"
                >
                  <div className="absolute inset-x-0 top-0 h-1/2 bg-white/10" />
                  {loadingPurchase ? <Loader2 size={20} className="animate-spin" /> : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --- QRIS PENDING PAYMENT MODAL --- */}
      {pendingPayment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#18181A] rounded-3xl flex flex-col overflow-hidden shadow-2xl border border-white/10 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5 bg-[#141518]">
              <h2 className="text-lg font-bold text-white">Selesaikan Pembayaran</h2>
              <button onClick={() => setPendingPayment(null)} className="text-gray-400 hover:text-white transition-colors bg-white/5 p-1.5 rounded-full">
                <X size={18} />
              </button>
            </div>
            <div className="p-6 flex flex-col items-center justify-center">
              <h3 className="text-blue-500 font-bold text-xl mb-4">Total: Rp {pendingPayment.amount.toLocaleString('id-ID')}</h3>
              <div className="bg-white p-4 rounded-xl mb-4 shadow-lg border-4 border-blue-500/20">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={pendingPayment.qrisUrl} alt="QRIS Code" className="w-48 h-48 object-contain" />
              </div>
              <p className="text-gray-400 text-sm text-center mb-6">
                Scan kode QRIS di atas dengan aplikasi dompet digital atau mobile banking Anda. <br />
                {qrisTimeRemaining && qrisTimeRemaining !== 'Expired' ? (
                  <span className="text-white font-bold inline-block mt-2 bg-red-500/20 text-red-400 px-3 py-1 rounded-full border border-red-500/30 text-xs">Sisa Waktu: {qrisTimeRemaining}</span>
                ) : null}
                <br />
                <span className="text-blue-400 font-semibold mt-2 inline-block animate-pulse text-xs">Menunggu pembayaran otomatis...</span>
              </p>

              <button
                onClick={() => window.open(pendingPayment.paymentUrl, '_blank')}
                className="w-full bg-white/5 hover:bg-white/10 text-gray-300 font-semibold py-3 rounded-xl transition-all border border-white/10 mb-2"
              >
                Buka Link Alternatif
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- ROBLOX AUTO REJOIN MODAL --- */}
      {robloxModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#18181A] rounded-3xl flex flex-col shadow-2xl border border-white/10 overflow-hidden animate-in slide-in-from-bottom-5">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">Roblox Auto Rejoin</h2>
              <button onClick={() => setRobloxModalOpen(false)} className="text-gray-400 hover:text-white transition-colors bg-white/5 p-1.5 rounded-full">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 flex flex-col gap-4">
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">Private Server URL</label>
                <input
                  type="text"
                  value={robloxUrlInput}
                  onChange={(e: any) => setRobloxUrlInput(e.target.value)}
                  placeholder="https://www.roblox.com/games/..."
                  className="w-full bg-[#141518] text-sm text-white px-4 py-3 rounded-xl border border-white/10 outline-none focus:border-blue-500 focus:bg-white/5 transition-all mb-2"
                />
                <p className="text-[10px] text-gray-500 leading-tight">
                  Jika URL ini diisi, Cloud Phone akan otomatis membuka URL ini setiap kali terjadi disconnect pada game Roblox Anda. Biarkan kosong untuk mematikan fitur.
                </p>
              </div>
              <div>
                <label className="text-xs font-bold text-gray-500 mb-2 block">Auto Execute Script (Delta)</label>
                <textarea
                  value={robloxScriptInput}
                  onChange={(e: any) => setRobloxScriptInput(e.target.value)}
                  placeholder="-- Insert your auto attack / god mode lua script here"
                  className="w-full bg-[#141518] text-sm text-white px-4 py-3 rounded-xl border border-white/10 outline-none focus:border-blue-500 focus:bg-white/5 transition-all mb-2 min-h-[100px]"
                />
                <p className="text-[10px] text-gray-500 leading-tight">
                  Sistem akan otomatis mendeteksi executor yang ada (Delta, Fluxus, Codex, Arceus, Hydrogen, dll). Script ini lalu akan otomatis ditulis ke <strong>[NamaExecutor]/AutoExecute/shieldRejoin.txt</strong> sesaat sebelum Roblox dibuka ulang.
                </p>
              </div>
            </div>

            <div className="p-5 bg-black/20 border-t border-white/5 flex gap-3">
              <button
                onClick={() => setRobloxModalOpen(false)}
                className="flex-1 px-4 py-3 rounded-xl border border-white/10 text-white font-bold text-sm tracking-wide hover:bg-white/5 transition-colors"
              >
                Batal
              </button>
              <button
                onClick={handleSaveRobloxUrl}
                disabled={savingRobloxUrl}
                className="flex-1 px-4 py-3 bg-blue-600 hover:bg-blue-500 transition-colors rounded-xl text-white font-bold text-sm tracking-wide flex justify-center items-center shadow-[0_5px_15px_rgba(37,99,235,0.3)] disabled:opacity-50"
              >
                {savingRobloxUrl ? <Loader2 size={18} className="animate-spin" /> : 'Simpan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* --- HISTORY MODAL --- */}
      {historyModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-sm bg-[#18181A] rounded-3xl flex flex-col shadow-2xl border border-white/10 overflow-hidden animate-in slide-in-from-bottom-5 max-h-[85vh]">
            <div className="flex items-center justify-between px-6 py-5 border-b border-white/5">
              <h2 className="text-lg font-bold text-white">Riwayat Transaksi</h2>
              <button onClick={() => setHistoryModalOpen(false)} className="text-gray-400 hover:text-white transition-colors bg-white/5 p-1.5 rounded-full">
                <X size={18} />
              </button>
            </div>

            <div className="p-5 flex-1 overflow-y-auto">
              {loadingHistory ? (
                <div className="flex flex-col items-center justify-center py-10 opacity-70">
                  <Loader2 size={32} className="animate-spin text-blue-500 mb-3" />
                  <p className="text-sm font-medium text-gray-400">Memuat data & sinkronisasi status...</p>
                </div>
              ) : transactionHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 opacity-70">
                  <Box size={40} className="text-white/20 mb-3" />
                  <p className="text-sm font-medium text-gray-400">Belum ada transaksi</p>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {transactionHistory.map(tx => (
                    <div key={tx.id} className="bg-[#141518] border border-white/5 p-4 rounded-2xl flex flex-col gap-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="text-xs text-gray-400 font-mono mb-0.5">{tx.order_id}</p>
                          <p className="text-sm font-bold text-white capitalize">{tx.plan.replace('_', ' ')}</p>
                        </div>
                        <div className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${tx.status === 'SUCCESS' ? 'bg-green-500/20 text-green-400' : tx.status === 'PENDING' ? 'bg-orange-500/20 text-orange-400' : 'bg-red-500/20 text-red-400'}`}>
                          {tx.status}
                        </div>
                      </div>
                      <div className="flex justify-between items-center mt-2 pt-2 border-t border-white/5 text-xs">
                        <span className="text-white/40">{new Date(tx.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                        <span className="text-blue-400 font-bold">Rp {tx.amount.toLocaleString('id-ID')}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {/* Added functionality to manually refresh. Will just call the same endpoint which auto-syncs. */}
            <div className="p-4 bg-black/20 border-t border-white/5 flex">
              <button
                onClick={fetchTransactionHistory}
                disabled={loadingHistory}
                className="w-full flex justify-center items-center gap-2 bg-white/5 hover:bg-white/10 py-3 rounded-xl transition-colors text-sm font-bold disabled:opacity-50"
              >
                {loadingHistory ? <Loader2 size={16} className="animate-spin" /> : <RotateCcw size={16} />}
                <span>Refresh Sync Status</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
    </div>
  );
}
