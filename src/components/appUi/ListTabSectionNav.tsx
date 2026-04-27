import { useEffect, useMemo, useState } from "react";

export type ListTabSectionNavItem = {
  id: string;
  label: string;
};

export function ListTabSectionNav({ items, label }: { items: ListTabSectionNavItem[]; label: string }) {
  const visibleItems = useMemo(() => items.filter((item) => item.id && item.label), [items]);
  const [activeId, setActiveId] = useState(visibleItems[0]?.id ?? "");

  const scrollToSection = (id: string) => {
    const target = document.getElementById(id);
    if (!target) return;
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setActiveId(id);
  };

  useEffect(() => {
    if (visibleItems.length === 0) return undefined;
    const nodes = visibleItems
      .map((item) => document.getElementById(item.id))
      .filter((node): node is HTMLElement => Boolean(node));
    if (nodes.length === 0) return undefined;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => Math.abs(a.boundingClientRect.top) - Math.abs(b.boundingClientRect.top));
        const next = visible[0]?.target.id;
        if (next) setActiveId(next);
      },
      {
        rootMargin: "-22% 0px -62% 0px",
        threshold: [0, 0.15, 0.4],
      }
    );

    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [visibleItems]);

  if (visibleItems.length === 0) return null;

  return (
    <nav className="list-tab-section-nav" aria-label={label}>
      <div className="list-tab-section-nav__eyebrow">Sommaire</div>
      <ul className="list-tab-section-nav__list">
        {visibleItems.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id} className="list-tab-section-nav__item">
              <button
                type="button"
                className={`list-tab-section-nav__link${active ? " is-active" : ""}`}
                aria-current={active ? "true" : undefined}
                onClick={(event) => {
                  event.preventDefault();
                  scrollToSection(item.id);
                }}
              >
                {item.label}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
