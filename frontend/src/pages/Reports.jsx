import { useState, useEffect, useRef } from "react";
import {
  BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, ReferenceLine,
} from "recharts";
import { getDailyUsage, getUsageByTap, getHourlyPattern, getExportUrl } from "../api";
import { useAuth } from "../context/AuthContext";
import { useTheme } from "../context/ThemeContext";
import { useResponsive } from "../hooks/useResponsive";
import PageHeader from "../components/PageHeader";

const PIE_COLORS = ["#00d4ff","#0057ff","#00d97e","#ff9d00","#ff4d6d","#a855f7"];

export default function Reports() {
  const { user }        = useAuth();
  const { t }           = useTheme();
  const { isMobile }    = useResponsive();
  const uid             = user?.user_id;

  const [days,    setDays]    = useState(30);
  const [daily,   setDaily]   = useState([]);
  const [byTap,   setByTap]   = useState([]);
  const [hourly,  setHourly]  = useState([]);
  const [loading, setLoading] = useState(true);
  const lockRef = useRef(false);

  const safe = async (fn) => { try { return await fn(); } catch { return null; } };

  const load = async () => {
    if (lockRef.current) return;
    lockRef.current = true;
    try {
      const [d, bt, hp] = await Promise.all([
        safe(() => getDailyUsage(uid, days)),
        safe(() => getUsageByTap(uid, days)),
        safe(() => getHourlyPattern(uid, days)),
      ]);
      if (d?.data) {
        const rows = Array.isArray(d.data) ? d.data : [];
        setDaily(rows.map(r => ({
          date:   (r.date||r.usage_date||"").substring(5),
          full:   r.date||r.usage_date||"",
          usage:  +(r.total_usage||0).toFixed(1),
          color:  r.color_status||"green",
          isLive: r.is_live||false,
        })));
      }
      if (bt?.data) setByTap(Array.isArray(bt.data)?bt.data:[]);
      if (hp?.data) setHourly(Array.isArray(hp.data)?hp.data:[]);
      setLoading(false);
    } finally { lockRef.current = false; }
  };

  useEffect(() => {
    load();
    // Reports update every 10 minutes
    const id = setInterval(load, 600000);
    return () => clearInterval(id);
  }, [uid, days]);

  const totalUsage = daily.reduce((a,r)=>a+r.usage, 0).toFixed(1);
  const avgPerDay  = daily.length>0 ? (totalUsage/daily.length).toFixed(1) : 0;
  const peakDay    = daily.reduce((a,r)=>r.usage>(a?.usage||0)?r:a, null);
  const peakHour   = hourly.reduce((a,r)=>r.avg_liters>(a?.avg_liters||0)?r:a, null);
  const maxAvg     = Math.max(...hourly.map(h=>h.avg_liters), 1);
  const colorMap   = { green:t.green, orange:t.orange, red:t.red };

  const tip  = { background:t.card2, border:`1px solid ${t.border}`,
    borderRadius:8, color:t.text, fontSize:13, fontWeight:600, padding:"8px 12px" };
  const tipI = { color:t.text };
  const tipL = { color:t.textMuted, fontWeight:400, marginBottom:3 };

  // Week-on-week comparison: group by week
  const weeklyData = (() => {
    const weeks = {};
    daily.forEach(d => {
      const weekKey = Math.floor(daily.indexOf(d) / 7);
      const label   = `W${weekKey+1}`;
      if (!weeks[label]) weeks[label] = { week:label, total:0, days:0 };
      weeks[label].total += d.usage;
      weeks[label].days  += 1;
    });
    return Object.values(weeks).map(w => ({
      week:    w.week,
      total:   +w.total.toFixed(1),
      avg:     +(w.total/w.days).toFixed(1),
    }));
  })();

  return (
    <div style={{ color:t.text, fontFamily:"'DM Sans',sans-serif" }}>
      <PageHeader subtitle="Historical water usage insights and exports" />

      {/* Header row */}
      <div style={{ display:"flex", justifyContent:"space-between",
        alignItems:"center", marginBottom:20, flexWrap:"wrap", gap:12 }}>
        <h2 style={{ fontSize:"clamp(18px,2.5vw,22px)", fontWeight:700,
          color:t.text, margin:0 }}>Reports & Analytics</h2>
        <button onClick={() => {
          const a = document.createElement("a");
          a.href = getExportUrl(uid, days);
          a.download = `aquatrack_${days}d.csv`;
          a.click();
        }} style={{ padding:"10px 18px",
          background:`linear-gradient(135deg,${t.green},#059669)`,
          border:"none", borderRadius:10, color:"#fff",
          fontSize:14, fontWeight:700, cursor:"pointer",
          display:"flex", alignItems:"center", gap:6 }}>
          📥 Export CSV ({days}d)
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:"flex", gap:16, marginBottom:20, flexWrap:"wrap" }}>
        <FilterGroup t={t} label="Date Range (Days)"
          value={days} onChange={v=>{setDays(v);setLoading(true);}}
          options={[7,14,30,60,90]} />
      </div>

      {/* KPI row */}
      <div style={{ display:"grid",
        gridTemplateColumns: isMobile?"1fr 1fr":"repeat(4,1fr)",
        gap:12, marginBottom:20 }}>
        {[
          {icon:"💧",label:`Total (${days}d)`, val:`${totalUsage} L`, c:t.cyan},
          {icon:"📊",label:"Avg / Day",       val:`${avgPerDay} L`,  c:t.green},
          {icon:"📈",label:"Peak Day",
            val: peakDay?`${peakDay.usage} L`:"–",
            sub: peakDay?.date||"", c:t.orange},
          {icon:"⏰",label:"Peak Hour",
            val: peakHour?peakHour.label:"–",
            sub: peakHour?`avg ${peakHour.avg_liters} L`:"",
            c:"#a855f7"},
        ].map(({icon,label,val,sub,c})=>(
          <div key={label} style={{ background:t.card, border:`1px solid ${c}25`,
            borderRadius:14, padding: isMobile?"14px":"18px" }}>
            <div style={{fontSize:22,marginBottom:6}}>{icon}</div>
            <div style={{color:t.textMuted,fontSize:12,fontWeight:600,
              textTransform:"uppercase",letterSpacing:0.7,marginBottom:4}}>{label}</div>
            <div style={{color:c,fontSize:isMobile?18:22,fontWeight:800}}>{val}</div>
            {sub&&<div style={{color:t.textSub,fontSize:12,marginTop:2}}>{sub}</div>}
          </div>
        ))}
      </div>

      {loading ? (
        <div style={{color:t.textMuted,textAlign:"center",padding:60}}>Loading charts…</div>
      ) : (<>

        {/* Daily bar chart */}
        <ChartCard t={t} title={`Daily Totals — Last ${days} Days`}
          sub="Green=safe · Orange=moderate · Red=critical">
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={daily} margin={{top:8,right:16,left:12,bottom:32}}>
              <CartesianGrid strokeDasharray="3 3" stroke={t.border}/>
              <XAxis dataKey="date" stroke={t.textMuted} fontSize={isMobile?9:10}
                type="category"
                interval={days>30?"preserveStartEnd":"preserveStart"}
                label={{value:"Date (MM-DD)",position:"insideBottom",offset:-20,
                  fill:t.textMuted,fontSize:12}}/>
              <YAxis stroke={t.textMuted} fontSize={12}
                label={{value:"Litres (L)",angle:-90,position:"insideLeft",offset:12,
                  fill:t.textMuted,fontSize:12}}/>
              <Tooltip contentStyle={tip} itemStyle={tipI} labelStyle={tipL}
                formatter={(v,n,p)=>[`${v} L${p.payload?.isLive?" (live)":""}`, "Usage"]}/>
              <Bar dataKey="usage" radius={[4,4,0,0]}>
                {daily.map((e,i)=>(
                  <Cell key={i}
                    fill={e.isLive?t.cyan:(colorMap[e.color]||t.cyan)}
                    opacity={e.isLive?1:0.82}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          {daily.some(r=>r.isLive) && (
            <div style={{display:"flex",alignItems:"center",gap:6,
              marginTop:8,color:t.cyan,fontSize:12}}>
              <div style={{width:10,height:10,borderRadius:2,background:t.cyan}}/>
              Today (live)
            </div>
          )}
        </ChartCard>

        {/* Week-on-week comparison */}
        {weeklyData.length > 1 && (
          <ChartCard t={t} title="Week-on-Week Comparison"
            sub="Total and average daily usage per week">
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyData} margin={{top:8,right:16,left:12,bottom:24}}>
                <CartesianGrid strokeDasharray="3 3" stroke={t.border}/>
                <XAxis dataKey="week" stroke={t.textMuted} fontSize={13}/>
                <YAxis stroke={t.textMuted} fontSize={12}
                  label={{value:"Litres",angle:-90,position:"insideLeft",offset:12,
                    fill:t.textMuted,fontSize:12}}/>
                <Tooltip contentStyle={tip} itemStyle={tipI} labelStyle={tipL}
                  formatter={v=>[`${v} L`]}/>
                <Legend wrapperStyle={{color:t.textMuted,fontSize:12}}/>
                <Bar dataKey="total" name="Total (L)" fill={t.cyan} radius={[4,4,0,0]} opacity={0.85}/>
                <Bar dataKey="avg" name="Avg/Day (L)" fill={t.blue} radius={[4,4,0,0]} opacity={0.85}/>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        )}

        {/* Hourly heatmap */}
        <ChartCard t={t}
          title={`Hourly Usage Pattern — Last ${days} Days`}
          sub="Average litres per hour of day · shows your peak times">
          {hourly.every(h=>h.avg_liters===0) ? (
            <div style={{color:t.textMuted,textAlign:"center",padding:32}}>
              No hourly data yet.
            </div>
          ) : (
            <>
              {/* Colour grid */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(24,1fr)",
                gap:3,marginBottom:6}}>
                {hourly.map(h=>{
                  const i = maxAvg>0?h.avg_liters/maxAvg:0;
                  const bg = i>0.7?t.red:i>0.4?t.orange:i>0.1?t.green:t.border;
                  return <div key={h.hour} title={`${h.label} — avg ${h.avg_liters} L`}
                    style={{height:40,background:bg,borderRadius:4,
                      opacity:0.2+i*0.8,cursor:"pointer"}}/>;
                })}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(24,1fr)",gap:3,marginBottom:12}}>
                {hourly.map(h=>(
                  <div key={h.hour} style={{textAlign:"center",color:t.textMuted,fontSize:8,
                    fontWeight:h.hour%6===0?700:400}}>
                    {h.hour%6===0?`${h.hour}h`:""}
                  </div>
                ))}
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={hourly} margin={{top:0,right:16,left:12,bottom:28}}>
                  <CartesianGrid strokeDasharray="3 3" stroke={t.border}/>
                  <XAxis dataKey="label" stroke={t.textMuted} fontSize={10}
                    interval={2}
                    label={{value:"Hour of Day",position:"insideBottom",offset:-18,
                      fill:t.textMuted,fontSize:12}}/>
                  <YAxis stroke={t.textMuted} fontSize={12}
                    label={{value:"Avg L",angle:-90,position:"insideLeft",offset:10,
                      fill:t.textMuted,fontSize:12}}/>
                  <Tooltip contentStyle={tip} itemStyle={tipI} labelStyle={tipL}
                    formatter={v=>[`${v} L`,"Avg"]}/>
                  <Bar dataKey="avg_liters" radius={[3,3,0,0]}>
                    {hourly.map((h,i)=>{
                      const ii=maxAvg>0?h.avg_liters/maxAvg:0;
                      return <Cell key={i}
                        fill={ii>0.7?t.red:ii>0.4?t.orange:t.green}
                        opacity={0.3+ii*0.7}/>;
                    })}
                  </Bar>
                  {peakHour && (
                    <ReferenceLine x={peakHour.label} stroke={t.red} strokeDasharray="4 2"
                      label={{value:"Peak",fill:t.red,fontSize:11,position:"top"}}/>
                  )}
                </BarChart>
              </ResponsiveContainer>
              <div style={{display:"flex",gap:14,marginTop:8,flexWrap:"wrap"}}>
                {[{c:t.border,l:"No usage"},{c:t.green,l:"Low"},
                  {c:t.orange,l:"Medium"},{c:t.red,l:"High (peak)"}].map(({c,l})=>(
                  <div key={l} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:10,height:10,borderRadius:2,background:c}}/>
                    <span style={{color:t.textSub,fontSize:12}}>{l}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </ChartCard>

        {/* Pie + Table */}
        <div style={{display:"grid",
          gridTemplateColumns:isMobile?"1fr":"1fr 1fr",gap:14}}>
          <ChartCard t={t} title={`Usage by Tap — Last ${days}d`}
            sub="Includes today's live running totals">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart margin={{top:16,right:50,left:50,bottom:8}}>
                <Pie data={byTap} dataKey="total_usage" nameKey="tap_name"
                  cx="50%" cy="50%" innerRadius={45} outerRadius={80}
                  labelLine={{stroke:t.textMuted,strokeWidth:1.2}}
                  label={({name,percent,x,y,midAngle})=>{
                    const anchor=(midAngle>90&&midAngle<270)?"end":"start";
                    const ox=(midAngle>90&&midAngle<270)?-5:5;
                    return(
                      <text x={x+ox} y={y} fill={t.text} fontSize={11} fontWeight={600}
                        textAnchor={anchor} dominantBaseline="central">
                        {name} {(percent*100).toFixed(0)}%
                      </text>
                    );
                  }}>
                  {byTap.map((_,i)=>(
                    <Cell key={i} fill={PIE_COLORS[i%PIE_COLORS.length]}
                      stroke={t.card} strokeWidth={2}/>
                  ))}
                </Pie>
                <Tooltip contentStyle={tip} itemStyle={tipI} labelStyle={tipL}
                  formatter={v=>[`${(+v).toFixed(2)} L`,"Usage"]}/>
                <Legend iconType="circle" iconSize={10}
                  wrapperStyle={{color:t.textMuted,fontSize:12}}/>
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard t={t} title="Tap Usage Table">
            <div style={{overflowX:"auto"}}>
              <table style={{width:"100%",borderCollapse:"collapse",fontSize:14}}>
                <thead>
                  <tr>
                    {["Tap","Location","Total (L)","Share %"].map(h=>(
                      <th key={h} style={{color:t.textMuted,textAlign:"left",
                        padding:"8px 10px",borderBottom:`1px solid ${t.border}`,
                        fontSize:12,fontWeight:600,letterSpacing:0.6}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {byTap.map((tap,i)=>{
                    const share=totalUsage>0
                      ?((tap.total_usage/totalUsage)*100).toFixed(1):0;
                    return(
                      <tr key={i}>
                        <td style={{padding:"9px 10px",color:t.text,fontWeight:600,
                          borderBottom:`1px solid ${t.border}`}}>{tap.tap_name}</td>
                        <td style={{padding:"9px 10px",color:t.textMuted,
                          borderBottom:`1px solid ${t.border}`}}>{tap.location}</td>
                        <td style={{padding:"9px 10px",fontWeight:700,
                          color:PIE_COLORS[i%PIE_COLORS.length],
                          borderBottom:`1px solid ${t.border}`}}>
                          {(tap.total_usage||0).toFixed(2)}
                        </td>
                        <td style={{padding:"9px 10px",color:t.text,
                          borderBottom:`1px solid ${t.border}`}}>
                          <div style={{display:"flex",alignItems:"center",gap:7}}>
                            <div style={{width:`${Math.min(50,+share)}px`,height:6,
                              background:PIE_COLORS[i%PIE_COLORS.length],
                              borderRadius:3,opacity:0.75}}/>
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

      </>)}
    </div>
  );
}

function FilterGroup({ t, label, value, onChange, options }) {
  return (
    <div>
      <div style={{color:t.textMuted,fontSize:12,marginBottom:6,
        fontWeight:600,letterSpacing:0.8,textTransform:"uppercase"}}>{label}</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        {options.map(o=>(
          <button key={o} onClick={()=>onChange(o)} style={{
            padding:"7px 16px",borderRadius:8,fontSize:13,fontWeight:600,
            background:value===o?`${t.cyan}20`:t.card,
            border:`1px solid ${value===o?t.cyan:t.border}`,
            color:value===o?t.cyan:t.textMuted,
            cursor:"pointer",
          }}>{o}</button>
        ))}
      </div>
    </div>
  );
}

function ChartCard({ t, title, sub, children }) {
  return (
    <div style={{background:t.card,border:`1px solid ${t.border}`,
      borderRadius:14,padding:"18px 20px",marginBottom:16}}>
      <div style={{marginBottom:14}}>
        <div style={{color:t.text,fontSize:15,fontWeight:700}}>{title}</div>
        {sub&&<div style={{color:t.textMuted,fontSize:12,marginTop:2}}>{sub}</div>}
      </div>
      {children}
    </div>
  );
}
