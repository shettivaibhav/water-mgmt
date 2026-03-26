/**
 * WaterTank – animated SVG beaker that fills based on pct (0-100).
 * color: "green" | "orange" | "red"
 */
export default function WaterTank({ pct = 0, color = "green", label = "" }) {
  const clamp = Math.min(100, Math.max(0, pct));
  const fillH = 120 * (clamp / 100);   // max height of beaker body = 120px

  const colorMap = {
    green:  { fill:"#00d97e", glow:"#00d97e40", text:"#00d97e" },
    orange: { fill:"#ff9d00", glow:"#ff9d0040", text:"#ff9d00" },
    red:    { fill:"#ff4d6d", glow:"#ff4d6d40", text:"#ff4d6d" },
  };
  const c = colorMap[color] || colorMap.green;

  return (
    <div style={{ display:"flex", flexDirection:"column", alignItems:"center", gap:8 }}>
      <svg width="80" height="160" viewBox="0 0 80 160" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id={`wg_${color}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={c.fill} stopOpacity="0.9"/>
            <stop offset="100%" stopColor={c.fill} stopOpacity="0.5"/>
          </linearGradient>
          <clipPath id={`clip_${color}`}>
            <rect x="10" y="30" width="60" height="120" rx="4"/>
          </clipPath>
        </defs>

        {/* Beaker outline */}
        <rect x="10" y="30" width="60" height="120" rx="4"
          fill="none" stroke="#1e2a45" strokeWidth="2"/>

        {/* Water fill – animated */}
        <rect
          x="10" y={30 + (120 - fillH)} width="60" height={fillH} rx="2"
          fill={`url(#wg_${color})`}
          clipPath={`url(#clip_${color})`}
          style={{ transition:"y 1s ease, height 1s ease" }}
        />

        {/* Tick marks */}
        {[25,50,75].map(t => (
          <line key={t} x1="58" y1={30 + 120*(1-t/100)} x2="68" y2={30 + 120*(1-t/100)}
            stroke="#1e2a45" strokeWidth="1.5"/>
        ))}

        {/* Spout (top) */}
        <rect x="28" y="22" width="24" height="10" rx="3"
          fill="none" stroke="#1e2a45" strokeWidth="2"/>

        {/* Percentage text */}
        <text x="40" y={30 + 60} textAnchor="middle" dominantBaseline="middle"
          fill={clamp > 50 ? "#fff" : c.text}
          fontSize="13" fontWeight="700" fontFamily="'DM Sans', sans-serif">
          {Math.round(clamp)}%
        </text>
      </svg>
      <div style={{ color:"#64748b", fontSize:11, textAlign:"center" }}>{label}</div>
    </div>
  );
}
