"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

function todayISO() {
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export default function AdminPage() {
  const [status, setStatus] = useState("fechado");
  const [queue, setQueue] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = useMemo(() => todayISO(), []);

  useEffect(() => {
    let cancelled = false;

    async function loadAll() {
      try {
        setLoading(true);
        setError(null);

        const [statusRes, queueRes, apptRes] = await Promise.all([
          supabase.from("shop_status").select("*").order("updated_at", { ascending: false }).limit(1),
          supabase.from("queue_counters").select("*").eq("date", today).maybeSingle(),
          supabase.from("appointments").select("*").eq("date", today).order("time", { ascending: true })
        ]);

        if (statusRes.error) throw new Error(`shop_status: ${statusRes.error.message}`);
        if (queueRes.error) throw new Error(`queue_counters: ${queueRes.error.message}`);
        if (apptRes.error) throw new Error(`appointments: ${apptRes.error.message}`);

        if (!cancelled) {
          setStatus(nextStatus);
        }
      } catch (e) {
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadAll();
    return () => { cancelled = true; };
  }, [today]);

  useEffect(() => {
    const channel = supabase
      .channel("admin-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_status" }, async () => {
        const { data } = await supabase.from("shop_status").select("*").order("updated_at", { ascending: false }).limit(1);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_counters" }, (payload) => {
        const row = payload.new;
        if (row?.date === today) setQueue(row);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, async () => {
        const { data } = await supabase.from("appointments").select("*").eq("date", today).order("time", { ascending: true });
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [today]);

  async function changeStatus(next) {
    const { error } = await supabase.from("shop_status").insert({ status: next });
    if (error) {
      setError(`status insert: ${error.message}`);
      return;
    }
    setStatus(next);
  }

  async function ensureQueueRow() {
    const { data, error } = await supabase.from("queue_counters").select("*").eq("date", today).maybeSingle();
    if (!error && data) return data;

    const { data: inserted, error: insertErr } = await supabase
      .from("queue_counters")
      .insert({ date: today, in_count: 0, out_count: 0 })
      .select()
      .single();

    if (insertErr) throw new Error(`queue insert: ${insertErr.message}`);
    return inserted;
  }

  async function incrementIn() {
    try {
      const { data, error } = await supabase
        .from("queue_counters")
        .eq("id", current.id)
        .select()
        .single();
      if (error) throw new Error(`queue update: ${error.message}`);
      setQueue(data);
    } catch (e) {
    }
  }

  async function incrementOut() {
    try {
      const { data, error } = await supabase
        .from("queue_counters")
        .eq("id", current.id)
        .select()
        .single();
      if (error) throw new Error(`queue update: ${error.message}`);
      setQueue(data);
    } catch (e) {
    }
  }

  useEffect(() => {
    const handleKey = (e) => {
      const tag = e.target?.tagName?.toLowerCase();

      if (e.key === "1") {
        e.preventDefault();
        incrementIn();
      } else if (e.key === "2") {
        e.preventDefault();
        incrementOut();
      }
    };

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [queue]);

  return (
    <div className="space-y-8">
      <header className="border-b border-brand-gold/30 pb-4">
        <h1 className="text-2xl font-bold">
          <span className="text-brand-gold">Painel</span> do Barbeiro
        </h1>
        <p className="opacity-70 mt-1">Status, fila e agenda do dia</p>
      </header>

      {error && (
        <div className="rounded p-3" style={{ border: "1px solid tomato", color: "white", background: "color-mix(in srgb, tomato, black 70%)" }}>
          Erro: {error}
        </div>
      )}

      {loading ? (
        <p className="opacity-80">Carregando...</p>
      ) : (
        <>
          <section className="rounded-lg p-4" style={{ border: "1px solid color-mix(in srgb, var(--color-brand-gold), transparent 70%)" }}>
            <h2 className="text-lg font-semibold text-brand-gold">Status da Barbearia</h2>
            <p className="mt-2">Atual: <span className="font-bold">{status.toUpperCase()}</span></p>
            <div className="mt-3 flex flex-wrap gap-2">
              {["aberto", "fechado", "almoco", "manutencao"].map((s) => (
                <button
                  key={s}
                  className="px-3 py-2 rounded"
                  style={{
                    backgroundColor: status === s ? "var(--color-brand-gold)" : "transparent",
                    border: "1px solid var(--color-brand-gold)",
                    color: status === s ? "black" : "white"
                  }}
                  onClick={() => changeStatus(s)}
                >
                  {s === "aberto" ? "Aberto" : s === "fechado" ? "Fechado" : s === "almoco" ? "Almoço" : "Manutenção"}
                </button>
              ))}
            </div>
          </section>

          <section className="rounded-lg p-4" style={{ border: "1px solid color-mix(in srgb, var(--color-brand-gold), transparent 70%)" }}>
            <h2 className="text-lg font-semibold text-brand-gold">Fila de Hoje ({today})</h2>
            <div className="mt-2 flex items-center gap-6">
              <div>
                <div className="opacity-70 text-sm">Entradas</div>
                <div className="text-3xl font-bold">{queue?.in_count ?? 0}</div>
              </div>
              <div>
                <div className="opacity-70 text-sm">Saídas</div>
                <div className="text-3xl font-bold">{queue?.out_count ?? 0}</div>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button className="px-4 py-2 rounded" style={{ backgroundColor: "var(--color-brand-gold)", color: "black" }} onClick={incrementIn}>
                +1 Entrada (1)
              </button>
              <button className="px-4 py-2 rounded" style={{ backgroundColor: "var(--color-brand-gold)", color: "black" }} onClick={incrementOut}>
                +1 Saída (2)
              </button>
            </div>
          </section>

          <section className="rounded-lg p-4" style={{ border: "1px solid color-mix(in srgb, var(--color-brand-gold), transparent 70%)" }}>
            <h2 className="text-lg font-semibold text-brand-gold">Agendamentos de Hoje</h2>
            {appointments.length === 0 ? (
              <p className="mt-2 opacity-70">Nenhum horário agendado para hoje.</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {appointments.map((a) => (
                  <li key={a.id} className="flex items-center justify-between">
                    <div>
                      <div className="font-semibold">{a.customer_name}</div>
                      <div className="opacity-70 text-sm">{a.customer_phone}</div>
                    </div>
                    <div className="text-brand-gold font-bold">{a.time?.slice(0, 5)}</div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}