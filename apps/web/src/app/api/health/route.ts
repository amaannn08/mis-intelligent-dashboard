import { NextResponse } from 'next/server';
import { db } from '@mis/db';
import { sql } from 'drizzle-orm';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await db.execute(sql`SELECT 1`);
    return NextResponse.json({ ok: true, db: 'up' }, { status: 200 });
  } catch (error) {
    console.error('Health check database query failed:', error);
    return NextResponse.json({ ok: false, db: 'down' }, { status: 503 });
  }
}
