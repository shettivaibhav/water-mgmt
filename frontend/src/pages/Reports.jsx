import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { getTimeseries, getDailyUsage, getUsageByTap, getHourlyPattern, getExportUrl } from "../api";
import { useAuth } from "../context/AuthContext";

const PIE_COLORS = ["#00d4ff","#0057ff","#00d97e","#ff9d00","#ff4d6d","#a855f7"];
const COLOR_MAP  = { green:"#00d97e", orange:"#ff9d00", red:"#ff4d6d" };

// ── Tooltip style — white text on very dark bg ──────────────────
const tooltipStyle = {
  background:"#0a0e1a",
  border:"1px solid #2a3a55",
  borderRadius:8,
  color:"#f1f5f9",
  fontSize:13,
  fontWeight:600,
  padding:"8px 12px",
};
const tooltipItemStyle  = { color:"#f1f5f9" };
const tooltipLabelStyle = { color:"#94a3b8", fontWeight:400, marginBottom:4 };

export default function Reports() {
  const { user }        = useAuth();
  const uid             = user?.user_id;
  const [days,  setDays]  = useState(30);
  const [hours, setHours] = useState(24);
  const [series,    setSeries]    = useState([]);
  const [bucketMin, setBucketMin] = useState(15);
  const [daily,     setDaily]     = useState([]);
  const [byTap,     setByTap]     = useState([]);
  const [hourly,    setHourly]    = useState([]);
  const [loading,   setLoading]   = useState(true);

  const safe = async (fn) => { try { return await fn(); } catch(e) { console.warn(e?.message); return null; } };

  const load = async () => {
    setLoading(true);
    const [s, d, bt, hp] = await Promise.all([
      safe(() => getTimeseries(uid, hours)),
      safe(() => getDailyUsage(uid, days)),
      safe(() => getUsageByTap(uid, days)),
      safe(() => getHourlyPattern(uid, days)),
    ]);

    if (s?.data) {
      const payload = s.data;
      const rows    = payload.data || payload;
      setBucketMin(payload.bucket_mins || 15);
      setSeries(rows.map(r => ({ time: r.time_bucket, usage: r.total_liters })));
    }

    if (d?.data) {
      setDaily(d.data.map(r => ({
        date:   r.date || r.usage_date || "",
        usage:  +(r.total_usage || 0).toFixed(2),
        color:  r.color_status || "green",
        isLive: r.is_live || false,
      })));
    }

    if (bt?.data) setByTap(bt.data);
    if (hp?.data) setHourly(hp.data);

    setLoading(false);
  };

  useEffect(() => { load(); }, [uid, days, hours]);

  const totalUsage = daily.reduce((a,r) => a + r.usage, 0).toFixed(1);
  const avgPerDay  = daily.length > 0 ? (totalUsage / daily.length).toFixed(1) : 0;
  const peakDay    = daily.reduce((a,r) => r.usage > (a?.usage||0) ? r : a, null);
  const peakHour   = hourly.reduce((a,r) => r.avg_liters > (a?.avg_liters||0) ? r : a, null);
  const maxAvg     = Math.max(...hourly.map(h => h.avg_liters), 1);

  const bucketLabel = bucketMin >= 60 ? "hourly" : bucketMin >= 30 ? "30-min" : bucketMin >= 15 ? "15-min" : "5-min";

  const exportCSV = () => {
    const a = document.createElement("a");
    a.href = getExportUrl(uid, days);
    a.download = `water_usage_${days}d.csv`;
    a.click();
  };

  return (
    <div style={{ color:"#e2e8f0", fontFamily:"'DM Sans',sans-serif" }}>

      {/* Header */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:32 }}>
        <div>
          <h1 style={{ fontSize:28, fontWeight:800, margin:0,
            background:"linear-gradient(90deg,#00d4ff,#0057ff)",
            WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
            Reports & Analytics
          </h1>
          <p style={{ color:"#4a7fa5", marginTop:4, fontSize:14 }}>
            Historical water usage insights and exports
          </p>
        </div>
        <button onClick={exportCSV} style={{
          padding:"10px 20px",
          background:"linear-gradient(135deg,#00d97e,#059669)",
          border:"none", borderRadius:10, color:"#fff",
          fontSize:13, fontWeight:700, cursor:"pointer",
          display:"flex", alignItems:"center", gap:6,
        }}>
          📥 Export CSV ({days}d)
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:16, marginBottom:24, flexWrap:"wrap" }}>
        <FilterGroup label="Date Range (Days)" value={days} onChange={setDays}
          options={[7,14,30,60,90]} />
        <FilterGroup label="Timeseries Window (Hours)" value={hours} onChange={setHours}
          options={[6,12,24,48,72]} />
      </div>

      {/* KPI cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:28 }}>
        <MiniCard icon="💧" label={`Total (${days}d)`}   value={`${totalUsage} L`}  color="#00d4ff" />
        <MiniCard icon="📊" label="Avg / Day"             value={`${avgPerDay} L`}   color="#00d97e" />
        <MiniCard icon="📈" label="Peak Day"
          value={peakDay ? `${peakDay.usage} L` : "–"}
          sub={peakDay?.date?.substring(5) || ""}
          color="#ff9d00" />
        <MiniCard icon="⏰" label="Peak Hour"
          value={peakHour ? peakHour.label : "–"}
          sub={peakHour ? `avg ${peakHour.avg_liters} L` : "No data yet"}
          color="#a855f7" />
      </div>

      {loading ? (
        <div style={{ color:"#4a7fa5", textAlign:"center", padding:60 }}>Loading charts…</div>
      ) : (
        <>
          {/* ── Line chart ── */}
          <ChartCard
            title={`Usage Over Time (Last ${hours}h)`}
            sub={series.length <= 1
              ? "⏳ Waiting for more simulator ticks"
              : `${series.length} points · ${bucketLabel} buckets (auto-scaled)`}
          >
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={series} margin={{ top:10, right:24, left:16, bottom:36 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
                <XAxis dataKey="time" stroke="#4a7fa5" fontSize={10}
                  interval="preserveStartEnd"
                  label={{ value:"Time (HH:MM)", position:"insideBottom", offset:-20,
                    fill:"#4a7fa5", fontSize:11 }} />
                <YAxis stroke="#4a7fa5" fontSize={10}
                  label={{ value:"Litres (L)", angle:-90, position:"insideLeft", offset:12,
                    fill:"#4a7fa5", fontSize:11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  labelStyle={{ color:"#94a3b8", fontWeight:400, fontSize:11 }}
                  formatter={v => [`${v} L`, "Usage"]}
                />
                <Line type="monotone" dataKey="usage" stroke="#00d4ff"
                  strokeWidth={2}
                  dot={{ r:4, fill:"#00d4ff", strokeWidth:0 }}
                  activeDot={{ r:6 }}
                  name="Litres" connectNulls />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          {/* ── Bar chart ── */}
          <ChartCard title={`Daily Totals (${days} days)`} sub="Today's cyan bar = live running total">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={daily} margin={{ top:10, right:24, left:16, bottom:36 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
                <XAxis dataKey="date" stroke="#4a7fa5" fontSize={9}
                  type="category"
                  tickFormatter={d => typeof d === "string" ? d.substring(5) : d}
                  label={{ value:"Date (MM-DD)", position:"insideBottom", offset:-20,
                    fill:"#4a7fa5", fontSize:11 }} />
                <YAxis stroke="#4a7fa5" fontSize={10}
                  label={{ value:"Litres (L)", angle:-90, position:"insideLeft", offset:12,
                    fill:"#4a7fa5", fontSize:11 }} />
                <Tooltip
                  contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                  labelStyle={{ color:"#94a3b8", fontWeight:400, fontSize:11 }}
                  formatter={(v, n, props) => [
                    `${v} L${props.payload?.isLive ? " (live)" : ""}`, "Usage"
                  ]}
                />
                <Bar dataKey="usage" name="Litres" radius={[4,4,0,0]}>
                  {daily.map((e,i) => (
                    <Cell key={i}
                      fill={e.isLive ? "#00d4ff" : (COLOR_MAP[e.color] || "#00d4ff")}
                      opacity={e.isLive ? 1 : 0.85}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            {daily.some(r => r.isLive) && (
              <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:8, color:"#00d4ff", fontSize:11 }}>
                <div style={{ width:10, height:10, borderRadius:2, background:"#00d4ff" }}/>
                Today (live) — updates every 60s
              </div>
            )}
          </ChartCard>

          {/* ── Hourly Usage Pattern Heatmap ── */}
          <ChartCard
            title={`Hourly Usage Pattern (last ${days} days)`}
            sub="Average litres consumed per hour of day — shows your peak usage times"
          >
            {hourly.length === 0 || hourly.every(h => h.avg_liters === 0) ? (
              <div style={{ color:"#4a7fa5", textAlign:"center", padding:40 }}>
                No hourly data yet — keep the simulator running to build your pattern.
              </div>
            ) : (
              <>
                <div style={{
                  display:"grid", gridTemplateColumns:"repeat(24,1fr)",
                  gap:3, marginBottom:10,
                }}>
                  {hourly.map(h => {
                    const intensity = maxAvg > 0 ? h.avg_liters / maxAvg : 0;
                    const bg = intensity > 0.7 ? "#ff4d6d"
                             : intensity > 0.4 ? "#ff9d00"
                             : intensity > 0.1 ? "#00d97e"
                             : "#1e2a45";
                    return (
                      <div key={h.hour}
                        title={`${h.label} — avg ${h.avg_liters} L`}
                        style={{
                          height: 48,
                          background: bg,
                          borderRadius: 4,
                          opacity: 0.2 + intensity * 0.8,
                          cursor:"pointer",
                          transition:"opacity 0.2s",
                          position:"relative",
                        }}
                      />
                    );
                  })}
                </div>

                {/* Hour labels */}
                <div style={{
                  display:"grid", gridTemplateColumns:"repeat(24,1fr)",
                  gap:3, marginBottom:16,
                }}>
                  {hourly.map(h => (
                    <div key={h.hour} style={{
                      textAlign:"center", color:"#4a7fa5",
                      fontSize:8, fontWeight: h.hour % 6 === 0 ? 700 : 400,
                    }}>
                      {h.hour % 6 === 0 ? `${h.hour}h` : ""}
                    </div>
                  ))}
                </div>

                {/* Bar chart view of hourly pattern */}
                <ResponsiveContainer width="100%" height={180}>
                  <BarChart data={hourly} margin={{ top:0, right:24, left:16, bottom:36 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
                    <XAxis dataKey="label" stroke="#4a7fa5" fontSize={9}
                      interval={2}
                      label={{ value:"Hour of Day", position:"insideBottom", offset:-20,
                        fill:"#4a7fa5", fontSize:11 }} />
                    <YAxis stroke="#4a7fa5" fontSize={10}
                      label={{ value:"Avg Litres", angle:-90, position:"insideLeft", offset:12,
                        fill:"#4a7fa5", fontSize:11 }} />
                    <Tooltip
                      contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                      labelStyle={{ color:"#94a3b8", fontWeight:400, fontSize:11 }}
                      formatter={v => [`${v} L`, "Avg usage"]}
                    />
                    <Bar dataKey="avg_liters" name="Avg Litres" radius={[3,3,0,0]}>
                      {hourly.map((h,i) => {
                        const intensity = maxAvg > 0 ? h.avg_liters / maxAvg : 0;
                        const fill = intensity > 0.7 ? "#ff4d6d"
                                   : intensity > 0.4 ? "#ff9d00"
                                   : "#00d97e";
                        return <Cell key={i} fill={fill} opacity={0.3 + intensity * 0.7}/>;
                      })}
                    </Bar>
                    {peakHour && (
                      <ReferenceLine x={peakHour.label} stroke="#ff4d6d"
                        strokeDasharray="4 2"
                        label={{ value:"Peak", fill:"#ff4d6d", fontSize:10, position:"top" }} />
                    )}
                  </BarChart>
                </ResponsiveContainer>

                {/* Legend */}
                <div style={{ display:"flex", gap:16, marginTop:8, flexWrap:"wrap" }}>
                  {[
                    { color:"#1e2a45", label:"No usage" },
                    { color:"#00d97e", label:"Low" },
                    { color:"#ff9d00", label:"Medium" },
                    { color:"#ff4d6d", label:"High (peak)" },
                  ].map(({ color, label }) => (
                    <div key={label} style={{ display:"flex", alignItems:"center", gap:5 }}>
                      <div style={{ width:10, height:10, borderRadius:2, background:color }}/>
                      <span style={{ color:"#64748b", fontSize:11 }}>{label}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </ChartCard>

          {/* ── Pie + Table ── */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <ChartCard title={`Usage by Tap (${days}d)`} sub="Share of total consumption per tap">
              <ResponsiveContainer width="100%" height={280}>
                <PieChart margin={{ top:20, right:60, left:60, bottom:10 }}>
                  <Pie data={byTap} dataKey="total_usage" nameKey="tap_name"
                    cx="50%" cy="50%" innerRadius={50} outerRadius={85}
                    labelLine={{ stroke:"#4a7fa5", strokeWidth:1.5 }}
                    label={({ name, percent, x, y, midAngle }) => {
                      const anchor = (midAngle > 90 && midAngle < 270) ? "end" : "start";
                      const ox     = (midAngle > 90 && midAngle < 270) ? -6 : 6;
                      return (
                        <text x={x+ox} y={y} fill="#e2e8f0" fontSize={11} fontWeight={600}
                          textAnchor={anchor} dominantBaseline="central">
                          {name} {(percent*100).toFixed(1)}%
                        </text>
                      );
                    }}>
                    {byTap.map((_,i) => (
                      <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}
                        stroke="#0d1220" strokeWidth={2} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={tooltipStyle}
                  itemStyle={tooltipItemStyle}
                  labelStyle={tooltipLabelStyle}
                    labelStyle={{ color:"#94a3b8", fontSize:11 }}
                    formatter={v => [`${(+v).toFixed(2)} L`, "Usage"]}
                  />
                  <Legend iconType="circle" iconSize={10}
                    wrapperStyle={{ color:"#94a3b8", fontSize:12, paddingTop:8 }} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Tap Usage Table">
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
                  <thead>
                    <tr>
                      {["Tap","Location","Total (L)","Share %"].map(h => (
                        <th key={h} style={{ color:"#4a7fa5", textAlign:"left",
                          padding:"8px 10px", borderBottom:"1px solid #1e2a45",
                          fontSize:11, fontWeight:600, letterSpacing:0.6 }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {byTap.map((t,i) => {
                      const share = totalUsage > 0 ? ((t.total_usage/totalUsage)*100).toFixed(1) : 0;
                      return (
                        <tr key={i} style={{ background: i%2===0 ? "transparent" : "#0a0e1a0a" }}>
                          <td style={tdStyle}>{t.tap_name}</td>
                          <td style={{ ...tdStyle, color:"#64748b" }}>{t.location}</td>
                          <td style={{ ...tdStyle, color:PIE_COLORS[i%PIE_COLORS.length], fontWeight:700 }}>
                            {(t.total_usage||0).toFixed(2)}
                          </td>
                          <td style={tdStyle}>
                            <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                              <div style={{
                                width:`${Math.min(60, +share)}px`, height:6,
                                background:PIE_COLORS[i%PIE_COLORS.length],
                                borderRadius:3, opacity:0.7,
                              }}/>
                              {share}%
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </ChartCard>
          </div>
        </>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function FilterGroup({ label, value, onChange, options }) {
  return (
    <div>
      <div style={{ color:"#4a7fa5", fontSize:11, marginBottom:6,
        fontWeight:600, letterSpacing:0.8, textTransform:"uppercase" }}>{label}</div>
      <div style={{ display:"flex", gap:6 }}>
        {options.map(o => (
          <button key={o} onClick={() => onChange(o)} style={{
            padding:"6px 14px", borderRadius:8, fontSize:12, fontWeight:600,
            background: value===o ? "#00d4ff20" : "#0d1220",
            border: `1px solid ${value===o ? "#00d4ff" : "#1e2a45"}`,
            color: value===o ? "#00d4ff" : "#4a7fa5",
            cursor:"pointer",
          }}>{o}</button>
        ))}
      </div>
    </div>
  );
}

function MiniCard({ icon, label, value, sub, color }) {
  return (
    <div style={{ background:"#0d1220", border:`1px solid ${color}30`,
      borderRadius:16, padding:"18px 22px" }}>
      <div style={{ fontSize:22, marginBottom:6 }}>{icon}</div>
      <div style={{ color:"#4a7fa5", fontSize:11, textTransform:"uppercase",
        letterSpacing:0.8, fontWeight:600, marginBottom:4 }}>{label}</div>
      <div style={{ color, fontSize:22, fontWeight:800 }}>{value}</div>
      {sub && <div style={{ color:"#64748b", fontSize:11, marginTop:2 }}>{sub}</div>}
    </div>
  );
}

function ChartCard({ title, sub, children }) {
  return (
    <div style={{ background:"#0d1220", border:"1px solid #1e2a45",
      borderRadius:16, padding:"20px 24px", marginBottom:20 }}>
      <div style={{ marginBottom:16 }}>
        <div style={{ color:"#e2e8f0", fontSize:14, fontWeight:700 }}>{title}</div>
        {sub && <div style={{ color:"#4a7fa5", fontSize:11, marginTop:2 }}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}

const tdStyle = {
  padding:"10px 10px", color:"#e2e8f0",
  borderBottom:"1px solid #1e2a45",
};
