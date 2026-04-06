import { useState, useEffect, useCallback, useRef } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from "recharts";
import { getDashboard, getTimeseries, getDailyUsage, getUsageByTap,
         tapOn, tapOff, getTaps } from "../api";
import axios from "axios";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useResponsive } from "../hooks/useResponsive";
import WaterTank from "../components/WaterTank";
import PageHeader from "../components/PageHeader";

const PIE_COLORS = ["#00d4ff","#0057ff","#00d97e","#ff9d00","#ff4d6d","#a855f7"];
const BASE = "http://localhost:5000";

// get today-hourly from backend
async function fetchTodayHourly(uid) {
  const token = localStorage.getItem("token") || "";
  const r = await axios.get(`${BASE}/today-hourly/${uid}`,
    { headers: { Authorization:`Bearer ${token}` } });
  return r.data;
}

// get today tap breakdown from tap_usage_running
async function fetchTodayTaps(uid) {
  const token = localStorage.getItem("token") || "";
  const r = await axios.get(`${BASE}/taps/${uid}`,
    { headers: { Authorization:`Bearer ${token}` } });
  return r.data;
}

export default function Dashboard() {
  const { user }           = useAuth();
  const { t }              = useTheme();
  const { isMobile, isTablet } = useResponsive();
  const uid                = user?.user_id;

  // ── State ─────────────────────────────────────────────────
  const [dash,     setDash]     = useState(null);
  const [taps,     setTaps]     = useState([]);
  const [todayHr,  setTodayHr]  = useState([]);  // 24 hourly buckets for today
  const [byTap,    setByTap]    = useState([]);   // today usage by tap
  const [daily,    setDaily]    = useState([]);   // 14-day bar
  const [toggling, setToggling] = useState({});
  const [loading,  setLoading]  = useState(true);
  const [throttled,setThrottled]= useState(false);
  const [hrWindow, setHrWindow] = useState(0);   // 0=0-4h, 1=4-8h, ...

  // ── Locks ─────────────────────────────────────────────────
  const fastLock  = useRef(false);
  const slowLock  = useRef(false);

  const safe = async (fn) => { try { return await fn(); } catch { return null; } };

  // ── FAST (2s): dashboard KPIs + taps list ─────────────────
  const loadFast = useCallback(async () => {
    if (fastLock.current) return;
    fastLock.current = true;
    try {
      const [d, tp] = await Promise.all([
        safe(() => getDashboard(uid)),
        safe(() => getTaps(uid)),
      ]);
      if (d?.data) {
        setDash(d.data);
        const tot  = d.data.today_total || 0;
        const glim = d.data.green_limit || 9999;
        setThrottled(tot >= glim && glim < 9999);
      }
      if (tp?.data) setTaps(Array.isArray(tp.data) ? tp.data : []);
      setLoading(false);
    } finally { fastLock.current = false; }
  }, [uid]);

  // ── MEDIUM (10s): hourly chart for today + today tap pie ──
  const loadMedium = useCallback(async () => {
    if (slowLock.current) return;
    slowLock.current = true;
    try {
      const [hr, bt] = await Promise.all([
        safe(() => fetchTodayHourly(uid)),
        safe(() => getDailyUsage(uid, 14)),
      ]);
      if (hr) setTodayHr(Array.isArray(hr) ? hr : []);
      if (bt?.data) {
        const rows = Array.isArray(bt.data) ? bt.data : [];
        setDaily(rows.map(r => ({
          date:   (r.date||r.usage_date||"").substring(5),
          usage:  +(r.total_usage||0).toFixed(1),
          color:  r.color_status||"green",
          isLive: r.is_live||false,
        })));
      }
      // Today's pie — from taps running usage
      const tp2 = await safe(() => getTaps(uid));
      if (tp2?.data) {
        const rows2 = Array.isArray(tp2.data) ? tp2.data : [];
        setByTap(rows2
          .filter(t => (t.current_usage||0) > 0)
          .map(t => ({ tap_name:t.tap_name, total_usage:+(t.current_usage||0) })));
      }
    } finally { slowLock.current = false; }
  }, [uid]);

  useEffect(() => {
    loadFast();
    loadMedium();
    const fastId   = setInterval(loadFast,    2000);
    const mediumId = setInterval(loadMedium, 10000);
    return () => { clearInterval(fastId); clearInterval(mediumId); };
  }, [loadFast, loadMedium]);

  const toggleTap = async (tap) => {
    setToggling(p => ({ ...p, [tap.tap_id]:true }));
    try {
      tap.tap_status==="ON" ? await tapOff(tap.tap_id) : await tapOn(tap.tap_id);
      await loadFast();
    } finally { setToggling(p => ({ ...p, [tap.tap_id]:false })); }
  };

  if (loading) return (
    <div style={{ textAlign:"center", paddingTop:80, color:t.cyan }}>
      <div style={{ fontSize:44 }}>💧</div>
      <p style={{ fontSize:16, marginTop:12 }}>Loading dashboard…</p>
    </div>
  );

  const d        = dash || {};
  const cMap     = { green:t.green, orange:t.orange, red:t.red };
  const color    = d.color_status || "green";
  const accent   = cMap[color] || t.green;
  const pct      = d.orange_limit > 0 ? (d.today_total/d.orange_limit)*100 : 0;
  const total    = d.today_total || 0;

  // Hourly chart window: show 4h at a time
  const windowStart = hrWindow * 4;
  const windowEnd   = Math.min(24, windowStart + 4);
  const hrSlice     = todayHr.slice(windowStart, windowEnd);
  const maxWindows  = 6; // 0-4, 4-8, ..., 20-24

  const tip  = { background:t.card2, border:`1px solid ${t.border}`,
    borderRadius:8, color:t.text, fontSize:13, fontWeight:600 };
  const tipI = { color:t.text };
  const tipL = { color:t.textMuted, fontWeight:400 };

  // Grid helpers
  const cols2 = isMobile ? "1fr" : "1fr 1fr";

  return (
    <div style={{ color:t.text, fontFamily:"'DM Sans',sans-serif" }}>
      <PageHeader subtitle="Live · KPIs every 2s · charts every 10s" />

      {/* AI Banner */}
      {throttled && (
        <div style={{ background:`${t.orange}18`, border:`1px solid ${t.orange}50`,
          borderRadius:12, padding:"12px 16px", marginBottom:18,
          display:"flex", alignItems:"center", gap:12 }}>
          <span style={{ fontSize:22 }}>🤖</span>
          <div>
            <div style={{ color:t.orange, fontSize:15, fontWeight:700 }}>
              AI Water Manager: Green limit exceeded
            </div>
            <div style={{ color:t.textMuted, fontSize:13 }}>
              Flow reduced to 30% · {total.toFixed(1)} L used / {d.green_limit} L limit
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div style={{ display:"grid",
        gridTemplateColumns: isMobile?"1fr 1fr":"repeat(4,1fr)",
        gap:12, marginBottom:18 }}>
        {[
          { icon:"💧", label:"Today",     val:`${total.toFixed(1)} L`,
            sub:`Limit: ${d.orange_limit||"–"} L`, a:accent },
          { icon:"📅", label:"Yesterday", val:`${(d.yesterday_total||0).toFixed(1)} L`,
            a:t.textMuted },
          { icon:"📊", label:"Change",    val:`${d.change_pct>=0?"+":""}${d.change_pct||0}%`,
            sub:"vs yesterday",
            a: d.change_pct>0?t.orange:d.change_pct<0?t.green:t.textMuted },
          { icon:"🟢", label:"Status",    val:color.toUpperCase(), a:accent },
        ].map(({ icon, label, val, sub, a }) => (
          <div key={label} style={{ background:t.card, border:`1px solid ${a}25`,
            borderRadius:14, padding: isMobile?"14px":"18px" }}>
            <div style={{ fontSize: isMobile?22:26, marginBottom:6 }}>{icon}</div>
            <div style={{ color:t.textMuted, fontSize:12, fontWeight:600,
              letterSpacing:0.7, textTransform:"uppercase", marginBottom:4 }}>{label}</div>
            <div style={{ color:a, fontSize: isMobile?20:24, fontWeight:800 }}>{val}</div>
            {sub && <div style={{ color:t.textSub, fontSize:12, marginTop:3 }}>{sub}</div>}
          </div>
        ))}
      </div>

      {/* Tank + Tap controls */}
      <div style={{ display:"grid",
        gridTemplateColumns: isMobile?"1fr":"180px 1fr",
        gap:12, marginBottom:18 }}>

        {/* Water tank */}
        <div style={{ background:t.card, border:`1px solid ${t.border}`,
          borderRadius:14, padding:"16px 10px",
          display:"flex", flexDirection:"column",
          alignItems:"center", justifyContent:"center" }}>
          <WaterTank pct={pct} color={color}
            total={total.toFixed(1)} limit={d.orange_limit||"–"}
            throttled={throttled} />
        </div>

        {/* Taps */}
        <div style={{ background:t.card, border:`1px solid ${t.border}`,
          borderRadius:14, padding:"16px 20px" }}>
          <div style={{ color:t.textMuted, fontSize:13, fontWeight:600,
            letterSpacing:0.7, textTransform:"uppercase", marginBottom:14 }}>
            Tap Control & Today's Usage
          </div>
          {taps.length === 0 && (
            <p style={{ color:t.textMuted, fontSize:15 }}>
              No taps yet — go to Manage & Config to add taps.
            </p>
          )}
          {taps.map(tap => {
            const isOn  = tap.tap_status === "ON";
            const usage = tap.current_usage || 0;
            const pBar  = d.orange_limit>0 ? Math.min(100,(usage/d.orange_limit)*100) : 0;
            return (
              <div key={tap.tap_id} style={{ marginBottom:14 }}>
                <div style={{ display:"flex", alignItems:"center",
                  justifyContent:"space-between", marginBottom:5, flexWrap:"wrap", gap:6 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                    <span style={{ fontSize:18 }}>{locIcon(tap.location)}</span>
                    <span style={{ color:t.text, fontSize:15, fontWeight:600 }}>
                      {tap.tap_name}
                    </span>
                    <span style={{ color:t.textMuted, fontSize:13 }}>
                      ({tap.location})
                    </span>
                    <span style={{ padding:"2px 8px", borderRadius:20,
                      fontSize:12, fontWeight:700,
                      background:isOn?`${t.green}20`:`${t.textMuted}15`,
                      color:isOn?t.green:t.textMuted }}>{tap.tap_status}</span>
                    {isOn&&throttled&&<span style={{fontSize:12,color:t.orange}}>⚡slow</span>}
                  </div>
                  <div style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <span style={{ color:accent, fontSize:15, fontWeight:700 }}>
                      {usage.toFixed(1)} L
                    </span>
                    <button onClick={()=>toggleTap(tap)}
                      disabled={toggling[tap.tap_id]}
                      style={{ padding:"6px 14px", borderRadius:8,
                        fontSize:13, fontWeight:700, cursor:"pointer", border:"none",
                        background:isOn?`${t.red}20`:`${t.green}20`,
                        color:isOn?t.red:t.green }}>
                      {toggling[tap.tap_id]?"…":isOn?"Turn OFF":"Turn ON"}
                    </button>
                  </div>
                </div>
                <div style={{ height:6, background:t.border, borderRadius:3 }}>
                  <div style={{ height:"100%", width:`${pBar}%`,
                    background:`linear-gradient(90deg,${accent}80,${accent})`,
                    borderRadius:3, transition:"width 0.5s ease" }}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display:"grid", gridTemplateColumns:cols2,
        gap:12, marginBottom:12 }}>

        {/* Today hourly line chart with window navigation */}
        <div style={{ background:t.card, border:`1px solid ${t.border}`,
          borderRadius:14, padding:"16px 18px" }}>
          <div style={{ display:"flex", justifyContent:"space-between",
            alignItems:"center", marginBottom:8 }}>
            <div>
              <div style={{ color:t.text, fontSize:15, fontWeight:700 }}>
                Usage Today — Hourly
              </div>
              <div style={{ color:t.textMuted, fontSize:12, marginTop:2 }}>
                {String(windowStart).padStart(2,"0")}:00 –{" "}
                {String(windowEnd).padStart(2,"0")}:00
              </div>
            </div>
            <div style={{ display:"flex", gap:6 }}>
              <NavBtn t={t} disabled={hrWindow===0}
                onClick={()=>setHrWindow(w=>Math.max(0,w-1))}>‹</NavBtn>
              <NavBtn t={t} disabled={hrWindow>=maxWindows-1}
                onClick={()=>setHrWindow(w=>Math.min(maxWindows-1,w+1))}>›</NavBtn>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <LineChart data={hrSlice} margin={{top:4,right:10,left:8,bottom:24}}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border}/>
              <XAxis dataKey="label" stroke={t.textMuted} fontSize={12}
                label={{value:"Hour",position:"insideBottom",offset:-16,
                  fill:t.textMuted,fontSize:12}}/>
              <YAxis stroke={t.textMuted} fontSize={12}
                label={{value:"L",angle:-90,position:"insideLeft",offset:8,
                  fill:t.textMuted,fontSize:12}}/>
              <Tooltip contentStyle={tip} itemStyle={tipI} labelStyle={tipL}
                formatter={v=>[`${v} L`,"Usage"]}/>
              <Line type="monotone" dataKey="liters" stroke={t.cyan}
                strokeWidth={2} dot={{r:5,fill:t.cyan,strokeWidth:0}}
                activeDot={{r:7}} connectNulls/>
            </LineChart>
          </ResponsiveContainer>
          {/* Window dots */}
          <div style={{ display:"flex", justifyContent:"center", gap:5, marginTop:8 }}>
            {Array.from({length:maxWindows}).map((_,i)=>(
              <button key={i} onClick={()=>setHrWindow(i)}
                style={{ width:8, height:8, borderRadius:"50%", border:"none",
                  cursor:"pointer", padding:0,
                  background: i===hrWindow ? t.cyan : t.border,
                  transition:"background 0.2s" }}/>
            ))}
          </div>
        </div>

        {/* Today bar chart — today's usage overview */}
        <div style={{ background:t.card, border:`1px solid ${t.border}`,
          borderRadius:14, padding:"16px 18px" }}>
          <div style={{ color:t.text, fontSize:15, fontWeight:700, marginBottom:4 }}>
            Daily Totals (14 days)
          </div>
          <div style={{ color:t.textMuted, fontSize:12, marginBottom:10 }}>
            Cyan = today live
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={daily} margin={{top:4,right:10,left:8,bottom:24}}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border}/>
              <XAxis dataKey="date" stroke={t.textMuted} fontSize={10}
                type="category"
                label={{value:"Date",position:"insideBottom",offset:-16,
                  fill:t.textMuted,fontSize:12}}/>
              <YAxis stroke={t.textMuted} fontSize={12}
                label={{value:"L",angle:-90,position:"insideLeft",offset:8,
                  fill:t.textMuted,fontSize:12}}/>
              <Tooltip contentStyle={tip} itemStyle={tipI} labelStyle={tipL}
                formatter={(v,n,p)=>[`${v} L${p.payload?.isLive?" (live)":""}`, "Usage"]}/>
              <Bar dataKey="usage" radius={[4,4,0,0]}>
                {daily.map((e,i)=>(
                  <Cell key={i}
                    fill={e.isLive?t.cyan:(cMap[e.color]||t.cyan)}
                    opacity={e.isLive?1:0.82}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Today pie: usage by tap */}
      <div style={{ background:t.card, border:`1px solid ${t.border}`,
        borderRadius:14, padding:"16px 18px" }}>
        <div style={{ color:t.text, fontSize:15, fontWeight:700, marginBottom:4 }}>
          Today's Usage by Tap
        </div>
        <div style={{ color:t.textMuted, fontSize:12, marginBottom:10 }}>
          Live running totals per tap
        </div>
        {byTap.length === 0 ? (
          <div style={{ textAlign:"center", padding:"28px 0", color:t.textMuted }}>
            <div style={{ fontSize:28, marginBottom:8 }}>💧</div>
            <div style={{ fontSize:15, color:t.text }}>No usage yet today</div>
            <div style={{ fontSize:13, marginTop:4 }}>Turn taps ON to start tracking</div>
          </div>
        ) : (
          <div style={{ display:"grid",
            gridTemplateColumns: isMobile?"1fr":"1fr 1fr",
            gap:16, alignItems:"center" }}>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={byTap} dataKey="total_usage" nameKey="tap_name"
                  cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                  labelLine={false} label={false}>
                  {byTap.map((_,i)=>(
                    <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}
                      stroke={t.card} strokeWidth={2}/>
                  ))}
                </Pie>
                <Tooltip contentStyle={tip} itemStyle={tipI} labelStyle={tipL}
                  formatter={v=>[`${(+v).toFixed(2)} L`,"Usage"]}/>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
              {byTap.map((tap,i) => {
                const total2 = byTap.reduce((a,x)=>a+(+x.total_usage||0),0);
                const pct2   = total2>0 ? ((tap.total_usage/total2)*100).toFixed(1) : 0;
                return (
                  <div key={i} style={{ display:"flex", alignItems:"center", gap:10 }}>
                    <div style={{ width:13, height:13, borderRadius:3, flexShrink:0,
                      background:PIE_COLORS[i%PIE_COLORS.length] }}/>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ color:t.text, fontSize:14, fontWeight:600,
                        overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>
                        {tap.tap_name}
                      </div>
                    </div>
                    <div style={{ textAlign:"right", flexShrink:0 }}>
                      <div style={{ color:PIE_COLORS[i%PIE_COLORS.length],
                        fontSize:14, fontWeight:700 }}>
                        {(+tap.total_usage).toFixed(1)} L
                      </div>
                      <div style={{ color:t.textSub, fontSize:12 }}>{pct2}%</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function NavBtn({ t, onClick, disabled, children }) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      width:32, height:32, borderRadius:8,
      background: disabled ? t.border : `${t.cyan}20`,
      border:`1px solid ${disabled?t.border:t.cyan}`,
      color: disabled ? t.textSub : t.cyan,
      cursor: disabled?"not-allowed":"pointer",
      fontSize:16, fontWeight:700,
      display:"flex", alignItems:"center", justifyContent:"center",
    }}>{children}</button>
  );
}

function locIcon(loc="") {
  const l = loc.toLowerCase();
  if (l.includes("bath"))    return "🚿";
  if (l.includes("kitchen")) return "🍳";
  if (l.includes("toilet"))  return "🚽";
  if (l.includes("garden"))  return "🌱";
  return "💧";
}
