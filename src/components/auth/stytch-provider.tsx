"use client";

import { StytchProvider as StytchProviderSDK } from "@stytch/nextjs";
import { createStytchUIClient } from "@stytch/nextjs/ui";
import { ReactNode } from "react";

// Pinned to @stytch/nextjs@21 because v22 bundles Preact for its UI components
// (transitively via @stytch/vanilla-js@6) and that bundled Preact crashes at
// hydration with "undefined is not an object (evaluating 'X.context[Y.__c]')"
// on every page that mounts our auth context. v21 is the last version that
// works without that crash. PR-D will rip Stytch out entirely for WorkOS.
let stytchClient: ReturnType<typeof createStytchUIClient> | null = null;

function getStytchClient() {
  if (!stytchClient) {
    const token = process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN;
    if (!token) {
      console.error("[mukoko:auth] NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN is not set");
      return createStytchUIClient("");
    }
    stytchClient = createStytchUIClient(token);
  }
  return stytchClient;
}

export function StytchProvider({ children }: { children: ReactNode }) {
  return (
    <StytchProviderSDK stytch={getStytchClient()}>{children}</StytchProviderSDK>
  );
}
