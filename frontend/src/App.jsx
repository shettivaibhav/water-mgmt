import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import Login        from "./pages/Login";
import Register     from "./pages/Register";
import Dashboard    from "./pages/Dashboard";
import TapControl   from "./pages/TapControl";
import Reports      from "./pages/Reports";
import TapManagement from "./pages/TapManagement";
import SystemSetup  from "./pages/SystemSetup";
import Layout       from "./components/Layout";

function PrivateRoute({ children }) {
  const { user } = useAuth();
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login"    element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route path="/" element={
            <PrivateRoute>
              <Layout />
            </PrivateRoute>
          }>
            <Route index            element={<Dashboard />} />
            <Route path="tap-control"   element={<TapControl />} />
            <Route path="reports"       element={<Reports />} />
            <Route path="tap-management" element={<TapManagement />} />
            <Route path="setup"         element={<SystemSetup />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
