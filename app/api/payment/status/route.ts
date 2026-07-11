import { NextResponse } from 'next/server';
import { getTransactionByOrderId } from '@/lib/db';

export async function GET(req: Request) {
    const url = new URL(req.url);
    const orderId = url.searchParams.get('order_id');

    if (!orderId) {
        return NextResponse.json({ error: 'Order ID required' }, { status: 400 });
    }

    const transaction = getTransactionByOrderId(orderId);

    if (!transaction) {
        return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
    }

    return NextResponse.json({ status: transaction.status });
}
