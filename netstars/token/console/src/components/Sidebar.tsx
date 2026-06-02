"use client";

/**
 * Sidebar nav — UX-SPEC §3 + §4.
 *
 * Active-route highlight via usePathname (Client only). Two groups separated
 * by a thin rule: business pages on top, admin pages at the bottom. Footer
 * shows backend status (polled by AppShell, passed down).
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, BarChart3, Coins, KeyRound, Cpu,
  FileText, Settings, ShieldCheck, Network, ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; Icon: typeof LayoutDashboard };

const PRIMARY: Item[] = [
  { href: "/dashboard", label: "Dashboard",  Icon: LayoutDashboard },
  { href: "/usage",     label: "Usage",      Icon: BarChart3 },
  { href: "/tokens",    label: "Tokens",     Icon: Coins },
  { href: "/api-keys",  label: "API Keys",   Icon: KeyRound },
  { href: "/models",    label: "Models",     Icon: Cpu },
  { href: "/invoices",  label: "Invoices",   Icon: FileText },
  { href: "/protocol",  label: "Protocol",   Icon: Network },
];

const SECONDARY: Item[] = [
  { href: "/settings", label: "Settings",  Icon: Settings },
  { href: "/audit",    label: "Audit Log", Icon: ShieldCheck },
];

export function Sidebar({ backendOk }: { backendOk: boolean }) {
  const pathname = usePathname() ?? "";

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-border-subtle bg-surface-base">
      <nav className="flex-1 overflow-y-auto px-2 py-4" aria-label="Primary">
        <ul className="space-y-0.5">
          {PRIMARY.map((item) => (
            <SidebarLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
          ))}
        </ul>
        <div className="mx-3 my-3 h-px bg-border-subtle" />
        <ul className="space-y-0.5">
          {SECONDARY.map((item) => (
            <SidebarLink key={item.href} item={item} active={pathname.startsWith(item.href)} />
          ))}
        </ul>
      </nav>

      <footer className="border-t border-border-subtle px-4 py-3 text-caption text-ink-tertiary">
        <a
          href="http://localhost:3001"
          className="flex items-center gap-1.5 hover:text-brand-primary"
          target="_blank"
          rel="noreferrer"
          title="Consumer site (independent deployment)"
        >
          Consumer Site → <ExternalLink className="h-3 w-3" />
        </a>
        <a
          href="https://developer.netstars.jp"
          className="mt-1.5 flex items-center gap-1.5 hover:text-brand-primary"
          target="_blank"
          rel="noreferrer"
        >
          Docs <ExternalLink className="h-3 w-3" />
        </a>
        <div className="mt-2 flex items-center gap-1.5">
          <span
            className={cn(
              "block h-1.5 w-1.5 rounded-full",
              backendOk ? "bg-semantic-success" : "bg-semantic-danger",
            )}
            aria-hidden
          />
          <span>{backendOk ? "All systems operational" : "Backend degraded"}</span>
        </div>
      </footer>
    </aside>
  );
}

function SidebarLink({ item, active }: { item: Item; active: boolean }) {
  const { Icon, href, label } = item;
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "group flex items-center gap-2.5 rounded px-3 py-2 text-small transition-colors",
          active
            ? "bg-brand-primary/10 text-brand-primary font-medium"
            : "text-ink-secondary hover:bg-surface-muted hover:text-ink-primary",
        )}
      >
        <Icon className={cn("h-4 w-4 shrink-0", active && "text-brand-primary")} aria-hidden />
        <span className="truncate">{label}</span>
      </Link>
    </li>
  );
}
