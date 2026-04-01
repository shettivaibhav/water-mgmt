import { useState, useEffect, useCallback } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { getDashboard, getTimeseries, getDailyUsage, getUsageByTap } from "../api";
import { useAuth } from "../context/AuthContext";
import WaterTank from "../components/WaterTank";

const COLOR_MAP = { green:"#00d97e", orange:"#ff9d00", red:"#ff4d6d" };
const PIE_COLORS = ["#00d4ff","#0057ff","#00d97e","#ff9d00","#ff4d6d","#a855f7"];

function StatCard({ icon, label, value, sub, accent }) {
  return (
    <div style={{
      background:"#0d1220", border:`1px solid ${accent}30`,
      borderRadius:16, padding:"20px 24px",
      boxShadow:`0 0 20px ${accent}10`,
    }}>
      <div style={{ fontSize:26, marginBottom:8 }}>{icon}</div>
      <div style={{ color:"#64748b", fontSize:12, fontWeight:600,
        letterSpacing:0.8, textTransform:"uppercase", marginBottom:4 }}>{label}</div>
      <div style={{ color:accent, fontSize:28, fontWeight:800 }}>{value}</div>
      {sub && <div style={{ color:"#64748b", fontSize:12, marginTop:4 }}>{sub}</div>}
    </div>
  );
}

