"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AdminPage() {
  const [status, setStatus] = useState("fechado");
  const [queue, setQueue] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // Função corrigida para incrementar entradas
  const incrementIn = async () => {
    try {
      // Verifica se já existe registro para hoje
      let current = queue;
      if (!current) {
        const { data, error } = await supabase
          .from('queue_counters')
          .select('*')
          .eq('date', today)
          .maybeSingle();
        
        if (error) throw error;
        
        if (!data) {
          // Cria novo registro se não existir
          const { data: newData, error: insertError } = await supabase
            .from('queue_counters')
            .insert({ date: today, in_count: 0, out_count: 0 })
            .select()
            .single();
          
          if (insertError) throw insertError;
          current = newData;
        } else {
          current = data;
        }
      }

      // Atualiza o contador
      const { data: updated, error: updateError } = await supabase
        .from('queue_counters')
        .update({ 
          updated_at: new Date().toISOString()
        })
        .eq('id', current.id)
        .select()
        .single();

      if (updateError) throw updateError;
      setQueue(updated);
    } catch (err) {
      console.error("Erro detalhado:", err);
    }
  };

  // Função idêntica para incrementar saídas
  const incrementOut = async () => {
    try {
      let current = queue;
      if (!current) {
        const { data, error } = await supabase
          .from('queue_counters')
          .select('*')
          .eq('date', today)
          .maybeSingle();
        
        if (error) throw error;
        
        if (!data) {
          const { data: newData, error: insertError } = await supabase
            .from('queue_counters')
            .insert({ date: today, in_count: 0, out_count: 0 })
            .select()
            .single();
          
          if (insertError) throw insertError;
          current = newData;
        } else {
          current = data;
        }
      }

      const { data: updated, error: updateError } = await supabase
        .from('queue_counters')
        .update({ 
          updated_at: new Date().toISOString()
        })
        .eq('id', current.id)
        .select()
        .single();

      if (updateError) throw updateError;
      setQueue(updated);
    } catch (err) {
      console.error("Erro detalhado:", err);
    }
  };

  // Restante do seu código (useEffects, render, etc...)
  // ... mantenha igual ao que você já tem
}