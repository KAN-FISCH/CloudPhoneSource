import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getTransactionByOrderId, markTransactionAllocated, getSubscriptionByOrderId, activateSubscriptionByOrderId, getSubscriptionById, extendSubscription, getUserById } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { order_id } = await req.json();

        const transaction = getTransactionByOrderId(order_id);
        const user = getUserById(session.userId);
        const isAdmin = user && user.role === 'admin';

        if (!transaction || (transaction.user_id !== session.userId && !isAdmin)) {
            return NextResponse.json({ error: 'Transaction not found or invalid' }, { status: 404 });
        }

        if (transaction.status !== 'SUCCESS') {
            return NextResponse.json({ error: 'Transaction is not completed yet' }, { status: 400 });
        }

        let subscription = getSubscriptionByOrderId(order_id);

        // If it's a renewal, we might not have a "new" subscription record by order_id
        if (!subscription && transaction.renew_sub_id) {
            subscription = getSubscriptionById(transaction.renew_sub_id);
        }

        if (!subscription) {
            return NextResponse.json({ error: 'Subscription data not found for this order' }, { status: 404 });
        }

        if (transaction.is_allocated === 1) {
            return NextResponse.json({
                message: 'Device already allocated successfully',
                device_udid: subscription.device_udid,
                token: subscription.token,
                streamUrl: subscription.stream_url,
                expiresAt: subscription.expires_at
            }, { status: 200 });
        }

        // Calculate expiration time (always 7 days for new purchases)
        const hours = 7 * 24; // 7 days in hours
        const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

        if (transaction.renew_sub_id) {
            extendSubscription(transaction.renew_sub_id, 7);
        } else {
            // New Purchase Cleanup: Clear residual scripts and enforce Keyboard
            try {
                const { AdbServerClient } = require('@/lib/adb-server');
                const adb = new AdbServerClient();
                
                // 1. Clear residual scripts
                const executors = "Delta Fluxus Codex arceusx hydrogen TrigonEvo Ronix";
                const cleanupCmd = `for d in ${executors}; do rm -f "/sdcard/$d/AutoExecute/shieldRejoin.txt"; done`;
                await adb.shell(subscription.device_udid, cleanupCmd).catch(() => {});
                
                // 2. Enforce Custom Keyboard
                const KEYBOARD_PKG = 'com.example.keyboardadb';
                const KEYBOARD_IME = `${KEYBOARD_PKG}/.ClipboardSyncKeyboardService`;
                
                // Enable our keyboard
                await adb.shell(subscription.device_udid, `ime enable ${KEYBOARD_IME}`).catch(() => {});
                // Set it as default
                await adb.shell(subscription.device_udid, `ime set ${KEYBOARD_IME}`).catch(() => {});
                
                // 3. Disable competing keyboards (Gboard, etc.)
                // This command lists all IMEs except ours and tries to disable them
                const disableOthersCmd = `ime list -s | grep -v "${KEYBOARD_PKG}" | while read line; do pkg=$(echo $line | cut -d/ -f1); pm disable-user --user 0 $pkg; done`;
                await adb.shell(subscription.device_udid, disableOthersCmd).catch(() => {});

                console.log(`[Setup] Cleaned scripts and enforced keyboard for device ${subscription.device_udid}`);
            } catch (e) {
                console.error("[Setup Error] Failed to configure device:", e);
            }

            activateSubscriptionByOrderId(order_id, expiresAt);
        }

        markTransactionAllocated(order_id);

        return NextResponse.json({
            message: transaction.renew_sub_id ? 'Subscription extended successfully' : 'Device allocated successfully',
            device_udid: subscription?.device_udid || '',
            token: subscription?.token || '',
            streamUrl: subscription?.stream_url || '',
            expiresAt
        }, { status: 200 });

    } catch (error: any) {
        console.error("Allocation error:", error.message);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
