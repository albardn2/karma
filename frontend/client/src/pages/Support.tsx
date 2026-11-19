import { Link } from "wouter";
import { Mail } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { PublicPageLayout } from "@/components/PublicPageLayout";
import { SUPPORT_EMAIL, SUPPORT_FAQ_COUNT } from "@/i18n/translations/legal";

/** Public support page at /support; App Store Connect links here. */
export default function Support() {
  const { t } = useLanguage();
  const vars = { email: SUPPORT_EMAIL };
  const faqs = Array.from({ length: SUPPORT_FAQ_COUNT }, (_, i) => i + 1);

  return (
    <PublicPageLayout>
      <div className="space-y-10 text-gray-700 leading-relaxed">
        <header className="space-y-3">
          <h1 className="text-3xl font-bold text-gray-900">{t("legal.support.title")}</h1>
          <p>{t("legal.support.intro")}</p>
        </header>

        <section className="rounded-2xl border border-gray-200 p-6 space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">{t("legal.support.contactTitle")}</h2>
          <p>{t("legal.support.contactBody", vars)}</p>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white brand-gradient rounded-full hover:opacity-90"
            data-testid="support-email"
          >
            <Mail className="w-4 h-4" />
            {t("legal.support.emailButton")}
          </a>
        </section>

        <section className="space-y-5">
          <h2 className="text-xl font-semibold text-gray-900">{t("legal.support.faqTitle")}</h2>
          {faqs.map((n) => (
            <div key={n} className="space-y-1.5" data-testid={`support-faq-${n}`}>
              <h3 className="font-semibold text-gray-900">{t(`legal.support.q${n}`)}</h3>
              <p>{t(`legal.support.a${n}`)}</p>
            </div>
          ))}
        </section>

        <p className="text-sm text-gray-500">
          <Link href="/privacy" className="underline hover:text-gray-900">
            {t("legal.privacyLink")}
          </Link>
        </p>
      </div>
    </PublicPageLayout>
  );
}
