"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

// --- FUNÇÕES AUXILIARES ---

// Função para pegar a data local correta (Brasil)
const getLocalDate = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

// Hook personalizado para autenticação
function useAdminAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    const checkAuth = () => {
      if (typeof window === "undefined") {
        setLoading(false);
        return;
      }

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

  return { isAuthenticated, loading };
}

// Componente de proteção de rota
function AdminProtected({ children }) {
  const { isAuthenticated, loading } = useAdminAuth();

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
  const [lastUpdate, setLastUpdate] = useState(null);
  const [connectionStatus, setConnectionStatus] = useState("Conectando...");
  const [isClient, setIsClient] = useState(false);
  
  // Estados para notificações
  const [notifications, setNotifications] = useState([]);
  const [showRescheduleModal, setShowRescheduleModal] = useState(false);
  const [selectedAppointment, setSelectedAppointment] = useState(null);
  const [availableRescheduleSlots, setAvailableRescheduleSlots] = useState([]);
  const [rescheduleLoading, setRescheduleLoading] = useState(false);

  // Estado para confirmação de chegada
  const [arrivalConfirmations, setArrivalConfirmations] = useState([]);

  // Estado para controlar se já carregou os dados iniciais
  const [initialLoadComplete, setInitialLoadComplete] = useState(false);

  // NOVOS ESTADOS PARA BLOQUEIO
  const [isShopBlocked, setIsShopBlocked] = useState(false);
  const [blockMessage, setBlockMessage] = useState("");
  const [showBlockShopModal, setShowBlockShopModal] = useState(false);
  const [unblockLoading, setUnblockLoading] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const today = useMemo(() => getLocalDate(), []);

  const formatTimeSafe = (date) => {
    if (!date || !isClient) return "--:--:--";
    return date.toLocaleTimeString();
  };

  useEffect(() => {
    if (isClient) {
      setSelectedDate(today);
    }
  }, [isClient, today]);

  const validateAndFormatDate = (dateString) => {
    if (!dateString) return today;
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return today;
      return dateString;
    } catch {
      return today;
    }
  };

  // --- FUNÇÃO WHATSAPP ---
  const sendWhatsAppMessage = (phone, message) => {
    try {
      if (!phone) return;
      let cleanPhone = phone.replace(/\D/g, '');
      if (cleanPhone.length < 12 || !cleanPhone.startsWith('55')) {
        cleanPhone = `55${cleanPhone}`;
      }
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://wa.me/${cleanPhone}?text=${encodedMessage}`;
      const newWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      if (!newWindow) {
        alert("Popup bloqueado! Por favor, permita popups para este site para abrir o WhatsApp.");
      }
    } catch (err) {
      console.error("❌ Erro ao enviar mensagem WhatsApp:", err);
      alert("Erro ao abrir WhatsApp. Verifique o número do cliente.");
    }
  };

  // Função auxiliar para mensagens WhatsApp
  const handleMensagemWhatsApp = (phone, name) => {
    const message = `Olá ${name}! Tudo bem?\n\nEstamos entrando em contato da LEO PRIME BARBERSHOP para confirmar sua presença hoje.\n\nPoderia nos confirmar se virá para o corte?`;
    sendWhatsAppMessage(phone, message);
  };

  // --- FUNÇÕES DE BLOQUEIO ---

  const checkShopBlockStatus = async () => {
    try {
      const currentDate = getLocalDate();
      const { data: activeBlocks, error } = await supabase
        .from('blocks')
        .select('id, date, reason, start_time, end_time')
        .eq('date', currentDate)
        .eq('reason', 'BLOQUEIO_GERAL')
        .limit(1);

      if (error) {
        console.log('ℹ️ Erro ao ler bloqueios:', JSON.stringify(error, null, 2));
        return;
      }

      if (!activeBlocks || activeBlocks.length === 0) {
        setIsShopBlocked(false);
        setBlockMessage("");
        return;
      }

      const latestBlock = activeBlocks[0];
      setIsShopBlocked(true);
      setBlockMessage(latestBlock.reason || "Barbearia temporariamente fechada");
    } catch (error) {
      console.log('ℹ️ Erro geral bloqueio:', error);
    }
  };

  const blockShopAppointments = async (message) => {
    try {
      setUnblockLoading(true);
      const currentDate = getLocalDate();
      const blockData = {
        date: currentDate,
        start_time: "00:00:00",
        end_time: "23:59:59",
        reason: "BLOQUEIO_GERAL"
      };

      await supabase.from('blocks').delete().eq('date', currentDate).eq('reason', 'BLOQUEIO_GERAL');
      const { error: insertError } = await supabase.from('blocks').insert([blockData]);

      if (insertError) throw insertError;

      setIsShopBlocked(true);
      setBlockMessage(message || "Agendamentos suspensos");
      setShowBlockShopModal(false);
      alert("🚫 AGENDAMENTOS BLOQUEADOS!");
    } catch (err) {
      console.error('❌ Erro detalhado ao bloquear:', JSON.stringify(err, null, 2));
      alert(`Erro ao bloquear: ${err.message || 'Verifique o console'}`);
    } finally {
      setUnblockLoading(false);
    }
  };

  const unblockShopAppointments = async () => {
    try {
      setUnblockLoading(true);
      const currentDate = getLocalDate();
      const { error: deleteError } = await supabase
        .from('blocks')
        .delete()
        .eq('date', currentDate)
        .eq('reason', 'BLOQUEIO_GERAL');

      if (deleteError) throw deleteError;

      setIsShopBlocked(false);
      setBlockMessage("");
      alert("✅ AGENDAMENTOS LIBERADOS!");
    } catch (err) {
      console.error('❌ Erro detalhado ao desbloquear:', JSON.stringify(err, null, 2));
      alert("Erro ao desbloquear.");
    } finally {
      setUnblockLoading(false);
    }
  };

  // --- FUNÇÕES DE FILA ---

  const createNewQueueEntry = async () => {
    try {
      const { data: newQueue, error: newQueueError } = await supabase
        .from('queue_counters')
        .insert({ 
          date: today, 
          in_count: 0, 
          out_count: 0
        })
        .select()
        .single();
      
      if (newQueueError) {
        if (newQueueError.code === '23505') {
          const { data: existingQueue } = await supabase
            .from('queue_counters')
            .select('*')
            .eq('date', today)
            .single();
          if (existingQueue) setQueue(existingQueue);
          return;
        }
        setQueue({ in_count: 0, out_count: 0 });
        return;
      }
      
      if (newQueue) setQueue(newQueue);
    } catch (err) {
      console.error('❌ Erro ao criar fila:', JSON.stringify(err, null, 2));
    }
  };

  const loadQueueData = async () => {
    try {
      const { data: queueData, error: queueError } = await supabase
        .from('queue_counters')
        .select('*')
        .eq('date', today)
        .maybeSingle();

      if (queueError) {
        if (queueError.code === '42P01') {
          setQueue({ in_count: 0, out_count: 0 });
          return;
        }
        await createNewQueueEntry();
        return;
      }

      if (queueData) {
        setQueue(queueData);
      } else {
        await createNewQueueEntry();
      }
    } catch (err) {
      setQueue({ in_count: 0, out_count: 0 });
    }
  };

  const updateQueue = async (type) => {
    try {
      let { data: currentQueue } = await supabase
        .from('queue_counters')
        .select('*')
        .eq('date', today)
        .maybeSingle();

      if (!currentQueue) {
        if (type === 'out') {
          alert("Não há clientes na barbearia para registrar saída!");
          return;
        }

        const { data: newQueue, error: createError } = await supabase
          .from('queue_counters')
          .insert({
            date: today,
            in_count: 1,
            out_count: 0
          })
          .select()
          .single();

        if (createError) {
           if (createError.code === '23505') {
              await updateQueue(type); 
              return;
           }
           throw createError;
        }

        setQueue(newQueue);
        return;
      }

      const currentIn = currentQueue.in_count || 0;
      const currentOut = currentQueue.out_count || 0;
      const currentPeople = currentIn - currentOut;

      const updateData = {};

      if (type === 'in') {
        updateData.in_count = currentIn + 1;
      } else if (type === 'out') {
        if (currentPeople > 0) {
          updateData.out_count = currentOut + 1;
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
      console.error('❌ Erro updateQueue:', JSON.stringify(err, null, 2));
      setError(`Erro ao atualizar fila: ${err.message}`);
      await loadQueueData();
    }
  };

  const confirmArrival = async (appointmentId, customerName, customerPhone) => {
    try {
      const { error: appointmentError } = await supabase
        .from('appointments')
        .update({ 
          status_atrasado: 'presente',
          last_notification_sent: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (appointmentError) throw appointmentError;

      await updateQueue('in');

      setArrivalConfirmations(prev => prev.filter(id => id !== appointmentId));
      setAppointments(prev => prev.filter(appt => appt.id !== appointmentId));
      
      alert(`Cliente ${customerName} confirmado!`);
      
    } catch (err) {
      console.error('❌ Erro confirmar chegada:', JSON.stringify(err, null, 2));
      setError(err.message);
    }
  };

  // --- CARREGAMENTO DE DADOS ---

  const loadData = async () => {
    try {
      setLoading(true);
      
      const { data: statusData } = await supabase
        .from('shop_status')
        .select('*')
        .limit(1)
        .single();

      if (statusData) setStatus(statusData.status);

      await loadQueueData();
      await loadPendingAppointments();
      const validDate = validateAndFormatDate(selectedDate);
      await loadAppointmentsByDate(validDate);
      await checkNotifications();
      await checkArrivalConfirmations();
      await checkShopBlockStatus();
      
      setLastUpdate(new Date());
      setConnectionStatus("✅ Conectado");
      setInitialLoadComplete(true);
      
    } catch (err) {
      console.error('❌ Erro ao carregar dados:', JSON.stringify(err, null, 2));
      setError(err.message);
      setConnectionStatus("❌ Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  const loadAppointmentsByDate = async (date) => {
    try {
      const validDate = validateAndFormatDate(date);
      const { data: appointmentsData, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', validDate)
        .eq('status', 'confirmed')
        .neq('status_atrasado', 'presente')
        .order('time', { ascending: true });

      if (error) throw error;
      setAppointments(appointmentsData || []);
    } catch (err) {
      setAppointments([]);
    }
  };

  const loadPendingAppointments = async () => {
    try {
      const { data: appointmentsData, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('status', 'pending')
        .order('id', { ascending: false });

      if (error) throw error;
      setPendingAppointments(appointmentsData || []);
    } catch (err) {
      setPendingAppointments([]);
    }
  };

  const checkArrivalConfirmations = async () => {
    try {
      const now = new Date();
      const currentDate = getLocalDate();
      const { data: todayAppointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', currentDate)
        .eq('status', 'confirmed')
        .neq('status_atrasado', 'presente')
        .order('time', { ascending: true });

      if (!todayAppointments) return;

      const newConfirmations = [];
      const nowMinutes = now.getHours() * 60 + now.getMinutes();

      for (const appointment of todayAppointments) {
        const [hours, minutes] = appointment.time.split(':').map(Number);
        const appointmentMinutes = hours * 60 + minutes;
        
        if (nowMinutes >= appointmentMinutes + 10 && !arrivalConfirmations.includes(appointment.id)) {
          newConfirmations.push(appointment.id);
        }
      }

      if (newConfirmations.length > 0) {
        setArrivalConfirmations(prev => [...prev, ...newConfirmations]);
      }
    } catch (err) {
      console.error('❌ Erro checkArrival:', JSON.stringify(err, null, 2));
    }
  };

  const checkNotifications = async () => {
    try {
      const now = new Date();
      const currentDate = getLocalDate();
      const { data: todayAppointments } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', currentDate)
        .eq('status', 'confirmed')
        .order('time', { ascending: true });

      if (!todayAppointments) return;

      const newNotifications = [];

      for (const appointment of todayAppointments) {
        const appointmentTime = appointment.time;
        const appointmentDateTime = new Date(`${currentDate}T${appointmentTime}`);
        const timeDiff = (appointmentDateTime - now) / (1000 * 60);

        if (timeDiff <= 15 && timeDiff > 0 && !appointment.notified_15min) {
          newNotifications.push({
            id: `15min-${appointment.id}`,
            type: 'reminder_15min',
            appointment: appointment,
            message: `⏰ Lembrete: ${appointment.customer_name} tem corte em 15min (${appointment.time})`,
            timestamp: new Date(),
            color: 'yellow'
          });

          await supabase
            .from('appointments')
            .update({ notified_15min: true, last_notification_sent: new Date().toISOString() })
            .eq('id', appointment.id);
        }

        if (timeDiff <= -10 && timeDiff > -60 && !appointment.notified_atrasado && appointment.status_atrasado !== 'atrasado') {
          newNotifications.push({
            id: `atrasado-${appointment.id}`,
            type: 'cliente_atrasado',
            appointment: appointment,
            message: `⚠️ CLIENTE ATRASADO: ${appointment.customer_name} não compareceu (${appointment.time})`,
            timestamp: new Date(),
            requiresAction: true,
            color: 'black'
          });

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

      if (newNotifications.length > 0) {
        setNotifications(prev => [...newNotifications, ...prev]);
      }
    } catch (err) {
      console.error('❌ Erro checkNotifications:', JSON.stringify(err, null, 2));
    }
  };

  // --- ACEITAR / RECUSAR AGENDAMENTOS ---

  const acceptAppointment = async (appointmentId) => {
    try {
      const appointment = pendingAppointments.find(a => a.id === appointmentId);
      if (!appointment) {
        alert("Agendamento não encontrado na lista local.");
        return;
      }

      const confirmationMessage = `✅ *AGENDAMENTO CONFIRMADO!*\n\nOlá ${appointment.customer_name}! 👋\n\nÉ com grande satisfação que informamos que seu agendamento na *LEO PRIME BARBERSHOP* foi *CONFIRMADO COM SUCESSO!* 🎉\n\n📅 *Data:* ${appointment.date}\n🕒 *Horário:* ${appointment.time}\n\n💈 *Serviço:* Corte de Cabelo\n\n📍 *Endereço:* Rua São José, Jardim Nova Esperança - Salvador/BA\n\n📋 *Informações importantes:*\n• Chegue com 5 minutos de antecedência\n• Traga este comprovante consigo\n• Em caso de imprevisto, entre em contato conosco\n\nAgradecemos pela confiança e preferência! 💈✂️\n\n*LEO PRIME BARBERSHOP*\n*Transformando estilo, elevando autoestima!*`;

      const { error } = await supabase
        .from('appointments')
        .update({ status: 'confirmed', status_atrasado: 'confirmed' })
        .eq('id', appointmentId);

      if (error) throw error;

      sendWhatsAppMessage(appointment.customer_phone, confirmationMessage);
      
      await loadPendingAppointments();
      const validDate = validateAndFormatDate(selectedDate);
      await loadAppointmentsByDate(validDate);
      
      alert("Agendamento confirmado e mensagem enviada ao cliente!");
    } catch (err) {
      console.error('❌ Erro ao aceitar:', JSON.stringify(err, null, 2));
      setError(err.message);
    }
  };

  const rejectAppointment = async (appointmentId) => {
    try {
      const appointment = pendingAppointments.find(a => a.id === appointmentId) || 
                         appointments.find(a => a.id === appointmentId);
      if (!appointment) {
        alert("Agendamento não encontrado.");
        return;
      }

      const cancellationMessage = `❌ *AGENDAMENTO CANCELADO*\n\nOlá ${appointment.customer_name}!\n\nLamentamos informar que seu agendamento para *${appointment.date}* às *${appointment.time}* foi *cancelado*.\n\n📋 *Informações:*\n• Data: ${appointment.date}\n• Horário: ${appointment.time}\n\n🔄 *Como proceder:*\n• Entre em contato conosco para verificar outros horários disponíveis\n• Acesse nosso sistema de agendamento online\n• Visite nossa barbearia para agendamento presencial\n\n📞 *Contato:* (71) 99999-9999\n\nPedimos desculpas pelo inconveniente e esperamos poder atendê-lo em breve!\n\n*LEO PRIME BARBERSHOP*\n*Sempre à disposição para melhor servi-lo!*`;

      // Ao mudar para 'cancelled', o horário é liberado automaticamente
      // pois as funções de verificação só buscam 'confirmed' e 'pending'
      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointmentId);

      if (error) throw error;

      sendWhatsAppMessage(appointment.customer_phone, cancellationMessage);
      
      await loadPendingAppointments();
      const validDate = validateAndFormatDate(selectedDate);
      await loadAppointmentsByDate(validDate);
      
      alert("Agendamento cancelado e mensagem enviada ao cliente! O horário está disponível para novos agendamentos.");
    } catch (err) {
      console.error('❌ Erro ao cancelar:', JSON.stringify(err, null, 2));
      setError(`Erro ao cancelar: ${err.message}`);
    }
  };

  // --- OUTRAS FUNÇÕES ---

  const updateStatus = async (newStatus) => {
    try {
      const { error } = await supabase.from('shop_status').insert({ status: newStatus });
      if (error) throw error;
      setStatus(newStatus);
    } catch (err) {
      console.error('❌ Erro status:', JSON.stringify(err, null, 2));
      setError(err.message);
    }
  };

  const handleReagendarClick = async (appointment) => {
    setSelectedAppointment(appointment);
    setShowRescheduleModal(true);
    await loadAvailableRescheduleSlots(appointment.date);
  };

  const loadAvailableRescheduleSlots = async (originalDate) => {
    setRescheduleLoading(true);
    try {
      const validDate = validateAndFormatDate(originalDate);
      
      // --- MUDANÇA AQUI ---
      // Agora buscamos 'confirmed' E 'pending' para bloquear o horário.
      // Se o status for 'cancelled', ele NÃO vem nessa lista, então o horário fica livre.
      const { data: existingAppointments } = await supabase
        .from('appointments')
        .select('time')
        .eq('date', validDate)
        .in('status', ['confirmed', 'pending']); // ANTES: .eq('status', 'confirmed')

      const { data: blocks } = await supabase.from('blocks').select('*').eq('date', validDate);
      const dateObj = new Date(validDate);
      const weekday = dateObj.getDay();
      const { data: availability } = await supabase
        .from('availability')
        .select('*')
        .eq('weekday', weekday)
        .eq('active', true);

      let slots = [];
      if (availability && availability.length > 0) {
        availability.forEach(avail => {
          const start = new Date(`1970-01-01T${avail.start_time}`);
          const end = new Date(`1970-01-01T${avail.end_time}`);
          const slotDuration = avail.slot_minutes * 60 * 1000;
          let current = start;
          while (current < end) {
            const timeString = current.toTimeString().slice(0,5);
            
            // Verifica se o horário está ocupado por um agendamento CONFIRMADO ou PENDENTE
            const isBooked = existingAppointments?.some(apt => 
              apt.time.slice(0,5) === timeString // Removida a checagem extra de status aqui, pois já filtramos no banco
            );
            
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

      setNotifications(prev => prev.filter(n => !n.id.includes(selectedAppointment.id)));
      setShowRescheduleModal(false);
      setSelectedAppointment(null);
      alert(`Agendamento reagendado para ${newTime}`);
      const validDate = validateAndFormatDate(selectedDate);
      await loadAppointmentsByDate(validDate);
    } catch (err) {
      console.error('❌ Erro reagendar:', JSON.stringify(err, null, 2));
      setError(err.message);
    }
  };

  const removeNotification = (notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  const resetDailyCounter = async () => {
    if (window.confirm("Tem certeza que deseja ZERAR o contador de clientes de hoje?")) {
      try {
        const { data, error } = await supabase
          .from('queue_counters')
          .update({ 
            in_count: 0, 
            out_count: 0
          })
          .eq('date', today)
          .select()
          .single();

        if (error) throw error;
        setQueue(data);
        alert("✅ Contador zerado com sucesso!");
      } catch (err) {
        console.error('❌ Erro zerar:', JSON.stringify(err, null, 2));
        setError(`Erro ao zerar contador: ${err.message}`);
      }
    }
  };

  // SISTEMA DE TEMPO REAL
  useEffect(() => {
    if (!isClient) return;
    let intervalId;
    let confirmationIntervalId;
    let subscription;

    const initializeRealtime = async () => {
      await loadData();
      intervalId = setInterval(async () => {
        if (initialLoadComplete) {
          await loadPendingAppointments();
          const validDate = validateAndFormatDate(selectedDate);
          await loadAppointmentsByDate(validDate);
          setLastUpdate(new Date());
        }
      }, 5000);
      confirmationIntervalId = setInterval(async () => {
        await checkArrivalConfirmations();
      }, 60000);

      try {
        subscription = supabase
          .channel('admin-realtime')
          .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'appointments' }, async (payload) => {
              setConnectionStatus("✅ WebSocket Ativo");
              await loadPendingAppointments();
              setLastUpdate(new Date());
              if (Notification.permission === 'granted') {
                new Notification('📅 NOVO AGENDAMENTO!', {
                  body: `${payload.new.customer_name}\n${payload.new.date} às ${payload.new.time}`,
                  icon: '/favicon.ico',
                });
              }
              if (payload.new.status === 'pending') {
                const newNotification = {
                  id: `novo-${payload.new.id}`,
                  type: 'novo_agendamento',
                  appointment: payload.new,
                  message: `📅 NOVO AGENDAMENTO: ${payload.new.customer_name} - ${payload.new.date} às ${payload.new.time}`,
                  timestamp: new Date(),
                  color: 'yellow'
                };
                setNotifications(prev => [newNotification, ...prev]);
              }
            }
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_status' }, (payload) => {
              if (payload.new) {
                setStatus(payload.new.status);
                setLastUpdate(new Date());
              }
            }
          )
          .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks' }, async () => {
              await checkShopBlockStatus();
            }
          )
          .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'appointments' }, async (payload) => {
              if (payload.new.status === 'cancelled') {
                await loadPendingAppointments();
                const validDate = validateAndFormatDate(selectedDate);
                await loadAppointmentsByDate(validDate);
                setLastUpdate(new Date());
              }
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') setConnectionStatus("✅ WebSocket Conectado");
            else if (status === 'CHANNEL_ERROR') setConnectionStatus("🔄 Usando Polling (5s)");
          });
      } catch (websocketError) {
        setConnectionStatus("🔄 Usando Polling (5s)");
      }
    };

    initializeRealtime();

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    const handleKey = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === '1') { e.preventDefault(); updateQueue('in'); }
      if (e.key === '2') { e.preventDefault(); updateQueue('out'); }
    };

    window.addEventListener('keydown', handleKey);

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (confirmationIntervalId) clearInterval(confirmationIntervalId);
      if (subscription) supabase.removeChannel(subscription);
      window.removeEventListener('keydown', handleKey);
    };
  }, [today, selectedDate, isClient, initialLoadComplete]);

  const peopleInShop = Math.max(0, (queue?.in_count || 0) - (queue?.out_count || 0));
  const completedCuts = queue?.out_count || 0;
  const priorityAppointments = appointments.filter(appt => appt.status === 'confirmed' && appt.date === today).length;
  const todayAppointmentsList = appointments.filter(appt => appt.date === today && appt.status === 'confirmed').sort((a, b) => a.time.localeCompare(b.time));
  const forceRefresh = async () => {
    setConnectionStatus("🔄 Atualizando manualmente...");
    await loadData();
  };

  const getNotificationStyle = (notification) => {
    if (notification.color === 'yellow') {
      return { backgroundColor: "#1a1a1a", borderColor: "#FFD700", color: "#FFD700" };
    } else {
      return { backgroundColor: "#000", borderColor: "#FFD700", color: "#FFD700" };
    }
  };

  if (!isClient) return <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">Carregando...</div>;
  if (loading && !initialLoadComplete) return <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">Carregando sistema...</div>;

  return (
    <div className="min-h-screen bg-black text-white p-4">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold" style={{ color: "#FFD700" }}>LEO PRIME BARBERSHOP - ADMIN</h1>
        <div className="flex gap-2 items-center">
          <div className="text-sm px-2 py-1 rounded border" style={{ borderColor: "#FFD700" }}>
            <span className={connectionStatus.includes("✅") ? "text-green-400" : "text-yellow-400"}>{connectionStatus}</span>
            <br />
            <span className="text-gray-400 text-xs">Última atualização: {formatTimeSafe(lastUpdate)}</span>
          </div>
          <button onClick={forceRefresh} className="px-3 py-1 rounded text-sm font-bold border border-yellow-500 text-yellow-500 bg-black">🔄</button>
          <button onClick={() => { localStorage.removeItem("adminAuthenticated"); localStorage.removeItem("adminLoginTime"); window.location.href = "/admin/login"; }} className="px-4 py-2 rounded text-sm font-bold bg-red-600 text-black">Sair</button>
        </div>
      </div>

      {/* SEÇÃO: Status de Bloqueio */}
      <section className="mb-6 p-4 rounded-lg border" style={{ borderColor: isShopBlocked ? "#FF0000" : "#FFD700", backgroundColor: isShopBlocked ? "#1a0000" : "#1a1a1a" }}>
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-semibold" style={{ color: isShopBlocked ? "#FF0000" : "#FFD700" }}>
              {isShopBlocked ? "🚫 AGENDAMENTOS BLOQUEADOS" : "✅ AGENDAMENTOS LIBERADOS"}
            </h2>
            {isShopBlocked && blockMessage && <p className="text-red-300 mt-1">{blockMessage}</p>}
            {!isShopBlocked && <p className="text-green-300 mt-1">Clientes podem agendar normalmente</p>}
          </div>
          <div className="flex gap-2">
            {!isShopBlocked ? (
              <button onClick={() => setShowBlockShopModal(true)} className="px-4 py-2 rounded text-sm font-bold bg-red-600 text-black">🚫 Bloquear Agendamentos</button>
            ) : (
              <button onClick={unblockShopAppointments} disabled={unblockLoading} className="px-4 py-2 rounded text-sm font-bold bg-green-500 text-black">{unblockLoading ? "🔄..." : "✅ Desbloquear"}</button>
            )}
          </div>
        </div>
      </section>

      {/* Seção de Confirmações de Chegada */}
      {arrivalConfirmations.length > 0 && (
        <section className="mb-6 p-4 rounded-lg border bg-gray-900 border-yellow-500">
          <h2 className="text-xl font-semibold text-yellow-500">🕒 {arrivalConfirmations.length} Cliente(s) para Confirmar Chegada</h2>
          <div className="mt-2 space-y-2">
            {appointments.filter(appt => arrivalConfirmations.includes(appt.id)).map((appt) => (
              <div key={appt.id} className="flex justify-between items-center p-3 rounded bg-black border border-yellow-500">
                <div className="flex-1">
                  <div className="font-medium text-white">{appt.customer_name}</div>
                  <div className="text-sm text-yellow-500">📞 {appt.customer_phone} • 🕒 {appt.time}</div>
                  <div className="text-xs mt-1 text-yellow-500">⚠️ Cliente não confirmou chegada (10min após horário)</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => confirmArrival(appt.id, appt.customer_name, appt.customer_phone)} className="px-3 py-1 rounded text-sm font-bold bg-yellow-500 text-black">✅ Chegou</button>
                  <button onClick={() => handleMensagemWhatsApp(appt.customer_phone, appt.customer_name)} className="px-3 py-1 rounded text-sm font-bold bg-black text-yellow-500 border border-yellow-500">📱 Mensagem</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* NOTIFICAÇÕES */}
      {notifications.length > 0 && (
        <section className="mb-6 p-4 rounded-lg border bg-gray-900 border-yellow-500">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-yellow-500">🔔 {notifications.length} Notificação(ões)</h2>
            <button onClick={() => setNotifications([])} className="px-2 py-1 rounded text-sm font-bold bg-black text-yellow-500 border border-yellow-500">Limpar Todas</button>
          </div>
          <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
            {notifications.map((notification) => (
              <div key={notification.id} className="flex justify-between items-center p-3 rounded" style={getNotificationStyle(notification)}>
                <div className="flex-1">
                  <div className="font-medium">{notification.message}</div>
                  <div className="text-sm opacity-80">{notification.appointment.customer_phone} • {new Date(notification.timestamp).toLocaleTimeString()}</div>
                </div>
                <div className="flex gap-2">
                  {notification.type === 'cliente_atrasado' && (
                    <>
                      <button onClick={() => confirmArrival(notification.appointment.id, notification.appointment.customer_name, notification.appointment.customer_phone)} className="px-2 py-1 rounded text-xs font-bold bg-yellow-500 text-black">Confirmar Chegada</button>
                      <button onClick={() => handleReagendarClick(notification.appointment)} className="px-2 py-1 rounded text-xs font-bold bg-black text-yellow-500 border border-yellow-500">Reagendar</button>
                      <button onClick={() => handleMensagemWhatsApp(notification.appointment.customer_phone, notification.appointment.customer_name)} className="px-2 py-1 rounded text-xs font-bold bg-black text-yellow-500 border border-yellow-500">Mensagem</button>
                      <button onClick={() => rejectAppointment(notification.appointment.id)} className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-black">Cancelar</button>
                    </>
                  )}
                  <button onClick={() => removeNotification(notification.id)} className="px-2 py-1 rounded text-xs font-bold bg-gray-800 text-white">✕</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      
      {/* LISTA DE CORTES HOJE */}
      <section className="mb-6 p-4 rounded-lg border bg-gray-900 border-yellow-500">
        <h2 className="text-xl font-semibold mb-3 text-yellow-500">📋 Cortes Agendados para Hoje ({today})</h2>
        {todayAppointmentsList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {todayAppointmentsList.map((appt) => (
              <div key={appt.id} className="p-3 rounded border bg-black" style={{ borderColor: appt.status_atrasado === 'atrasado' ? '#FF0000' : appt.notified_15min ? '#FFD700' : '#00FF00' }}>
                <div className="font-medium text-white">{appt.customer_name}</div>
                <div className="text-sm text-gray-300">📞 {appt.customer_phone}</div>
                <div className="text-lg font-bold text-white">🕒 {appt.time}</div>
                <div className="text-xs mt-1">
                  {appt.status_atrasado === 'atrasado' ? <span className="text-red-500">⚠️ ATRASADO</span> : appt.notified_15min ? <span className="text-yellow-500">⏰ Lembrete enviado</span> : <span className="text-green-500">✅ No prazo</span>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-4">Nenhum corte agendado para hoje</p>
        )}
      </section>

      {/* Pendentes */}
      {pendingAppointments.length > 0 && (
        <section className="mb-6 p-4 rounded-lg border bg-gray-900 border-yellow-500">
          <h2 className="text-xl font-semibold text-yellow-500">⚠️ {pendingAppointments.length} Agendamento(s) Pendente(s)</h2>
          <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
            {pendingAppointments.map((appt) => (
              <div key={appt.id} className="flex justify-between items-center p-3 rounded bg-black border border-yellow-500">
                <div className="flex-1">
                  <div className="font-medium text-white">{appt.customer_name}</div>
                  <div className="text-sm text-yellow-500">📞 {appt.customer_phone} - 📅 {appt.date} às 🕒 {appt.time}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => acceptAppointment(appt.id)} className="px-3 py-1 rounded text-sm font-bold bg-yellow-500 text-black">✅ Aceitar</button>
                  <button onClick={() => rejectAppointment(appt.id)} className="px-3 py-1 rounded text-sm font-bold bg-red-600 text-black">❌ Recusar</button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Status da Barbearia */}
      <section className="mb-6 p-4 rounded-lg border bg-gray-900 border-yellow-500">
        <h2 className="text-xl font-semibold mb-3 text-yellow-500">Status da Barbearia</h2>
        <div className="flex gap-2 flex-wrap">
          {['aberto', 'fechado', 'almoco', 'manutencao'].map((s) => (
            <button key={s} onClick={() => updateStatus(s)} className={`px-3 py-2 rounded text-sm font-bold ${status === s ? 'bg-yellow-500 text-black' : 'bg-gray-800 text-white'}`}>{s.toUpperCase()}</button>
          ))}
        </div>
      </section>

      {/* Clientes na Barbearia */}
      <section className="mb-6 p-6 rounded-lg text-center relative" style={{ background: "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)", boxShadow: "0 4px 20px rgba(255, 215, 0, 0.4)" }}>
        <h2 className="text-2xl font-bold mb-2 text-black">CLIENTES NA BARBEARIA</h2>
        <div className="text-5xl font-bold mb-1 text-black">{peopleInShop}</div>
        <p className="text-black">Aguardando atendimento</p>
        <button onClick={resetDailyCounter} className="absolute top-2 right-2 px-2 py-1 rounded text-xs font-bold bg-black text-yellow-500" title="Zerar contador do dia">🔄 Zerar</button>
      </section>

      {/* Estatísticas */}
      <section className="mb-6 grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border text-center bg-gray-900 border-yellow-500">
          <h3 className="text-sm font-semibold mb-1 text-yellow-500">🔥 PRIORIDADE</h3>
          <div className="text-2xl font-bold text-white">{priorityAppointments}</div>
          <p className="text-xs mt-1 text-yellow-500">Agendados para HOJE</p>
        </div>
        <div className="p-4 rounded-lg border text-center bg-gray-900 border-yellow-500">
          <h3 className="text-sm font-semibold mb-1 text-yellow-500">✂️ CORTES HOJE</h3>
          <div className="text-2xl font-bold text-white">{completedCuts}</div>
          <p className="text-xs mt-1 text-yellow-500">Realizados</p>
        </div>
      </section>

      {/* Controles de Fila */}
      <section className="mb-6 p-4 rounded-lg border bg-gray-900 border-yellow-500">
        <h2 className="text-lg font-semibold mb-3 text-yellow-500">Controles Rápidos</h2>
        <div className="flex gap-3">
          <button onClick={() => updateQueue('in')} className="flex-1 py-3 rounded font-bold text-center bg-green-500 text-black">✅ Entrou (1)</button>
          <button onClick={() => updateQueue('out')} className="flex-1 py-3 rounded font-bold text-center bg-red-600 text-black">❌ Saiu (2)</button>
        </div>
        <div className="mt-2 text-center text-xs text-yellow-500">Teclas: 1 = Entrada, 2 = Saída</div>
      </section>

      {/* Agendamentos por Data */}
      <section className="p-4 rounded-lg border bg-gray-900 border-yellow-500">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold text-yellow-500">Agendamentos Confirmados ({selectedDate})</h2>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-400">Hoje: {today}</span>
            <input type="date" value={selectedDate} onChange={(e) => setSelectedDate(e.target.value)} className="p-2 rounded border text-white text-sm bg-black border-yellow-500" />
          </div>
        </div>
        
        {appointments.length > 0 ? (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {appointments.map((appt) => (
              <div key={appt.id} className="flex justify-between items-center p-3 rounded border bg-black" style={{ borderColor: appt.status_atrasado === 'atrasado' ? '#FF0000' : appt.status_atrasado === 'presente' ? '#00FF00' : '#FFD700' }}>
                <div className="flex-1">
                  <div className="font-medium text-white">{appt.customer_name}</div>
                  <div className="text-sm text-gray-400">📞 {appt.customer_phone}</div>
                  <div className="text-xs text-gray-500">🕒 {appt.time} - {appt.status_atrasado === 'atrasado' ? ' ⚠️ ATRASADO' : appt.status_atrasado === 'presente' ? ' ✅ PRESENTE' : ' 🔄 AGUARDANDO'}</div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => confirmArrival(appt.id, appt.customer_name, appt.customer_phone)} className="px-2 py-1 rounded text-xs font-bold bg-yellow-500 text-black">✅ Chegou</button>
                  <button onClick={() => rejectAppointment(appt.id)} className="px-2 py-1 rounded text-xs font-bold bg-red-600 text-black">Cancelar</button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-4 text-sm">Nenhum agendamento confirmado para esta data</p>
        )}
      </section>

      {/* MODAL: Bloquear Agendamentos */}
      {showBlockShopModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="p-6 rounded-lg border max-w-md w-full bg-gray-900 border-red-600">
            <h3 className="text-xl font-bold mb-4 text-red-600">🚫 Bloquear Agendamentos</h3>
            <p className="text-white mb-4">Ao bloquear, os clientes NÃO poderão fazer agendamentos online até você desbloquear.</p>
            <div className="mb-4">
              <label className="block text-white mb-2">Mensagem para os clientes (opcional):</label>
              <textarea value={blockMessage} onChange={(e) => setBlockMessage(e.target.value)} className="w-full p-3 rounded border text-white bg-black border-red-600 min-h-[80px]" placeholder="Ex: Estamos em manutenção..." />
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={() => blockShopAppointments(blockMessage)} disabled={unblockLoading} className="flex-1 py-3 rounded font-bold bg-red-600 text-black">{unblockLoading ? "BLOQUEANDO..." : "🚫 CONFIRMAR BLOQUEIO"}</button>
              <button onClick={() => setShowBlockShopModal(false)} className="flex-1 py-3 rounded font-bold bg-gray-600 text-black">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Reagendamento */}
      {showRescheduleModal && selectedAppointment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="p-6 rounded-lg border max-w-md w-full bg-gray-900 border-yellow-500">
            <h3 className="text-xl font-bold mb-4 text-yellow-500">Reagendar {selectedAppointment.customer_name}</h3>
            <p className="text-white mb-4">Horário original: {selectedAppointment.time}</p>
            {rescheduleLoading ? (
              <p className="text-yellow-500 text-center">Carregando horários disponíveis...</p>
            ) : availableRescheduleSlots.length > 0 ? (
              <div className="max-h-60 overflow-y-auto">
                <h4 className="text-white mb-2">Horários disponíveis:</h4>
                <div className="grid grid-cols-3 gap-2">
                  {availableRescheduleSlots.map((slot) => (
                    <button key={slot} onClick={() => handleReagendarConfirm(slot)} className="p-2 rounded text-sm font-bold bg-yellow-500 text-black">{slot}</button>
                  ))}
                </div>
              </div>
            ) : (
              <p className="text-red-400 text-center">Nenhum horário disponível para esta data</p>
            )}
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowRescheduleModal(false)} className="flex-1 py-3 rounded font-bold bg-gray-600 text-black">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded-lg text-sm bg-gray-900 border border-red-600 text-red-600">
          <strong>Erro:</strong> {error}
          <button onClick={() => setError(null)} className="ml-3 text-xs underline">Fechar</button>
        </div>
      )}
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