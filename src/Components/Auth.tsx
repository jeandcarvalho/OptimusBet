// src/Components/Auth.tsx
import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";

const API_BASE = "https://carcara-web-api.onrender.com";

const Auth: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // lê ?redirect=/Path%20aqui
  const searchParams = new URLSearchParams(location.search);
  const redirectTo = searchParams.get("redirect")
    ? decodeURIComponent(searchParams.get("redirect") as string)
    : "/";

  const toggleMode = () => {
    setMode(mode === "login" ? "register" : "login");
    setErrorMsg("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg("");
    setLoading(true);

    try {
      const url =
        mode === "login"
          ? `${API_BASE}/auth/login`
          : `${API_BASE}/auth/register`;

      const body =
        mode === "login"
          ? { email, password }
          : { name, email, password };

      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      const data = await response.json();

      if (!response.ok) {
        setLoading(false);
        setErrorMsg(data.error || "Unexpected error.");
        return;
      }

      if (mode === "login") {
        // LOGIN: save token + user
        localStorage.setItem("token", data.token);
        localStorage.setItem("user", JSON.stringify(data.user));

        // volta pra página de origem (ou "/" se não tiver redirect)
        navigate(redirectTo || "/", { replace: true });
      } else {
        // REGISTER: troca pra modo login, mantendo o redirect na URL
        setMode("login");
        setPassword("");
      }
    } catch (err) {
      setErrorMsg("Connection error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-zinc-950 min-h-screen flex flex-col">
      <Header />

      {/* Back button */}
      <div className="my-3 ml-3">
        <Link to={redirectTo || "/"}>
          <button className="bg-gray-700 text-white hover:bg-gray-600 text-base md:text-lg font-bold py-1 px-3 rounded-full transition duration-300 text-roboto">
            ← Back
          </button>
        </Link>
      </div>

      {/* Center container */}
      <div className="flex-grow flex justify-center items-center px-4">
        <main className="bg-zinc-900 w-full max-w-md rounded-lg shadow-lg p-6 border border-zinc-800">
          <h1 className="text-3xl font-medium text-yellow-300 mb-6 text-center">
            {mode === "login" ? "Sign In" : "Create Account"}
          </h1>

          {/* Error message */}
          {errorMsg && (
            <div className="bg-red-900 text-red-100 p-2 rounded mb-4 text-center">
              {errorMsg}
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "register" && (
              <div>
                <label className="text-gray-300 block mb-1">Full Name</label>
                <input
                  className="w-full p-2 rounded bg-zinc-800 text-gray-100 border border-zinc-700"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                />
              </div>
            )}

            <div>
              <label className="text-gray-300 block mb-1">Email</label>
              <input
                type="email"
                className="w-full p-2 rounded bg-zinc-800 text-gray-100 border border-zinc-700"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div>
              <label className="text-gray-300 block mb-1">Password</label>
              <input
                type="password"
                className="w-full p-2 rounded bg-zinc-800 text-gray-100 border border-zinc-700"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {/* Button */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 mt-4 bg-yellow-500 hover:bg-yellow-400 text-black font-bold rounded transition duration-300"
            >
              {loading
                ? "Loading..."
                : mode === "login"
                ? "Sign In"
                : "Register"}
            </button>
          </form>

          {/* Switch login/register */}
          <p className="text-gray-300 text-center mt-6">
            {mode === "login"
              ? "Don't have an account?"
              : "Already have an account?"}
            <button
              onClick={toggleMode}
              className="ml-2 text-yellow-400 hover:underline"
            >
              {mode === "login" ? "Create one" : "Sign in"}
            </button>
          </p>
        </main>
      </div>

      <Footer />
    </div>
  );
};

export default Auth;
