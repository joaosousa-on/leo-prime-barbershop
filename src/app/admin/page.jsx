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

  // Calcular pessoas na barbearia e prioridades
  const peopleInShop = (queue?.in_count || 0) - (queue?.out_count || 0);
  const priorityAppointments = appointments.filter(appt => 
    // Considerar como prioridade se o horário já passou ou está próximo
    new Date(`${today}T${appt.time}`) <= new Date()
  ).length;

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
        // Cria registro inicial para hoje
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
    <div className="min-h-screen bg-black text-white p-6">
      <h1 className="text-3xl font-bold text-yellow-500 mb-8 text-center">
        LEO PRIME BARBERSHOP
      </h1>
      
      {/* Seção Status */}
      <section className="mb-8 p-6 bg-gray-900 rounded-lg border border-yellow-600">
        <h2 className="text-xl font-semibold text-yellow-500 mb-4">Status da Barbearia</h2>
        <div className="flex gap-3 flex-wrap">
          {['aberto', 'fechado', 'almoco', 'manutencao'].map((s) => (
            <button
              key={s}
              onClick={() => updateStatus(s)}
              className={`px-4 py-2 rounded transition-colors ${
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

      {/* Seção Principal - Pessoas na Barbearia */}
      <section className="mb-8 p-8 bg-gradient-to-br from-yellow-600 to-yellow-800 rounded-lg text-center">
        <h2 className="text-2xl font-bold text-white mb-4">PESSOAS NA BARBEARIA</h2>
        <div className="text-6xl font-bold text-white mb-2">
          {peopleInShop}
        </div>
        <p className="text-yellow-100 text-lg">Clientes aguardando</p>
      </section>

      {/* Seção Estatísticas */}
      <section className="mb-8 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Prioridades */}
        <div className="p-6 bg-blue-900 rounded-lg border border-blue-600">
          <h3 className="text-lg font-semibold text-blue-300 mb-2">PRIORIDADES</h3>
          <div className="text-3xl font-bold text-white text-center">
            {priorityAppointments}
          </div>
          <p className="text-blue-200 text-center text-sm mt-2">Clientes com hora marcada</p>
        </div>

        {/* Cortes Realizados */}
        <div className="p-6 bg-green-900 rounded-lg border border-green-600">
          <h3 className="text-lg font-semibold text-green-300 mb-2">CORTES HOJE</h3>
          <div className="text-3xl font-bold text-white text-center">
            {queue?.out_count || 0}
          </div>
          <p className="text-green-200 text-center text-sm mt-2">Cortes realizados</p>
        </div>
      </section>

      {/* Controles de Fila */}
      <section className="mb-8 p-6 bg-gray-900 rounded-lg border border-yellow-600">
        <h2 className="text-xl font-semibold text-yellow-500 mb-4">Controles</h2>
        <div className="flex gap-4 justify-center flex-wrap">
          <button
            onClick={() => updateQueue('in')}
            className="px-6 py-4 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg transition-colors text-lg"
          >
            👥 +1 Entrada (1)
          </button>
          <button
            onClick={() => updateQueue('out')}
            className="px-6 py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-lg transition-colors text-lg"
          >
            ✂️ +1 Saída (2)
          </button>
        </div>
        <div className="mt-4 text-center text-gray-400 text-sm">
          Use as teclas 1 e 2 para controle rápido
        </div>
      </section>

      {/* Agendamentos do Dia */}
      <section className="p-6 bg-gray-900 rounded-lg border border-yellow-600">
        <h2 className="text-xl font-semibold text-yellow-500 mb-4">
          Agendamentos de Hoje ({appointments.length})
        </h2>
        {appointments.length > 0 ? (
          <div className="space-y-3 max-h-60 overflow-y-auto">
            {appointments.map((appt) => {
              const appointmentTime = new Date(`${today}T${appt.time}`);
              const isPriority = appointmentTime <= new Date();
              
              return (
                <div 
                  key={appt.id} 
                  className={`flex justify-between items-center p-3 rounded border ${
                    isPriority 
                      ? 'border-blue-500 bg-blue-900/20' 
                      : 'border-gray-700'
                  }`}
                >
                  <div>
                    <div className="font-medium">{appt.customer_name}</div>
                    <div className="text-sm text-gray-400">{appt.customer_phone}</div>
                  </div>
                  <div className="text-right">
                    <div className={`font-semibold ${
                      isPriority ? 'text-blue-400' : 'text-yellow-500'
                    }`}>
                      {appt.time?.slice(0,5) || '--:--'}
                    </div>
                    {isPriority && (
                      <div className="text-xs text-blue-300">PRIORIDADE</div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-4">Nenhum agendamento para hoje</p>
        )}
      </section>

      {error && (
        <div className="mt-6 p-4 bg-red-900 text-white rounded-lg">
          <strong>Erro:</strong> {error}
          <button 
            onClick={() => setError(null)}
            className="ml-4 text-sm underline"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}