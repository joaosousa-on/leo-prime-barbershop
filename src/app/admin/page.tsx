"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";


export default function AdminPage() {
  const [status, setStatus] = useState<Status>("fechado");
  const [inCount, setInCount] = useState<number>(0);
  const [outCount, setOutCount] = useState<number>(0);
  const [todayAppts, setTodayAppts] = useState<any[]>([]);

  const todayStr = new Date().toISOString().slice(0, 10);

  const upsertStatus = async (newStatus: Status) => {
    const { data } = await supabase.from("shop_status").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
    if (data?.id) {
      await supabase.from("shop_status").update({ status: newStatus, updated_at: new Date().toISOString() }).eq("id", data.id);
    } else {
      await supabase.from("shop_status").insert({ status: newStatus });
    }
    setStatus(newStatus);
  };

  const loadQueue = async () => {
    const { data } = await supabase.from("queue_counters").select("*").eq("date", todayStr).maybeSingle();
    if (data) {
    } else {
      // cria registro do dia
      await supabase.from("queue_counters").insert({ date: todayStr });
      setInCount(0);
      setOutCount(0);
    }
  };

  const incIn = async () => {
    await supabase.rpc("noop"); // opcional
    await supabase.from("queue_counters")
      .update({ in_count: inCount + 1, updated_at: new Date().toISOString() })
      .eq("date", todayStr);
    setInCount(prev => prev + 1);
  };

  const incOut = async () => {
    await supabase.from("queue_counters")
      .update({ out_count: Math.max(0, outCount + 1), updated_at: new Date().toISOString() })
      .eq("date", todayStr);
    setOutCount(prev => Math.max(0, prev + 1));
  };

  useEffect(() => {
    const init = async () => {
      const { data: st } = await supabase.from("shop_status").select("*").order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (st?.status) setStatus(st.status);

      await loadQueue();

      const { data: ap } = await supabase.from("appointments").select("*").eq("date", todayStr).order("time");
    };
    init();

    const chStatus = supabase
      .channel("status")
      .on("postgres_changes", { event: "*", schema: "public", table: "shop_status" }, payload => {
        if (row?.status) setStatus(row.status);
      })
      .subscribe();

    const chQueue = supabase
      .channel("queue")
      .on("postgres_changes", { event: "*", schema: "public", table: "queue_counters" }, payload => {
        const row: any = payload.new;
        if (row?.date === todayStr) {
        }
      })
      .subscribe();

    const chAppts = supabase
      .channel("appts")
      .on("postgres_changes", { event: "*", schema: "public", table: "appointments" }, payload => {
        const row: any = payload.new;
        if (row?.date === todayStr) {
          // recarrega lista do dia
          supabase.from("appointments").select("*").eq("date", todayStr).order("time").then(({ data }) => {
          });
        }
      })
      .subscribe();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "F8") incIn();
      if (e.key === "F9") incOut();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      supabase.removeChannel(chStatus);
      supabase.removeChannel(chQueue);
      supabase.removeChannel(chAppts);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  const waiting = Math.max(0, inCount - outCount);

  return (
    <div className="space-y-10">
      <section className="rounded-lg border border-brand-gold/30 p-5">
        <h2 className="text-xl font-semibold mb-4">Status da Barbearia</h2>
        <div className="flex gap-3 flex-wrap">
          {(["aberto","fechado","almoco","manutencao"] as Status[]).map(s => (
            <button
              key={s}
              onClick={() => upsertStatus(s)}
              className={`px-4 py-2 rounded border ${status === s ? "bg-brand-gold text-black" : "border-brand-gold/40 hover:border-brand-gold/80"}`}
            >
              {s === "aberto" ? "Aberto" :
               s === "fechado" ? "Fechado" :
               s === "almoco" ? "Almoço" : "Manutenção"}
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-lg border border-brand-gold/30 p-5">
        <h2 className="text-xl font-semibold mb-2">Fila (Walk-ins)</h2>
        <p className="opacity-80">Atalhos: F8 = Entrada, F9 = Saída</p>
        <div className="mt-4 flex items-center gap-4">
          <button onClick={incIn} className="bg-brand-gold text-black px-4 py-2 rounded">+1 Entrada (F8)</button>
          <button onClick={incOut} className="border border-brand-gold/60 px-4 py-2 rounded">+1 Saída (F9)</button>
          <div className="ml-auto">
            <span className="opacity-80 mr-4">Entradas: {inCount}</span>
            <span className="opacity-80 mr-4">Saídas: {outCount}</span>
            <span className="text-brand-gold font-semibold">Na fila: {waiting}</span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-brand-gold/30 p-5">
        <h2 className="text-xl font-semibold mb-4">Agendamentos de hoje</h2>
        <ul className="space-y-2">
          {todayAppts.map(a => (
            <li key={a.id} className="flex justify-between text-sm border-b border-white/10 pb-2">
              <span>{a.time.slice(0,5)} - {a.customer_name}</span>
              <span className="opacity-70">{a.customer_phone}</span>
            </li>
          ))}
          {!todayAppts.length && <li className="opacity-60 text-sm">Sem agendamentos hoje.</li>}
        </ul>
      </section>
    </div>
  );
}