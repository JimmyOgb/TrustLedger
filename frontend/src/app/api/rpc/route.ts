import { NextRequest, NextResponse } from 'next/server';

const GENLAYER_RPC = 'https://studio.genlayer.com/api';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const res = await fetch(GENLAYER_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    });

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err: any) {
    console.error('RPC proxy error:', err);
    return NextResponse.json(
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32603, message: err?.message || 'RPC proxy error' },
      },
      { status: 500 }
    );
  }
}
