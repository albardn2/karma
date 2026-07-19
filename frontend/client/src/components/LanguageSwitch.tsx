import { Globe } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { LANGUAGE_LABELS } from "@/i18n";
import type { Lang } from "@/i18n";

// Segmented language switch: shows BOTH languages with the current one
// highlighted, so the control reads as state + switch (an "switch-to-X"
// label was misread as the current language).
export function LanguageSwitch({
  className = "",
  testId = "language-toggle",
}: {
  className?: string;
  testId?: string;
}) {
  const { lang, setLang } = useLanguage();
  return (
    <div className={`flex items-center gap-2 ${className}`} data-testid={testId}>
      <Globe className="w-4 h-4 text-gray-400 shrink-0" />
      <div className="inline-flex p-0.5 rounded-lg bg-gray-100 border border-gray-200">
        {(Object.keys(LANGUAGE_LABELS) as Lang[]).map((code) => (
          <button
            key={code}
            type="button"
            onClick={() => setLang(code)}
            data-testid={`language-${code}`}
            className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
              lang === code
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-500 hover:text-gray-900"
            }`}
          >
            {LANGUAGE_LABELS[code]}
          </button>
        ))}
      </div>
    </div>
  );
}
