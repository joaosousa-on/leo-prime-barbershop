"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AdminLogin() {
  const [credentials, setCredentials] = useState({
    username: "",
    password: ""
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const handleSubmit = (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Credenciais fixas
    const validUsername = "leobarbeiro";
    const validPassword = "1234";

    if (credentials.username === validUsername && credentials.password === validPassword) {
      // Salva no localStorage e redireciona
      localStorage.setItem("adminAuthenticated", "true");
      localStorage.setItem("adminLoginTime", new Date().toISOString());
      router.push("/admin");
    } else {
      setError("Usuário ou senha incorretos!");
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCredentials(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: "linear-gradient(135deg, #000 0%, #1a1a1a 100%)" }}>
      <div className="max-w-md w-full p-8 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#111" }}>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2" style={{ color: "#FFD700" }}>
            LEO PRIME BARBERSHOP
          </h1>
          <h2 className="text-xl text-white/80">Acesso Restrito - Admin</h2>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label className="block text-white mb-2 font-semibold">
                Usuário
              </label>
              <input
                type="text"
                name="username"
                value={credentials.username}
                onChange={handleInputChange}
                className="w-full p-4 rounded-lg text-white transition-all"
                style={{ 
                  backgroundColor: "#000",
                  border: "1px solid rgba(255, 215, 0, 0.3)",
                  outline: "none"
                }}
                placeholder="Digite seu usuário"
                required
              />
            </div>

            <div>
              <label className="block text-white mb-2 font-semibold">
                Senha
              </label>
              <input
                type="password"
                name="password"
                value={credentials.password}
                onChange={handleInputChange}
                className="w-full p-4 rounded-lg text-white transition-all"
                style={{ 
                  backgroundColor: "#000",
                  border: "1px solid rgba(255, 215, 0, 0.3)",
                  outline: "none"
                }}
                placeholder="Digite sua senha"
                required
              />
            </div>
          </div>

          {error && (
            <div className="mt-4 p-3 bg-red-900 text-white rounded text-center">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 mt-6 rounded-lg text-xl font-bold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
            style={{
              backgroundColor: loading ? "#666" : "#FFD700",
              color: "#000",
              boxShadow: loading ? "none" : "0 4px 20px rgba(255, 215, 0, 0.4)"
            }}
          >
            {loading ? "Entrando..." : "Entrar no Painel"}
          </button>
        </form>

        <div className="mt-6 text-center text-yellow-500 text-sm">
          <p>Usuário: <strong>leobarbeiro</strong></p>
        </div>
      </div>
    </div>
  );
}