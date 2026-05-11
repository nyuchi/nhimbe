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
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
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
