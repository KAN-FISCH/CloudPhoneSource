import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getAllTransactionsByUserId, getTransactionByOrderId, updateTransactionStatus, getSubscriptionByOrderId, activateSubscriptionByOrderId, markTransactionAllocated } from '@/lib/db';
import axios from 'axios';

const PAKASIR_API_KEY = process.env.PAKASIR_API_KEY || 'JWaDMBbzJsASS4ldM6vkCMBtobkZ1FI7';
const PAKASIR_PROJECT = process.env.PAKASIR_PROJECT || 'pt-nusantara-cloudphone';

export async function GET(req: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        let transactions = getAllTransactionsByUserId(session.userId);

        // Auto-sync PENDING transactions with Pakasir
        for (const tx of transactions) {
            if (tx.status === 'PENDING' && tx.amount > 0) {
                try {
                    const checkUrl = `https://app.pakasir.com/api/transactiondetail?project=${encodeURIComponent(PAKASIR_PROJECT)}&amount=${tx.amount}&order_id=${encodeURIComponent(tx.order_id)}&api_key=${encodeURIComponent(PAKASIR_API_KEY)}`;
                    const res = await axios.get(checkUrl);

                    if (res.data && res.data.transaction) {
                        const pakStatus = res.data.transaction.status.toUpperCase();

                        if (pakStatus === 'SUCCESS' || pakStatus === 'PAID' || pakStatus === 'COMPLETED') {
                            updateTransactionStatus(tx.order_id, 'SUCCESS');
                            tx.status = 'SUCCESS';

                            // Allocate if not already allocated
                            if (tx.is_allocated === 0) {
                                const subscription = getSubscriptionByOrderId(tx.order_id);
                                if (subscription) {
                                    const hours = 7 * 24; // 7 days in hours
                                    const expiresAt = new Date(Date.now() + hours * 60 * 60 * 1000).toISOString();

                                    activateSubscriptionByOrderId(tx.order_id, expiresAt);
                                    markTransactionAllocated(tx.order_id);
                                    tx.is_allocated = 1;
                                }
                            }
                        } else if (pakStatus === 'FAILED' || pakStatus === 'EXPIRED' || pakStatus === 'CANCELED') {
                            updateTransactionStatus(tx.order_id, 'FAILED');
                            tx.status = 'FAILED';
                        }
                    }
                } catch (err) {
                    console.error('Failed to sync transaction', tx.order_id, err);
                }
            }
        }

        return NextResponse.json({ transactions });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
