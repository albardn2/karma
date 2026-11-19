import type { ReactNode } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitch } from "@/components/LanguageSwitch";
import { SUPPORT_EMAIL } from "@/i18n/translations/legal";

/** Header and footer for public pages that anyone can open without signing in. */
export function PublicPageLayout({ children }: { children: ReactNode }) {
  const { t } = useLanguage();
  return (
    <div className="min-h-screen bg-white flex flex-col">
      <header className="border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link href="/" className="text-lg font-bold brand-gradient-text">
            {t("legal.brand")}
          </Link>
          <LanguageSwitch testId="public-language-toggle" />
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto px-4 sm:px-6 py-10">{children}</main>
      <footer className="border-t border-gray-100 py-6">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-3 text-sm text-gray-500">
          <span>© {new Date().getFullYear()} {t("legal.brand")}</span>
          <nav className="flex items-center gap-4">
            <Link href="/privacy" className="hover:text-gray-900" data-testid="footer-privacy">
              {t("legal.privacyLink")}
            </Link>
            <Link href="/support" className="hover:text-gray-900" data-testid="footer-support">
              {t("legal.supportLink")}
            </Link>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-gray-900" dir="ltr">
              {SUPPORT_EMAIL}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** Renders a translated body: a blank line separates paragraphs, "• " lines are bullets. */
export function PlainTextBody({ text }: { text: string }) {
  return (
    <>
      {text.split("\n\n").map((block, i) => {
        const lines = block.split("\n");
        if (lines.every((l) => l.startsWith("• "))) {
          return (
            <ul key={i} className="list-disc ps-6 space-y-1.5">
              {lines.map((l, j) => (
                <li key={j}>{l.slice(2)}</li>
              ))}
            </ul>
          );
        }
        return <p key={i}>{block}</p>;
      })}
    </>
  );
}
