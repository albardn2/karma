import { Link } from "wouter";
import {
  Users,
  Package,
  Truck,
  CreditCard,
  BarChart3,
  Languages,
  Globe,
  ArrowRight,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";

// Public marketing page shown at "/" when nobody is signed in — the karma
// counterpart of kintaar's LandingPage: top nav, gradient hero with a product
// mock, features grid, CTA band, footer. Fully bilingual and RTL-safe.

const FEATURES = [
  { icon: Users, titleKey: "misc.landing.f1Title", bodyKey: "misc.landing.f1Body" },
  { icon: Package, titleKey: "misc.landing.f2Title", bodyKey: "misc.landing.f2Body" },
  { icon: Truck, titleKey: "misc.landing.f3Title", bodyKey: "misc.landing.f3Body" },
  { icon: CreditCard, titleKey: "misc.landing.f4Title", bodyKey: "misc.landing.f4Body" },
  { icon: BarChart3, titleKey: "misc.landing.f5Title", bodyKey: "misc.landing.f5Body" },
  { icon: Languages, titleKey: "misc.landing.f6Title", bodyKey: "misc.landing.f6Body" },
];

function HeroMock({ t }: { t: (k: string) => string }) {
  // a lightweight "product screenshot": stat tiles + a chart, pure markup
  const bars = [28, 44, 36, 62, 55, 78, 70, 92, 84, 100, 90, 96];
  return (
    <div className="rounded-2xl bg-white shadow-2xl border border-gray-200 overflow-hidden">
      <div className="h-10 px-4 flex items-center gap-1.5 border-b border-gray-100">
        <span className="w-3 h-3 rounded-full bg-red-400/80" />
        <span className="w-3 h-3 rounded-full bg-yellow-400/80" />
        <span className="w-3 h-3 rounded-full bg-green-400/80" />
        <span className="ms-3 text-xs text-gray-400">{t("misc.landing.brand")}</span>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t("misc.landing.statRevenue"), value: "4.2M", accent: "text-[hsl(245,58%,57%)]" },
            { label: t("misc.landing.statOrders"), value: "1,284", accent: "text-emerald-600" },
            { label: t("misc.landing.statTrips"), value: "312", accent: "text-violet-600" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-gray-100 bg-gray-50/60 p-3">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">
                {s.label}
              </p>
              <p className={`mt-1 text-xl font-bold ${s.accent}`}>{s.value}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-gray-100 p-4" dir="ltr">
          <div className="flex items-end gap-1.5 h-28">
            {bars.map((h, i) => (
              <div
                key={i}
                className="flex-1 rounded-t-md brand-gradient opacity-80"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Landing() {
  const { t, lang, setLang } = useLanguage();

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* top nav */}
      <header className="border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <span className="text-lg font-bold brand-gradient-text">
            {t("misc.landing.brand")}
          </span>
          <nav className="flex items-center gap-2 sm:gap-4">
            <button
              onClick={() => setLang(lang === "en" ? "ar" : "en")}
              className="flex items-center gap-1.5 px-2 py-1.5 text-sm font-medium text-gray-500 hover:text-gray-900 rounded-lg transition-colors"
              data-testid="landing-language-toggle"
            >
              <Globe className="w-4 h-4" />
              {lang === "en" ? "العربية" : "English"}
            </button>
            <Link
              href="/login"
              className="px-3 py-1.5 text-sm font-medium text-gray-600 hover:text-gray-900"
              data-testid="landing-signin"
            >
              {t("misc.landing.navSignIn")}
            </Link>
            <Link
              href="/signup"
              className="px-4 py-2 text-sm font-semibold text-white brand-gradient rounded-full hover:opacity-90 transition-opacity"
              data-testid="landing-signup"
            >
              {t("misc.landing.navSignUp")}
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        {/* hero */}
        <section className="relative overflow-hidden">
          <div
            className="absolute inset-0 -z-10 opacity-[0.06] brand-gradient"
            aria-hidden
          />
          <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-16 pb-20 lg:pt-24 lg:pb-28">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              <div>
                <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-gray-900 leading-[1.08] tracking-tight">
                  {t("misc.landing.heroTitle1")}{" "}
                  <span className="brand-gradient-text">{t("misc.landing.heroTitle2")}</span>{" "}
                  {t("misc.landing.heroTitle3")}
                </h1>
                <p className="mt-6 text-lg text-gray-600 max-w-xl leading-relaxed">
                  {t("misc.landing.heroSub")}
                </p>
                <div className="mt-9 flex flex-wrap items-center gap-3">
                  <Link
                    href="/signup"
                    className="inline-flex items-center gap-2 px-6 py-3 text-base font-semibold text-white brand-gradient rounded-full hover:opacity-90 transition-opacity"
                    data-testid="landing-cta-signup"
                  >
                    {t("misc.landing.ctaStart")}
                    <ArrowRight className="w-4 h-4 rtl:rotate-180" />
                  </Link>
                  <Link
                    href="/login"
                    className="inline-flex items-center px-6 py-3 text-base font-semibold text-gray-700 border border-gray-300 rounded-full hover:bg-gray-50 transition-colors"
                    data-testid="landing-cta-signin"
                  >
                    {t("misc.landing.ctaSignIn")}
                  </Link>
                </div>
              </div>
              <div className="lg:ps-6">
                <HeroMock t={t} />
              </div>
            </div>
          </div>
        </section>

        {/* features */}
        <section className="py-16 lg:py-24 bg-gray-50/70 border-y border-gray-100">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="max-w-2xl">
              <p className="text-sm font-semibold uppercase tracking-wider text-[hsl(245,58%,57%)]">
                {t("misc.landing.featuresKicker")}
              </p>
              <h2 className="mt-3 text-3xl lg:text-4xl font-bold text-gray-900 tracking-tight">
                {t("misc.landing.featuresTitle")}
              </h2>
              <p className="mt-4 text-base lg:text-lg text-gray-600 leading-relaxed">
                {t("misc.landing.featuresSub")}
              </p>
            </div>
            <div className="mt-12 grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((f) => (
                <article
                  key={f.titleKey}
                  className="p-6 rounded-2xl bg-white border border-gray-200 hover:shadow-lg transition-shadow"
                >
                  <div className="w-10 h-10 rounded-xl brand-gradient flex items-center justify-center">
                    <f.icon className="w-5 h-5 text-white" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-gray-900">{t(f.titleKey)}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-gray-600">{t(f.bodyKey)}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* CTA band */}
        <section className="py-16 lg:py-20">
          <div className="max-w-6xl mx-auto px-4 sm:px-6">
            <div className="rounded-3xl brand-gradient px-8 py-12 lg:px-14 lg:py-14 text-center">
              <h2 className="text-3xl lg:text-4xl font-bold text-white tracking-tight">
                {t("misc.landing.bandTitle")}
              </h2>
              <p className="mt-4 text-white/85 text-base lg:text-lg max-w-xl mx-auto">
                {t("misc.landing.bandSub")}
              </p>
              <Link
                href="/signup"
                className="mt-8 inline-flex items-center gap-2 px-7 py-3 text-base font-semibold text-[hsl(245,58%,45%)] bg-white rounded-full hover:bg-gray-100 transition-colors"
                data-testid="landing-band-signup"
              >
                {t("misc.landing.ctaStart")}
                <ArrowRight className="w-4 h-4 rtl:rotate-180" />
              </Link>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-gray-100 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-center justify-between text-sm text-gray-400">
          <span className="font-semibold brand-gradient-text">{t("misc.landing.brand")}</span>
          <span>
            © {new Date().getFullYear()} {t("misc.landing.footer")}
          </span>
        </div>
      </footer>
    </div>
  );
}
