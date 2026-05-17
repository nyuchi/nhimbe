/**
 * Circuit breaker — Netflix Hystrix-inspired pattern.
 * Tracks failures per provider. When failures exceed threshold,
 * the circuit "opens" and rejects requests immediately.
 *
 * States: CLOSED → OPEN → HALF_OPEN → CLOSED
 */

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerConfig {
  /** Number of consecutive failures before opening */
  failureThreshold: number;
  /** How long to wait before trying again (ms) */
  cooldownMs: number;
  /** Timeout for each operation (ms) */
  timeoutMs: number;
}

interface CircuitBreakerState {
  state: CircuitState;
  failureCount: number;
  lastFailureTime: number;
}

// In-memory state per provider (resets on worker cold start — acceptable for Workers)
const circuits = new Map<string, CircuitBreakerState>();

const DEFAULT_CONFIGS: Record<string, CircuitBreakerConfig> = {
  workos: { failureThreshold: 3, cooldownMs: 2 * 60_000, timeoutMs: 5_000 },
  vectorize: { failureThreshold: 5, cooldownMs: 5 * 60_000, timeoutMs: 8_000 },
  ai: { failureThreshold: 3, cooldownMs: 5 * 60_000, timeoutMs: 15_000 },
  r2: { failureThreshold: 5, cooldownMs: 1 * 60_000, timeoutMs: 10_000 },
  // Supabase (PostgREST) — opens after 5 transient failures, retry every 30s.
  // Tighter than vectorize because the worker is much harder offline against
  // Supabase than against a missing Vectorize match.
  supabase: { failureThreshold: 5, cooldownMs: 30_000, timeoutMs: 10_000 },
};

function getState(provider: string): CircuitBreakerState {
  if (!circuits.has(provider)) {
    circuits.set(provider, { state: "CLOSED", failureCount: 0, lastFailureTime: 0 });
  }
  return circuits.get(provider)!;
}

function getConfig(provider: string): CircuitBreakerConfig {
  return DEFAULT_CONFIGS[provider] || { failureThreshold: 3, cooldownMs: 2 * 60_000, timeoutMs: 10_000 };
}

/**
 * Execute an operation through a circuit breaker.
 * Returns null if the circuit is open (caller should use fallback).
 */
export async function withCircuitBreaker<T>(
  provider: string,
  operation: () => Promise<T>,
  fallback?: T,
): Promise<T | null> {
  const state = getState(provider);
  const config = getConfig(provider);

  // Check if circuit is open
  if (state.state === "OPEN") {
    const elapsed = Date.now() - state.lastFailureTime;
    if (elapsed < config.cooldownMs) {
      console.warn(`[mukoko:circuit-breaker] ${provider} circuit OPEN — rejecting request`);
      return fallback ?? null;
    }
    // Cooldown expired — try half-open
    state.state = "HALF_OPEN";
  }

  try {
    // Race against timeout
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${provider} timed out after ${config.timeoutMs}ms`)), config.timeoutMs)
      ),
    ]);

    // Success — reset circuit
    state.state = "CLOSED";
    state.failureCount = 0;
    return result;
  } catch (error) {
    state.failureCount++;
    state.lastFailureTime = Date.now();

    if (state.failureCount >= config.failureThreshold) {
      state.state = "OPEN";
      console.error(`[mukoko:circuit-breaker] ${provider} circuit OPENED after ${state.failureCount} failures`);
    }

    console.error(`[mukoko:circuit-breaker] ${provider} failure (${state.failureCount}/${config.failureThreshold}):`, error);
    return fallback ?? null;
  }
}

/**
 * Get the current circuit state for monitoring/health checks.
 */
export function getCircuitState(provider: string): CircuitState {
  return getState(provider).state;
}

/**
 * Error thrown when a circuit-broken operation is rejected because the
 * circuit is OPEN. Callers can catch this to surface a 503 to clients
 * rather than a generic 500.
 */
export class CircuitOpenError extends Error {
  constructor(public readonly provider: string) {
    super(`[mukoko:circuit-breaker] ${provider} circuit is OPEN — request rejected`);
    this.name = "CircuitOpenError";
  }
}

/**
 * Throw-on-open variant of withCircuitBreaker. Unlike the null-returning
 * default, this:
 *   - throws CircuitOpenError immediately when the circuit is OPEN
 *   - re-throws the operation's error after counting it (or skipping it,
 *     if shouldCountAsFailure returns false)
 *   - lets callers distinguish "infra down" from "no data" / "bad input"
 *
 * The shouldCountAsFailure predicate keeps unrelated errors (e.g. 4xx caller
 * bugs) from tripping the breaker.
 */
export async function withCircuitBreakerThrow<T>(
  provider: string,
  operation: () => Promise<T>,
  options: { shouldCountAsFailure?: (error: unknown) => boolean } = {},
): Promise<T> {
  const state = getState(provider);
  const config = getConfig(provider);

  if (state.state === "OPEN") {
    const elapsed = Date.now() - state.lastFailureTime;
    if (elapsed < config.cooldownMs) {
      console.warn(`[mukoko:circuit-breaker] ${provider} circuit OPEN — rejecting request`);
      throw new CircuitOpenError(provider);
    }
    state.state = "HALF_OPEN";
  }

  try {
    const result = await Promise.race([
      operation(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${provider} timed out after ${config.timeoutMs}ms`)), config.timeoutMs)
      ),
    ]);
    state.state = "CLOSED";
    state.failureCount = 0;
    return result;
  } catch (error) {
    const counts = options.shouldCountAsFailure ? options.shouldCountAsFailure(error) : true;
    if (counts) {
      state.failureCount++;
      state.lastFailureTime = Date.now();
      if (state.failureCount >= config.failureThreshold) {
        state.state = "OPEN";
        console.error(`[mukoko:circuit-breaker] ${provider} circuit OPENED after ${state.failureCount} failures`);
      }
      console.error(`[mukoko:circuit-breaker] ${provider} failure (${state.failureCount}/${config.failureThreshold}):`, error);
    }
    throw error;
  }
}

/** Reset a circuit to CLOSED — for tests only. */
export function resetCircuit(provider: string): void {
  circuits.set(provider, { state: "CLOSED", failureCount: 0, lastFailureTime: 0 });
}
