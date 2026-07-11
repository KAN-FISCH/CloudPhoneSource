'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Clock, Zap, Shield, ChevronRight, Loader2, Sparkles } from 'lucide-react';

const PLANS = [
    { id: '1_hour', name: 'Rapid Access', duration: '1 Hour', price: 'Rp 5.000', icon: Zap, color: 'from-orange-500/20 to-rose-500/20', border: 'border-orange-500/30' },
    { id: '3_hours', name: 'Standard Session', duration: '3 Hours', price: 'Rp 14.000', icon: Clock, color: 'from-blue-500/20 to-cyan-500/20', border: 'border-blue-500/30', popular: true },
    { id: '24_hours', name: 'Full Day Rental', duration: '24 Hours', price: 'Rp 50.000', icon: Shield, color: 'from-purple-500/20 to-indigo-500/20', border: 'border-purple-500/30' }
];

interface RentDeviceProps {
    onRequireAuth: () => void;
}

export default function RentDevice({ onRequireAuth }: RentDeviceProps) {
    const { user } = useAuth();
    const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

    const handlePurchase = async (planId: string) => {
        if (!user) {
            onRequireAuth();
            return;
        }

        setLoadingPlan(planId);
        try {
            const res = await fetch('/api/payment/purchase', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ plan: planId })
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error);

            if (data.paymentUrl) {
                window.location.href = data.paymentUrl;
            }
        } catch (err: any) {
            alert(err.message || 'Failed to initialize payment');
            setLoadingPlan(null);
        }
    };

    return (
        <div className="w-full">
            <div className="flex items-center justify-between mb-8">
                <div>
                    <h2 className="text-2xl font-bold tracking-tight mb-2 flex items-center gap-2">
                        Rent Cloud Devices <Sparkles className="text-yellow-400" size={20} />
                    </h2>
                    <p className="text-muted-foreground max-w-xl text-sm leading-relaxed">
                        Instantly connect to real physical Android devices in our datacenter. Perfect for testing, development, and remote debugging without buying hardware.
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {PLANS.map((plan) => (
                    <motion.div
                        whileHover={{ y: -5 }}
                        key={plan.id}
                        className={`relative flex flex-col p-6 rounded-3xl bg-card border ${plan.border} overflow-hidden group`}
                    >
                        <div className={`absolute inset-0 bg-gradient-to-br ${plan.color} opacity-10 group-hover:opacity-20 transition-opacity duration-500`} />

                        {plan.popular && (
                            <div className="absolute top-0 inset-x-0 h-1 bg-gradient-to-r from-blue-500 to-cyan-400" />
                        )}

                        <div className="flex justify-between items-start mb-8 relative z-10">
                            <div className={`p-3 rounded-2xl bg-white/5 border border-white/10 shadow-inner`}>
                                <plan.icon size={24} className="text-white" />
                            </div>
                            {plan.popular && (
                                <span className="px-3 py-1 bg-blue-500/20 text-blue-400 border border-blue-500/30 rounded-full text-[10px] font-bold tracking-widest uppercase">
                                    Most Popular
                                </span>
                            )}
                        </div>

                        <div className="relative z-10">
                            <h3 className="text-white/60 text-sm font-semibold uppercase tracking-wider mb-1">{plan.name}</h3>
                            <div className="flex items-baseline gap-2 mb-2">
                                <span className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
                                    {plan.duration}
                                </span>
                            </div>
                            <p className="text-xl font-medium text-white mb-6">{plan.price}</p>
                        </div>

                        <button
                            onClick={() => handlePurchase(plan.id)}
                            disabled={loadingPlan === plan.id}
                            className={`mt-auto relative z-10 w-full py-4 rounded-xl font-semibold flex items-center justify-center gap-2 transition-all 
                ${plan.popular
                                    ? 'bg-gradient-to-r from-blue-600 to-cyan-600 hover:from-blue-500 hover:to-cyan-500 text-white shadow-lg shadow-blue-500/25'
                                    : 'bg-white/10 hover:bg-white/20 text-white'
                                }
              `}
                        >
                            {loadingPlan === plan.id ? (
                                <Loader2 size={18} className="animate-spin" />
                            ) : (
                                <>
                                    <span>Choose Plan</span>
                                    <ChevronRight size={18} />
                                </>
                            )}
                        </button>
                    </motion.div>
                ))}
            </div>
        </div>
    );
}
