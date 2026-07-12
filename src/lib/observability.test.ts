/**
 * Observability logger tests.
 *
 * Covers the structured logger's `[mukoko]` prefix contract, module scoping,
 * level routing to the right console method, and the `measure` / `trackError`
 * helpers. These are the conventions CLAUDE.md requires of all log output, so
 * they're worth pinning down.
 *
 * The module captures `console.*` references into a lookup table at import
 * time, so each test installs the spies first, resets the module registry, and
 * re-imports a fresh copy that binds to the spied methods.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

type Level = "debug" | "info" | "warn" | "error";
type SpyMap = Record<Level, ReturnType<typeof vi.spyOn>>;
type Observability = typeof import("./observability");

let spies: SpyMap;
let obs: Observability;

beforeEach(async () => {
  vi.resetModules();
  spies = {
    debug: vi.spyOn(console, "debug").mockImplementation(() => {}),
    info: vi.spyOn(console, "info").mockImplementation(() => {}),
    warn: vi.spyOn(console, "warn").mockImplementation(() => {}),
    error: vi.spyOn(console, "error").mockImplementation(() => {}),
  };
  obs = await import("./observability");
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("log", () => {
  it("routes each level to the matching console method", () => {
    obs.log.debug("d");
    obs.log.info("i");
    obs.log.warn("w");
    obs.log.error("e");
    expect(spies.debug).toHaveBeenCalledTimes(1);
    expect(spies.info).toHaveBeenCalledTimes(1);
    expect(spies.warn).toHaveBeenCalledTimes(1);
    expect(spies.error).toHaveBeenCalledTimes(1);
  });

  it("prefixes messages with [mukoko] and the upper-cased level when no module is given", () => {
    obs.log.info("Server started");
    expect(spies.info.mock.calls[0][0]).toBe("[mukoko] INFO Server started");
  });

  it("uses a [mukoko:module] prefix when a module is provided", () => {
    obs.log.warn("Cache miss", { module: "registry" });
    expect(spies.warn.mock.calls[0][0]).toBe("[mukoko:registry] WARN Cache miss");
  });

  it("appends a trace tag, structured data, and error object as extra args", () => {
    const err = new Error("boom");
    obs.log.error("Failed", { module: "api", traceId: "req-123", data: { port: 3000 }, error: err });
    const args = spies.error.mock.calls[0];
    expect(args[0]).toBe("[mukoko:api] ERROR Failed");
    expect(args).toContain("[trace:req-123]");
    expect(args).toContainEqual({ port: 3000 });
    expect(args).toContain(err);
  });

  it("omits optional parts when not supplied", () => {
    obs.log.info("bare");
    expect(spies.info.mock.calls[0]).toEqual(["[mukoko] INFO bare"]);
  });
});

describe("createLogger", () => {
  it("binds the module into every call", () => {
    const logger = obs.createLogger("checkout");
    logger.info("served", { data: { name: "button" } });
    const args = spies.info.mock.calls[0];
    expect(args[0]).toBe("[mukoko:checkout] INFO served");
    expect(args).toContainEqual({ name: "button" });
  });

  it("routes error through console.error with the bound module", () => {
    const logger = obs.createLogger("registry");
    logger.error("File not found", { error: new Error("ENOENT") });
    expect(spies.error.mock.calls[0][0]).toBe("[mukoko:registry] ERROR File not found");
  });
});

describe("measure", () => {
  it("returns the result and logs a completion line for success", async () => {
    const result = await obs.measure("fetch", async () => 42);
    expect(result).toBe(42);
    expect(spies.info).toHaveBeenCalledTimes(1);
    const msg = spies.info.mock.calls[0][0] as string;
    expect(msg).toContain("[mukoko:perf] INFO");
    expect(msg).toMatch(/fetch completed in \d+ms/);
  });

  it("logs a failure line and re-throws when the function rejects", async () => {
    const boom = new Error("nope");
    await expect(
      obs.measure("risky", async () => {
        throw boom;
      }),
    ).rejects.toBe(boom);
    expect(spies.error).toHaveBeenCalledTimes(1);
    const args = spies.error.mock.calls[0];
    expect(args[0]).toMatch(/risky failed after \d+ms/);
    expect(args).toContain(boom);
  });

  it("honors an explicit module override", async () => {
    await obs.measure("op", () => "ok", { module: "db" });
    expect(spies.info.mock.calls[0][0]).toContain("[mukoko:db] INFO");
  });
});

describe("trackError", () => {
  it("logs a non-Error value by coercing it to an Error message", () => {
    obs.trackError("string failure", { module: "x" });
    const args = spies.error.mock.calls[0];
    expect(args[0]).toBe("[mukoko:x] ERROR string failure");
    expect(args.at(-1)).toBeInstanceOf(Error);
  });

  it("preserves an existing Error instance", () => {
    const err = new Error("kept");
    obs.trackError(err);
    const args = spies.error.mock.calls[0];
    expect(args[0]).toBe("[mukoko] ERROR kept");
    expect(args).toContain(err);
  });
});
