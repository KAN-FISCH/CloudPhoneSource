import { NextResponse } from 'next/server';
import { getUserByEmail, createUser } from '@/lib/db';
import { createSessionCookie } from '@/lib/auth';
import crypto from 'crypto';

export async function POST(req: Request) {
    try {
        const { email, name, password } = await req.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Email and password required' }, { status: 400 });
        }

        const existingUser = getUserByEmail(email);
        if (existingUser) {
            return NextResponse.json({ error: 'User already exists' }, { status: 400 });
        }

        const passwordHash = crypto.createHash('sha256').update(password).digest('hex');
        const userId = createUser(email, name || email.split('@')[0], passwordHash);

        await createSessionCookie(Number(userId), email);

        return NextResponse.json({ message: 'User registered successfully' }, { status: 201 });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
