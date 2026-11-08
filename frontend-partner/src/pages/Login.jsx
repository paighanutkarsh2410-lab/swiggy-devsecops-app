import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../auth/context";

export default function Login() {
  const { user, login } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to="/" replace />;
  }

  async function submit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      await login({ email, password });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-card">
        <div className="brand large">
          <span className="brand-mark">S</span>
          <span>swiggy <em>partner</em></span>
        </div>
        <h1>Restaurant console</h1>
        <p className="subtle">Manage live orders and your menu. Accounts are set up by Swiggy for restaurant owners and their staff.</p>

        <form onSubmit={submit}>
          <label>
            Email
            <input
              required
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              autoComplete="current-password"
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </label>
          <button className="button primary block" disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in"}
          </button>
        </form>

        {error && <p className="notice error" role="alert">{error}</p>}
      </section>
    </main>
  );
}
