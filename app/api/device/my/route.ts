import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getActiveSubscriptionsByUserId, getAllActiveSubscriptions, getUserById } from '@/lib/db';
import { AdbServerClient } from '@/lib/adb-server';

// In-memory uptime tracker: deviceSerial -> { pkg, since }
const appUptimeTracker = new Map<string, { pkg: string; since: number }>();

// In-memory Roblox game cache: deviceSerial -> { placeId, name, logo, fetchedAt }
const robloxGameCache = new Map<string, { placeId: string; name: string; logo: string; fetchedAt: number }>();

// Query Roblox public API to get game name from placeId
async function getRobloxGameName(placeId: string): Promise<{ name: string; logo: string }> {
    try {
        const res = await fetch(`https://games.roblox.com/v1/games/multiget-place-details?placeIds=${placeId}`, {
            headers: { 'Accept': 'application/json' },
            signal: AbortSignal.timeout(3000),
        });
        if (!res.ok) throw new Error('API error');
        const data = await res.json();
        const game = Array.isArray(data) ? data[0] : null;
        if (game?.name) {
            const iconRes = await fetch(`https://thumbnails.roblox.com/v1/places/gameicons?placeIds=${placeId}&size=150x150&format=Png&isCircular=false`, {
                signal: AbortSignal.timeout(3000),
            });
            let iconUrl = 'https://www.google.com/s2/favicons?domain=roblox.com&sz=64';
            if (iconRes.ok) {
                const iconData = await iconRes.json();
                iconUrl = iconData?.data?.[0]?.imageUrl || iconUrl;
            }
            return { name: game.name, logo: iconUrl };
        }
    } catch { /* fallback */ }
    return { name: 'Roblox', logo: 'https://www.google.com/s2/favicons?domain=roblox.com&sz=64' };
}

