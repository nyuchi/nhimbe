/**
 * Gated segment layout — every route in the (admin) group renders inside the
 * AdminShell AND behind a server-side requireAdmin("admin") gate, so no admin
 * chrome ever ships to anonymous, plain-user, or moderator visitors. The shell
 * gates at "admin" to match the pages: every (admin) page re-gates at admin
 * (settings at super_admin), so there is no moderator-accessible surface —
 * gating the shell any lower only showed moderators navigation that denied on
 * click. Each page still re-gates at its own level because client-side
 * navigations don't re-run this layout.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { isDevBypass, DEV_EMAIL, DEV_NAME } from "@/lib/auth/dev";
import { AdminShell } from "@admin/components/admin-shell";
import { requireAdmin } from "@admin/lib/require-admin";

export const dynamic = "force-dynamic";

export default async function GatedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requester = await requireAdmin("admin");

  let name = DEV_NAME;
  let email = DEV_EMAIL;
  if (!isDevBypass()) {
    const { user } = await withAuth();
    name =
      [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
      user?.email ||
      "Admin";
    email = user?.email ?? "";
  }

  return (
    <AdminShell
      user={{
        name,
        email,
        role: requester.role,
      }}
    >
      {children}
    </AdminShell>
  );
}
