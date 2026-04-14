import { useEffect, useRef, useState, type ReactNode } from "react";

/** Monte le graphique Recharts seulement quand le bloc entre dans le viewport (perf scroll). */
export function RechartsWhenVisible({ height, children, className }: { height: number; children: ReactNode; className?: string }) {
  const ref = useRef(null);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || show) return undefined;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) setShow(true);
      },
      { root: null, rootMargin: "160px 0px", threshold: 0.02 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [show]);
  return (
    <div ref={ref} className={className || undefined} style={{ minHeight: height }}>
      {show ? (
        children
      ) : (
        <div
          className="list-tab-chart-skeleton"
          style={{ height }}
          aria-hidden
        />
      )}
    </div>
  );
}

