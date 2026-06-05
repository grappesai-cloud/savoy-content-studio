// ── Client-direct Blob upload token for Mode 3 footage ───────────────────────
// Vercel function bodies cap at ~4.5MB, so the browser uploads straight to
// Blob via @vercel/blob/client and only the URL reaches our API.

import type { APIRoute } from 'astro';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { json } from '../../../lib/api-utils';
import { e } from '../../../lib/env';

export const POST: APIRoute = async ({ locals, request }) => {
  const user = locals.user;
  if (!user) return json({ error: 'Sign in to upload.' }, 401);

  const body = (await request.json()) as HandleUploadBody;
  try {
    const res = await handleUpload({
      body,
      request,
      token: e('BLOB_READ_WRITE_TOKEN'),
      onBeforeGenerateToken: async (pathname: string) => ({
        allowedContentTypes: ['video/mp4', 'video/quicktime', 'video/webm'],
        maximumSizeInBytes: 200 * 1024 * 1024,
        tokenPayload: JSON.stringify({ userId: user.id, pathname }),
        addRandomSuffix: true,
      } as any),
      onUploadCompleted: async () => {},
    });
    return json(res);
  } catch (err: any) {
    console.error('[studio/upload] error:', err?.message);
    return json({ error: err?.message ?? 'Upload setup failed.' }, 500);
  }
};
