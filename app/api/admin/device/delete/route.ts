import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getUserById, deactivateSubscription } from '@/lib/db';

export async function POST(req: Request) {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const user = getUserById(session.userId);
        if (!user || user.role !== 'admin') {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const { subscriptionId } = await req.json();
        if (!subscriptionId) {
            return NextResponse.json({ error: 'Subscription ID is required' }, { status: 400 });
        }

        deactivateSubscription(subscriptionId);

        return NextResponse.json({ message: 'Device deleted successfully' }, { status: 200 });

    } catch (error: any) {
        console.error("Admin delete device error:", error.message);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
