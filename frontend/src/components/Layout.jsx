import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const NAV = [
  { to: "/",              icon: "📊", label: "Dashboard"      },
  { to: "/tap-control",   icon: "🚿", label: "Tap Control"    },
  { to: "/tap-management",icon: "⚙️", label: "Tap Management" },
  { to: "/reports",       icon: "📈", label: "Reports"        },
  { to: "/setup",         icon: "🛠️", label: "System Setup"   },
];

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => { logout(); navigate("/login"); };

  return (
    <div style={{ display:"flex", minHeight:"100vh", background:"#0a0e1a", fontFamily:"'DM Sans', sans-serif" }}>
      {/* Sidebar */}
      <aside style={{
        width:240, background:"#0d1220",
        borderRight:"1px solid #1e2a45",
        display:"flex", flexDirection:"column",
        padding:"0 0 24px",
        position:"fixed", top:0, left:0, bottom:0, zIndex:100,
      }}>
        {/* Logo */}
        <div style={{ padding:"28px 24px 20px", borderBottom:"1px solid #1e2a45" }}>
          <div style={{ display:"flex", alignItems:"center", gap:10 }}>
            <div style={{
              width:38, height:38, borderRadius:10,
              background:"linear-gradient(135deg,#00d4ff,#0057ff)",
              display:"flex", alignItems:"center", justifyContent:"center",
              fontSize:20,
            }}>💧</div>
            <div>
              <div style={{ color:"#e2e8f0", fontSize:13, fontWeight:700, letterSpacing:0.5 }}>AquaTrack</div>
              <div style={{ color:"#4a7fa5", fontSize:10 }}>Smart Water Monitor</div>
            </div>
          </div>
        </div>

        {/* User badge */}
        <div style={{ padding:"16px 24px", borderBottom:"1px solid #1e2a45" }}>
          <div style={{ fontSize:10, color:"#4a7fa5", marginBottom:4 }}>LOGGED IN AS</div>
          <div style={{ color:"#94d2ff", fontSize:13, fontWeight:600 }}>
            {user?.name || "User"}
          </div>
        </div>

        {/* Nav links */}
        <nav style={{ flex:1, padding:"16px 12px" }}>
          {NAV.map(({ to, icon, label }) => (
            <NavLink key={to} to={to} end={to==="/"} style={({ isActive }) => ({
              display:"flex", alignItems:"center", gap:10,
              padding:"10px 12px", borderRadius:8, marginBottom:4,
              textDecoration:"none",
              background: isActive ? "linear-gradient(90deg,#00d4ff18,#0057ff18)" : "transparent",
              borderLeft: isActive ? "3px solid #00d4ff" : "3px solid transparent",
              color: isActive ? "#00d4ff" : "#64748b",
              fontSize:13, fontWeight:isActive?600:400,
              transition:"all 0.2s",
            })}>
              <span>{icon}</span> {label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding:"0 12px" }}>
          <button onClick={handleLogout} style={{
            width:"100%", padding:"10px 12px",
            background:"#ff4d4d18", border:"1px solid #ff4d4d40",
            borderRadius:8, color:"#ff6b6b",
            cursor:"pointer", fontSize:13, fontWeight:600,
            display:"flex", alignItems:"center", gap:10,
          }}>
            🚪 Logout
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex:1, marginLeft:240, padding:"32px", overflowY:"auto" }}>
        <Outlet />
      </main>
    </div>
  );
}
