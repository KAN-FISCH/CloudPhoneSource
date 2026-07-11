import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { updateSubscriptionRobloxSettings, getActiveSubscriptionsByUserId } from '@/lib/db';

export async function POST(request: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id, url, script } = await request.json();
        if (!id) {
            return NextResponse.json({ error: 'Missing subscription ID' }, { status: 400 });
        }

        const subs = getActiveSubscriptionsByUserId(session.userId);
        const sub = subs.find(s => s.id === id);

        if (!sub) {
            return NextResponse.json({ error: 'Subscription not found or unauthorized' }, { status: 404 });
        }

        updateSubscriptionRobloxSettings(id, url || null, script || null);

        return NextResponse.json({ success: true, url: url || null, script: script || null });
    } catch (e: any) {
        return NextResponse.json({ error: e.message }, { status: 500 });
    }
}
