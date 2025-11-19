"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

// Componente de proteção de rota
function AdminProtected({ children }) {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = () => {
      const authenticated = localStorage.getItem("adminAuthenticated");
      const loginTime = localStorage.getItem("adminLoginTime");
      
      if (authenticated === "true" && loginTime) {
        const loginDate = new Date(loginTime);
        const now = new Date();
        const hoursDiff = (now - loginDate) / (1000 * 60 * 60);
        
        if (hoursDiff < 8) {
          setIsAuthenticated(true);
        } else {
          localStorage.removeItem("adminAuthenticated");
          localStorage.removeItem("adminLoginTime");
          router.push("/admin/login");
        }
      } else {
        router.push("/admin/login");
      }
      setLoading(false);
    };

    checkAuth();
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
        <div className="text-yellow-500 text-xl">Verificando acesso...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
        <div className="text-yellow-500 text-xl">Redirecionando...</div>
      </div>
    );
  }

  return children;
}

function AdminContent() {
  const [status, setStatus] = useState("fechado");
  const [queue, setQueue] = useState({ in_count: 0, out_count: 0 });
  const [appointments, setAppointments] = useState([]);
  const [pendingAppointments, setPendingAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockForm, setBlockForm] = useState({
    date: "",
    start_time: "",
    end_time: "",
    reason: ""
  });
  const [lastUpdate, setLastUpdate] = useState(new Date());
  const [connectionStatus, setConnectionStatus] = useState("Conectando...");
  
  // Estados para notificações
  const [notifications, setNotifications] = useState([]);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [availableRescheduleSlots, setAvailableRescheduleSlots] = useState([]);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  const today = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }, []);

  // Inicializa com a data de hoje
  useEffect(() => {
    setSelectedDate(today);
  }, [today]);

  // Função para carregar todos os dados
  const loadData = async () => {
    try {
      setLoading(true);
      console.log("🔄 Carregando dados...");
      
      // Carrega status
      const { data: statusData, error: statusError } = await supabase
        .from('shop_status')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (statusError) throw statusError;
      if (statusData) {
        setStatus(statusData.status);
      }

      // Carrega fila
      const { data: queueData, error: queueError } = await supabase
        .from('queue_counters')
        .select('*')
        .eq('date', today)
        .maybeSingle();

      if (queueError) throw queueError;
      if (queueData) {
        setQueue(queueData);
      } else {
        const { data: newQueue, error: newQueueError } = await supabase
          .from('queue_counters')
          .insert({ 
            date: today, 
            in_count: 0, 
            out_count: 0 
          })
          .select()
          .single();
        
        if (newQueueError) throw newQueueError;
        if (newQueue) {
          setQueue(newQueue);
        }
      }

      // Carrega agendamentos pendentes
      await loadPendingAppointments();
      
      // Carrega agendamentos para a data selecionada
      await loadAppointmentsByDate(selectedDate);
      
      // Verifica notificações
      await checkNotifications();
      
      setLastUpdate(new Date());
      setConnectionStatus("✅ Conectado");
      
    } catch (err) {
      console.error('Erro ao carregar dados:', err);
      setError(err.message);
      setConnectionStatus("❌ Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  // Carrega agendamentos pendentes
  const loadPendingAppointments = async () => {
    try {
      const { data: appointmentsData, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;

      if (appointmentsData) {
        setPendingAppointments(appointmentsData);
      } else {
        setPendingAppointments([]);
      }
    } catch (err) {
      console.error('Erro ao carregar pendentes:', err);
      setPendingAppointments([]);
    }
  };

  // Carrega agendamentos por data
  const loadAppointmentsByDate = async (date) => {
    try {
      const { data: appointmentsData, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', date)
        .order('time', { ascending: true });

      if (error) throw error;

      if (appointmentsData) {
        setAppointments(appointmentsData);
      } else {
        setAppointments([]);
      }
    } catch (err) {
      console.error('Erro ao carregar agendamentos:', err);
      setAppointments([]);
    }
  };

  // 🔥 SISTEMA DE NOTIFICAÇÕES INTELIGENTES
  const checkNotifications = async () => {
    try {
      const now = new Date();
      const currentTime = now.toTimeString().slice(0, 5);
      const currentDate = now.toISOString().split('T')[0];
      
      console.log("🔔 Verificando notificações...", { currentDate, currentTime });

      // Busca agendamentos confirmados para hoje
      const { data: todayAppointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', currentDate)
        .eq('status', 'confirmed')
        .order('time', { ascending: true });

      if (error) throw error;

      if (!todayAppointments) return;

      const newNotifications = [];

      for (const appointment of todayAppointments) {
        const appointmentTime = appointment.time;
        const appointmentDateTime = new Date(`${currentDate}T${appointmentTime}`);
        const timeDiff = (appointmentDateTime - now) / (1000 * 60); // diferença em minutos

        // Notificação 15 minutos antes
        if (timeDiff <= 15 && timeDiff > 0 && !appointment.notified_15min) {
          newNotifications.push({
            id: `15min-${appointment.id}`,
            type: 'reminder_15min',
            appointment: appointment,
            message: `⏰ Lembrete: ${appointment.customer_name} tem corte em 15min (${appointment.time})`,
            timestamp: new Date()
          });

          // Marca como notificado
          await supabase
            .from('appointments')
            .update({ notified_15min: true, last_notification_sent: new Date().toISOString() })
            .eq('id', appointment.id);
        }

        // Notificação de atraso (15 minutos após o horário)
        if (timeDiff <= -15 && timeDiff > -60 && !appointment.notified_atrasado && appointment.status_atrasado !== 'atrasado') {
          newNotifications.push({
            id: `atrasado-${appointment.id}`,
            type: 'cliente_atrasado',
            appointment: appointment,
            message: `⚠️ CLIENTE ATRASADO: ${appointment.customer_name} não compareceu (${appointment.time})`,
            timestamp: new Date(),
            requiresAction: true
          });

          // Marca como atrasado
          await supabase
            .from('appointments')
            .update({ 
              notified_atrasado: true, 
              status_atrasado: 'atrasado',
              last_notification_sent: new Date().toISOString() 
            })
            .eq('id', appointment.id);
        }
      }

      // Adiciona novas notificações
      if (newNotifications.length > 0) {
        setNotifications(prev => [...newNotifications, ...prev]);
        
        // Mostra notificações do navegador
        newNotifications.forEach(notification => {
          if (Notification.permission === 'granted') {
            new Notification('LEO PRIME - Notificação', {
              body: notification.message,
              icon: '/favicon.ico',
              tag: notification.id
            });
          }
        });
      }

    } catch (err) {
      console.error('Erro ao verificar notificações:', err);
    }
  };

  // Quando a data selecionada muda
  useEffect(() => {
    if (selectedDate) {
      loadAppointmentsByDate(selectedDate);
    }
  }, [selectedDate]);

  // Atualiza status
  const updateStatus = async (newStatus) => {
    try {
      const { error } = await supabase.from('shop_status').insert({ status: newStatus });
      if (error) throw error;
      setStatus(newStatus);
    } catch (err) {
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
        const currentPeople = (currentQueue.in_count || 0) - (currentQueue.out_count || 0);
        if (currentPeople > 0) {
          updateData.out_count = (currentQueue.out_count || 0) + 1;
        } else {
          alert("Não há clientes na barbearia para registrar saída!");
          return;
        }
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

  // Aceitar agendamento
  const acceptAppointment = async (appointmentId) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'confirmed' })
        .eq('id', appointmentId);

      if (error) throw error;

      await loadPendingAppointments();
      await loadAppointmentsByDate(selectedDate);
      
      alert("Agendamento confirmado com sucesso!");
    } catch (err) {
      setError(err.message);
    }
  };

  // Recusar/Cancelar agendamento
  const rejectAppointment = async (appointmentId) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointmentId);

      if (error) throw error;

      await loadPendingAppointments();
      await loadAppointmentsByDate(selectedDate);
      
      alert("Agendamento cancelado com sucesso!");
    } catch (err) {
      setError(err.message);
    }
  };

  // 🔥 AÇÕES PARA CLIENTES ATRASADOS
  const handleClienteCortando = async (appointmentId) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ 
          status_atrasado: 'cortando',
          last_notification_sent: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Remove a notificação
      setNotifications(prev => prev.filter(n => !n.id.includes(appointmentId)));
      
      alert("Cliente marcado como 'Cortando'");
      
      await loadAppointmentsByDate(selectedDate);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleCancelarAtendimento = async (appointmentId) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ 
          status: 'cancelled',
          status_atrasado: 'cancelado_atraso'
        })
        .eq('id', appointmentId);

      if (error) throw error;

      // Remove a notificação
      setNotifications(prev => prev.filter(n => !n.id.includes(appointmentId)));
      
      alert("Atendimento cancelado devido ao atraso");
      
      await loadAppointmentsByDate(selectedDate);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleMensagemWhatsApp = (phone, customerName) => {
    const message = `Olá ${customerName}! Percebemos que você ainda não chegou para seu corte. Ainda pretende comparecer? 😊`;
    const whatsappUrl = `https://wa.me/55${phone}?text=${encodeURIComponent(message)}`;
    window.open(whatsappUrl, '_blank');
  };

  const handleReagendarClick = async (appointment) => {
    setSelectedAppointment(appointment);
    setShowRescheduleModal(true);
    
    // Carrega horários disponíveis
    await loadAvailableRescheduleSlots(appointment.date);
  };

  const loadAvailableRescheduleSlots = async (originalDate) => {
    setRescheduleLoading(true);
    try {
      // Busca agendamentos existentes para a data (apenas confirmados)
      const { data: existingAppointments } = await supabase
        .from('appointments')
        .select('time')
        .eq('date', originalDate)
        .eq('status', 'confirmed');

      // Busca bloqueios para a data
      const { data: blocks } = await supabase
        .from('blocks')
        .select('*')
        .eq('date', originalDate);

      // Busca disponibilidade padrão
      const dateObj = new Date(originalDate);
      const weekday = dateObj.getDay();
      
      const { data: availability } = await supabase
        .from('availability')
        .select('*')
        .eq('weekday', weekday)
        .eq('active', true);

      // Gera slots disponíveis
      let slots = [];
      if (availability && availability.length > 0) {
        availability.forEach(avail => {
          const start = new Date(`1970-01-01T${avail.start_time}`);
          const end = new Date(`1970-01-01T${avail.end_time}`);
          const slotDuration = avail.slot_minutes * 60 * 1000;

          let current = start;
          while (current < end) {
            const timeString = current.toTimeString().slice(0,5);
            
            // Verifica se o horário não está agendado (confirmado)
            const isBooked = existingAppointments?.some(apt => 
              apt.time.slice(0,5) === timeString
            );

            // Verifica se não está bloqueado
            const isBlocked = blocks?.some(block => {
              if (!block.start_time) return true;
              const blockStart = new Date(`1970-01-01T${block.start_time}`);
              const blockEnd = new Date(`1970-01-01T${block.end_time}`);
              const slotTime = new Date(`1970-01-01T${timeString}`);
              return slotTime >= blockStart && slotTime < blockEnd;
            });

            if (!isBooked && !isBlocked) {
              slots.push(timeString);
            }

            current = new Date(current.getTime() + slotDuration);
          }
        });
      }

      setAvailableRescheduleSlots(slots);
    } catch (error) {
      console.error("Erro ao carregar horários:", error);
    } finally {
      setRescheduleLoading(false);
    }
  };

  const handleReagendarConfirm = async (newTime) => {
    if (!selectedAppointment) return;

    try {
      const { error } = await supabase
        .from('appointments')
        .update({ 
          time: newTime,
          status_atrasado: 'reagendado',
          notified_atrasado: true,
          last_notification_sent: new Date().toISOString()
        })
        .eq('id', selectedAppointment.id);

      if (error) throw error;

      // Remove a notificação
      setNotifications(prev => prev.filter(n => !n.id.includes(selectedAppointment.id)));
      
      setShowRescheduleModal(false);
      setSelectedAppointment(null);
      
      alert(`Agendamento reagendado para ${newTime}`);
      
      await loadAppointmentsByDate(selectedDate);
    } catch (err) {
      setError(err.message);
    }
  };

  // Bloquear horário
  const handleBlockTime = async (e) => {
    e.preventDefault();
    try {
      const { error } = await supabase
        .from('blocks')
        .insert([{
          date: blockForm.date,
          start_time: blockForm.start_time,
          end_time: blockForm.end_time,
          reason: blockForm.reason
        }]);

      if (error) throw error;

      setShowBlockModal(false);
      setBlockForm({ date: "", start_time: "", end_time: "", reason: "" });
      alert("Horário bloqueado com sucesso!");
    } catch (err) {
      setError(err.message);
    }
  };

  // Remove notificação individual
  const removeNotification = (notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  // Remove todas as notificações
  const clearAllNotifications = () => {
    setNotifications([]);
  };

  // SOLUÇÃO GARANTIDA - WebSockets + Polling
  useEffect(() => {
    let intervalId;
    let notificationIntervalId;
    let subscription;

    const initializeRealtime = async () => {
      console.log("🚀 Iniciando sistema em tempo real...");
      
      // Primeiro carregamento
      await loadData();

      // Polling como fallback - verifica a cada 5 segundos
      intervalId = setInterval(async () => {
        await loadPendingAppointments();
        await loadAppointmentsByDate(selectedDate);
        setLastUpdate(new Date());
      }, 5000);

      // Verificação de notificações a cada 30 segundos
      notificationIntervalId = setInterval(async () => {
        await checkNotifications();
      }, 30000);

      // Tentativa com WebSockets do Supabase
      try {
        console.log("🔌 Conectando WebSocket...");
        
        subscription = supabase
          .channel('custom-all-channel')
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'appointments'
            },
            async (payload) => {
              console.log('🎯 WebSocket: Mudança detectada:', payload);
              setConnectionStatus("✅ WebSocket Ativo");
              
              await loadPendingAppointments();
              await loadAppointmentsByDate(selectedDate);
              setLastUpdate(new Date());

              if (payload.eventType === 'INSERT' && payload.new.status === 'pending') {
                if (Notification.permission === 'granted') {
                  new Notification('📅 NOVO AGENDAMENTO!', {
                    body: `${payload.new.customer_name}\n${payload.new.date} às ${payload.new.time}`,
                    icon: '/favicon.ico',
                  });
                }
              }
            }
          )
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: 'public',
              table: 'shop_status'
            },
            (payload) => {
              if (payload.new) {
                setStatus(payload.new.status);
                setLastUpdate(new Date());
              }
            }
          )
          .subscribe((status) => {
            console.log('Status da inscrição WebSocket:', status);
            if (status === 'SUBSCRIBED') {
              setConnectionStatus("✅ WebSocket Conectado");
            } else if (status === 'CHANNEL_ERROR') {
              setConnectionStatus("❌ WebSocket Falhou - Usando Polling");
            }
          });

      } catch (websocketError) {
        console.error('Erro no WebSocket:', websocketError);
        setConnectionStatus("❌ WebSocket Falhou - Usando Polling");
      }
    };

    initializeRealtime();

    // Solicitar permissão para notificações
    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // Atalhos de teclado
    const handleKey = (e) => {
      if (e.key === '1') updateQueue('in');
      if (e.key === '2') updateQueue('out');
    };
    window.addEventListener('keydown', handleKey);

    // Cleanup
    return () => {
      console.log("🧹 Limpando listeners...");
      if (intervalId) clearInterval(intervalId);
      if (notificationIntervalId) clearInterval(notificationIntervalId);
      if (subscription) {
        supabase.removeChannel(subscription);
      }
      window.removeEventListener('keydown', handleKey);
    };
  }, [today, selectedDate]);

  // Cálculos para as estatísticas
  const peopleInShop = Math.max(0, (queue?.in_count || 0) - (queue?.out_count || 0));
  const completedCuts = queue?.out_count || 0;
  
  const priorityAppointments = appointments.filter(appt => 
    appt.status === 'confirmed' && appt.date === today
  ).length;

  // Agendamentos de hoje para a lista de cortes
  const todayAppointmentsList = appointments.filter(appt => 
    appt.date === today && appt.status === 'confirmed'
  ).sort((a, b) => a.time.localeCompare(b.time));

  // Função para logout
  const handleLogout = () => {
    localStorage.removeItem("adminAuthenticated");
    localStorage.removeItem("adminLoginTime");
    window.location.href = "/admin/login";
  };

  // Função para forçar atualização manual
  const forceRefresh = async () => {
    setConnectionStatus("🔄 Atualizando manualmente...");
    await loadData();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
        <div className="text-yellow-500 text-xl">Carregando sistema...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white p-4">
      {/* Header com Status de Conexão */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-yellow-500">
          LEO PRIME BARBERSHOP - ADMIN
        </h1>
        <div className="flex gap-2 items-center">
          <div className="text-sm px-2 py-1 rounded border border-yellow-600">
            <span className={connectionStatus.includes("✅") ? "text-green-400" : "text-red-400"}>
              {connectionStatus}
            </span>
            <br />
            <span className="text-gray-400 text-xs">
              Última atualização: {lastUpdate.toLocaleTimeString()}
            </span>
          </div>
          <button
            onClick={forceRefresh}
            className="px-3 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-sm transition-colors"
            title="Forçar atualização"
          >
            🔄
          </button>
          <button
            onClick={handleLogout}
            className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded text-sm transition-colors"
          >
            Sair
          </button>
        </div>
      </div>

      {/* 🔔 NOTIFICAÇÕES */}
      {notifications.length > 0 && (
        <section className="mb-6 p-4 bg-red-900 rounded-lg border border-red-600">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-red-300">
              🔔 {notifications.length} Notificação(ões)
            </h2>
            <div className="flex gap-2">
              <button
                onClick={clearAllNotifications}
                className="px-2 py-1 bg-red-700 text-white rounded text-sm hover:bg-red-600 transition-colors"
              >
                Limpar Todas
              </button>
            </div>
          </div>
          <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
            {notifications.map((notification) => (
              <div key={notification.id} className="flex justify-between items-center p-3 bg-red-800 rounded">
                <div className="flex-1">
                  <div className="font-medium text-white">{notification.message}</div>
                  <div className="text-sm text-red-200">
                    {notification.appointment.customer_phone} • 
                    {new Date(notification.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  {notification.type === 'cliente_atrasado' && (
                    <>
                      <button
                        onClick={() => handleClienteCortando(notification.appointment.id)}
                        className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-500 transition-colors"
                      >
                        Está Cortando
                      </button>
                      <button
                        onClick={() => handleReagendarClick(notification.appointment)}
                        className="px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-500 transition-colors"
                      >
                        Reagendar
                      </button>
                      <button
                        onClick={() => handleMensagemWhatsApp(notification.appointment.customer_phone, notification.appointment.customer_name)}
                        className="px-2 py-1 bg-yellow-600 text-white rounded text-xs hover:bg-yellow-500 transition-colors"
                      >
                        Mensagem
                      </button>
                      <button
                        onClick={() => handleCancelarAtendimento(notification.appointment.id)}
                        className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-500 transition-colors"
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => removeNotification(notification.id)}
                    className="px-2 py-1 bg-gray-600 text-white rounded text-xs hover:bg-gray-500 transition-colors"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      
      {/* 📋 LISTA DE CORTES AGENDADOS HOJE */}
      <section className="mb-6 p-4 bg-blue-900 rounded-lg border border-blue-600">
        <h2 className="text-xl font-semibold text-blue-300 mb-3">
          📋 Cortes Agendados para Hoje ({today})
        </h2>
        {todayAppointmentsList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {todayAppointmentsList.map((appt) => (
              <div key={appt.id} className={`p-3 rounded border ${
                appt.status_atrasado === 'atrasado' ? 'border-red-500 bg-red-900/20' :
                appt.notified_15min ? 'border-yellow-500 bg-yellow-900/20' :
                'border-green-500 bg-green-900/20'
              }`}>
                <div className="font-medium">{appt.customer_name}</div>
                <div className="text-sm text-gray-300">📞 {appt.customer_phone}</div>
                <div className="text-lg font-bold text-white">🕒 {appt.time}</div>
                <div className="text-xs mt-1">
                  {appt.status_atrasado === 'atrasado' ? (
                    <span className="text-red-400">⚠️ ATRASADO</span>
                  ) : appt.notified_15min ? (
                    <span className="text-yellow-400">⏰ Lembrete enviado</span>
                  ) : (
                    <span className="text-green-400">✅ No prazo</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-4">Nenhum corte agendado para hoje</p>
        )}
      </section>

      {/* Notificações de Agendamentos Pendentes */}
      {pendingAppointments.length > 0 && (
        <section className="mb-6 p-4 bg-yellow-900 rounded-lg border border-yellow-600">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-yellow-300">
              ⚠️ {pendingAppointments.length} Agendamento(s) Pendente(s)
            </h2>
          </div>
          <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
            {pendingAppointments.map((appt) => (
              <div key={appt.id} className="flex justify-between items-center p-3 bg-yellow-800 rounded">
                <div className="flex-1">
                  <div className="font-medium text-white">{appt.customer_name}</div>
                  <div className="text-sm text-yellow-200">
                    📞 {appt.customer_phone} - 📅 {appt.date} às 🕒 {appt.time}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptAppointment(appt.id)}
                    className="px-3 py-1 bg-green-600 text-white rounded text-sm hover:bg-green-500 transition-colors"
                  >
                    ✅ Aceitar
                  </button>
                  <button
                    onClick={() => rejectAppointment(appt.id)}
                    className="px-3 py-1 bg-red-600 text-white rounded text-sm hover:bg-red-500 transition-colors"
                  >
                    ❌ Recusar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Seção Status */}
      <section className="mb-6 p-4 bg-gray-900 rounded-lg border border-yellow-600">
        <h2 className="text-xl font-semibold text-yellow-500 mb-3">Status da Barbearia</h2>
        <div className="flex gap-2 flex-wrap">
          {['aberto', 'fechado', 'almoco', 'manutencao'].map((s) => (
            <button
              key={s}
              onClick={() => updateStatus(s)}
              className={`px-3 py-2 rounded text-sm transition-colors ${
                status === s 
                  ? 'bg-yellow-500 text-black font-bold' 
                  : 'bg-gray-800 hover:bg-gray-700'
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() => setShowBlockModal(true)}
            className="px-3 py-2 bg-red-600 text-white rounded text-sm hover:bg-red-500 transition-colors ml-auto"
          >
            Bloquear Horários
          </button>
        </div>
      </section>

      {/* Seção Principal - Pessoas na Barbearia */}
      <section className="mb-6 p-6 bg-gradient-to-br from-yellow-600 to-yellow-800 rounded-lg text-center">
        <h2 className="text-2xl font-bold text-white mb-2">CLIENTES NA BARBEARIA</h2>
        <div className="text-5xl font-bold text-white mb-1">
          {peopleInShop}
        </div>
        <p className="text-yellow-100">Aguardando atendimento</p>
      </section>

      {/* Seção Estatísticas */}
      <section className="mb-6 grid grid-cols-2 gap-4">
        <div className="p-4 bg-yellow-900 rounded-lg border border-yellow-600 text-center">
          <h3 className="text-sm font-semibold text-yellow-300 mb-1">PRIORIDADE</h3>
          <div className="text-2xl font-bold text-white">
            {priorityAppointments}
          </div>
          <p className="text-yellow-200 text-xs mt-1">Agendados para HOJE</p>
        </div>
        <div className="p-4 bg-yellow-900 rounded-lg border border-yellow-600 text-center">
          <h3 className="text-sm font-semibold text-yellow-300 mb-1">CORTES HOJE</h3>
          <div className="text-2xl font-bold text-white">
            {completedCuts}
          </div>
          <p className="text-yellow-200 text-xs mt-1">Realizados</p>
        </div>
      </section>

      {/* Controles de Fila */}
      <section className="mb-6 p-4 bg-gray-900 rounded-lg border border-yellow-600">
        <h2 className="text-lg font-semibold text-yellow-500 mb-3">Controles Rápidos</h2>
        <div className="flex gap-3">
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

      {/* Agendamentos do Dia */}
      <section className="p-4 bg-gray-900 rounded-lg border border-yellow-600">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-yellow-500">
            Agendamentos ({selectedDate})
          </h2>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-400">Hoje: {today}</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="p-2 bg-black rounded border border-yellow-600 text-white text-sm"
            />
          </div>
        </div>
        
        {appointments.length > 0 ? (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {appointments.map((appt) => (
              <div 
                key={appt.id} 
                className={`flex justify-between items-center p-3 rounded border ${
                  appt.status === 'confirmed' 
                    ? appt.status_atrasado === 'atrasado' 
                      ? 'border-red-500 bg-red-900/20' 
                      : 'border-green-500 bg-green-900/20'
                    : appt.status === 'pending'
                    ? 'border-yellow-500 bg-yellow-900/20'
                    : 'border-red-500 bg-red-900/20'
                }`}
              >
                <div className="flex-1">
                  <div className="font-medium">{appt.customer_name}</div>
                  <div className="text-sm text-gray-400">📞 {appt.customer_phone}</div>
                  <div className="text-xs text-gray-500">
                    🕒 {appt.time} - {appt.status === 'confirmed' ? '✅ Confirmado' : appt.status === 'pending' ? '⏳ Pendente' : '❌ Cancelado'}
                    {appt.status_atrasado === 'atrasado' && (
                      <span className="block text-red-400">⚠️ CLIENTE ATRASADO</span>
                    )}
                  </div>
                </div>
                <div className="flex gap-2">
                  {appt.status === 'pending' && (
                    <>
                      <button
                        onClick={() => acceptAppointment(appt.id)}
                        className="px-2 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-500 transition-colors"
                      >
                        ✓
                      </button>
                      <button
                        onClick={() => rejectAppointment(appt.id)}
                        className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-500 transition-colors"
                      >
                        ✕
                      </button>
                    </>
                  )}
                  {appt.status === 'confirmed' && (
                    <button
                      onClick={() => rejectAppointment(appt.id)}
                      className="px-2 py-1 bg-red-600 text-white rounded text-xs hover:bg-red-500 transition-colors"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-4 text-sm">Nenhum agendamento para esta data</p>
        )}
      </section>

      {/* Modal de Bloqueio */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 p-6 rounded-lg border border-yellow-600 max-w-md w-full">
            <h3 className="text-xl font-bold text-yellow-500 mb-4">Bloquear Horários</h3>
            <form onSubmit={handleBlockTime}>
              <div className="space-y-4">
                <div>
                  <label className="block text-white mb-2">Data</label>
                  <input
                    type="date"
                    value={blockForm.date}
                    onChange={(e) => setBlockForm({...blockForm, date: e.target.value})}
                    className="w-full p-3 bg-black rounded border border-yellow-600 text-white"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-white mb-2">Hora Início</label>
                    <input
                      type="time"
                      value={blockForm.start_time}
                      onChange={(e) => setBlockForm({...blockForm, start_time: e.target.value})}
                      className="w-full p-3 bg-black rounded border border-yellow-600 text-white"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-white mb-2">Hora Fim</label>
                    <input
                      type="time"
                      value={blockForm.end_time}
                      onChange={(e) => setBlockForm({...blockForm, end_time: e.target.value})}
                      className="w-full p-3 bg-black rounded border border-yellow-600 text-white"
                      required
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-white mb-2">Motivo (opcional)</label>
                  <input
                    type="text"
                    value={blockForm.reason}
                    onChange={(e) => setBlockForm({...blockForm, reason: e.target.value})}
                    className="w-full p-3 bg-black rounded border border-yellow-600 text-white"
                    placeholder="Ex: Manutenção, Folga, etc."
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  className="flex-1 py-3 bg-red-600 hover:bg-red-500 text-white font-bold rounded transition-colors"
                >
                  Bloquear Horário
                </button>
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Reagendamento */}
      {showRescheduleModal && selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-gray-900 p-6 rounded-lg border border-yellow-600 max-w-md w-full">
            <h3 className="text-xl font-bold text-yellow-500 mb-4">
              Reagendar {selectedAppointment.customer_name}
            </h3>
            <p className="text-white mb-4">
              Horário original: {selectedAppointment.time}
            </p>
            
            {rescheduleLoading ? (
              <p className="text-yellow-500 text-center">Carregando horários disponíveis...</p>
            ) : availableRescheduleSlots.length > 0 ? (
              <div className="max-h-60 overflow-y-auto">
                <h4 className="text-white mb-2">Horários disponíveis:</h4>
                <div className="grid grid-cols-3 gap-2">
                  {availableRescheduleSlots.map((slot) => (
                    <button
                      key={slot}
                      onClick={() => handleReagendarConfirm(slot)}
                      className="p-2 bg-green-600 hover:bg-green-500 text-white rounded text-sm transition-colors"
                    >
                      {slot}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-red-400 text-center">Nenhum horário disponível para esta data</p>
            )}
            
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowRescheduleModal(false)}
                className="flex-1 py-3 bg-gray-600 hover:bg-gray-500 text-white font-bold rounded transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

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

      <div className="mt-6 text-center text-gray-500 text-xs">
        <p>Sistema de notificações inteligentes - Lembretes 15min + Clientes Atrasados</p>
      </div>
    </div>
  );
}

export default function AdminPage() {
  return (
    <AdminProtected>
      <AdminContent />
    </AdminProtected>
  );
}