import { NextResponse } from 'next/server';
import { getSession, destroySession } from '@/lib/auth';
import { getUserById } from '@/lib/db';

export async function GET() {
    try {
        const session = await getSession();
        if (!session) {
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }

        const user = getUserById(session.userId);
        if (!user) {
            await destroySession();
            return NextResponse.json({ authenticated: false }, { status: 401 });
        }

        return NextResponse.json({
            authenticated: true,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role
            }
        });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function POST() {
    await destroySession();
    return NextResponse.json({ message: 'Logged out successfully' });
}
