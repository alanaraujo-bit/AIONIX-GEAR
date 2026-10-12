import { AppShell } from "@/components/app/app-shell";
import { NAV, QUICK_ACTIONS } from "@/components/app/nav";
import { requireApp } from "@/server/session";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { session, org, can } = await requireApp();
  const nav = NAV.filter((n) => !n.anyOf || n.anyOf.some((p) => can(p)));
  const quick = QUICK_ACTIONS.filter((q) => q.anyOf.some((p) => can(p)));
  return (
    <AppShell
      user={{ name: session.user.name, email: session.user.email, isPlatformAdmin: session.user.isPlatformAdmin }}
      org={{ id: org.id, name: org.name, isDemo: org.isDemo }}
      role={session.role!}
      orgs={session.orgs}
      nav={nav}
      quick={quick}
    >
      {children}
    </AppShell>
  );
}
