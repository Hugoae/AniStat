import { pentagramPath, starPointAngleToward } from "./mediaDisplayHelpers";

type MediaOriginFlagSvgProps = {
  code?: string | null;
  width?: number;
  height?: number;
};

/** Drapeaux SVG locaux (lisibles partout, hors-ligne). Autres ISO2 : pastille code. */
export function MediaOriginFlagSvg({ code, width = 20, height = 14 }: MediaOriginFlagSvgProps) {
  const w = width;
  const h = height;
  const upper = String(code || "").toUpperCase();
  switch (upper) {
    case "JP":
      return (
        <svg width={w} height={h} viewBox="0 0 20 14" aria-hidden className="media-origin-flag-svg">
          <rect width="20" height="14" fill="#fff" />
          <circle cx="10" cy="7" r="4.2" fill="#bc002d" />
        </svg>
      );
    case "KR": {
      /* Taegeukgi : rouge au nord, bleu au sud (rotation -90° du tracé yin-yang classique qui sinon remplit est/ouest). */
      return (
        <svg width={w} height={h} viewBox="0 0 20 14" aria-hidden className="media-origin-flag-svg">
          <rect width="20" height="14" fill="#fff" />
          <g transform="translate(10,7) rotate(-90)">
            <path
              fill="#cd2e3a"
              d="M0,-3 a3,3 0,0,1,0,6 a1.5,1.5 0,0,1,0,-3 a1.5,1.5 0,0,0,0,-3"
            />
            <path
              fill="#0047a0"
              d="M0,3 a3,3 0,0,1,0,-6 a1.5,1.5 0,0,1,0,3 a1.5,1.5 0,0,0,0,3"
            />
          </g>
          <g stroke="#111" strokeWidth="0.38" strokeLinecap="round">
            {/* Geon - haut gauche : trois traits pleins */}
            <line x1="1.25" y1="1.35" x2="4.05" y2="1.35" />
            <line x1="1.25" y1="2.2" x2="4.05" y2="2.2" />
            <line x1="1.25" y1="3.05" x2="4.05" y2="3.05" />
            {/* Gam - haut droit : milieu plein, haut et bas brisés */}
            <line x1="15.95" y1="1.35" x2="16.85" y2="1.35" />
            <line x1="17.15" y1="1.35" x2="18.75" y2="1.35" />
            <line x1="15.95" y1="2.2" x2="18.75" y2="2.2" />
            <line x1="15.95" y1="3.05" x2="16.85" y2="3.05" />
            <line x1="17.15" y1="3.05" x2="18.75" y2="3.05" />
            {/* Ri - bas gauche : milieu brisé, haut et bas pleins */}
            <line x1="1.25" y1="10.95" x2="4.05" y2="10.95" />
            <line x1="1.25" y1="11.8" x2="2.05" y2="11.8" />
            <line x1="3.25" y1="11.8" x2="4.05" y2="11.8" />
            <line x1="1.25" y1="12.65" x2="4.05" y2="12.65" />
            {/* Gon - bas droit : trois traits brisés */}
            <line x1="15.95" y1="10.95" x2="16.85" y2="10.95" />
            <line x1="17.15" y1="10.95" x2="18.75" y2="10.95" />
            <line x1="15.95" y1="11.8" x2="16.85" y2="11.8" />
            <line x1="17.15" y1="11.8" x2="18.75" y2="11.8" />
            <line x1="15.95" y1="12.65" x2="16.85" y2="12.65" />
            <line x1="17.15" y1="12.65" x2="18.75" y2="12.65" />
          </g>
        </svg>
      );
    }
    case "CN": {
      const bx = 3.85;
      const by = 3.05;
      const br = 1.12;
      const sr = 0.38;
      const sm = [
        { x: 7.65, y: 1.65 },
        { x: 9.15, y: 3.15 },
        { x: 9.15, y: 4.85 },
        { x: 7.65, y: 6.2 },
      ];
      return (
        <svg width={w} height={h} viewBox="0 0 20 14" aria-hidden className="media-origin-flag-svg">
          <rect width="20" height="14" fill="#de2910" />
          <path fill="#ffde00" d={pentagramPath(bx, by, br, 0)} />
          <path fill="#ffde00" d={pentagramPath(sm[0].x, sm[0].y, sr, starPointAngleToward(sm[0].x, sm[0].y, bx, by))} />
          <path fill="#ffde00" d={pentagramPath(sm[1].x, sm[1].y, sr, starPointAngleToward(sm[1].x, sm[1].y, bx, by))} />
          <path fill="#ffde00" d={pentagramPath(sm[2].x, sm[2].y, sr, starPointAngleToward(sm[2].x, sm[2].y, bx, by))} />
          <path fill="#ffde00" d={pentagramPath(sm[3].x, sm[3].y, sr, starPointAngleToward(sm[3].x, sm[3].y, bx, by))} />
        </svg>
      );
    }
    case "TW": {
      const tcx = 5;
      const tcy = 3.5;
      const rDisk = 1.12;
      const rRayIn = 1.38;
      const rRayOut = 2.76;
      let rayD = "";
      for (let k = 0; k < 12; k++) {
        const t = -Math.PI / 2 + (k * Math.PI) / 6;
        const t1 = t - Math.PI / 12;
        const t2 = t + Math.PI / 12;
        const x1i = tcx + rRayIn * Math.cos(t1);
        const y1i = tcy + rRayIn * Math.sin(t1);
        const x1o = tcx + rRayOut * Math.cos(t1);
        const y1o = tcy + rRayOut * Math.sin(t1);
        const x2o = tcx + rRayOut * Math.cos(t2);
        const y2o = tcy + rRayOut * Math.sin(t2);
        const x2i = tcx + rRayIn * Math.cos(t2);
        const y2i = tcy + rRayIn * Math.sin(t2);
        rayD += `M${x1i},${y1i}L${x1o},${y1o}L${x2o},${y2o}L${x2i},${y2i}Z`;
      }
      return (
        <svg width={w} height={h} viewBox="0 0 20 14" aria-hidden className="media-origin-flag-svg">
          <rect width="20" height="14" fill="#fe0000" />
          <rect width="10" height="7" x="0" y="0" fill="#000095" />
          <path fill="#fff" d={rayD} />
          <circle cx={tcx} cy={tcy} r={rDisk} fill="#fff" />
        </svg>
      );
    }
    default:
      return (
        <svg width={w} height={h} viewBox="0 0 20 14" aria-hidden className="media-origin-flag-svg">
          <rect width="20" height="14" rx="3" fill="#1f2d3d" />
          <text
            x="10"
            y="9.5"
            textAnchor="middle"
            fill="#8ba0b2"
            fontSize="5.5"
            fontWeight="800"
            fontFamily="system-ui, 'Segoe UI', sans-serif"
          >
            {upper}
          </text>
        </svg>
      );
  }
}
