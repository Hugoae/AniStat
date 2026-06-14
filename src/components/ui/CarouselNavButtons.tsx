import type { RefObject } from "react";

export type CarouselNavButtonsProps = {
  /** Ref vers le conteneur scrollable (flex row + overflow-x: auto). */
  scrollRef: RefObject<HTMLDivElement | null>;
  /** Booléens déjà calculés ailleurs (via useHorizontalScrollFades). */
  canScrollLeft: boolean;
  canScrollRight: boolean;
  /** Nom court du carrousel, utilisé pour les aria-label (« suivant / précédent »). */
  ariaLabelBase: string;
  /**
   * Montant à scroller par clic.
   *   - `"item"` (défaut) : un enfant direct (card) + le gap CSS. Rend le
   *     défilement progressif et prévisible.
   *   - `"page"` : ~85 % de la largeur visible (grand saut).
   *   - `number` : valeur arbitraire en pixels.
   */
  step?: number | "page" | "item";
};

/**
 * Boutons de navigation ← / → flottants pour un carrousel horizontal.
 *
 * Les boutons sont absolus dans le parent `position: relative`. Ils déclenchent
 * un scroll horizontal fluide (ou instantané si `prefers-reduced-motion` est
 * actif — le navigateur gère cette adaptation pour `behavior: 'smooth'`).
 *
 * Le composant ne gère **pas** la détection du scroll : les booléens sont passés
 * par le parent, qui les calcule via `useHorizontalScrollFades` (source de
 * vérité unique pour l'affichage des fades *et* l'état des boutons).
 */
export function CarouselNavButtons({
  scrollRef,
  canScrollLeft,
  canScrollRight,
  ariaLabelBase,
  step = "item",
}: CarouselNavButtonsProps) {
  const scroll = (dir: -1 | 1) => {
    const el = scrollRef.current;
    if (!el) return;
    let amount: number;
    if (typeof step === "number") {
      amount = step;
    } else if (step === "page") {
      amount = Math.max(160, el.clientWidth * 0.85);
    } else {
      /* "item" : largeur d'une carte + gap flex/grid. On mesure la première
       * carte encore au moins partiellement visible côté avance pour éviter
       * les sauts quand les cartes ne se valent pas en largeur. Fallback :
       * 180 px (≈ jaquette media) si on ne trouve rien. */
      const children = Array.from(el.children) as HTMLElement[];
      const cs = window.getComputedStyle(el);
      const gap = parseFloat(cs.columnGap || cs.gap || "0") || 0;
      const ref = children.find((c) => c.offsetWidth > 0);
      const itemWidth = ref ? ref.offsetWidth : 0;
      amount = itemWidth > 0 ? itemWidth + gap : 180;
    }
    el.scrollBy({ left: dir * amount, behavior: "smooth" });
  };

  return (
    <>
      <button
        type="button"
        className="carousel-nav-btn carousel-nav-btn--prev"
        onClick={() => scroll(-1)}
        disabled={!canScrollLeft}
        aria-label={`${ariaLabelBase} : défiler vers la gauche`}
        tabIndex={canScrollLeft ? 0 : -1}
        aria-hidden={!canScrollLeft}
      >
        <svg
          className="carousel-nav-btn__icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M15 18l-6-6 6-6" />
        </svg>
      </button>
      <button
        type="button"
        className="carousel-nav-btn carousel-nav-btn--next"
        onClick={() => scroll(1)}
        disabled={!canScrollRight}
        aria-label={`${ariaLabelBase} : défiler vers la droite`}
        tabIndex={canScrollRight ? 0 : -1}
        aria-hidden={!canScrollRight}
      >
        <svg
          className="carousel-nav-btn__icon"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M9 6l6 6-6 6" />
        </svg>
      </button>
    </>
  );
}
