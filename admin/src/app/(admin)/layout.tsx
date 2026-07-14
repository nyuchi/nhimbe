/**
 * Gated segment layout — every route in the (admin) group renders inside the
 * AdminShell AND behind a server-side requireAdmin("moderator") gate, so no
 * admin chrome ever ships to anonymous or plain-user visitors. The shell
 * gates at "moderator" (matching the old in-app layout, which showed the
 * navigation to moderators with admin-only items locked); each page then
 * re-gates at its own level — requireAdmin() (admin) for the data pages,
 * "super_admin" for settings — because client-side navigations don't re-run
 * this layout.
 */

import { withAuth } from "@workos-inc/authkit-nextjs";
import { AdminShell } from "@admin/components/admin-shell";
import { requireAdmin } from "@admin/lib/require-admin";

export const dynamic = "force-dynamic";

export default async function GatedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const requester = await requireAdmin("moderator");
  const { user } = await withAuth();

  const name =
    [user?.firstName, user?.lastName].filter(Boolean).join(" ") ||
    user?.email ||
    "Admin";

  return (
    <AdminShell
      user={{
        name,
        email: user?.email ?? "",
        role: requester.role,
      }}
    >
      {children}
    </AdminShell>
  );
}
