import { SITE } from "../config/site";

type SiteLogoVariant = "header" | "landing";

type SiteLogoProps = {
  variant?: SiteLogoVariant;
  className?: string;
};

const SIZES: Record<SiteLogoVariant, number> = {
  header: 42,
  landing: 44,
};

export function SiteLogo({ variant = "header", className }: SiteLogoProps) {
  const size = SIZES[variant];
  const classes = ["site-logo", `site-logo--${variant}`, className].filter(Boolean).join(" ");

  return (
    <img
      src={SITE.brand.logo}
      alt=""
      className={classes}
      width={size}
      height={size}
      decoding="async"
    />
  );
}