function ProgressBar({ label, location, value, max, color }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom:12 }}>
      <div style={{ display:"flex", justifyContent:"space-between", marginBottom:4 }}>
        <span style={{ color:"#94a3b8", fontSize:13 }}>
          💧 {label} <span style={{ color:"#4a7fa5", fontSize:11 }}>({location})</span>
        </span>
        <span style={{ color:COLOR_MAP[color]||"#00d97e", fontSize:13, fontWeight:700 }}>
          {value.toFixed(1)} L
        </span>
      </div>
      <div style={{ height:6, background:"#1e2a45", borderRadius:3 }}>
        <div style={{
          height:"100%", width:`${pct}%`,
          background:`linear-gradient(90deg,${COLOR_MAP[color]||"#00d97e"}aa,${COLOR_MAP[color]||"#00d97e"})`,
          borderRadius:3, transition:"width 0.8s ease",
        }}/>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user }          = useAuth();
  const uid               = user?.user_id;
  const [dash,    setDash]    = useState(null);
  const [series,  setSeries]  = useState([]);
  const [daily,   setDaily]   = useState([]);
  const [byTap,   setByTap]   = useState([]);
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    // Fetch each endpoint independently — one failure won't kill the whole dashboard
    const safe = async (fn) => { try { return await fn(); } catch(e) { console.warn("API error:", e?.message); return null; } };

    const [d, s, dl, bt] = await Promise.all([
      safe(() => getDashboard(uid)),
      safe(() => getTimeseries(uid, 24)),
      safe(() => getDailyUsage(uid, 14)),
      safe(() => getUsageByTap(uid, 7)),
    ]);

    // Dashboard KPIs — only update if we got a valid response
    if (d?.data) setDash(d.data);

    // Timeseries — backend now returns { bucket_mins, data: [...] }
    if (s?.data) {
      const rows = Array.isArray(s.data) ? s.data : (s.data.data || []);
      setSeries(rows.map(r => ({ time: r.time_bucket, usage: r.total_liters })));
    }

    // Daily bar chart
    if (dl?.data) {
      setDaily(dl.data.map(r => ({
        date:   r.date || r.usage_date || "",
        usage:  +(r.total_usage || 0).toFixed(2),
        color:  r.color_status || "green",
        isLive: r.is_live || false,
      })));
    }

    // Pie chart
    if (bt?.data) setByTap(bt.data);

    setLoading(false);
  }, [uid]);

  useEffect(() => {
    loadAll();
    const id = setInterval(loadAll, 60000);
    return () => clearInterval(id);
  }, [loadAll]);

  if (loading) return (
    <div style={{ color:"#00d4ff", textAlign:"center", paddingTop:100 }}>
      <div style={{ fontSize:40 }}>💧</div>
      <p>Loading dashboard…</p>
    </div>
  );

  const d          = dash || {};
  const color      = d.color_status || "green";
  const pct        = d.orange_limit > 0 ? (d.today_total / d.orange_limit) * 100 : 0;
  const totalUsage = d.today_total || 0;

  return (
    <div style={{ color:"#e2e8f0", fontFamily:"'DM Sans',sans-serif" }}>
      {/* Header */}
      <div style={{ marginBottom:32 }}>
        <h1 style={{ fontSize:28, fontWeight:800, margin:0,
          background:"linear-gradient(90deg,#00d4ff,#0057ff)",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          Water Dashboard
        </h1>
        <p style={{ color:"#4a7fa5", marginTop:4, fontSize:14 }}>
          Real-time water usage analytics · auto-refreshes every 60s
        </p>
      </div>

      {/* KPI row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:16, marginBottom:24 }}>
        <StatCard icon="💧" label="Today's Usage"
          value={`${totalUsage.toFixed(1)} L`}
          sub={d.orange_limit ? `Limit: ${d.orange_limit} L` : "Set limits in System Setup"}
          accent={COLOR_MAP[color]} />
        <StatCard icon="📅" label="Yesterday"
          value={`${(d.yesterday_total||0).toFixed(1)} L`}
          accent="#4a7fa5" />
        <StatCard icon="📊" label="Change"
          value={`${d.change_pct >= 0 ? "+" : ""}${d.change_pct || 0}%`}
          sub="vs yesterday"
          accent={d.change_pct >= 0 ? "#ff9d00" : "#00d97e"} />
        <StatCard icon="🟢" label="Status"
          value={color.toUpperCase()}
          sub={d.green_limit && d.orange_limit
            ? `Green < ${d.green_limit}L | Orange < ${d.orange_limit}L`
            : "Configure limits in System Setup"}
          accent={COLOR_MAP[color]} />
      </div>

      {/* Tank + tap progress */}
      <div style={{ display:"grid", gridTemplateColumns:"240px 1fr", gap:16, marginBottom:24 }}>
        <div style={{
          background:"#0d1220", border:"1px solid #1e2a45",
          borderRadius:16, padding:"24px 16px", display:"flex",
          flexDirection:"column", alignItems:"center", justifyContent:"center", gap:4,
        }}>
          <WaterTank
            pct={pct}
            color={color}
            label="Daily Usage"
            total={totalUsage.toFixed(1)}
            limit={d.orange_limit || "–"}
          />
        </div>

        <div style={{
          background:"#0d1220", border:"1px solid #1e2a45",
          borderRadius:16, padding:"20px 24px",
        }}>
          <div style={{ color:"#94a3b8", fontSize:12, fontWeight:600,
            letterSpacing:0.8, textTransform:"uppercase", marginBottom:16 }}>
            Usage by Tap (Today)
          </div>
          {(d.tap_usage||[]).length === 0 && (
            <p style={{ color:"#4a7fa5", fontSize:13 }}>No taps configured yet.</p>
          )}
          {(d.tap_usage||[]).map(t => (
            <ProgressBar key={t.tap_id}
              label={t.tap_name} location={t.location}
              value={t.usage_today||0} max={d.orange_limit||200}
              color={color} />
          ))}
        </div>
      </div>

      {/* Charts row 1 */}
      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
        <ChartCard title="Usage Over Time (24h)" sub={
          series.length <= 1
            ? "⏳ Waiting for more simulator ticks — updates every 60s"
            : `${series.length} data points`
        }>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={series} margin={{ top:10, right:20, left:10, bottom:30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
              <XAxis dataKey="time" stroke="#4a7fa5" fontSize={10}
                interval="preserveStartEnd"
                label={{ value:"Time (HH:MM)", position:"insideBottom", offset:-16,
                  fill:"#4a7fa5", fontSize:11 }} />
              <YAxis stroke="#4a7fa5" fontSize={10}
                label={{ value:"Litres (L)", angle:-90, position:"insideLeft", offset:10,
                  fill:"#4a7fa5", fontSize:11 }} />
              <Tooltip contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
                formatter={v => [`${v} L`, "Usage"]} />
              <Line
                type="monotone" dataKey="usage" stroke="#00d4ff"
                strokeWidth={2}
                dot={{ r: 4, fill: "#00d4ff", strokeWidth: 0 }}
                activeDot={{ r: 6 }}
                name="Litres"
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily Totals (14 days)" sub="Today's bar shows live running data">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={daily} margin={{ top:10, right:20, left:10, bottom:30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
              <XAxis dataKey="date" stroke="#4a7fa5" fontSize={9}
                type="category"
                tickFormatter={d => typeof d === "string" ? d.substring(5) : d}
                label={{ value:"Date (MM-DD)", position:"insideBottom", offset:-16,
                  fill:"#4a7fa5", fontSize:11 }} />
              <YAxis stroke="#4a7fa5" fontSize={10}
                label={{ value:"Litres (L)", angle:-90, position:"insideLeft", offset:10,
                  fill:"#4a7fa5", fontSize:11 }} />
              <Tooltip contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
                formatter={(v, n, props) => [
                  `${v} L${props.payload?.isLive ? " (live)" : ""}`, "Usage"
                ]} />
              <Bar dataKey="usage" name="Litres" radius={[4,4,0,0]}>
                {daily.map((entry, i) => (
                  <Cell key={i}
                    fill={entry.isLive ? "#00d4ff" : (COLOR_MAP[entry.color] || "#00d4ff")}
                    opacity={entry.isLive ? 1 : 0.85}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {daily.some(r => r.isLive) && (
            <div style={{ display:"flex", alignItems:"center", gap:6,
              marginTop:8, color:"#00d4ff", fontSize:11 }}>
              <div style={{ width:10, height:10, borderRadius:2,
                background:"#00d4ff", flexShrink:0 }}/>
              Today (live) — updates every 60s
            </div>
          )}
        </ChartCard>
      </div>

      {/* Pie chart — increased height and labelLine to prevent overlap */}
      <ChartCard title="Usage Distribution by Tap (7 days)" sub="Includes today's live usage">
        {byTap.length === 0 || byTap.every(t => !t.total_usage || t.total_usage === 0) ? (
          <div style={{ textAlign:"center", padding:"40px 0", color:"#4a7fa5" }}>
            <div style={{ fontSize:32, marginBottom:10 }}>💧</div>
            <div style={{ fontSize:14, fontWeight:600 }}>No usage data yet</div>
            <div style={{ fontSize:12, marginTop:6 }}>
              Turn on taps and let the simulator run to see usage distribution
            </div>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <PieChart margin={{ top:20, right:80, left:80, bottom:20 }}>
              <Pie
                data={byTap} dataKey="total_usage" nameKey="tap_name"
                cx="50%" cy="50%"
                innerRadius={55} outerRadius={95}
                labelLine={{ stroke:"#4a7fa5", strokeWidth:1.5, strokeDasharray:"3 3" }}
                label={({ name, percent, x, y, midAngle }) => {
                  const lx = x + (midAngle > 90 && midAngle < 270 ? -8 : 8);
                  return (
                    <text x={lx} y={y} fill="#e2e8f0" fontSize={11} fontWeight={600}
                      textAnchor={midAngle > 90 && midAngle < 270 ? "end" : "start"}
                      dominantBaseline="central">
                      {name} {(percent*100).toFixed(1)}%
                    </text>
                  );
                }}
              >
                {byTap.map((_, i) => (
                  <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]}
                    stroke="#0d1220" strokeWidth={2} />
                ))}
              </Pie>
              <Tooltip contentStyle={tooltipStyle}
                itemStyle={tooltipItemStyle}
                labelStyle={tooltipLabelStyle}
                formatter={(v) => [`${(+v).toFixed(2)} L`, "Usage"]} />
              <Legend iconType="circle" iconSize={10}
                wrapperStyle={{ color:"#94a3b8", fontSize:12, paddingTop:8 }} />
            </PieChart>
          </ResponsiveContainer>
        )}
      </ChartCard>
    </div>
  );
}

function ChartCard({ title, sub, children }) {
  return (
    <div style={{
      background:"#0d1220", border:"1px solid #1e2a45",
      borderRadius:16, padding:"20px 24px",
    }}>
      <div style={{ marginBottom:16 }}>
        <div style={{ color:"#e2e8f0", fontSize:14, fontWeight:700 }}>{title}</div>
        <div style={{ color:"#4a7fa5", fontSize:11 }}>{sub}</div>
      </div>
      {children}
    </div>
  );
}

const tooltipStyle = {
  background:"#0a0e1a",
  border:"1px solid #2a3a55",
  borderRadius:8,
  color:"#f1f5f9",
  fontSize:12,
  fontWeight:600,
};
const tooltipItemStyle = { color:"#f1f5f9" };
const tooltipLabelStyle = { color:"#94a3b8", fontWeight:400, marginBottom:4 };
