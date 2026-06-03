"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useLocale } from "next-intl";
import { Globe, Check, ChevronDown } from "lucide-react";
import { useRouter } from "next/navigation";
import { setLocaleCookie } from "@/lib/i18n/locale-action";
import { cn } from "@/lib/utils";

type LocaleOption = { code: "zh-CN" | "ja" | "en"; label: string; native: string };

const LOCALES: LocaleOption[] = [
  { code: "zh-CN", label: "Chinese (Simplified)", native: "ZH" },
  { code: "ja",    label: "Japanese",              native: "JA" },
  { code: "en",    label: "English",               native: "EN" },
];

/**
 * 3-language picker (zh-CN / ja / en) in HabaTopBar.
 *
 * Click → server action sets `locale` cookie → router.refresh re-runs the
 * RSC tree with the new locale → all translated strings update without a
 * full page reload.
 */
export function LocaleSwitcher() {
  const currentLocale = useLocale();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function pick(code: LocaleOption["code"]) {
    setOpen(false);
    if (code === currentLocale) return;
    startTransition(async () => {
      await setLocaleCookie(code);
      router.refresh();
    });
  }

  const active = LOCALES.find((l) => l.code === currentLocale) ?? LOCALES[0];

  return (
    <div ref={wrapperRef} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={pending}
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-3 py-1.5 text-caption transition-colors",
          open
            ? "border-brand-primary/40 bg-brand-primary/5 text-brand-primary"
            : "border-border-subtle bg-surface-base text-ink-secondary hover:border-brand-primary/40 hover:text-brand-primary",
          pending && "opacity-60",
        )}
      >
        <Globe className="h-3 w-3 shrink-0" aria-hidden />
        <span className="whitespace-nowrap font-medium">{active.native}</span>
        <ChevronDown className={cn("h-3 w-3 shrink-0 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <ul
          role="menu"
          className="absolute right-0 top-full z-40 mt-1.5 w-40 overflow-hidden rounded-lg border border-border-subtle bg-surface-base shadow-e2"
        >
          {LOCALES.map((opt) => {
            const isActive = opt.code === currentLocale;
            return (
              <li key={opt.code} role="none">
                <button
                  type="button"
                  role="menuitemradio"
                  aria-checked={isActive}
                  onClick={() => pick(opt.code)}
                  className={cn(
                    "flex w-full items-center justify-between gap-2 px-3 py-2 text-caption text-ink-secondary transition-colors hover:bg-surface-muted hover:text-brand-primary",
                    isActive && "text-brand-primary",
                  )}
                >
                  <span>{opt.label}</span>
                  {isActive && <Check className="h-3 w-3" aria-hidden />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
