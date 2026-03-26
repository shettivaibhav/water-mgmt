import { useState, useEffect } from "react";
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { getTimeseries, getDailyUsage, getUsageByTap, getExportUrl } from "../api";
import { useAuth } from "../context/AuthContext";

const PIE_COLORS = ["#00d4ff","#0057ff","#00d97e","#ff9d00","#ff4d6d","#a855f7"];
const COLOR_MAP  = { green:"#00d97e", orange:"#ff9d00", red:"#ff4d6d" };

export default function Reports() {
  const { user }        = useAuth();
  const uid             = user?.user_id;
  const [days,  setDays]  = useState(30);
  const [hours, setHours] = useState(24);
  const [series,  setSeries]  = useState([]);
  const [daily,   setDaily]   = useState([]);
  const [byTap,   setByTap]   = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [s, d, bt] = await Promise.all([
        getTimeseries(uid, hours),
        getDailyUsage(uid, days),
        getUsageByTap(uid, days),
      ]);

      // Aggregate timeseries by hour
      const agg = {};
      s.data.forEach(r => {
        const k = r.bucket?.substring(0, 13) || "";
        agg[k] = +(((agg[k]||0) + r.usage_liters).toFixed(2));
      });
      setSeries(Object.entries(agg).map(([t,v]) => ({ time:t.substring(11)+"h", usage:v })));

      // daily-usage now returns { date, total_usage, color_status, is_live? }
      setDaily(d.data.map(r => ({
        date:   r.date || r.usage_date,
        usage:  +(r.total_usage || 0).toFixed(2),
        color:  r.color_status,
        isLive: r.is_live || false,
      })));
      setByTap(bt.data);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [uid, days, hours]);

  const exportCSV = () => {
    const url = getExportUrl(uid, days);
    const a   = document.createElement("a");
    a.href    = url;
    a.download = `water_usage_${days}d.csv`;
    a.click();
  };

  const totalUsage   = daily.reduce((a,r) => a+r.usage, 0).toFixed(1);
  const avgPerDay    = daily.length > 0 ? (totalUsage / daily.length).toFixed(1) : 0;
  const peakDay      = daily.reduce((a,r) => r.usage > (a?.usage||0) ? r : a, null);

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
          border:"none", borderRadius:10,
          color:"#fff", fontSize:13, fontWeight:700,
          cursor:"pointer", display:"flex", alignItems:"center", gap:6,
        }}>
          📥 Export CSV ({days}d)
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:16, marginBottom:24 }}>
        <FilterGroup label="Date Range (Days)" value={days} onChange={setDays}
          options={[7,14,30,60,90]} />
        <FilterGroup label="Timeseries (Hours)" value={hours} onChange={setHours}
          options={[6,12,24,48,72]} />
      </div>

      {/* KPI cards */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:16, marginBottom:24 }}>
        <MiniCard icon="💧" label={`Total (${days}d)`}  value={`${totalUsage} L`}  color="#00d4ff" />
        <MiniCard icon="📊" label="Avg / Day"            value={`${avgPerDay} L`}   color="#00d97e" />
        <MiniCard icon="📈" label="Peak Day"
          value={peakDay ? `${peakDay.usage} L` : "–"}
          sub={peakDay?.date || ""}
          color="#ff9d00" />
      </div>

      {loading ? (
        <div style={{ color:"#4a7fa5", textAlign:"center", padding:60 }}>Loading charts…</div>
      ) : (
        <>
          {/* Timeseries line chart */}
          <ChartCard title={`Hourly Usage (Last ${hours}h)`}>
            <ResponsiveContainer width="100%" height={220}>
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

          {/* Daily bar chart */}
          <ChartCard title={`Daily Totals (${days} days)`} sub="Today's bar shows live running data">
            <ResponsiveContainer width="100%" height={220}>
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
              <div style={{ display:"flex", alignItems:"center", gap:6,
                marginTop:8, color:"#00d4ff", fontSize:11 }}>
                <div style={{ width:10, height:10, borderRadius:2,
                  background:"#00d4ff", flexShrink:0 }}/>
                Today (live) — updates every 60s
              </div>
            )}
          </ChartCard>

          {/* Pie + table */}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
            <ChartCard title={`Usage by Tap (${days}d)`}>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie data={byTap} dataKey="total_usage" nameKey="tap_name"
                    cx="50%" cy="50%" outerRadius={80}
                    label={({ name, percent }) => `${name} ${(percent*100).toFixed(0)}%`}>
                    {byTap.map((_,i) => (
                      <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={tooltipStyle}
                    formatter={v=>[`${v.toFixed(2)} L`]} />
                </PieChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Table */}
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
                        <tr key={i}>
                          <td style={td}>{t.tap_name}</td>
                          <td style={{ ...td, color:"#4a7fa5" }}>{t.location}</td>
                          <td style={{ ...td, color:PIE_COLORS[i%PIE_COLORS.length], fontWeight:700 }}>
                            {(t.total_usage||0).toFixed(2)}
                          </td>
                          <td style={td}>{share}%</td>
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

function FilterGroup({ label, value, onChange, options }) {
  return (
    <div>
      <div style={{ color:"#4a7fa5", fontSize:11, marginBottom:4,
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
      <div style={{ color, fontSize:24, fontWeight:800 }}>{value}</div>
      {sub && <div style={{ color:"#4a7fa5", fontSize:11 }}>{sub}</div>}
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

const tooltipStyle = {
  background:"#0d1220", border:"1px solid #1e2a45",
  borderRadius:8, color:"#e2e8f0", fontSize:12,
};
const td = {
  padding:"8px 10px", color:"#e2e8f0",
  borderBottom:"1px solid #1e2a45",
};
