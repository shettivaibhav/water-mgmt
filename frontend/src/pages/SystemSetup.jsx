import { useState, useEffect } from "react";
import { getUser, updateLimits, getTaps } from "../api";
import { useAuth } from "../context/AuthContext";

const DEFAULT_GREEN_PP  = 100;
const DEFAULT_ORANGE_PP = 200;

export default function SystemSetup() {
  const { user }              = useAuth();
  const uid                   = user?.user_id;
  const [profile, setProfile] = useState(null);
  const [taps,    setTaps]    = useState([]);
  const [msg,     setMsg]     = useState("");
  const [loading, setLoading] = useState(false);

  const [people,     setPeople]     = useState(1);
  const [baseGreen,  setBaseGreen]  = useState(DEFAULT_GREEN_PP);
  const [baseOrange, setBaseOrange] = useState(DEFAULT_ORANGE_PP);

  // Live calculation
  const calcGreen  = +(baseGreen  * people).toFixed(1);
  const calcOrange = +(baseOrange * people).toFixed(1);

  useEffect(() => {
    (async () => {
      try {
        const [u, t] = await Promise.all([getUser(uid), getTaps(uid)]);
        setProfile(u.data);
        setTaps(t.data);
        setPeople(u.data.people_count           || 1);
        setBaseGreen(u.data.base_green_per_person  || DEFAULT_GREEN_PP);
        setBaseOrange(u.data.base_orange_per_person || DEFAULT_ORANGE_PP);
      } catch(e) { console.error(e); }
    })();
  }, [uid]);

  const save = async (e) => {
    e.preventDefault();
    if (baseGreen >= baseOrange) {
      setMsg("❌ Green limit per person must be less than Orange limit per person");
      return;
    }
    setLoading(true); setMsg("");
    try {
      const { data } = await updateLimits(uid, {
        people_count:           people,
        base_green_per_person:  baseGreen,
        base_orange_per_person: baseOrange,
      });
      setMsg(`✅ Saved! House total — 🟢 ${data.green_limit} L  🟠 ${data.orange_limit} L`);
      setProfile(p => ({
        ...p,
        people_count:           people,
        base_green_per_person:  baseGreen,
        base_orange_per_person: baseOrange,
        green_limit:            data.green_limit,
        orange_limit:           data.orange_limit,
      }));
    } catch(err) {
      setMsg("❌ " + (err.response?.data?.error || "Failed to save"));
    } finally { setLoading(false); }
  };

  return (
    <div style={{ color:"#e2e8f0", fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ marginBottom:32 }}>
        <h1 style={{ fontSize:28, fontWeight:800, margin:0,
          background:"linear-gradient(90deg,#00d4ff,#0057ff)",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          System Setup
        </h1>
        <p style={{ color:"#4a7fa5", marginTop:4, fontSize:14 }}>
          Configure household size — limits are calculated automatically per person
        </p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:24, marginBottom:24 }}>

        {/* ── LEFT: People + limits form ─── */}
        <Card title="🏠 Household Configuration">
          <form onSubmit={save}>

            {/* People counter */}
            <div style={{ marginBottom:28 }}>
              <label style={labelStyle}>Number of People at Home</label>
              <div style={{ display:"flex", alignItems:"stretch", marginTop:10, borderRadius:12, overflow:"hidden" }}>
                <button type="button" onClick={() => setPeople(p => Math.max(1, p-1))}
                  style={counterBtnStyle("left")}>−</button>
                <div style={{
                  flex:1, textAlign:"center", fontSize:40, fontWeight:800,
                  color:"#00d4ff", padding:"12px 0",
                  background:"#0a0e1a", border:"1px solid #1e2a45",
                  borderLeft:"none", borderRight:"none",
                }}>{people}</div>
                <button type="button" onClick={() => setPeople(p => Math.min(20, p+1))}
                  style={counterBtnStyle("right")}>+</button>
              </div>
              <div style={{ color:"#4a7fa5", fontSize:12, marginTop:8, textAlign:"center" }}>
                {people === 1
                  ? "Single occupant"
                  : `${people} people sharing the household water supply`}
              </div>

              {/* People avatars */}
              <div style={{ display:"flex", flexWrap:"wrap", gap:6, marginTop:12, justifyContent:"center" }}>
                {Array.from({ length: Math.min(people, 12) }).map((_, i) => (
                  <div key={i} style={{ fontSize:22 }}>👤</div>
                ))}
                {people > 12 && (
                  <div style={{ color:"#4a7fa5", fontSize:13, alignSelf:"center" }}>
                    +{people - 12} more
                  </div>
                )}
              </div>
            </div>

            {/* Per-person limits */}
            <div style={{ marginBottom:20 }}>
              <label style={labelStyle}>Base Limit Per Person (Litres / Day)</label>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12, marginTop:10 }}>
                <div>
                  <div style={{ color:"#00d97e", fontSize:11, fontWeight:700, marginBottom:6 }}>
                    🟢 Green / Person
                  </div>
                  <input type="number" min="10" max="500" step="5" required
                    value={baseGreen}
                    onChange={e => setBaseGreen(+e.target.value)}
                    style={inputStyle} />
                  <div style={{ color:"#4a7fa5", fontSize:10, marginTop:4 }}>
                    Below this = safe usage
                  </div>
                </div>
                <div>
                  <div style={{ color:"#ff9d00", fontSize:11, fontWeight:700, marginBottom:6 }}>
                    🟠 Orange / Person
                  </div>
                  <input type="number" min="10" max="1000" step="5" required
                    value={baseOrange}
                    onChange={e => setBaseOrange(+e.target.value)}
                    style={inputStyle} />
                  <div style={{ color:"#4a7fa5", fontSize:10, marginTop:4 }}>
                    Above orange = red alert
                  </div>
                </div>
              </div>
            </div>

            {/* Live preview panel */}
            <div style={{
              background:"#0a0e1a", border:"1px solid #1e2a45",
              borderRadius:12, padding:16, marginBottom:20,
            }}>
              <div style={{ color:"#94a3b8", fontSize:11, fontWeight:600,
                letterSpacing:0.8, textTransform:"uppercase", marginBottom:14 }}>
                📊 Live Calculation — House Total
              </div>

              {/* Formula cards */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto 1fr", gap:8, alignItems:"center", marginBottom:16 }}>
                <FormulaCard
                  color="#00d97e" icon="🟢" label="Green Limit"
                  formula={`${baseGreen} × ${people}`}
                  result={`${calcGreen} L/day`} />
                <div style={{ color:"#4a7fa5", textAlign:"center", fontSize:12 }}>and</div>
                <FormulaCard
                  color="#ff9d00" icon="🟠" label="Orange Limit"
                  formula={`${baseOrange} × ${people}`}
                  result={`${calcOrange} L/day`} />
              </div>

              {/* Colour band */}
              <div style={{ height:14, borderRadius:7, overflow:"hidden", display:"flex" }}>
                <div style={{ flex:calcGreen,    background:"linear-gradient(90deg,#00d97e60,#00d97e)" }}/>
                <div style={{ flex:calcOrange - calcGreen, background:"linear-gradient(90deg,#ff9d0060,#ff9d00)" }}/>
                <div style={{ flex:calcOrange * 0.25, background:"linear-gradient(90deg,#ff4d6d60,#ff4d6d)" }}/>
              </div>
              <div style={{ display:"flex", justifyContent:"space-between",
                color:"#4a7fa5", fontSize:10, marginTop:6 }}>
                <span>0 L</span>
                <span style={{ color:"#00d97e", fontWeight:700 }}>Green &lt; {calcGreen} L</span>
                <span style={{ color:"#ff9d00", fontWeight:700 }}>Orange &lt; {calcOrange} L</span>
                <span style={{ color:"#ff4d6d", fontWeight:700 }}>Red ↑</span>
              </div>
            </div>

            {msg && (
              <div style={{
                padding:"10px 14px", borderRadius:8, fontSize:13, marginBottom:14,
                background: msg.startsWith("✅") ? "#00d97e18" : "#ff4d4d18",
                border:`1px solid ${msg.startsWith("✅") ? "#00d97e40" : "#ff4d4d40"}`,
                color: msg.startsWith("✅") ? "#00d97e" : "#ff6b6b",
              }}>{msg}</div>
            )}

            <button type="submit" disabled={loading} style={btnStyle}>
              {loading ? "Saving…" : "💾 Save Household Settings"}
            </button>
          </form>
        </Card>

        {/* ── RIGHT: Profile + per-person breakdown ─── */}
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <Card title="👤 User Profile">
            {profile && (
              <div style={{ display:"flex", flexDirection:"column", gap:10 }}>
                <InfoRow label="Name"         value={profile.name} />
                <InfoRow label="Email"        value={profile.email} />
                <InfoRow label="User ID"      value={`#${profile.user_id}`} />
                <InfoRow label="Member Since" value={profile.created_at?.substring(0,10)} />
                <InfoRow label="People at Home"
                  value={<span style={{ color:"#00d4ff", fontWeight:800, fontSize:18 }}>
                    {profile.people_count || 1} 👤
                  </span>} />
                <InfoRow label="Green Limit (Household)"
                  value={<span style={{ color:"#00d97e", fontWeight:700 }}>
                    {profile.green_limit} L/day
                  </span>} />
                <InfoRow label="Orange Limit (Household)"
                  value={<span style={{ color:"#ff9d00", fontWeight:700 }}>
                    {profile.orange_limit} L/day
                  </span>} />
              </div>
            )}
          </Card>

          {/* Per-person grid — only when >1 */}
          {(profile?.people_count || 1) > 1 && (
            <Card title="📐 Per-Person Allowance">
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:10 }}>
                {Array.from({ length: profile.people_count }).map((_, i) => (
                  <div key={i} style={{
                    background:"#0a0e1a", border:"1px solid #1e2a45",
                    borderRadius:10, padding:"10px 14px",
                    display:"flex", alignItems:"center", gap:10,
                  }}>
                    <div style={{ fontSize:20 }}>👤</div>
                    <div>
                      <div style={{ color:"#e2e8f0", fontSize:12, fontWeight:600 }}>
                        Person {i+1}
                      </div>
                      <div style={{ color:"#00d97e", fontSize:11 }}>
                        🟢 {profile.base_green_per_person} L
                      </div>
                      <div style={{ color:"#ff9d00", fontSize:11 }}>
                        🟠 {profile.base_orange_per_person} L
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      </div>

      {/* Taps table */}
      <Card title={`🚿 Registered Taps (${taps.length})`}>
        {taps.length === 0 ? (
          <p style={{ color:"#4a7fa5" }}>No taps added yet. Go to Tap Management.</p>
        ) : (
          <div style={{ overflowX:"auto" }}>
            <table style={{ width:"100%", borderCollapse:"collapse", fontSize:13 }}>
              <thead>
                <tr>
                  {["ID","Tap Name","Location","Status","Usage Today"].map(h => (
                    <th key={h} style={{ color:"#4a7fa5", textAlign:"left",
                      padding:"8px 12px", borderBottom:"1px solid #1e2a45",
                      fontSize:11, fontWeight:600, letterSpacing:0.6 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {taps.map(t => (
                  <tr key={t.tap_id}>
                    <td style={td}>#{t.tap_id}</td>
                    <td style={{ ...td, color:"#e2e8f0", fontWeight:600 }}>{t.tap_name}</td>
                    <td style={td}>{t.location}</td>
                    <td style={td}>
                      <span style={{
                        padding:"2px 10px", borderRadius:20, fontSize:11, fontWeight:700,
                        background: t.tap_status==="ON" ? "#00d97e20" : "#4a7fa520",
                        color:      t.tap_status==="ON" ? "#00d97e"   : "#4a7fa5",
                      }}>{t.tap_status}</span>
                    </td>
                    <td style={{ ...td, color:"#00d4ff", fontWeight:700 }}>
                      {(t.current_usage||0).toFixed(2)} L
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Architecture */}
      <Card title="🏗️ System Architecture">
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)" }}>
          {[
            { icon:"🚿", label:"Tap Control",   sub:"Manual ON/OFF" },
            { icon:"🐍", label:"Flask Backend",  sub:"REST API" },
            { icon:"🤖", label:"Simulator",      sub:"Adds usage/60s" },
            { icon:"🗄️", label:"MySQL DB",       sub:"All data stored" },
            { icon:"⚛️", label:"React Frontend", sub:"Live dashboard" },
          ].map((item, i, arr) => (
            <div key={i} style={{ display:"flex", alignItems:"center" }}>
              <div style={{ textAlign:"center", flex:1 }}>
                <div style={{ fontSize:28, marginBottom:4 }}>{item.icon}</div>
                <div style={{ color:"#e2e8f0", fontSize:12, fontWeight:700 }}>{item.label}</div>
                <div style={{ color:"#4a7fa5", fontSize:10 }}>{item.sub}</div>
              </div>
              {i < arr.length-1 && (
                <div style={{ color:"#00d4ff", fontSize:20, padding:"0 4px" }}>→</div>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────

function FormulaCard({ color, icon, label, formula, result }) {
  return (
    <div style={{
      background:`${color}12`, border:`1px solid ${color}35`,
      borderRadius:10, padding:"12px 14px", textAlign:"center",
    }}>
      <div style={{ fontSize:18 }}>{icon}</div>
      <div style={{ color:"#4a7fa5", fontSize:10, margin:"4px 0" }}>{label}</div>
      <div style={{ color:"#64748b", fontSize:11 }}>{formula} =</div>
      <div style={{ color, fontSize:18, fontWeight:800, marginTop:2 }}>{result}</div>
    </div>
  );
}

function Card({ title, children }) {
  return (
    <div style={{ background:"#0d1220", border:"1px solid #1e2a45",
      borderRadius:16, padding:28, marginBottom:20 }}>
      <div style={{ color:"#e2e8f0", fontSize:16, fontWeight:700, marginBottom:20 }}>{title}</div>
      {children}
    </div>
  );
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center",
      padding:"8px 0", borderBottom:"1px solid #1e2a45" }}>
      <span style={{ color:"#4a7fa5", fontSize:13 }}>{label}</span>
      <span style={{ color:"#e2e8f0", fontSize:13, fontWeight:600 }}>{value}</span>
    </div>
  );
}

const counterBtnStyle = (side) => ({
  width:52, fontSize:24, fontWeight:700,
  background:"linear-gradient(135deg,#00d4ff18,#0057ff18)",
  border:"1px solid #1e2a45",
  borderRadius: side==="left" ? "12px 0 0 12px" : "0 12px 12px 0",
  color:"#00d4ff", cursor:"pointer", lineHeight:1,
});
const labelStyle = {
  display:"block", color:"#94a3b8", fontSize:11,
  fontWeight:600, letterSpacing:0.8, textTransform:"uppercase",
};
const inputStyle = {
  width:"100%", padding:"10px 14px",
  background:"#0a0e1a", border:"1px solid #1e2a45",
  borderRadius:10, color:"#e2e8f0", fontSize:14,
  outline:"none", boxSizing:"border-box",
};
const btnStyle = {
  width:"100%", padding:"12px",
  background:"linear-gradient(135deg,#00d4ff,#0057ff)",
  border:"none", borderRadius:10,
  color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer",
};
const td = {
  padding:"10px 12px", color:"#94a3b8",
  borderBottom:"1px solid #1e2a45",
};
