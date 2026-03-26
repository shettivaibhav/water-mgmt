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
    try {
      const [d, s, dl, bt] = await Promise.all([
        getDashboard(uid),
        getTimeseries(uid, 24),
        getDailyUsage(uid, 14),
        getUsageByTap(uid, 7),
      ]);
      setDash(d.data);

      // Process timeseries → aggregate by minute bucket
      const agg = {};
      s.data.forEach(r => {
        const k = r.bucket?.substring(11,16) || "00:00";
        agg[k] = (agg[k]||0) + r.usage_liters;
      });
      setSeries(Object.entries(agg).map(([t,v]) => ({ time:t, usage:+v.toFixed(2) })));

      // daily-usage now returns { date, total_usage, color_status, is_live? }
      setDaily(dl.data.map(r => ({
        date:    r.date || r.usage_date,          // handle both field names
        usage:   +(r.total_usage || 0).toFixed(2),
        color:   r.color_status,
        isLive:  r.is_live || false,
      })));

      setByTap(bt.data);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
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
          sub={`Limit: ${d.orange_limit} L`}
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
          sub={`Green < ${d.green_limit}L | Orange < ${d.orange_limit}L`}
          accent={COLOR_MAP[color]} />
      </div>

      {/* Tank + tap progress */}
      <div style={{ display:"grid", gridTemplateColumns:"180px 1fr", gap:16, marginBottom:24 }}>
        <div style={{
          background:"#0d1220", border:"1px solid #1e2a45",
          borderRadius:16, padding:24, display:"flex",
          flexDirection:"column", alignItems:"center", justifyContent:"center", gap:8,
        }}>
          <WaterTank pct={pct} color={color} label="Daily Usage" />
          <div style={{ color:COLOR_MAP[color], fontSize:12, fontWeight:700 }}>
            {totalUsage.toFixed(1)} / {d.orange_limit} L
          </div>
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
        <ChartCard title="Usage Over Time (24h)" sub="Litres per minute bucket">
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
              <XAxis dataKey="time" stroke="#4a7fa5" fontSize={10} />
              <YAxis stroke="#4a7fa5" fontSize={10} />
              <Tooltip contentStyle={tooltipStyle} />
              <Line type="monotone" dataKey="usage" stroke="#00d4ff"
                strokeWidth={2} dot={false} name="Litres" />
            </LineChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Daily Totals (14 days)" sub="Today's bar shows live running data">
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={daily}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e2a45" />
              <XAxis dataKey="date" stroke="#4a7fa5" fontSize={9}
                tickFormatter={d => d?.substring(5)} />
              <YAxis stroke="#4a7fa5" fontSize={10} />
              <Tooltip contentStyle={tooltipStyle}
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

      {/* Pie chart */}
      <ChartCard title="Usage Distribution by Tap (7 days)" sub="Includes today's live usage">
        <ResponsiveContainer width="100%" height={220}>
          <PieChart>
            <Pie data={byTap} dataKey="total_usage" nameKey="tap_name"
              cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) =>
                `${name} ${(percent*100).toFixed(1)}%`
              }>
              {byTap.map((_, i) => (
                <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
              ))}
            </Pie>
            <Tooltip contentStyle={tooltipStyle}
              formatter={(v) => [`${v.toFixed(2)} L`]} />
            <Legend />
          </PieChart>
        </ResponsiveContainer>
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
  background:"#0d1220", border:"1px solid #1e2a45",
  borderRadius:8, color:"#e2e8f0", fontSize:12,
};
