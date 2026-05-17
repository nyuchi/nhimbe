/**
 * Shared mock factories for nhimbe worker tests.
 *
 * D1 is gone; worker reads/writes through Supabase REST. Tests stub `fetch`
 * directly to assert the shape of outgoing requests. Mocks here only cover
 * the bindings that still exist on the worker (KV, R2, Vectorize, AI,
 * Analytics, Queues, RateLimiter, Images).
 */

import type {
  Env,
  KVNamespace,
  R2Bucket,
  VectorizeIndex,
  VectorizeQueryResult,
  Ai,
  AnalyticsEngineDataset,
  Queue,
  RateLimiter,
  ImagesBinding,
} from '../types';

// ============================================
// Layer 1: Mock Primitives
// ============================================

export function createMockKV(store: Record<string, string> = {}): KVNamespace {
  return {
    get: vi.fn().mockImplementation((key: string) => Promise.resolve(store[key] || null)),
    put: vi.fn().mockImplementation((key: string, value: string) => { store[key] = value; return Promise.resolve(); }),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ keys: [], list_complete: true }),
  } as unknown as KVNamespace;
}

export function createMockR2(): R2Bucket {
  return {
    head: vi.fn().mockResolvedValue(null),
    get: vi.fn().mockResolvedValue(null),
    put: vi.fn().mockResolvedValue({ key: 'test', version: '1', size: 0, etag: '', httpEtag: '', uploaded: new Date() }),
    delete: vi.fn().mockResolvedValue(undefined),
    list: vi.fn().mockResolvedValue({ objects: [], truncated: false, delimitedPrefixes: [] }),
  } as unknown as R2Bucket;
}

export function createMockVectorize(matches: VectorizeQueryResult['matches'] = []): VectorizeIndex {
  return {
    insert: vi.fn().mockResolvedValue({ count: 0, ids: [] }),
    upsert: vi.fn().mockResolvedValue({ count: 0, ids: [] }),
    query: vi.fn().mockResolvedValue({ matches, count: matches.length }),
    getByIds: vi.fn().mockResolvedValue([]),
    deleteByIds: vi.fn().mockResolvedValue({ count: 0, ids: [] }),
  };
}

export function createMockAI(response: string = 'mock response'): Ai {
  return {
    run: vi.fn().mockResolvedValue({ response, data: [[0.1, 0.2, 0.3]] }),
  };
}

export function createMockAnalytics(): AnalyticsEngineDataset {
  return { writeDataPoint: vi.fn() };
}

export function createMockQueue<T = unknown>(): Queue<T> {
  return {
    send: vi.fn().mockResolvedValue(undefined),
    sendBatch: vi.fn().mockResolvedValue(undefined),
  };
}

export function createMockRateLimiter(success = true): RateLimiter {
  return { limit: vi.fn().mockResolvedValue({ success }) };
}

export function createMockImages(): ImagesBinding {
  return {
    input: vi.fn().mockReturnValue({
      transform: vi.fn().mockReturnValue({
        draw: vi.fn().mockReturnThis(),
        output: vi.fn().mockResolvedValue(new ReadableStream()),
      }),
    }),
  };
}

// ============================================
// Layer 2: Environment Factory
// ============================================

export function createMockEnv(overrides?: Partial<Env>): Env {
  return {
    ENVIRONMENT: 'test',
    API_KEY: 'test-api-key-12345',
    ALLOWED_ORIGINS: 'http://localhost:3000',
    WORKOS_CLIENT_ID: 'project-test-12345',
    SUPABASE_URL: 'https://test-project.supabase.co',
    SUPABASE_SECRET_KEY: 'test-secret-key',
    MUKOKO_API_URL: 'https://api.mukoko.test',
    MUKOKO_API_KEY: 'test-mukoko-api-key',
    AI: createMockAI(),
    VECTORIZE: createMockVectorize(),
    CACHE: createMockKV(),
    MEDIA: createMockR2(),
    IMAGES: createMockImages(),
    ANALYTICS: createMockAnalytics(),
    ANALYTICS_QUEUE: createMockQueue(),
    EMAIL_QUEUE: createMockQueue(),
    RATE_LIMITER: createMockRateLimiter(),
    ...overrides,
  };
}

