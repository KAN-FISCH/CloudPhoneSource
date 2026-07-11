import { NextResponse } from 'next/server';
import { getUserByEmail } from '@/lib/db';
import { createSessionCookie } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(req: Request) {
    try {
        const { email, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
        }

        const user = getUserByEmail(email);
        if (!user) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        if (user.password !== passwordHash) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        await createSessionCookie(user.id, user.email);

        return NextResponse.json({ message: 'Logged in successfully', user: { id: user.id, email: user.email, name: user.name } }, { status: 200 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
