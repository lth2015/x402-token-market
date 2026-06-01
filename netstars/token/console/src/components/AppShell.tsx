/**
 * AppShell — single source of truth for TopBar + Sidebar + main column.
 *
 * Server Component; backendOk is checked at render time and passed to the
 * client-side Sidebar so the footer status indicator is correct without
 * an additional fetch.
 */
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";
import { ArchitectureCrumb } from "./ArchitectureCrumb";
import { api } from "@/lib/api";

export async function AppShell({ children }: { children: React.ReactNode }) {
  let backendOk = false;
  try {
    const h = await api.healthz();
    backendOk = h.status === "ok";
  } catch {
    backendOk = false;
  }

  return (
    <div className="min-h-dvh bg-surface-page text-ink-primary">
      <TopBar />
      <ArchitectureCrumb current="gateway" />
      <div className="flex">
        <Sidebar backendOk={backendOk} />
        <div className="flex-1 min-w-0">{children}</div>
      </div>
    </div>
  );
}