// Extract PlaceId from Roblox logcat
async function detectRobloxGame(adb: AdbServerClient, serial: string): Promise<{ name: string; logo: string }> {
    const cached = robloxGameCache.get(serial);

    try {
        // Roblox logs asset URLs containing placeId in the path or as query param
        // e.g., "https://assetdelivery.roblox.com/v1/asset?id=..." — won't have placeId
        // Better: check ClientSettings file or look for "gamejoinurl", "PlaceId" in logs

        // Try reading /sdcard/Android/ roblox log files if accessible
        const logRaw = await adb.shell(serial, 'logcat -d -t 1000 -s Roblox');

        // Pattern 1: "Starting game ... placeId=NNNNNN"
        const p1 = logRaw.match(/placeId[=: ]+(\d{6,})/);
        // Pattern 2: "rbxcdn.com/...NNNNN" or asset URLs with universe/place context
        const p2 = logRaw.match(/PlaceId[=: ,'"]+(\d{6,})/i);
        // Pattern 3: URL patterns from network requests
        const p3 = logRaw.match(/\/games\/(\d{6,})(?:\/|[ "])/);

        const placeId = (p1?.[1] || p2?.[1] || p3?.[1] || '').trim();

        if (placeId) {
            // If same placeId as cached, return cached (avoid hammering API)
            if (cached && cached.placeId === placeId && (Date.now() - cached.fetchedAt) < 300_000) {
                return { name: cached.name, logo: cached.logo };
            }
            // Fetch game name from Roblox
            const info = await getRobloxGameName(placeId);
            robloxGameCache.set(serial, { placeId, name: info.name, logo: info.logo, fetchedAt: Date.now() });
            return info;
        }
    } catch { /* ignore */ }

    // Fallback: return cached if available, otherwise generic Roblox
    if (cached) return { name: cached.name, logo: cached.logo };
    return { name: 'Roblox', logo: 'https://www.google.com/s2/favicons?domain=roblox.com&sz=64' };
}

// Map of package keywords -> { name, logo (icon URL), category }
const APP_MAP: Record<string, { name: string; logo: string; category: string }> = {
    // Games
    'com.mobile.legends': { name: 'Mobile Legends', logo: 'https://www.google.com/s2/favicons?domain=mobilelegends.com&sz=64', category: 'game' },
    'com.dts.freefireth': { name: 'Free Fire', logo: 'https://www.google.com/s2/favicons?domain=ff.garena.com&sz=64', category: 'game' },
    'com.dts.freefiremax': { name: 'Free Fire MAX', logo: 'https://www.google.com/s2/favicons?domain=ff.garena.com&sz=64', category: 'game' },
    'com.garena.star': { name: 'Free Fire', logo: 'https://www.google.com/s2/favicons?domain=ff.garena.com&sz=64', category: 'game' },
    'com.tencent.ig': { name: 'PUBG Mobile', logo: 'https://www.google.com/s2/favicons?domain=pubgmobile.com&sz=64', category: 'game' },
    'com.pubg.': { name: 'PUBG Mobile', logo: 'https://www.google.com/s2/favicons?domain=pubgmobile.com&sz=64', category: 'game' },
    'com.vng.pubgmspec': { name: 'PUBG Mobile VN', logo: 'https://www.google.com/s2/favicons?domain=pubgmobile.com&sz=64', category: 'game' },
    'com.roblox.client': { name: 'Roblox', logo: 'https://www.google.com/s2/favicons?domain=roblox.com&sz=64', category: 'game' },
    'com.mihoyo.genshinimpact': { name: 'Genshin Impact', logo: 'https://www.google.com/s2/favicons?domain=genshin.mihoyo.com&sz=64', category: 'game' },
    'com.kurogame.wutheringwaves': { name: 'Wuthering Waves', logo: 'https://www.google.com/s2/favicons?domain=wutheringwaves.kurogame.com&sz=64', category: 'game' },
    'com.mojang.minecraftpe': { name: 'Minecraft', logo: 'https://www.google.com/s2/favicons?domain=minecraft.net&sz=64', category: 'game' },
    'com.supercell.clashofclans': { name: 'Clash of Clans', logo: 'https://www.google.com/s2/favicons?domain=clashofclans.com&sz=64', category: 'game' },
    'com.supercell.clashroyale': { name: 'Clash Royale', logo: 'https://www.google.com/s2/favicons?domain=clashroyale.com&sz=64', category: 'game' },
    'com.activision.callofduty': { name: 'Call of Duty Mobile', logo: 'https://www.google.com/s2/favicons?domain=callofduty.com&sz=64', category: 'game' },
    'com.ea.game.fifa': { name: 'EA FC Mobile', logo: 'https://www.google.com/s2/favicons?domain=ea.com&sz=64', category: 'game' },
    'com.kofworld': { name: 'KOF All Star', logo: 'https://www.google.com/s2/favicons?domain=kofallstar.com&sz=64', category: 'game' },
    'com.levelinfinite.hotta': { name: 'Tower of Fantasy', logo: 'https://www.google.com/s2/favicons?domain=toweroffantasy-global.com&sz=64', category: 'game' },
    'com.hoyoverse.': { name: 'HoYoverse Game', logo: 'https://www.google.com/s2/favicons?domain=hoyoverse.com&sz=64', category: 'game' },
    // Social & Chat
    'com.whatsapp.w4b': { name: 'WhatsApp Business', logo: 'https://www.google.com/s2/favicons?domain=business.whatsapp.com&sz=64', category: 'social' },
    'com.whatsapp': { name: 'WhatsApp', logo: 'https://www.google.com/s2/favicons?domain=whatsapp.com&sz=64', category: 'social' },
    'com.instagram': { name: 'Instagram', logo: 'https://www.google.com/s2/favicons?domain=instagram.com&sz=64', category: 'social' },
    'com.facebook.katana': { name: 'Facebook', logo: 'https://www.google.com/s2/favicons?domain=facebook.com&sz=64', category: 'social' },
    'com.twitter.android': { name: 'Twitter / X', logo: 'https://www.google.com/s2/favicons?domain=x.com&sz=64', category: 'social' },
    'com.zhiliaoapp.musically': { name: 'TikTok', logo: 'https://www.google.com/s2/favicons?domain=tiktok.com&sz=64', category: 'social' },
    'com.ss.android.ugc.trill': { name: 'TikTok', logo: 'https://www.google.com/s2/favicons?domain=tiktok.com&sz=64', category: 'social' },
    'tiktok': { name: 'TikTok', logo: 'https://www.google.com/s2/favicons?domain=tiktok.com&sz=64', category: 'social' },
    'com.discord': { name: 'Discord', logo: 'https://www.google.com/s2/favicons?domain=discord.com&sz=64', category: 'social' },
    'com.telegram': { name: 'Telegram', logo: 'https://www.google.com/s2/favicons?domain=telegram.org&sz=64', category: 'social' },
    'com.snapchat': { name: 'Snapchat', logo: 'https://www.google.com/s2/favicons?domain=snapchat.com&sz=64', category: 'social' },
    // Media
    'com.google.android.youtube': { name: 'YouTube', logo: 'https://www.google.com/s2/favicons?domain=youtube.com&sz=64', category: 'media' },
    'com.spotify': { name: 'Spotify', logo: 'https://www.google.com/s2/favicons?domain=spotify.com&sz=64', category: 'media' },
    'com.netflix': { name: 'Netflix', logo: 'https://www.google.com/s2/favicons?domain=netflix.com&sz=64', category: 'media' },
    // System / Browser
    'com.android.chrome': { name: 'Chrome', logo: 'https://www.google.com/s2/favicons?domain=google.com&sz=64', category: 'system' },
    'com.google.android.gm': { name: 'Gmail', logo: 'https://www.google.com/s2/favicons?domain=gmail.com&sz=64', category: 'system' },
    'com.google.android.maps': { name: 'Google Maps', logo: 'https://www.google.com/s2/favicons?domain=maps.google.com&sz=64', category: 'system' },
    'com.google.android.googlequicksearchbox': { name: 'Google', logo: 'https://www.google.com/s2/favicons?domain=google.com&sz=64', category: 'system' },
};

function getAppInfo(pkgName: string): { name: string; logo: string; category: string } {
    if (!pkgName || pkgName === 'null') return { name: 'Standby', logo: '', category: 'standby' };
    const low = pkgName.toLowerCase();

    for (const [key, val] of Object.entries(APP_MAP)) {
        if (low.includes(key)) return val;
    }

    if (low.includes('launcher') || low.includes('nexuslauncher') || low.includes('systemui')) {
        return { name: 'Beranda', logo: '', category: 'home' };
    }

    const parts = low.split('.');
    const fallback = parts[parts.length - 1].replace(/_/g, ' ');
    return {
        name: fallback.charAt(0).toUpperCase() + fallback.slice(1),
        logo: `https://www.google.com/s2/favicons?domain=${low}&sz=64`,
        category: 'app'
    };
}

function formatUptime(ms: number): string {
    const totalSec = Math.floor(ms / 1000);
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    if (h > 0) return `${h}j ${m}m`;
    if (m > 0) return `${m}m ${s}d`;
    return `${s}d`;
}

export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = getUserById(session.userId);
        const subscriptions = user?.role === 'admin' 
            ? getAllActiveSubscriptions() 
            : getActiveSubscriptionsByUserId(session.userId);
        const adb = new AdbServerClient();

        const devicesWithStatus = await Promise.all(subscriptions.map(async (sub) => {
            let appInfo = { name: 'Standby', logo: '', category: 'standby' };
            let rawPkg = '';
            let uptimeStr = '';

            try {
                // Primary: mResumedActivity — format: ActivityRecord{HEX u0 com.pkg/.Activity tN}
                const actRaw = await adb.shell(sub.device_udid, 'dumpsys activity activities');
                const actMatch = actRaw.match(/mResumedActivity: ActivityRecord\{[0-9a-f]+ u\d+ ([^/]+)\//);
                if (actMatch && actMatch[1]) {
                    rawPkg = actMatch[1].trim();
                }

                // Fallback: mCurrentFocus
                if (!rawPkg) {
                    const winRaw = await adb.shell(sub.device_udid, 'dumpsys window windows');
                    const focusMatch = winRaw.match(/mCurrentFocus=Window\{[0-9a-f]+ u\d+ ([^/}]+)/);
                    if (focusMatch && focusMatch[1]) {
                        rawPkg = focusMatch[1].trim().split('/')[0];
                    } else if (winRaw.includes('mCurrentFocus=null')) {
                        rawPkg = 'null';
                    }
                }

                appInfo = getAppInfo(rawPkg);

                // If Roblox is active, try to detect the specific game being played
                if (rawPkg.includes('com.roblox.client') && appInfo.category === 'game') {
                    const robloxGame = await detectRobloxGame(adb, sub.device_udid);
                    appInfo = { ...appInfo, name: `Roblox › ${robloxGame.name}`, logo: robloxGame.logo };
                }

                // Uptime tracking
                const tracker = appUptimeTracker.get(sub.device_udid);
                if (tracker && tracker.pkg === rawPkg) {
                    // Same app — accumulate uptime
                    uptimeStr = formatUptime(Date.now() - tracker.since);
                } else {
                    // New app — reset timer
                    appUptimeTracker.set(sub.device_udid, { pkg: rawPkg, since: Date.now() });
                    uptimeStr = '0d';
                }
            } catch {
                appInfo = { name: 'Offline', logo: '', category: 'system' };
            }

            let cpu = 'S845', ram = '6GB';
            try {
                const cpuRaw = (await adb.shell(sub.device_udid, 'getprop ro.board.platform')).trim().toLowerCase();
                const cpuHardware = (await adb.shell(sub.device_udid, 'getprop ro.product.board')).trim().toLowerCase();
                const fullCpuInfo = cpuRaw + cpuHardware;

                if (fullCpuInfo.includes('625') || fullCpuInfo.includes('msm8953')) cpu = 'S625';
                else if (fullCpuInfo.includes('845') || fullCpuInfo.includes('sdm845')) cpu = 'S845';
                else if (fullCpuInfo.includes('855') || fullCpuInfo.includes('msm8150') || fullCpuInfo.includes('msmnile')) cpu = 'S855';
                else if (fullCpuInfo.includes('865') || fullCpuInfo.includes('kona')) cpu = 'S865';
                else if (fullCpuInfo.includes('888') || fullCpuInfo.includes('lahaina')) cpu = 'S888';
                else if (fullCpuInfo.includes('taro') || fullCpuInfo.includes('waipio')) cpu = 'S8Gen1';

                const meminfo = await adb.shell(sub.device_udid, 'cat /proc/meminfo');
                const memMatch = meminfo.match(/MemTotal:\s+(\d+)\s+kB/);
                if (memMatch) {
                    const gb = Math.round(parseInt(memMatch[1], 10) / (1024 * 1024));
                    ram = gb <= 4 ? '4GB' : gb <= 6 ? '6GB' : gb <= 8 ? '8GB' : gb <= 12 ? '12GB' : '16GB';
                }
            } catch (e) {
                // ignore spec detection errors for now
            }

            return {
                ...sub,
                current_game: appInfo.name,
                app_logo: appInfo.logo,
                app_category: appInfo.category,
                app_uptime: uptimeStr,
                app_package: rawPkg,
                cpu,
                ram
            };
        }));

        return NextResponse.json({ devices: devicesWithStatus }, { status: 200 });
    } catch (error: any) {
        console.error('Fetch devices error:', error.message);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
