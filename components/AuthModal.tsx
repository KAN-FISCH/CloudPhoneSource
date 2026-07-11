'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/context/AuthContext';
import { Mail, Lock, LogIn, Loader2, Eye, EyeOff } from 'lucide-react';

interface AuthModalProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function AuthModal({ isOpen, onClose }: AuthModalProps) {
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const { refresh } = useAuth();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
            const body = isLogin
                ? { email, password }
                : { email, password, name };

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || 'Failed to authenticate');
            }

            await refresh(); // Refresh global auth state
            onClose(); // Close modal on success

        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <AnimatePresence>
            {isOpen && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md"
                    onClick={onClose}
                >
                    <motion.div
                        initial={{ scale: 0.95, y: 10, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.95, y: 10, opacity: 0 }}
                        onClick={(e) => e.stopPropagation()}
                        className="w-full max-w-[400px] bg-[#141518] border border-white/5 rounded-[32px] overflow-hidden relative px-8 pb-10 pt-12"
                    >
                        {/* Top Squircle Icon */}
                        <div className="flex justify-center mb-6">
                            <div className="w-14 h-14 rounded-2xl bg-[#0E0E10] border border-white/5 flex items-center justify-center">
                                <LogIn size={24} className="text-white" strokeWidth={1.5} />
                            </div>
                        </div>

                        <h2 className="text-[22px] font-bold text-center text-white mb-2 tracking-tight">
                            {isLogin ? 'Sign in with email' : 'Create an account'}
                        </h2>
                        <p className="text-center text-gray-400 text-[13px] mb-8 leading-relaxed px-2">
                            {isLogin
                                ? 'Sign in to access your cloud phones, words, data, and teams together. For free.'
                                : 'Sign up to configure your cloud phones, manage your devices, and start remote computing.'}
                        </p>

                        {error && (
                            <div className="mb-6 p-3 bg-red-500/10 text-red-400 text-[13px] font-medium rounded-xl text-center border border-red-500/20">
                                {error}
                            </div>
                        )}

                        <form onSubmit={handleSubmit} className="space-y-3">
                            {!isLogin && (
                                <div className="relative">
                                    <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>
                                    </div>
                                    <input
                                        type="text"
                                        required={!isLogin}
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                        placeholder="Full Name"
                                        className="w-full pl-[42px] pr-4 py-3.5 bg-[#0E0E10] border border-white/5 focus:border-white/20 rounded-2xl text-white outline-none transition-all text-[14px] placeholder:text-gray-600 font-medium"
                                    />
                                </div>
                            )}

                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                                    <Mail size={18} strokeWidth={2} />
                                </div>
                                <input
                                    type="email"
                                    required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="Email"
                                    className="w-full pl-[42px] pr-4 py-3.5 bg-[#0E0E10] border border-white/5 focus:border-white/20 rounded-2xl text-white outline-none transition-all text-[14px] placeholder:text-gray-600 font-medium"
                                />
                            </div>

                            <div className="relative">
                                <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none">
                                    <Lock size={18} strokeWidth={2} />
                                </div>
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    required
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    className="w-full pl-[42px] pr-10 py-3.5 bg-[#0E0E10] border border-white/5 focus:border-white/20 rounded-2xl text-white outline-none transition-all text-[14px] placeholder:text-gray-600 font-medium"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white focus:outline-none transition-colors"
                                >
                                    {showPassword ? <EyeOff size={16} strokeWidth={2} /> : <Eye size={16} strokeWidth={2} />}
                                </button>
                            </div>

                            {isLogin && (
                                <div className="flex justify-end pt-1">
                                    <a href="#" className="text-[12px] font-semibold text-gray-500 hover:text-white transition-colors">
                                        Forgot password?
                                    </a>
                                </div>
                            )}

                            <button
                                type="submit"
                                disabled={loading}
                                className="w-full mt-4 py-4 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 text-[15px]"
                            >
                                {loading ? <Loader2 className="animate-spin" size={20} /> : (isLogin ? 'Get Started' : 'Sign Up')}
                            </button>
                        </form>

                        <div className="mt-8">
                            <p className="text-center text-[12px] text-gray-500 font-medium mb-5">
                                Or sign in with
                            </p>

                            <div className="flex items-center justify-center gap-6">
                                {/* Google */}
                                <button
                                    onClick={() => alert("Google Login akan segera hadir!")}
                                    className="w-12 h-12 rounded-full border border-white/5 bg-[#0E0E10] hover:bg-white/5 flex items-center justify-center transition-colors"
                                >
                                    <svg width="20" height="20" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
                                    </svg>
                                </button>

                                {/* Facebook */}
                                <button className="w-12 h-12 rounded-full border border-white/5 bg-[#0E0E10] hover:bg-white/5 flex items-center justify-center transition-colors">
                                    <svg width="22" height="22" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2" />
                                    </svg>
                                </button>

                                {/* Apple */}
                                <button className="w-12 h-12 rounded-full border border-white/5 bg-[#0E0E10] hover:bg-white/5 flex items-center justify-center transition-colors">
                                    <svg width="18" height="18" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M16.235 15.683A12.784 12.784 0 0017.522 12c-1.428-.82-2.39-2.338-2.39-4.092 0-2.38 1.942-4.322 4.331-4.322.28 0 .553.05.815.122-.843-1.666-2.584-2.812-4.598-2.812-1.742 0-3.328.878-4.281 2.222-.954-1.344-2.539-2.222-4.28-2.222C3.899.896 1.155 3.398 1.155 7.15c0 4.295 4.092 9.073 6.643 12.381 1.258 1.63 2.695 3.253 4.484 3.253 1.642 0 2.29-.988 4.28-.988 1.988 0 2.576.988 4.279.988 1.66 0 2.955-1.428 4.157-2.924a12.748 12.748 0 01-2.94-2.235c-2.486-2.485-3.033-6.19-.884-8.734a4.136 4.136 0 00-4.94 1.792z" fill="#ffffff" />
                                        <path d="M16.142 4.41C16.892 3.513 17.34 2.302 17.34 1a6.673 6.673 0 00-4.483 2.352 6.136 6.136 0 00-1.782 4.381c1.55-.008 3.167-.706 4.126-2.224h-.01z" fill="#ffffff" />
                                    </svg>
                                </button>
                            </div>

                            <div className="mt-8 text-center text-[12px] text-gray-400 font-medium">
                                {isLogin ? "Don't have an account? " : "Already have an account? "}
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        e.stopPropagation();
                                        setIsLogin(!isLogin);
                                        setError('');
                                    }}
                                    className="text-white border-b border-white hover:text-gray-300 hover:border-gray-300 font-bold transition-all ml-1 pb-0.5"
                                    type="button"
                                >
                                    {isLogin ? 'Sign up' : 'Sign in'}
                                </button>
                            </div>
                        </div>
                    </motion.div>
                </motion.div>
            )}
        </AnimatePresence>
    );
}
