"use client";

import { StytchProvider as StytchProviderSDK } from "@stytch/nextjs";
import { createStytchHeadlessClient } from "@stytch/nextjs/headless";
import { ReactNode } from "react";

// We only use Stytch's hooks (useStytch / useStytchUser / useStytchSession) and
// the magic-links / oauth authenticate methods. The "headless" entry point gives
// us those without pulling in Stytch's bundled UI components — which previously
// shipped a bundled copy of Preact that crashed at hydration with
// "undefined is not an object (evaluating 'tj.context')" on every page that
// loaded the auth context. Since we render Stytch's auth flow ourselves on
// /authenticate and /auth/signin, we don't need any of the UI client features.
let stytchClient: ReturnType<typeof createStytchHeadlessClient> | null = null;

function getStytchClient() {
  if (!stytchClient) {
    const token = process.env.NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN;
    if (!token) {
      console.error("[mukoko:auth] NEXT_PUBLIC_STYTCH_PUBLIC_TOKEN is not set");
      return createStytchHeadlessClient("");
    }
    stytchClient = createStytchHeadlessClient(token);
  }
  return stytchClient;
}

export function StytchProvider({ children }: { children: ReactNode }) {
  return (
    <StytchProviderSDK stytch={getStytchClient()}>{children}</StytchProviderSDK>
  );
}