// ============================================
// Layer 3: Request / Response Builders
// ============================================

export function createRequest(
  url: string,
  options: RequestInit & { origin?: string } = {}
): Request {
  const { origin = 'http://localhost:3000', ...init } = options;
  const headers = new Headers(init.headers);
  if (origin) headers.set('Origin', origin);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  return new Request(url, { ...init, headers });
}

export function createAuthenticatedRequest(
  url: string,
  token: string = 'valid-jwt-token',
  options: RequestInit & { origin?: string } = {}
): Request {
  const headers = new Headers(options.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return createRequest(url, { ...options, headers });
}

export function createApiKeyRequest(
  url: string,
  apiKey: string = 'test-api-key-12345',
  options: RequestInit & { origin?: string } = {}
): Request {
  const headers = new Headers(options.headers);
  headers.set('X-API-Key', apiKey);
  return createRequest(url, { ...options, headers });
}

// ============================================
// Layer 4: PostgREST fetch-stub router
// ============================================
//
// Worker routes hit Supabase via supabaseFetch(), which calls global fetch.
// Tests stub that fetch with a small URL-pattern router. Use pgrstMatch() to
// match a specific table+method, json()/noContent() to build canned responses,
// and makeFetchStub() to wire them together.
//
// Auth note: writeAuth's validateApiKey() uses crypto.subtle.timingSafeEqual,
// a Workers-runtime extension absent in Node. Tests should authenticate via
// Origin: http://localhost:3000 (whitelisted by isAllowedOrigin) rather than
// X-API-Key. trustedOriginHeaders() returns the right shape.

interface FetchStubRoute {
  match: (url: URL, method: string) => boolean;
  handle: (req: {
    url: URL;
    method: string;
    body: unknown;
    headers: Headers;
  }) => Response | Promise<Response>;
}

export interface FetchStubCall {
  url: string;
  method: string;
  body: unknown;
  headers: Record<string, string>;
}

export function makeFetchStub(routes: FetchStubRoute[]): {
  stub: ReturnType<typeof vi.fn>;
  calls: FetchStubCall[];
} {
  const calls: FetchStubCall[] = [];

  const stub = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const urlString =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const url = new URL(urlString);
      const method = (init?.method ?? 'GET').toUpperCase();
      let body: unknown = null;
      if (init?.body) {
        try {
          body = JSON.parse(init.body as string);
        } catch {
          body = init.body;
        }
      }
      const headers = new Headers(init?.headers);
      const headerObj: Record<string, string> = {};
      headers.forEach((v, k) => {
        headerObj[k] = v;
      });
      calls.push({ url: urlString, method, body, headers: headerObj });

      for (const route of routes) {
        if (route.match(url, method)) {
          return route.handle({ url, method, body, headers });
        }
      }
      throw new Error(`[fetch-stub] No route matched ${method} ${urlString}`);
    },
  );

  return { stub, calls };
}

/**
 * Match a PostgREST request by table name + method. Hostname matches the URL
 * used by createMockEnv() — `https://test-project.supabase.co`.
 */
export function pgrstMatch(
  table: string,
  methods: string[] = ['GET', 'POST', 'PATCH', 'DELETE'],
): (url: URL, method: string) => boolean {
  return (url, method) =>
    url.hostname === 'test-project.supabase.co' &&
    url.pathname === `/rest/v1/${table}` &&
    methods.includes(method);
}

/** Build a JSON Response. */
export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/** Build a 204 No Content response (Node forbids a body on 204). */
export function noContent(): Response {
  return new Response(null, { status: 204 });
}

/** Build the 406 PostgREST returns when single=true matches no rows. */
export function notFoundSingle(): Response {
  return new Response(null, { status: 406 });
}

/**
 * Headers that authenticate via the trusted-origin path. Use these for
 * writeAuth-protected routes — Node's crypto.subtle lacks the timingSafeEqual
 * extension that validateApiKey() relies on.
 */
export function trustedOriginHeaders(
  extra: Record<string, string> = {},
): HeadersInit {
  return {
    'Content-Type': 'application/json',
    Origin: 'http://localhost:3000',
    ...extra,
  };
}
