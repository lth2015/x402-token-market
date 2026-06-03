"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Target, Zap, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; Icon: typeof LayoutDashboard };

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Overview",    Icon: LayoutDashboard },
  { href: "/budget",    label: "Budget",      Icon: Target },
  { href: "/topup",     label: "Auto Topup",  Icon: Zap },
];

export function EnterpriseSidebar() {
  const pathname = usePathname() ?? "";

  return (
    <aside className="hidden lg:flex w-56 shrink-0 flex-col border-r border-border-default bg-surface-base">
      {/* Brand */}
      <div className="flex items-center gap-2.5 border-b border-border-default px-4 py-4">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-brand-primary text-white font-serif text-sm font-medium shadow-e1">
          H
        </span>
        <div className="min-w-0">
          <p className="truncate text-small font-semibold text-ink-primary">HABA Enterprise</p>
          <p className="truncate text-[10px] uppercase tracking-wider text-ink-tertiary">AI Platform</p>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Enterprise navigation">
        <ul className="space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = pathname.startsWith(item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-2.5 rounded px-3 py-2 text-small transition-colors",
                    active
                      ? "bg-brand-subtle text-brand-primary font-medium"
                      : "text-ink-secondary hover:bg-surface-muted hover:text-ink-primary",
                  )}
                >
                  <item.Icon className={cn("h-4 w-4 shrink-0", active && "text-brand-primary")} aria-hidden />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Footer */}
      <footer className="border-t border-border-default px-4 py-3 text-caption text-ink-tertiary">
        <a
          href="http://localhost:3000"
          className="flex items-center gap-1.5 hover:text-brand-primary transition-colors"
          target="_blank"
          rel="noreferrer"
        >
          Netstars Console <ExternalLink className="h-3 w-3" />
        </a>
      </footer>
    </aside>
  );
}
