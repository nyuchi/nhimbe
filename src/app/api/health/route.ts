/**
 * Liveness + dependency probe.
 *
 * nhimbe was the only app in the Mukoko fleet without one — kweli has
 * `/api/health`, the gateway has `/health`, every kweli-mcp worker has
 * `/health`. That gap meant nothing external could distinguish "the app is
 * down" from "the app is up but can't reach Mongo", and there was no endpoint
 * for an uptime monitor or a post-deploy smoke check to point at.
 *
 * Deliberately shaped like kweli's, so one monitor configuration covers both:
 *   200 + ok        — every critical dependency answered
 *   200 + degraded  — a non-critical dependency is unhappy
 *   503 + down      — a critical dependency failed
 *
 * MongoDB is the only critical check. The app is SSR-first and reads Mongo on
 * essentially every page, so if the driver can't ping, nhimbe cannot serve
 * real content — even though it will still render (every read degrades to
 * empty rather than throwing; that's the documented contract, and exactly why
 * a 200 on `/` is NOT sufficient evidence the app is healthy).
 *
 * Never authenticated, never cached, and never leaks connection details: a
 * failure reports which dependency and its class of error, not the URI.
 */

import { NextResponse } from "next/server";

import { getMongoClient } from "@/lib/mongo/client";

// A probe must reflect the state of the world right now, not the state at
// build time, so this can never be statically rendered.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Bound each probe so a hung dependency can't hang the health check itself. */
const PROBE_TIMEOUT_MS = 5_000;

type CheckStatus = "ok" | "down" | "skipped";

interface Check {
  status: CheckStatus;
  latencyMs: number | null;
  error?: string;
}

async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`${label} timed out after ${PROBE_TIMEOUT_MS}ms`)),
          PROBE_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function checkMongo(): Promise<Check> {
  if (!process.env.MONGODB_URI) {
    // Unconfigured is a deployment fact, not a runtime fault — report it
    // plainly instead of as a failure the on-call should chase.
    return { status: "skipped", latencyMs: null, error: "MONGODB_URI is not set" };
  }

  const startedAt = Date.now();
  try {
    const client = await withTimeout(getMongoClient(), "mongodb connect");
    await withTimeout(client.db("admin").command({ ping: 1 }), "mongodb ping");
    return { status: "ok", latencyMs: Date.now() - startedAt };
  } catch (error) {
    return {
      status: "down",
      latencyMs: Date.now() - startedAt,
      // Message only — a driver error can carry the full connection string,
      // and this endpoint is public.
      error: error instanceof Error ? error.name : "UnknownError",
    };
  }
}

export async function GET() {
  const startedAt = Date.now();
  const mongodb = await checkMongo();

  const status = mongodb.status === "down" ? "down" : "ok";
  const httpStatus = status === "down" ? 503 : 200;

  return NextResponse.json(
    {
      status,
      timestamp: new Date().toISOString(),
      version: process.env.VERCEL_GIT_COMMIT_SHA ?? "dev",
      region: process.env.VERCEL_REGION ?? null,
      durationMs: Date.now() - startedAt,
      checks: { mongodb },
    },
    {
      status: httpStatus,
      headers: {
        "X-Health-Status": status,
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}

/** Cheap polling for uptime monitors that only need the status code. */
export async function HEAD() {
  const mongodb = await checkMongo();
  const status = mongodb.status === "down" ? "down" : "ok";
  return new Response(null, {
    status: status === "down" ? 503 : 200,
    headers: { "X-Health-Status": status, "Cache-Control": "no-store, max-age=0" },
  });
}
