import { useState } from "react";
import { login, register, saveToken } from "../services/authService";

function AuthForm({ onAuthenticated }) {
  const [mode, setMode] = useState("login"); // "login" | "register"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setError("");
    setIsSubmitting(true);

    try {
      const result = mode === "login" ? await login(email, password) : await register(name, email, password);
      saveToken(result.access_token);
      onAuthenticated(result.user);
    } catch (err) {
      setError(err.response?.data?.detail || "Something went wrong. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSubmit();
  };

  return (
    <div className="card p-8 max-w-sm w-full">
      <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-1">
        {mode === "login" ? "Log In" : "Create an Account"}
      </h2>
      <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
        {mode === "login" ? "Welcome back." : "Get started with your own knowledge graphs."}
      </p>

      {mode === "register" && (
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="input-field w-full mb-2"
        />
      )}
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder="Email"
        className="input-field w-full mb-2"
      />
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Password"
        className="w-full mb-3 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

      <button onClick={handleSubmit} disabled={isSubmitting} className="btn-primary text-sm px-4 py-2 w-full">
        {isSubmitting ? "Please wait..." : mode === "login" ? "Log In" : "Create Account"}
      </button>

      <button
        onClick={() => {
          setMode(mode === "login" ? "register" : "login");
          setError("");
        }}
        className="text-xs text-brand-600 dark:text-brand-400 hover:underline mt-3 w-full text-center"
      >
        {mode === "login" ? "Need an account? Register" : "Already have an account? Log in"}
      </button>
    </div>
  );
}

export default AuthForm;