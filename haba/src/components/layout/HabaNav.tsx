"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Inline navigation matching the 4 top-level routes built in M3/M4.
 * Client component because the active-state highlight reads usePathname().
 */
export function HabaNav() {
  const t = useTranslations("nav");
  const pathname = usePathname() ?? "/";

  const items = [
    { href: "/",       key: "home" },
    { href: "/topup",  key: "topup" },
    { href: "/resale", key: "resale" },
    { href: "/b2b",    key: "b2b" },
  ] as const;

  return (
    <nav aria-label="HABA primary" className="flex items-center gap-1 text-small">
      {items.map((it) => {
        const isActive = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-md px-3 py-1.5 font-medium transition-colors",
              isActive
                ? "bg-brand-primary/10 text-brand-primary"
                : "text-ink-secondary hover:bg-surface-muted hover:text-brand-ink",
            )}
          >
            {t(it.key)}
          </Link>
        );
      })}
    </nav>
  );
}
