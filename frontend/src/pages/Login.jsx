import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/context";

export default function Login() {
  const { user, login, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [isRegistering, setIsRegistering] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (user) {
    return <Navigate to={user.role === "STAFF" ? "/staff" : "/"} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const account = isRegistering
        ? await register({ name, email, password })
        : await login({ email, password });

      const home = account.role === "STAFF" ? "/staff" : "/";
      navigate(location.state?.from ?? home, { replace: true });
    } catch (err) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  return (
    <main className="page-container auth-page">
      <section className="auth-card">
        <span className="eyebrow">{isRegistering ? "JOIN US" : "WELCOME BACK"}</span>
        <h1>{isRegistering ? "Create your account" : "Log in"}</h1>

        <form className="checkout-form" onSubmit={handleSubmit}>
          {isRegistering && (
            <label>
              Your name
              <input
                required
                maxLength={150}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          )}
          <label>
            Email
            <input
              required
              type="email"
              maxLength={254}
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              minLength={isRegistering ? 8 : undefined}
              maxLength={128}
              autoComplete={isRegistering ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>
          <button className="primary-button checkout-button" disabled={submitting}>
            {submitting ? "Please wait..." : isRegistering ? "Create account" : "Log in"}
          </button>
        </form>

        {error && <p className="message error">{error}</p>}

        <button
          type="button"
          className="text-button"
          onClick={() => {
            setIsRegistering(!isRegistering);
            setError("");
          }}
        >
          {isRegistering ? "Already have an account? Log in" : "New here? Create an account"}
        </button>
      </section>
    </main>
  );
}
