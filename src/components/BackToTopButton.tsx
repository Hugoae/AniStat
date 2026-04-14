type BackToTopButtonProps = {
  visible: boolean;
};

export function BackToTopButton({ visible }: BackToTopButtonProps) {
  if (!visible) return null;
  return (
    <button
      type="button"
      className="back-to-top-btn"
      onClick={() => {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }}
      aria-label="Remonter en haut de la page"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M18 15l-6-6-6 6" />
      </svg>
    </button>
  );
}
