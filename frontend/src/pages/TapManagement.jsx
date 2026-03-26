import { useState, useEffect } from "react";
import { getTaps, addTap, deleteTap } from "../api";
import { useAuth } from "../context/AuthContext";

const LOCATIONS = ["Bathroom","Kitchen","Toilet","Garden","Living Room","Balcony","Laundry","General"];

export default function TapManagement() {
  const { user }        = useAuth();
  const uid             = user?.user_id;
  const [taps, setTaps] = useState([]);
  const [form, setForm] = useState({ tap_name:"", location:"Bathroom" });
  const [msg,  setMsg]  = useState("");
  const [loading, setLoading] = useState(false);

  const load = async () => {
    const { data } = await getTaps(uid);
    setTaps(data);
  };

  useEffect(() => { load(); }, [uid]);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true); setMsg("");
    try {
      await addTap({ user_id:uid, tap_name:form.tap_name, location:form.location });
      setMsg("✅ Tap added successfully!");
      setForm({ tap_name:"", location:"Bathroom" });
      await load();
    } catch(err) {
      setMsg("❌ " + (err.response?.data?.error || "Failed to add tap"));
    } finally { setLoading(false); }
  };

  const remove = async (id) => {
    if (!window.confirm("Delete this tap and all its data?")) return;
    await deleteTap(id);
    await load();
  };

  return (
    <div style={{ color:"#e2e8f0", fontFamily:"'DM Sans',sans-serif" }}>
      <div style={{ marginBottom:32 }}>
        <h1 style={{ fontSize:28, fontWeight:800, margin:0,
          background:"linear-gradient(90deg,#00d4ff,#0057ff)",
          WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" }}>
          Tap Management
        </h1>
        <p style={{ color:"#4a7fa5", marginTop:4, fontSize:14 }}>
          Add and manage taps for your water monitoring system
        </p>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"380px 1fr", gap:24 }}>
        {/* Add tap form */}
        <div style={{ background:"#0d1220", border:"1px solid #1e2a45",
          borderRadius:16, padding:28 }}>
          <div style={{ color:"#e2e8f0", fontSize:16, fontWeight:700, marginBottom:20 }}>
            ➕ Add New Tap
          </div>

          <form onSubmit={submit}>
            <div style={{ marginBottom:16 }}>
              <label style={labelStyle}>Tap Name</label>
              <input
                value={form.tap_name}
                onChange={e => setForm(p => ({ ...p, tap_name:e.target.value }))}
                placeholder="e.g. Main Bathroom Shower"
                required
                style={inputStyle}
              />
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={labelStyle}>Location</label>
              <select
                value={form.location}
                onChange={e => setForm(p => ({ ...p, location:e.target.value }))}
                style={{ ...inputStyle, cursor:"pointer" }}
              >
                {LOCATIONS.map(l => <option key={l} value={l}>{l}</option>)}
              </select>
            </div>

            {msg && (
              <div style={{
                padding:"10px 14px", borderRadius:8, fontSize:13,
                background: msg.startsWith("✅") ? "#00d97e18" : "#ff4d4d18",
                border: `1px solid ${msg.startsWith("✅") ? "#00d97e40" : "#ff4d4d40"}`,
                color: msg.startsWith("✅") ? "#00d97e" : "#ff6b6b",
                marginBottom:16,
              }}>
                {msg}
              </div>
            )}

            <button type="submit" disabled={loading} style={{
              width:"100%", padding:"12px",
              background:"linear-gradient(135deg,#00d4ff,#0057ff)",
              border:"none", borderRadius:10,
              color:"#fff", fontSize:14, fontWeight:700, cursor:"pointer",
            }}>
              {loading ? "Adding…" : "Add Tap"}
            </button>
          </form>
        </div>

        {/* Tap list */}
        <div style={{ background:"#0d1220", border:"1px solid #1e2a45",
          borderRadius:16, padding:28 }}>
          <div style={{ color:"#e2e8f0", fontSize:16, fontWeight:700, marginBottom:20 }}>
            📋 Your Taps ({taps.length})
          </div>

          {taps.length === 0 && (
            <div style={{ color:"#4a7fa5", textAlign:"center", padding:40 }}>
              No taps yet. Add your first tap →
            </div>
          )}

          <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
            {taps.map(tap => (
              <div key={tap.tap_id} style={{
                display:"flex", alignItems:"center", justifyContent:"space-between",
                padding:"14px 16px", background:"#0a0e1a",
                border:"1px solid #1e2a45", borderRadius:12,
              }}>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <div style={{ fontSize:24 }}>{locIcon(tap.location)}</div>
                  <div>
                    <div style={{ color:"#e2e8f0", fontSize:14, fontWeight:600 }}>
                      {tap.tap_name}
                    </div>
                    <div style={{ color:"#4a7fa5", fontSize:12 }}>
                      📍 {tap.location} · ID #{tap.tap_id}
                    </div>
                  </div>
                </div>
                <div style={{ display:"flex", alignItems:"center", gap:12 }}>
                  <span style={{
                    padding:"3px 10px", borderRadius:20, fontSize:11, fontWeight:700,
                    background: tap.tap_status==="ON" ? "#00d97e20" : "#4a7fa520",
                    color:      tap.tap_status==="ON" ? "#00d97e"   : "#4a7fa5",
                  }}>
                    {tap.tap_status}
                  </span>
                  <button onClick={() => remove(tap.tap_id)} style={{
                    padding:"6px 12px", background:"#ff4d6d20",
                    border:"1px solid #ff4d6d40", borderRadius:8,
                    color:"#ff6b6b", cursor:"pointer", fontSize:12,
                  }}>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function locIcon(loc="") {
  const l = loc.toLowerCase();
  if (l.includes("bath"))    return "🚿";
  if (l.includes("kitchen")) return "🍳";
  if (l.includes("toilet"))  return "🚽";
  if (l.includes("garden"))  return "🌱";
  if (l.includes("laundry")) return "👕";
  return "💧";
}

const labelStyle = {
  display:"block", color:"#94a3b8", fontSize:11,
  fontWeight:600, marginBottom:6, letterSpacing:0.8, textTransform:"uppercase",
};
const inputStyle = {
  width:"100%", padding:"10px 14px",
  background:"#0a0e1a", border:"1px solid #1e2a45",
  borderRadius:10, color:"#e2e8f0", fontSize:14,
  outline:"none", boxSizing:"border-box",
};
