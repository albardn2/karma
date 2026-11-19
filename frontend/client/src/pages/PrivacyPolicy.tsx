import { useLanguage } from "@/contexts/LanguageContext";
import { PlainTextBody, PublicPageLayout } from "@/components/PublicPageLayout";
import { PRIVACY_SECTION_COUNT, SUPPORT_EMAIL } from "@/i18n/translations/legal";

/** Public privacy policy at /privacy; App Store Connect links here. */
export default function PrivacyPolicy() {
  const { t } = useLanguage();
  const vars = { email: SUPPORT_EMAIL };
  const sections = Array.from({ length: PRIVACY_SECTION_COUNT }, (_, i) => i + 1);

  return (
    <PublicPageLayout>
      <article className="space-y-8 text-gray-700 leading-relaxed">
        <header className="space-y-2">
          <h1 className="text-3xl font-bold text-gray-900">{t("legal.privacy.title")}</h1>
          <p className="text-sm text-gray-500">{t("legal.lastUpdated")}</p>
          <p>{t("legal.privacy.intro", vars)}</p>
        </header>
        {sections.map((n) => (
          <section key={n} className="space-y-3" data-testid={`privacy-section-${n}`}>
            <h2 className="text-xl font-semibold text-gray-900">{t(`legal.privacy.s${n}.title`)}</h2>
            <PlainTextBody text={t(`legal.privacy.s${n}.body`, vars)} />
          </section>
        ))}
      </article>
    </PublicPageLayout>
  );
}
