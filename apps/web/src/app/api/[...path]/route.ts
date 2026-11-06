import { NextRequest, NextResponse } from 'next/server';

const API = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001';

async function proxy(request: NextRequest, context: { params: Promise<{ path: string[] }> }) {
  const { path } = await context.params;
  const target = new URL(`${API}/${path.join('/')}`);
  target.search = request.nextUrl.search;

  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  const contentType = request.headers.get('content-type');
  const accept = request.headers.get('accept');
  if (cookie) headers.set('cookie', cookie);
  if (contentType) headers.set('content-type', contentType);
  if (accept) headers.set('accept', accept);

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
      redirect: 'manual',
    });

    const response = new NextResponse(await upstream.arrayBuffer(), { status: upstream.status });
    for (const name of ['content-type', 'content-disposition', 'cache-control', 'x-content-type-options']) {
      const value = upstream.headers.get(name);
      if (value) response.headers.set(name, value);
    }

    const setCookies = upstream.headers.getSetCookie?.() ?? [];
    for (const cookieValue of setCookies) {
      response.headers.append('set-cookie', cookieValue);
    }

    return response;
  } catch {
    return NextResponse.json(
      { message: 'The service is unavailable. Please try again.' },
      { status: 502 },
    );
  }
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
