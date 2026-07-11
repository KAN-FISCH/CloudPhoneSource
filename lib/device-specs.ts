import { AdbServerClient } from './adb-server';

// In-memory cache to map device models to their detected specs
export const DEVICE_SPECS: Record<string, { cpu: string, ram: string }> = {
    'Mi_A1': { cpu: 'S625', ram: '4GB' },
    // Snapdragon 636 devices
    'Redmi_Note_5': { cpu: 'S636', ram: '3GB' },
    'Redmi_Note_5_Pro': { cpu: 'S636', ram: '6GB' },
    'Nokia_6.1_Plus': { cpu: 'S636', ram: '6GB' },
    'Asus_ZenFone_Max_Pro_M1': { cpu: 'S636', ram: '3GB' },
};

export async function getDeviceSpecAdb(serial: string, model: string, adb: AdbServerClient): Promise<{ cpu: string, ram: string }> {
    if (!model || model === 'Unknown') return { cpu: 'Unknown', ram: 'Unknown' };

    // Validasi Cache
    if (DEVICE_SPECS[model]) {
        return DEVICE_SPECS[model];
    }

    try {
        const platform = await adb.shell(serial, 'getprop ro.board.platform');
        const hardware = await adb.shell(serial, 'getprop ro.hardware');
        const productBoard = await adb.shell(serial, 'getprop ro.product.board');
        const meminfo = await adb.shell(serial, 'cat /proc/meminfo');

        const combined = (platform + ' ' + hardware + ' ' + productBoard).toLowerCase();
        let cpu = 'Unknown';

        // Deteksi CPU
        if (combined.includes('msm8953') || combined.includes('sdm625')) cpu = 'S625';
        else if (combined.includes('sdm636')) cpu = 'S636';
        else if (combined.includes('sdm632') || combined.includes('msm8956')) cpu = 'S632';
        else if (combined.includes('sdm845') || combined.includes('msm8998') || combined.includes('845')) cpu = 'S845';
        else if (combined.includes('msm8150') || combined.includes('sm8150') || combined.includes('855') || combined.includes('msmnile')) cpu = 'S855';
        else if (combined.includes('sm8250') || combined.includes('kona') || combined.includes('865')) cpu = 'S865';
        else if (combined.includes('sm8350') || combined.includes('lahaina') || combined.includes('888')) cpu = 'S888';
        else if (combined.includes('taro') || combined.includes('waipio') || combined.includes('gen1')) cpu = 'S8Gen1';

        // Deteksi RAM
        let ram = 'Unknown';
        const memMatch = meminfo.match(/MemTotal:\s+(\d+)/);
        if (memMatch && memMatch[1]) {
            const kb = parseInt(memMatch[1], 10);
            const gb = Math.ceil(kb / (1024 * 1024));

            // Menyesuaikan ke tier RAM yang ada di Frontend (3GB, 4GB, 6GB, 8GB, 12GB, 16GB)
            if (gb <= 3) ram = '3GB';
            else if (gb <= 4) ram = '4GB';
            else if (gb <= 6) ram = '6GB';
            else if (gb <= 8) ram = '8GB';
            else if (gb <= 12) ram = '12GB';
            else ram = '16GB';
        }

        if (cpu !== 'Unknown' && ram !== 'Unknown') {
            DEVICE_SPECS[model] = { cpu, ram };
            return { cpu, ram };
        }

    } catch (e) {
        // Fail silently and return Unknown
    }

    return { cpu: 'Unknown', ram: 'Unknown' };
}
