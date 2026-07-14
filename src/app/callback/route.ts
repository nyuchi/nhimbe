import { handleAuth } from "@workos-inc/authkit-nextjs";
import { syncInputFromWorkosUser, syncPersonFromWorkos } from "@/lib/mongo/users";
import { createLogger } from "@/lib/observability";

const log = createLogger("callback");

// AuthKit redirects users here after completing sign-in. handleAuth swaps
// the authorization code for a session, sets the secure session cookie,
// and redirects to the returnPathname (or "/" by default).
//
// onSuccess provisions the person synchronously (issue #70): the moment the
// code exchange succeeds we upsert the WorkOS user into `identity.persons`,
// so the account exists in Mongo before the first page renders. It MUST
// never throw into the auth flow — any failure is logged and swallowed (the
// webhook and the lazy first-render sync remain as safety nets).
export const GET = handleAuth({
  returnPathname: "/",
  onSuccess: async ({ user }) => {
    try {
      await syncPersonFromWorkos(syncInputFromWorkosUser(user));
    } catch (error) {
      log.error("Post-auth person provisioning failed — deferring to webhook/lazy sync", {
        data: { workosUserId: user.id },
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  },
});
