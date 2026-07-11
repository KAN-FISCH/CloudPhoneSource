import { NextResponse } from 'next/server';
import { updateTransactionStatus } from '@/lib/db';

export async function GET(req: Request) {
    const url = new URL(req.url);
    const orderId = url.searchParams.get('order_id');

    if (!orderId) {
        return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
    }

    // Simulate payment success immediately for testing/dev
    updateTransactionStatus(orderId, 'SUCCESS');

    const host = req.headers.get('x-forwarded-host') || req.headers.get('host') || 'nsphone.space';
    const proto = req.headers.get('x-forwarded-proto') || 'https';
    
    let cleanHost = host;
    if (host.includes('0.0.0.0')) {
        cleanHost = 'nsphone.space';
    }

    const redirectUrl = `${proto}://${cleanHost}/?payment=success&order_id=${orderId}`;
    return NextResponse.redirect(new URL(redirectUrl));
}
