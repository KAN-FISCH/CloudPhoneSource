import { NextResponse } from 'next/server';
import { AdbServerClient } from '@/lib/adb-server';
import { getAllAllocatedSubscriptions } from '@/lib/db';
import { getDeviceSpecAdb } from '@/lib/device-specs';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const adb = new AdbServerClient();
        const devices = await adb.getDevices();
        console.log(`[Stock] Total devices found: ${devices.length}`);

        const activeSubscriptions = getAllAllocatedSubscriptions();
        const allocatedSerials = new Set(activeSubscriptions.map(s => s.device_udid));

        const availableDevices = devices.filter(d => {
            const isDevice = d.status === 'device';
            const isNotAllocated = !allocatedSerials.has(d.serial);
            if (!isDevice) console.log(`[Stock] Skipping ${d.serial}: status is ${d.status}`);
            if (!isNotAllocated) console.log(`[Stock] Skipping ${d.serial}: already allocated`);
            return isDevice && isNotAllocated;
        });

        console.log(`[Stock] Available candidate devices: ${availableDevices.length}`);

        const stock = {} as Record<string, Record<string, number>>;

        const specPromises = availableDevices.map(async dev => {
            const spec = await getDeviceSpecAdb(dev.serial, dev.model || 'Unknown', adb);
            console.log(`[Stock] Device ${dev.serial} (${dev.model}): CPU=${spec.cpu}, RAM=${spec.ram}`);
            
            if (spec.cpu !== 'Unknown' && spec.ram !== 'Unknown') {
                if (!stock[spec.cpu]) stock[spec.cpu] = {};
                stock[spec.cpu][spec.ram] = (stock[spec.cpu][spec.ram] || 0) + 1;
            }
        });

        await Promise.all(specPromises);
        console.log(`[Stock] Final stock count:`, JSON.stringify(stock));

        return NextResponse.json(stock, { status: 200 });
    } catch (error: any) {
        console.error("Error fetching available stock:", error);
        return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
    }
}
