/**
 * Route group layout: every page under (console)/ shares the AppShell.
 *
 * Route groups (parens) don't affect URLs, so:
 *   src/app/(console)/dashboard/page.tsx   →  /dashboard
 *   src/app/(console)/tokens/page.tsx      →  /tokens
 *   ...
 */
import { AppShell } from "@/components/AppShell";

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
