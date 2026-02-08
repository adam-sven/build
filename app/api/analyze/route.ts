import { NextResponse } from 'next/server';
import { analyzeToken } from '@/lib/analyzeToken';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const mint = searchParams.get('mint');

  if (!mint) {
    return NextResponse.json({ ok: false, error: 'Missing mint' }, { status: 400 });
  }

  try {
    const result = await analyzeToken(mint);
    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? 'Unknown error' },
      { status: 500 }
    );
  }
}
