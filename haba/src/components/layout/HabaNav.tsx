"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { cn } from "@/lib/utils";

/**
 * Inline navigation — the consumer-facing top-level routes.
 */
export function HabaNav() {
  const t = useTranslations("nav");
  const pathname = usePathname() ?? "/";

  const items = [
    { href: "/",       key: "home" },
    { href: "/resale", key: "resale" },
    { href: "/b2b",    key: "b2b" },
  ] as const;

  return (
    <nav aria-label="HABA primary" className="flex items-center gap-1.5 overflow-x-auto text-body">
      {items.map((it) => {
        const isActive = it.href === "/" ? pathname === "/" : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "shrink-0 whitespace-nowrap rounded-xl px-4 py-2 font-semibold transition-colors",
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
