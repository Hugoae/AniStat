import { useI18n } from "../../i18n/I18n";
import type { Lang } from "../../lib/routing";

const LANGS: { code: Lang; label: string; aria: string }[] = [
  { code: "fr", label: "FR", aria: "Passer en français" },
  { code: "en", label: "EN", aria: "Switch to English" },
];

/** Bascule de langue FR / EN (segmented control compact). */
export function LanguageSwitcher({ className }: { className?: string }) {
  const { lang, setLang } = useI18n();
  return (
    <div className={`lang-switcher${className ? ` ${className}` : ""}`} role="group" aria-label="Language / Langue">
      {LANGS.map((l) => {
        const active = l.code === lang;
        return (
          <button
            key={l.code}
            type="button"
            className={`lang-switcher__btn${active ? " lang-switcher__btn--active" : ""}`}
            aria-pressed={active}
            aria-label={l.aria}
            onClick={() => {
              if (!active) setLang(l.code);
            }}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}
