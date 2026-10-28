
import { Link, Route, Routes } from "react-router-dom";
import Home from "./pages/Home";
import Restaurant from "./pages/Restaurant";
import "./App.css";

function Header() {
  return (
    <header className="site-header">
      <div className="header-inner">
        <Link to="/" className="brand">
          <span className="brand-mark">S</span>
          <span>swiggy<span className="brand-dot">.</span></span>
        </Link>
        <span className="header-tagline">GOOD FOOD, DELIVERED WITH LOVE.</span>
        <Link to="/" className="header-home">Home</Link>
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
        <Route path="*" element={<main className="page-container"><h1>Page not found</h1><Link to="/">Return home</Link></main>} />
      </Routes>
      <Footer />
    </>
  );
}

