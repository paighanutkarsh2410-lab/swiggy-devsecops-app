
import { Link, Route, Routes } from "react-router-dom";
import { useAuth } from "./auth/context";
import RequireAuth from "./components/RequireAuth";
import Home from "./pages/Home";
import Login from "./pages/Login";
import OrderDetail from "./pages/OrderDetail";
import Orders from "./pages/Orders";
import Restaurant from "./pages/Restaurant";
import StaffDashboard from "./pages/StaffDashboard";
import "./App.css";

function Header() {
  const { user, logout } = useAuth();

  return (
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">S</span>
          <span>swiggy<span className="brand-dot">.</span></span>
        </Link>
        <span className="header-tagline">GOOD FOOD, DELIVERED WITH LOVE.</span>
        <nav className="header-nav">
          <Link to="/">Home</Link>
          {user?.role === "CUSTOMER" && <Link to="/orders">My orders</Link>}
          {user?.role === "STAFF" && <Link to="/staff">Dashboard</Link>}
          {user ? (
            <button type="button" onClick={logout}>Log out</button>
          ) : (
            <Link to="/login">Log in</Link>
          )}
        </nav>
      </div>
    </header>
  );
}

function Footer() {
  return (
    <footer className="site-footer">
      <p>swiggy<span className="brand-dot">.</span></p>
      <span>A cloud-native food delivery demo · Built with React, Node.js & PostgreSQL</span>
    </footer>
  );
}

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/restaurant/:id" element={<Restaurant />} />
        <Route path="/login" element={<Login />} />
        <Route path="/orders" element={<RequireAuth><Orders /></RequireAuth>} />
        <Route path="/orders/:id" element={<RequireAuth><OrderDetail /></RequireAuth>} />
        <Route path="/staff" element={<RequireAuth role="STAFF"><StaffDashboard /></RequireAuth>} />
        <Route path="*" element={<main className="page-container"><h1>Page not found</h1><Link to="/">Return home</Link></main>} />
      </Routes>
      <Footer />
    </>
  );
}

