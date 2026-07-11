import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { createTransaction, getAllAllocatedSubscriptions, createPendingSubscription, deactivateSubscription, getPendingTransactionByUserId, updateTransactionPaymentUrls, getSubscriptionByOrderId } from '@/lib/db';
import { AdbServerClient } from '@/lib/adb-server';
import { getDeviceSpecAdb } from '@/lib/device-specs';
import { v4 as uuidv4 } from 'uuid';
import axios from 'axios';

const PAKASIR_API_KEY = process.env.PAKASIR_API_KEY || 'JWaDMBbzJsASS4ldM6vkCMBtobkZ1FI7';
const PAKASIR_PROJECT = process.env.PAKASIR_PROJECT || 'pt-nusantara-cloudphone';
const PAKASIR_ENDPOINT = process.env.PAKASIR_ENDPOINT || 'https://app.pakasir.com/api/transactioncreate/qris';

const CPU_PRICES: Record<string, number> = {
    'S625': 17000,
    'S636': 20000,
    'S845': 37000,
    'S855': 37000,
    'S865': 37000,
    'S888': 37000
};

const RAM_PRICES: Record<string, number> = {
    '3GB': 0,
    '4GB': 0,
    '6GB': 0,
    '8GB': 5000,
    '12GB': 10000,
    '16GB': 20000
};

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { plan, cpu, ram, renewSubId } = await req.json();
        
        const basePrice = CPU_PRICES[cpu] || 0;
        const addPrice = (ram === '3GB' ? 0 : RAM_PRICES[ram] || 0);

        if (cpu && !CPU_PRICES[cpu]) {
            return NextResponse.json({ error: 'Invalid CPU selected' }, { status: 400 });
        }
        
        const calculatedAmount = basePrice + addPrice;

        // --- CHECK EXISTING PENDING ORDER ---
        const existingPending = getPendingTransactionByUserId(session.userId);
        if (existingPending && existingPending.qris_url) {
            const sub = getSubscriptionByOrderId(existingPending.order_id);
            return NextResponse.json({
                order_id: existingPending.order_id,
                qrisUrl: existingPending.qris_url,
                paymentUrl: existingPending.payment_url || '',
                amount: existingPending.amount,
                expiresAt: sub ? sub.expires_at : undefined
            }, { status: 200 });
        }
        // ------------------------------------

        const orderId = `ORD-${uuidv4()}`;
        const amount = calculatedAmount;

        // If not a renewal, check stock
        let availableDevice = undefined;
        if (!renewSubId) {
            const adb = new AdbServerClient();
            const devices = await adb.getDevices();

            if (devices.length === 0) {
                return NextResponse.json({ error: 'No devices connected to host. Please try again later.' }, { status: 503 });
            }

            const activeSubscriptions = getAllAllocatedSubscriptions();
            const allocatedSerials = new Set(activeSubscriptions.map(s => s.device_udid));

            for (const d of devices) {
                if (d.status !== 'device' || allocatedSerials.has(d.serial)) continue;
                const spec = await getDeviceSpecAdb(d.serial, d.model || 'Unknown', adb);
                if (spec.cpu === cpu && spec.ram === ram) {
                    availableDevice = d;
                    break;
                }
            }

            if (!availableDevice) {
                return NextResponse.json({ error: 'Tidak ada stok Device dengan spesifikasi tersebut saat ini.' }, { status: 503 });
            }
        }

        const pendingExpiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour to pay
        const token = uuidv4();
        
        let subId: any = null;
        if (!renewSubId && availableDevice) {
            const streamUrl = `/device/${availableDevice.serial}?token=${token}`;
            // Freeze stock immediately (status Active=2)
            subId = createPendingSubscription(
                session.userId,
                availableDevice.serial,
                orderId,
                token,
                streamUrl,
                pendingExpiresAt
            );
        }

        // Create transaction in local DB
        createTransaction(session.userId, orderId, amount, plan, renewSubId);

        // Force bypass payment because payment gateway is down (Direct Sandbox Mode)
        const dummyPaymentUrl = `/api/payment/dummy-checkout?order_id=${orderId}`;
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=BYPASS_PAYMENT_${orderId}`;

        updateTransactionPaymentUrls(orderId, qrUrl, dummyPaymentUrl);

        return NextResponse.json({
            order_id: orderId,
            paymentUrl: dummyPaymentUrl,
            amount: amount,
            expiresAt: pendingExpiresAt
        }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
