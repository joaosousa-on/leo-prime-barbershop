"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function AdminPage() {
  const [status, setStatus] = useState("fechado");
  const [queue, setQueue] = useState({ in_count: 0, out_count: 0 });
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // Cálculos para as estatísticas
  const peopleInShop = (queue?.in_count || 0) - (queue?.out_count || 0);
  const completedCuts = queue?.out_count || 0;
  
  // Agendamentos de hoje que já passaram do horário (considerados prioridade)
  const priorityAppointments = appointments.filter(appt => {
    const appointmentTime = new Date(`${today}T${appt.time}`);
    return appointmentTime <= new Date();
  }).length;

  // Função para carregar todos os dados
  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carrega status
      const { data: statusData } = await supabase
        .from('shop_status')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (statusData) {
        setStatus(statusData.status);
      }

      // Carrega fila
      const { data: queueData } = await supabase
        .from('queue_counters')
        .select('*')
        .eq('date', today)
        .maybeSingle();

      if (queueData) {
        setQueue(queueData);
      } else {
        const { data: newQueue } = await supabase
          .from('queue_counters')
          .insert({ 
            date: today, 
            in_count: 0, 
            out_count: 0 
          })
          .select()
          .single();
        
        if (newQueue) {
          setQueue(newQueue);
        }
      }

      // Carrega agendamentos
      const { data: appointmentsData } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', today)
        .order('time', { ascending: true });

      if (appointmentsData) {
        setAppointments(appointmentsData);
      }
      
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Atualiza status
  const updateStatus = async (newStatus) => {
    try {
      const { error } = await supabase.from('shop_status').insert({ status: newStatus });
      if (error) throw error;
      setStatus(newStatus);
    } catch (err) {
      console.error('Erro ao atualizar status:', err);
      setError(err.message);
    }
  };

  // Atualiza fila
  const updateQueue = async (type) => {
    try {
      let currentQueue = queue;
      
      if (!currentQueue || !currentQueue.id) {
        const { data: existingQueue } = await supabase
          .from('queue_counters')
          .select('*')
          .eq('date', today)
          .maybeSingle();

        if (existingQueue) {
          currentQueue = existingQueue;
        } else {
          const { data: newQueue } = await supabase
            .from('queue_counters')
            .insert({ 
              date: today, 
              in_count: 0, 
              out_count: 0 
            })
            .select()
            .single();
          
          if (newQueue) {
            currentQueue = newQueue;
          } else {
            throw new Error('Não foi possível criar a fila');
          }
        }
      }

      const updateData = {
        updated_at: new Date().toISOString(),
      };

      if (type === 'in') {
        updateData.in_count = (currentQueue.in_count || 0) + 1;
      } else if (type === 'out') {
        updateData.out_count = (currentQueue.out_count || 0) + 1;
      }

      const { data, error } = await supabase
        .from('queue_counters')
        .update(updateData)
        .eq('id', currentQueue.id)
        .select()
        .single();

      if (error) throw error;
      
      setQueue(data);
    } catch (err) {
      console.error('Erro ao atualizar fila:', err);
      setError(err.message);
    }
  };

  // Configura listeners em tempo real
  useEffect(() => {
    loadData();

    const statusSub = supabase
      .channel('status')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'shop_status' 
      }, (payload) => {
        if (payload.new) {
          setStatus(payload.new.status);
        }
      })
      .subscribe();

    const queueSub = supabase
      .channel('queue')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'queue_counters' 
      }, (payload) => {
        if (payload.new && payload.new.date === today) {
          setQueue(payload.new);
        }
      })
      .subscribe();

    const apptsSub = supabase
      .channel('appts')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'appointments' 
      }, () => {
        loadData();
      })
      .subscribe();

    // Atalhos de teclado
    const handleKey = (e) => {
      if (e.key === '1') updateQueue('in');
      if (e.key === '2') updateQueue('out');
    };
    window.addEventListener('keydown', handleKey);

    return () => {
      statusSub.unsubscribe();
      queueSub.unsubscribe();
      apptsSub.unsubscribe();
      window.removeEventListener('keydown', handleKey);
    };
  }, [today]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
        <div className="text-yellow-500 text-xl">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4">
      <h1 className="text-2xl font-bold text-yellow-500 mb-6 text-center">
        LEO PRIME BARBERSHOP
      </h1>
      
      {/* Status da Barbearia - Compacto */}
      <section className="mb-6 p-4 bg-gray-900 rounded-lg border border-yellow-600">
        <h2 className="text-lg font-semibold text-yellow-500 mb-3">Status</h2>
        <div className="flex gap-2 flex-wrap">
          {['aberto', 'fechado', 'almoco', 'manutencao'].map((s) => (
            <button
              key={s}
              onClick={() => updateStatus(s)}
              className={`px-3 py-1 rounded text-sm transition-colors ${
                status === s 
                  ? 'bg-yellow-500 text-black font-bold' 
                  : 'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
        </div>
      </section>

      {/* Destaque Principal - Pessoas na Barbearia */}
      <section className="mb-6 p-6 bg-gradient-to-br from-yellow-600 to-yellow-800 rounded-lg text-center shadow-lg">
        <h2 className="text-xl font-bold text-white mb-2">CLIENTES NA BARBEARIA</h2>
        <div className="text-5xl font-bold text-white mb-1">
          {peopleInShop}
        </div>
        <p className="text-yellow-100 text-sm">Aguardando atendimento</p>
      </section>

      {/* Estatísticas Secundárias */}
      <section className="mb-6 grid grid-cols-2 gap-4">
        {/* Prioridades */}
        <div className="p-4 bg-blue-900 rounded-lg border border-blue-600 text-center">
          <h3 className="text-sm font-semibold text-blue-300 mb-1">PRIORIDADE</h3>
          <div className="text-2xl font-bold text-white">
            {priorityAppointments}
          </div>
          <p className="text-blue-200 text-xs mt-1">Com hora marcada</p>
        </div>

        {/* Cortes Realizados */}
        <div className="p-4 bg-green-900 rounded-lg border border-green-600 text-center">
          <h3 className="text-sm font-semibold text-green-300 mb-1">CORTES HOJE</h3>
          <div className="text-2xl font-bold text-white">
            {completedCuts}
          </div>
          <p className="text-green-200 text-xs mt-1">Realizados</p>
        </div>
      </section>

      {/* Controles Compactos */}
      <section className="mb-6 p-4 bg-gray-900 rounded-lg border border-yellow-600">
        <h2 className="text-lg font-semibold text-yellow-500 mb-3">Controles Rápidos</h2>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => updateQueue('in')}
            className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white font-bold rounded transition-colors text-center"
          >
            Entrou (1)
          </button>
          <button
            onClick={() => updateQueue('out')}
            className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded transition-colors text-center"
          >
            Saiu (2)
          </button>
        </div>
        <div className="mt-2 text-center text-gray-400 text-xs">
          Teclas: 1 = Entrada, 2 = Saída
        </div>
      </section>

      {/* Detalhes da Fila - Compacto */}
      <section className="mb-6 p-4 bg-gray-900 rounded-lg border border-yellow-600">
        <div className="grid grid-cols-2 gap-4 text-center">
          <div>
            <div className="text-gray-400 text-sm">Total Entradas</div>
            <div className="text-xl font-bold text-green-400">{queue?.in_count || 0}</div>
          </div>
          <div>
            <div className="text-gray-400 text-sm">Total Saídas</div>
            <div className="text-xl font-bold text-red-400">{queue?.out_count || 0}</div>
          </div>
        </div>
      </section>

      {/* Agendamentos do Dia - Compacto */}
      <section className="p-4 bg-gray-900 rounded-lg border border-yellow-600">
        <h2 className="text-lg font-semibold text-yellow-500 mb-3">
          Agendamentos ({appointments.length})
        </h2>
        {appointments.length > 0 ? (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {appointments.map((appt) => {
              const appointmentTime = new Date(`${today}T${appt.time}`);
              const isPriority = appointmentTime <= new Date();
              
              return (
                <div 
                  key={appt.id} 
                  className={`flex justify-between items-center p-2 rounded text-sm ${
                    isPriority 
                      ? 'border-l-4 border-blue-500 bg-blue-900/20' 
                      : 'border-l-4 border-gray-600'
                  }`}
                >
                  <div className="flex-1">
                    <div className="font-medium truncate">{appt.customer_name}</div>
                    <div className="text-xs text-gray-400 truncate">{appt.customer_phone}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${
                      isPriority ? 'text-blue-400' : 'text-yellow-500'
                    }`}>
                      {appt.time?.slice(0,5) || '--:--'}
                    </div>
                    {isPriority && (
                      <div className="text-xs text-blue-300">PRIOR.</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-2 text-sm">Nenhum agendamento hoje</p>
        )}
      </section>

      {error && (
        <div className="mt-4 p-3 bg-red-900 text-white rounded-lg text-sm">
          <strong>Erro:</strong> {error}
          <button 
            onClick={() => setError(null)}
            className="ml-3 text-xs underline"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}