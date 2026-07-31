const EXTENSION_ID = 'llihcpikannlnjolgcmbebnoihokiffn';

const ALLOWED_ORIGINS = new Set([
  `chrome-extension://${EXTENSION_ID}`,
  'https://api.linkos.in',
  'http://127.0.0.1:8787',
]);

const ALLOW_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const ALLOW_HEADERS = 'Content-Type, Authorization';

/**
 * Returns the appropriate CORS origin header value based on the incoming request origin.
 */
export function getCorsOrigin(requestOrigin: string | null): string {
  if (requestOrigin && ALLOWED_ORIGINS.has(requestOrigin)) {
    return requestOrigin;
  }
  return `chrome-extension://${EXTENSION_ID}`;
}

/**
 * Attaches CORS headers to a Cloudflare Worker Response object.
 */
export function corsify(response: Response, requestOrigin: string | null): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', getCorsOrigin(requestOrigin));
  headers.set('Access-Control-Allow-Methods', ALLOW_METHODS);
  headers.set('Access-Control-Allow-Headers', ALLOW_HEADERS);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Builds the response for a CORS preflight (OPTIONS) request.
 */
export function preflightResponse(requestOrigin: string | null): Response {
  return new Response(null, {
    headers: {
      'Access-Control-Allow-Origin': getCorsOrigin(requestOrigin),
      'Access-Control-Allow-Methods': ALLOW_METHODS,
      'Access-Control-Allow-Headers': ALLOW_HEADERS,
    },
  });
}

/**
 * CORS options used by the Hono middleware for app routes.
 */
export const corsOptions = {
  origin: (origin: string) => (ALLOWED_ORIGINS.has(origin) ? origin : null),
  allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['set-auth-token'],
};
