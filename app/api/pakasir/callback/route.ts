import { NextResponse } from 'next/server';
import { updateTransactionStatus, getTransactionByOrderId, getSubscriptionByOrderId, activateSubscriptionByOrderId, markTransactionAllocated } from '@/lib/db';
import crypto from 'crypto';

export async function POST(req: Request) {
    try {
        const defaultSecret = process.env.PAKASIR_WEBHOOK_SECRET || 'fallback_secret';
        // Validate signature - adjust based on Pakasir docs
        // const signature = req.headers.get('x-signature');

        const body = await req.json();
        const { order_id, status } = body;

        if (!order_id || !status) {
            return NextResponse.json({ error: 'Missing webhook fields' }, { status: 400 });
        }

        const transaction = getTransactionByOrderId(order_id);
        if (!transaction) {
            return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
        }

        const normalizedStatus = status.toUpperCase();
        if (normalizedStatus === 'SUCCESS' || normalizedStatus === 'PAID' || normalizedStatus === 'COMPLETED') {
            updateTransactionStatus(order_id, 'SUCCESS');

            // Auto Allocate Background Process
            if (transaction.is_allocated === 0) {
                const subscription = getSubscriptionByOrderId(order_id);
                if (subscription) {
                    const hours = 7 * 24; // 7 days in hours
                    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

                    activateSubscriptionByOrderId(order_id, expiresAt);
                    markTransactionAllocated(order_id);
                }
            }
        } else if (normalizedStatus === 'FAILED' || normalizedStatus === 'EXPIRED' || normalizedStatus === 'CANCELED') {
            updateTransactionStatus(order_id, 'FAILED');
        }

        return NextResponse.json({ message: 'Webhook received and processed' });
    } catch (error: any) {
        console.error("Webhook processing error:", error.message);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
