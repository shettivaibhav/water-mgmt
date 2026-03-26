import { useState, useEffect } from "react";
import { getTaps, tapOn, tapOff } from "../api";
import { useAuth } from "../context/AuthContext";

const STATUS_COLOR = { ON:"#00d97e", OFF:"#4a7fa5" };

export default function TapControl() {
  const { user }          = useAuth();
  const uid               = user?.user_id;
  const [taps, setTaps]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState({});

  const load = async () => {
    try {
      const { data } = await getTaps(uid);
      setTaps(data);
    } catch(e) { console.error(e); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [uid]);

  const toggle = async (tap) => {
    setToggling(p => ({ ...p, [tap.tap_id]: true }));
    try {
      if (tap.tap_status === "ON") await tapOff(tap.tap_id);
      else                         await tapOn(tap.tap_id);
      await load();
    } catch(e) { console.error(e); }
    finally { setToggling(p => ({ ...p, [tap.tap_id]: false })); }
  };

  if (loading) return <LoadingScreen />;

  return (
    <div style={{ color:"#e2e8f0", fontFamily:"'DM Sans',sans-serif" }}>
      <PageHeader
        title="Tap Control"
        sub="Manually toggle individual taps. Simulator will add usage when ON."
      />

      {taps.length === 0 && (
        <EmptyState msg="No taps added yet. Go to Tap Management to add taps." />
      )}

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))", gap:20 }}>
        {taps.map(tap => (
          <TapCard key={tap.tap_id} tap={tap}
            onToggle={() => toggle(tap)}
            loading={toggling[tap.tap_id]} />
        ))}
      </div>

      <div style={{
        marginTop:32, background:"#0d1220", border:"1px solid #1e2a45",
        borderRadius:16, padding:20,
      }}>
        <div style={{ color:"#94a3b8", fontSize:12, fontWeight:600,
          letterSpacing:0.8, textTransform:"uppercase", marginBottom:12 }}>
          Quick Summary
        </div>
        <div style={{ display:"flex", gap:24 }}>
          <Stat label="Total Taps"  value={taps.length} />
          <Stat label="ON"  value={taps.filter(t=>t.tap_status==="ON").length}  color="#00d97e" />
          <Stat label="OFF" value={taps.filter(t=>t.tap_status==="OFF").length} color="#4a7fa5" />
          <Stat label="Running Usage"
            value={`${taps.reduce((a,t)=>a+(t.current_usage||0),0).toFixed(1)} L`}
            color="#00d4ff" />
        </div>
      </div>
    </div>
  );
}

function TapCard({ tap, onToggle, loading }) {
  const isOn    = tap.tap_status === "ON";
  const accent  = isOn ? "#00d97e" : "#4a7fa5";

  return (
    <div style={{
      background:"#0d1220", border:`1px solid ${accent}30`,
      borderRadius:16, padding:24,
      boxShadow: isOn ? `0 0 30px ${accent}15` : "none",
      transition:"all 0.3s",
    }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:16 }}>
        <div>
          <div style={{ fontSize:24, marginBottom:4 }}>
            {locationIcon(tap.location)}
          </div>
          <div style={{ color:"#e2e8f0", fontSize:16, fontWeight:700 }}>{tap.tap_name}</div>
          <div style={{ color:"#4a7fa5", fontSize:12 }}>{tap.location}</div>
        </div>
        <div style={{
          padding:"4px 12px", borderRadius:20,
          background:`${accent}20`, color:accent,
          fontSize:12, fontWeight:700,
        }}>
          {tap.tap_status}
        </div>
      </div>

      {/* Usage today */}
      <div style={{ marginBottom:16 }}>
        <div style={{ color:"#4a7fa5", fontSize:11, marginBottom:2 }}>USAGE TODAY</div>
        <div style={{ color:accent, fontSize:22, fontWeight:800 }}>
          {(tap.current_usage||0).toFixed(2)} L
        </div>
      </div>

      {/* Flow animation */}
      {isOn && (
        <div style={{ height:4, background:"#1e2a45", borderRadius:2, marginBottom:16, overflow:"hidden" }}>
          <div style={{
            height:"100%", width:"40%",
            background:`linear-gradient(90deg,transparent,${accent},transparent)`,
            animation:"flow 1.5s linear infinite",
          }}/>
        </div>
      )}

      <button onClick={onToggle} disabled={loading} style={{
        width:"100%", padding:"12px",
        background: isOn ? "#ff4d6d20" : "#00d97e20",
        border: `1px solid ${isOn?"#ff4d6d40":"#00d97e40"}`,
        borderRadius:10, color: isOn ? "#ff6b6b" : "#00d97e",
        cursor:"pointer", fontSize:14, fontWeight:700,
        transition:"all 0.2s",
      }}>
        {loading ? "…" : isOn ? "🔴 Turn OFF" : "🟢 Turn ON"}
      </button>
    </div>
  );
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div style={{ color:"#4a7fa5", fontSize:11 }}>{label}</div>
      <div style={{ color:color||"#e2e8f0", fontSize:20, fontWeight:800 }}>{value}</div>
    </div>
  );
}

function locationIcon(loc="") {
  const l = loc.toLowerCase();
  if (l.includes("bath")) return "🚿";
  if (l.includes("kitchen")) return "🍳";
  if (l.includes("toilet")) return "🚽";
  if (l.includes("garden")) return "🌱";
  return "💧";
}

function PageHeader({ title, sub }) {
  return (
    <div style={{ marginBottom:32 }}>
      <h1 style={{ fontSize:28, fontWeight:800, margin:0,
        background:"linear-gradient(90deg,#00d4ff,#0057ff)",
        WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>{title}</h1>
      <p style={{ color:"#4a7fa5", marginTop:4, fontSize:14 }}>{sub}</p>
    </div>
  );
}

function EmptyState({ msg }) {
  return (
    <div style={{ background:"#0d1220", border:"1px solid #1e2a45", borderRadius:16,
      padding:40, textAlign:"center", color:"#4a7fa5", marginBottom:24 }}>
      <div style={{ fontSize:40, marginBottom:12 }}>💧</div>
      <p>{msg}</p>
    </div>
  );
}

function LoadingScreen() {
  return (
    <div style={{ color:"#00d4ff", textAlign:"center", paddingTop:100 }}>
      <div style={{ fontSize:40 }}>💧</div>
      <p>Loading taps…</p>
    </div>
  );
}
