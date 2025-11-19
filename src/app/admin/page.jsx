"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useRouter } from "next/navigation";

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
  const [showBlockModal, setShowBlockModal] = useState(false);
  const [blockForm, setBlockForm] = useState({
    date: "",
    start_time: "",
    end_time: "",
    reason: ""
  });
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

  useEffect(() => {
    setIsClient(true);
  }, []);

  const getTodayDate = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  };

  const today = useMemo(() => getTodayDate(), []);

  const formatTimeSafe = (date) => {
    if (!date || !isClient) return "--:--:--";
    return date.toLocaleTimeString();
  };

  useEffect(() => {
    if (isClient) {
      const todayDate = getTodayDate();
      setSelectedDate(todayDate);
    }
  }, [isClient]);

  const validateAndFormatDate = (dateString) => {
    if (!dateString) return getTodayDate();
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return getTodayDate();
      return dateString;
    } catch {
      return getTodayDate();
    }
  };

  // 🔥 CORREÇÃO: Função para criar nova entrada na fila
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
        console.error('❌ Erro ao criar fila:', newQueueError);
        // Em caso de erro, usa valores padrão
        setQueue({ in_count: 0, out_count: 0 });
        return;
      }
      
      if (newQueue) {
        console.log('📊 Nova fila criada:', newQueue);
        setQueue(newQueue);
      }
    } catch (err) {
      console.error('❌ Erro ao criar nova fila:', err);
      setQueue({ in_count: 0, out_count: 0 });
    }
  };

  // 🔥 CORREÇÃO: Função loadQueueData corrigida
  const loadQueueData = async () => {
    try {
      console.log('📊 Buscando dados da fila para:', today);
      
      const { data: queueData, error: queueError } = await supabase
        .from('queue_counters')
        .select('*')
        .eq('date', today)
        .maybeSingle();

      if (queueError) {
        console.error('❌ Erro ao carregar fila:', queueError);
        // Não joga erro, apenas cria nova entrada
        await createNewQueueEntry();
        return;
      }

      if (queueData) {
        console.log('📊 Fila carregada:', queueData);
        setQueue(queueData);
      } else {
        // Se não existe, cria uma nova entrada
        console.log('📊 Criando nova entrada de fila para hoje');
        await createNewQueueEntry();
      }
    } catch (err) {
      console.error('❌ Erro crítico ao carregar fila:', err);
      // Define valores padrão em caso de erro
      setQueue({ in_count: 0, out_count: 0 });
    }
  };

  // Função para enviar mensagem WhatsApp CORRIGIDA e AUTOMÁTICA
  const sendWhatsAppMessage = (phone, message) => {
    try {
      // Remove caracteres especiais do telefone, mantendo apenas números
      const cleanPhone = phone.replace(/\D/g, '');
      
      // Codifica a mensagem para URL
      const encodedMessage = encodeURIComponent(message);
      
      // URL do WhatsApp formatada corretamente para envio automático
      const whatsappUrl = `https://api.whatsapp.com/send?phone=55${cleanPhone}&text=${encodedMessage}`;
      
      console.log("📱 Tentando abrir WhatsApp:", whatsappUrl);
      
      // Abre em nova aba
      const newWindow = window.open(whatsappUrl, '_blank', 'noopener,noreferrer');
      
      if (!newWindow) {
        alert("Popup bloqueado! Por favor, permita popups para este site.");
      }
      
    } catch (err) {
      console.error("❌ Erro ao enviar mensagem WhatsApp:", err);
      alert("Erro ao abrir WhatsApp. Verifique o número do cliente.");
    }
  };

  // 🔥 **CORREÇÃO PRINCIPAL: Confirmar chegada - REMOVE dos agendamentos confirmados**
  const confirmArrival = async (appointmentId, customerName, customerPhone) => {
    try {
      // Marca o cliente como presente e atualiza o status
      const { error: appointmentError } = await supabase
        .from('appointments')
        .update({ 
          status_atrasado: 'presente',
          last_notification_sent: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (appointmentError) throw appointmentError;

      // Registra na fila (entrada)
      await updateQueue('in');

      // Remove da lista de confirmações
      setArrivalConfirmations(prev => prev.filter(id => id !== appointmentId));
      
      // 🔥 **REMOVE dos agendamentos confirmados imediatamente**
      setAppointments(prev => prev.filter(appt => appt.id !== appointmentId));
      
      alert(`Cliente ${customerName} confirmado como presente e contabilizado na barbearia!`);
      
    } catch (err) {
      console.error('❌ Erro ao confirmar chegada:', err);
      setError(err.message);
    }
  };

  // Função para carregar todos os dados
  const loadData = async () => {
    try {
      setLoading(true);
      
      // Carrega status
      const { data: statusData, error: statusError } = await supabase
        .from('shop_status')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (statusError) {
        console.error('❌ Erro ao carregar status:', statusError);
      } else if (statusData) {
        setStatus(statusData.status);
      }

      // Carrega fila de forma mais robusta
      await loadQueueData();

      await loadPendingAppointments();
      const validDate = validateAndFormatDate(selectedDate);
      await loadAppointmentsByDate(validDate);
      
      await checkNotifications();
      await checkArrivalConfirmations();
      
      setLastUpdate(new Date());
      setConnectionStatus("✅ Conectado");
      setInitialLoadComplete(true);
      
    } catch (err) {
      console.error('❌ Erro ao carregar dados:', err);
      setError(err.message);
      setConnectionStatus("❌ Erro de conexão");
    } finally {
      setLoading(false);
    }
  };

  // Carrega apenas agendamentos CONFIRMADOS (exclui os que já chegaram)
  const loadAppointmentsByDate = async (date) => {
    try {
      const validDate = validateAndFormatDate(date);

      const { data: appointmentsData, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', validDate)
        .eq('status', 'confirmed')
        .neq('status_atrasado', 'presente') // 🔥 EXCLUI clientes que já chegaram
        .order('time', { ascending: true });

      if (error) {
        console.error('❌ Erro ao carregar agendamentos:', error);
        throw error;
      }
      
      if (appointmentsData) {
        setAppointments(appointmentsData);
      } else {
        setAppointments([]);
      }
    } catch (err) {
      console.error('❌ Erro ao carregar agendamentos:', err);
      setAppointments([]);
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

      if (error) {
        console.error('❌ Erro ao carregar pendentes:', error);
        throw error;
      }
      setPendingAppointments(appointmentsData || []);
    } catch (err) {
      console.error('❌ Erro ao carregar pendentes:', err);
      setPendingAppointments([]);
    }
  };

  // Verifica confirmações de chegada
  const checkArrivalConfirmations = async () => {
    try {
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];

      const { data: todayAppointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', currentDate)
        .eq('status', 'confirmed')
        .neq('status_atrasado', 'presente')
        .order('time', { ascending: true });

      if (error) {
        console.error('❌ Erro ao verificar confirmações:', error);
        return;
      }

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
      console.error('❌ Erro ao verificar confirmações:', err);
    }
  };

  // 🔥 **MELHORIA: Sistema de notificações com design preto e amarelo**
  const checkNotifications = async () => {
    try {
      const now = new Date();
      const currentDate = now.toISOString().split('T')[0];
      
      const { data: todayAppointments, error } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', currentDate)
        .eq('status', 'confirmed')
        .order('time', { ascending: true });

      if (error) {
        console.error('❌ Erro ao verificar notificações:', error);
        throw error;
      }
      if (!todayAppointments) return;

      const newNotifications = [];

      for (const appointment of todayAppointments) {
        const appointmentTime = appointment.time;
        const appointmentDateTime = new Date(`${currentDate}T${appointmentTime}`);
        const timeDiff = (appointmentDateTime - now) / (1000 * 60);

        // Notificação 15 minutos antes - DESIGN MELHORADO
        if (timeDiff <= 15 && timeDiff > 0 && !appointment.notified_15min) {
          newNotifications.push({
            id: `15min-${appointment.id}`,
            type: 'reminder_15min',
            appointment: appointment,
            message: `⏰ Lembrete: ${appointment.customer_name} tem corte em 15min (${appointment.time})`,
            timestamp: new Date(),
            color: 'yellow' // 🔥 NOVO: indica cor da notificação
          });

          await supabase
            .from('appointments')
            .update({ notified_15min: true, last_notification_sent: new Date().toISOString() })
            .eq('id', appointment.id);
        }

        // Notificação de atraso (10 minutos após o horário) - DESIGN MELHORADO
        if (timeDiff <= -10 && timeDiff > -60 && !appointment.notified_atrasado && appointment.status_atrasado !== 'atrasado') {
          newNotifications.push({
            id: `atrasado-${appointment.id}`,
            type: 'cliente_atrasado',
            appointment: appointment,
            message: `⚠️ CLIENTE ATRASADO: ${appointment.customer_name} não compareceu (${appointment.time})`,
            timestamp: new Date(),
            requiresAction: true,
            color: 'black' // 🔥 NOVO: indica cor da notificação
          });

          const whatsappMessage = `Olá ${appointment.customer_name}! Percebemos que você ainda não chegou para seu corte agendado às ${appointment.time}. Ainda pretende comparecer? 😊`;
          sendWhatsAppMessage(appointment.customer_phone, whatsappMessage);

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
      console.error('❌ Erro ao verificar notificações:', err);
    }
  };

  // Aceitar agendamento com WhatsApp CORRIGIDO
  const acceptAppointment = async (appointmentId) => {
    try {
      const appointment = pendingAppointments.find(a => a.id === appointmentId);
      
      if (!appointment) {
        alert("Agendamento não encontrado!");
        return;
      }

      const { error } = await supabase
        .from('appointments')
        .update({ status: 'confirmed', status_atrasado: 'confirmed' })
        .eq('id', appointmentId);

      if (error) {
        console.error('❌ Erro ao aceitar agendamento:', error);
        throw error;
      }

      if (appointment) {
        const confirmationMessage = `✅ AGENDAMENTO CONFIRMADO!\n\nOlá ${appointment.customer_name}!\n\nSeu agendamento na LEO PRIME BARBERSHOP foi *CONFIRMADO*!\n\n📅 *Data:* ${appointment.date}\n🕒 *Horário:* ${appointment.time}\n\n*Endereço:* Rua São José, Jardim Nova Esperança - Salvador/BA\n\nAgradecemos pela preferência! 💈✂️\n\n*LEO PRIME BARBERSHOP*`;
        
        console.log("📱 Enviando confirmação para:", appointment.customer_phone);
        sendWhatsAppMessage(appointment.customer_phone, confirmationMessage);
      }

      await loadPendingAppointments();
      const validDate = validateAndFormatDate(selectedDate);
      await loadAppointmentsByDate(validDate);
      
      alert("Agendamento confirmado e cliente notificado via WhatsApp!");
    } catch (err) {
      console.error("❌ Erro ao aceitar agendamento:", err);
      setError(err.message);
    }
  };

  // Recusar/Cancelar agendamento com WhatsApp CORRIGIDO
  const rejectAppointment = async (appointmentId) => {
    try {
      const appointment = pendingAppointments.find(a => a.id === appointmentId) || 
                         appointments.find(a => a.id === appointmentId);
      
      if (!appointment) {
        alert("Agendamento não encontrado!");
        return;
      }

      const { error } = await supabase
        .from('appointments')
        .update({ status: 'cancelled' })
        .eq('id', appointmentId);

      if (error) {
        console.error('❌ Erro ao cancelar agendamento:', error);
        throw error;
      }

      if (appointment) {
        const cancellationMessage = `❌ AGENDAMENTO CANCELADO\n\nOlá ${appointment.customer_name}!\n\nSeu agendamento na LEO PRIME BARBERSHOP para *${appointment.date}* às *${appointment.time}* foi *cancelado*.\n\nPara reagendar, entre em contato conosco!\n\nAgradecemos a compreensão.\n\n*LEO PRIME BARBERSHOP*`;
        
        console.log("📱 Enviando cancelamento para:", appointment.customer_phone);
        sendWhatsAppMessage(appointment.customer_phone, cancellationMessage);
      }

      await loadPendingAppointments();
      const validDate = validateAndFormatDate(selectedDate);
      await loadAppointmentsByDate(validDate);
      
      alert("Agendamento cancelado e cliente notificado via WhatsApp!");
    } catch (err) {
      console.error("❌ Erro ao cancelar agendamento:", err);
      setError(err.message);
    }
  };

  // Atualiza status
  const updateStatus = async (newStatus) => {
    try {
      const { error } = await supabase.from('shop_status').insert({ status: newStatus });
      if (error) {
        console.error('❌ Erro ao atualizar status:', error);
        throw error;
      }
      setStatus(newStatus);
    } catch (err) {
      console.error('❌ Erro ao atualizar status:', err);
      setError(err.message);
    }
  };

  // 🔥 CORREÇÃO: Função updateQueue mais robusta
  const updateQueue = async (type) => {
    try {
      console.log(`🔄 Atualizando fila: ${type}`);
      
      // Busca sempre os dados mais recentes da fila
      const { data: currentQueue, error: fetchError } = await supabase
        .from('queue_counters')
        .select('*')
        .eq('date', today)
        .maybeSingle();

      if (fetchError) {
        console.error('❌ Erro ao buscar fila:', fetchError);
        alert("Erro ao acessar dados da fila. Recarregando...");
        await loadQueueData();
        return;
      }

      // Se não existe fila, cria uma nova
      if (!currentQueue) {
        console.log('📊 Criando nova entrada de fila...');
        await createNewQueueEntry();
        
        // Se acabou de criar a fila e quer registrar saída, não permite
        if (type === 'out') {
          alert("Não há clientes na barbearia para registrar saída!");
          return;
        }
        
        // Recarrega os dados atualizados
        await loadQueueData();
        return;
      }

      // Calcula valores atuais
      const currentIn = currentQueue?.in_count || 0;
      const currentOut = currentQueue?.out_count || 0;
      const currentPeople = currentIn - currentOut;

      console.log(`📊 Estado atual: Entradas=${currentIn}, Saídas=${currentOut}, Pessoas=${currentPeople}`);

      // Prepara dados para atualização
      const updateData = {
        updated_at: new Date().toISOString(),
      };

      if (type === 'in') {
        // SEMPRE permite entrada
        updateData.in_count = currentIn + 1;
        console.log(`✅ Registrando ENTRADA. Nova contagem: ${updateData.in_count}`);
        
      } else if (type === 'out') {
        // Só permite saída se há pessoas na barbearia
        if (currentPeople > 0) {
          updateData.out_count = currentOut + 1;
          console.log(`✅ Registrando SAÍDA. Nova contagem: ${updateData.out_count}`);
        } else {
          console.log('❌ Tentativa de saída sem clientes na barbearia');
          alert("Não há clientes na barbearia para registrar saída!");
          return;
        }
      }

      // Atualiza no banco de dados
      const { data, error: updateError } = await supabase
        .from('queue_counters')
        .update(updateData)
        .eq('date', today)
        .select()
        .single();

      if (updateError) {
        console.error('❌ Erro ao atualizar fila:', updateError);
        alert(`Erro ao atualizar: ${updateError.message}`);
        return;
      }

      // Atualiza o estado local
      setQueue(data);
      console.log('✅ Fila atualizada com sucesso:', data);
      
      // Feedback visual
      const newPeopleCount = (data.in_count || 0) - (data.out_count || 0);
      if (type === 'in') {
        alert(`✅ Entrada registrada! Clientes na barbearia: ${newPeopleCount}`);
      } else {
        alert(`✅ Saída registrada! Clientes na barbearia: ${newPeopleCount}`);
      }

    } catch (err) {
      console.error('❌ Erro ao atualizar fila:', err);
      setError(`Erro ao atualizar fila: ${err.message}`);
      
      // Tenta recarregar os dados da fila em caso de erro
      await loadQueueData();
    }
  };

  // Ações para clientes atrasados
  const handleClienteCortando = async (appointmentId) => {
    try {
      const { error } = await supabase
        .from('appointments')
        .update({ 
          status_atrasado: 'cortando',
          last_notification_sent: new Date().toISOString()
        })
        .eq('id', appointmentId);

      if (error) {
        console.error('❌ Erro ao marcar como cortando:', error);
        throw error;
      }

      setNotifications(prev => prev.filter(n => !n.id.includes(appointmentId)));
      alert("Cliente marcado como 'Cortando'");
      
      const validDate = validateAndFormatDate(selectedDate);
      await loadAppointmentsByDate(validDate);
    } catch (err) {
      console.error('❌ Erro ao marcar como cortando:', err);
      setError(err.message);
    }
  };

  const handleMensagemWhatsApp = (phone, customerName) => {
    const message = `Olá ${customerName}! Percebemos que você ainda não chegou para seu corte. Ainda pretende comparecer? 😊`;
    sendWhatsAppMessage(phone, message);
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
      
      const { data: existingAppointments, error: appointmentsError } = await supabase
        .from('appointments')
        .select('time')
        .eq('date', validDate)
        .eq('status', 'confirmed');

      if (appointmentsError) {
        console.error('❌ Erro ao carregar agendamentos para reagendamento:', appointmentsError);
      }

      const { data: blocks, error: blocksError } = await supabase
        .from('blocks')
        .select('*')
        .eq('date', validDate);

      if (blocksError) {
        console.error('❌ Erro ao carregar bloqueios para reagendamento:', blocksError);
      }

      const dateObj = new Date(validDate);
      const weekday = dateObj.getDay();
      
      const { data: availability, error: availabilityError } = await supabase
        .from('availability')
        .select('*')
        .eq('weekday', weekday)
        .eq('active', true);

      if (availabilityError) {
        console.error('❌ Erro ao carregar disponibilidade para reagendamento:', availabilityError);
      }

      let slots = [];
      if (availability && availability.length > 0) {
        availability.forEach(avail => {
          const start = new Date(`1970-01-01T${avail.start_time}`);
          const end = new Date(`1970-01-01T${avail.end_time}`);
          const slotDuration = avail.slot_minutes * 60 * 1000;

          let current = start;
          while (current < end) {
            const timeString = current.toTimeString().slice(0,5);
            
            const isBooked = existingAppointments?.some(apt => 
              apt.time.slice(0,5) === timeString
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
      console.error("❌ Erro ao carregar horários para reagendamento:", error);
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

      if (error) {
        console.error('❌ Erro ao reagendar:', error);
        throw error;
      }

      setNotifications(prev => prev.filter(n => !n.id.includes(selectedAppointment.id)));
      setShowRescheduleModal(false);
      setSelectedAppointment(null);
      
      alert(`Agendamento reagendado para ${newTime}`);
      
      const validDate = validateAndFormatDate(selectedDate);
      await loadAppointmentsByDate(validDate);
    } catch (err) {
      console.error('❌ Erro ao reagendar:', err);
      setError(err.message);
    }
  };

  // Bloquear horário
  const handleBlockTime = async (e) => {
    e.preventDefault();
    try {
      const validDate = validateAndFormatDate(blockForm.date);
      
      const { error } = await supabase
        .from('blocks')
        .insert([{
          date: validDate,
          start_time: blockForm.start_time,
          end_time: blockForm.end_time,
          reason: blockForm.reason
        }]);

      if (error) {
        console.error('❌ Erro ao bloquear horário:', error);
        throw error;
      }

      setShowBlockModal(false);
      setBlockForm({ date: "", start_time: "", end_time: "", reason: "" });
      alert("Horário bloqueado com sucesso!");
    } catch (err) {
      console.error('❌ Erro ao bloquear horário:', err);
      setError(err.message);
    }
  };

  // Remove notificação individual
  const removeNotification = (notificationId) => {
    setNotifications(prev => prev.filter(n => n.id !== notificationId));
  };

  // Sistema de tempo real OTIMIZADO
  useEffect(() => {
    if (!isClient) return;

    let intervalId;
    let confirmationIntervalId;
    let subscription;

    const initializeRealtime = async () => {
      console.log("🚀 Iniciando sistema em tempo real...");
      await loadData();

      // Polling menos frequente para evitar flickering
      intervalId = setInterval(async () => {
        if (initialLoadComplete) {
          await loadPendingAppointments();
          const validDate = validateAndFormatDate(selectedDate);
          await loadAppointmentsByDate(validDate);
          setLastUpdate(new Date());
        }
      }, 10000);

      // Verificação de confirmações a cada minuto
      confirmationIntervalId = setInterval(async () => {
        await checkArrivalConfirmations();
      }, 60000);

      // WebSockets - apenas para notificações em tempo real
      try {
        subscription = supabase
          .channel('admin-realtime')
          .on(
            'postgres_changes',
            { 
              event: 'INSERT', 
              schema: 'public', 
              table: 'appointments',
              filter: 'status=eq.pending'
            },
            async (payload) => {
              console.log('🎯 Novo agendamento pendente detectado:', payload.new);
              setConnectionStatus("✅ WebSocket Ativo");
              
              await loadPendingAppointments();
              setLastUpdate(new Date());

              if (Notification.permission === 'granted') {
                new Notification('📅 NOVO AGENDAMENTO!', {
                  body: `${payload.new.customer_name}\n${payload.new.date} às ${payload.new.time}`,
                  icon: '/favicon.ico',
                });
              }
            }
          )
          .on(
            'postgres_changes',
            { event: '*', schema: 'public', table: 'shop_status' },
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
              setConnectionStatus("🔄 Usando Polling (10s)");
            }
          });

      } catch (websocketError) {
        console.error('❌ Erro no WebSocket:', websocketError);
        setConnectionStatus("🔄 Usando Polling (10s)");
      }
    };

    initializeRealtime();

    if ('Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    // CORREÇÃO: Atalhos de teclado MELHORADOS
    const handleKey = (e) => {
      // Evita que o atalho funcione quando o usuário está digitando em inputs
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) {
        return;
      }

      if (e.key === '1') {
        e.preventDefault();
        console.log('Tecla 1 pressionada - Registrando entrada');
        updateQueue('in');
      }
      if (e.key === '2') {
        e.preventDefault();
        console.log('Tecla 2 pressionada - Registrando saída');
        updateQueue('out');
      }
    };

    window.addEventListener('keydown', handleKey);

    return () => {
      console.log("🧹 Limpando listeners do admin...");
      if (intervalId) clearInterval(intervalId);
      if (confirmationIntervalId) clearInterval(confirmationIntervalId);
      if (subscription) supabase.removeChannel(subscription);
      window.removeEventListener('keydown', handleKey);
    };
  }, [today, selectedDate, isClient, initialLoadComplete]);

  // 🔥 **MELHORIA: Componente para confirmações de chegada - DESIGN ATUALIZADO**
  const ArrivalConfirmationSection = () => {
    if (arrivalConfirmations.length === 0) return null;

    const confirmationAppointments = appointments.filter(appt => 
      arrivalConfirmations.includes(appt.id)
    );

    return (
      <section className="mb-6 p-4 rounded-lg border" 
        style={{ 
          backgroundColor: "#1a1a1a", 
          borderColor: "#FFD700",
          boxShadow: "0 4px 20px rgba(255, 215, 0, 0.2)"
        }}>
        <div className="flex justify-between items-center">
          <h2 className="text-xl font-semibold" style={{ color: "#FFD700" }}>
            🕒 {confirmationAppointments.length} Cliente(s) para Confirmar Chegada
          </h2>
        </div>
        <div className="mt-2 space-y-2">
          {confirmationAppointments.map((appt) => (
            <div key={appt.id} className="flex justify-between items-center p-3 rounded"
              style={{ 
                backgroundColor: "#000",
                border: "1px solid #FFD700"
              }}>
              <div className="flex-1">
                <div className="font-medium text-white">{appt.customer_name}</div>
                <div className="text-sm" style={{ color: "#FFD700" }}>
                  📞 {appt.customer_phone} • 🕒 {appt.time}
                </div>
                <div className="text-xs mt-1" style={{ color: "#FFD700" }}>
                  ⚠️ Cliente não confirmou chegada (10min após horário)
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => confirmArrival(appt.id, appt.customer_name, appt.customer_phone)}
                  className="px-3 py-1 rounded text-sm transition-colors font-bold"
                  style={{
                    backgroundColor: "#FFD700",
                    color: "#000"
                  }}
                >
                  ✅ Chegou
                </button>
                <button
                  onClick={() => handleMensagemWhatsApp(appt.customer_phone, appt.customer_name)}
                  className="px-3 py-1 rounded text-sm transition-colors font-bold"
                  style={{
                    backgroundColor: "#000",
                    color: "#FFD700",
                    border: "1px solid #FFD700"
                  }}
                >
                  📱 Mensagem
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    );
  };

  // 🔥 CORREÇÃO: Cálculo correto de pessoas na barbearia
  const peopleInShop = Math.max(0, (queue?.in_count || 0) - (queue?.out_count || 0));
  const completedCuts = queue?.out_count || 0;
  
  // 🔥 CORREÇÃO: PRIORIDADE agora conta TODOS os agendamentos confirmados para hoje
  const priorityAppointments = appointments.filter(appt => 
    appt.status === 'confirmed' && appt.date === today
  ).length;

  // Agendamentos de hoje para a lista de cortes
  const todayAppointmentsList = appointments.filter(appt => 
    appt.date === today && appt.status === 'confirmed'
  ).sort((a, b) => a.time.localeCompare(b.time));

  // Função para forçar atualização manual
  const forceRefresh = async () => {
    setConnectionStatus("🔄 Atualizando manualmente...");
    await loadData();
  };

  // NOVA FUNÇÃO: Resetar contador do dia
  const resetDailyCounter = async () => {
    if (window.confirm("Tem certeza que deseja ZERAR o contador de clientes de hoje?")) {
      try {
        const { data, error } = await supabase
          .from('queue_counters')
          .update({ 
            in_count: 0, 
            out_count: 0,
            updated_at: new Date().toISOString()
          })
          .eq('date', today)
          .select()
          .single();

        if (error) {
          console.error('❌ Erro ao zerar contador:', error);
          throw error;
        }
        
        setQueue(data);
        alert("✅ Contador zerado com sucesso!");
      } catch (err) {
        console.error('❌ Erro ao zerar contador:', err);
        setError(`Erro ao zerar contador: ${err.message}`);
      }
    }
  };

  // 🔥 **MELHORIA: Função para obter estilo da notificação baseado no tipo**
  const getNotificationStyle = (notification) => {
    if (notification.color === 'yellow') {
      return {
        backgroundColor: "#1a1a1a",
        borderColor: "#FFD700",
        color: "#FFD700"
      };
    } else {
      return {
        backgroundColor: "#000",
        borderColor: "#FFD700", 
        color: "#FFD700"
      };
    }
  };

  if (!isClient) {
    return (
      <div className="min-h-screen bg-black text-white p-6 flex items-center justify-center">
        <div className="text-yellow-500 text-xl">Carregando sistema...</div>
      </div>
    );
  }

  if (loading && !initialLoadComplete) {
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
        <h1 className="text-3xl font-bold" style={{ color: "#FFD700" }}>
          LEO PRIME BARBERSHOP - ADMIN
        </h1>
        <div className="flex gap-2 items-center">
          <div className="text-sm px-2 py-1 rounded border" style={{ borderColor: "#FFD700" }}>
            <span className={connectionStatus.includes("✅") ? "text-green-400" : "text-yellow-400"}>
              {connectionStatus}
            </span>
            <br />
            <span className="text-gray-400 text-xs">
              Última atualização: {formatTimeSafe(lastUpdate)}
            </span>
          </div>
          <button
            onClick={forceRefresh}
            className="px-3 py-1 rounded text-sm transition-colors font-bold"
            style={{
              backgroundColor: "#000",
              color: "#FFD700",
              border: "1px solid #FFD700"
            }}
            title="Forçar atualização"
          >
            🔄
          </button>
          <button
            onClick={() => {
              localStorage.removeItem("adminAuthenticated");
              localStorage.removeItem("adminLoginTime");
              window.location.href = "/admin/login";
            }}
            className="px-4 py-2 rounded text-sm transition-colors font-bold"
            style={{
              backgroundColor: "#FF0000",
              color: "#000"
            }}
          >
            Sair
          </button>
        </div>
      </div>

      {/* Seção de Confirmações de Chegada */}
      <ArrivalConfirmationSection />

      {/* 🔥 MELHORIA: NOTIFICAÇÕES - DESIGN PRETO E AMARELO */}
      {notifications.length > 0 && (
        <section className="mb-6 p-4 rounded-lg border" 
          style={{ 
            backgroundColor: "#1a1a1a", 
            borderColor: "#FFD700",
            boxShadow: "0 4px 20px rgba(255, 215, 0, 0.2)"
          }}>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold" style={{ color: "#FFD700" }}>
              🔔 {notifications.length} Notificação(ões)
            </h2>
            <button
              onClick={() => setNotifications([])}
              className="px-2 py-1 rounded text-sm transition-colors font-bold"
              style={{
                backgroundColor: "#000",
                color: "#FFD700",
                border: "1px solid #FFD700"
              }}
            >
              Limpar Todas
            </button>
          </div>
          <div className="mt-2 space-y-2 max-h-60 overflow-y-auto">
            {notifications.map((notification) => (
              <div 
                key={notification.id} 
                className="flex justify-between items-center p-3 rounded"
                style={getNotificationStyle(notification)}
              >
                <div className="flex-1">
                  <div className="font-medium">{notification.message}</div>
                  <div className="text-sm" style={{ opacity: 0.8 }}>
                    {notification.appointment.customer_phone} • 
                    {new Date(notification.timestamp).toLocaleTimeString()}
                  </div>
                </div>
                <div className="flex gap-2">
                  {notification.type === 'cliente_atrasado' && (
                    <>
                      <button
                        onClick={() => confirmArrival(notification.appointment.id, notification.appointment.customer_name, notification.appointment.customer_phone)}
                        className="px-2 py-1 rounded text-xs transition-colors font-bold"
                        style={{
                          backgroundColor: "#FFD700",
                          color: "#000"
                        }}
                      >
                        Confirmar Chegada
                      </button>
                      <button
                        onClick={() => handleReagendarClick(notification.appointment)}
                        className="px-2 py-1 rounded text-xs transition-colors font-bold"
                        style={{
                          backgroundColor: "#000",
                          color: "#FFD700",
                          border: "1px solid #FFD700"
                        }}
                      >
                        Reagendar
                      </button>
                      <button
                        onClick={() => handleMensagemWhatsApp(notification.appointment.customer_phone, notification.appointment.customer_name)}
                        className="px-2 py-1 rounded text-xs transition-colors font-bold"
                        style={{
                          backgroundColor: "#000", 
                          color: "#FFD700",
                          border: "1px solid #FFD700"
                        }}
                      >
                        Mensagem
                      </button>
                      <button
                        onClick={() => rejectAppointment(notification.appointment.id)}
                        className="px-2 py-1 rounded text-xs transition-colors font-bold"
                        style={{
                          backgroundColor: "#FF0000",
                          color: "#000"
                        }}
                      >
                        Cancelar
                      </button>
                    </>
                  )}
                  <button
                    onClick={() => removeNotification(notification.id)}
                    className="px-2 py-1 rounded text-xs transition-colors font-bold"
                    style={{
                      backgroundColor: "#333",
                      color: "#FFF"
                    }}
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
      
      {/* LISTA DE CORTES AGENDADOS HOJE */}
      <section className="mb-6 p-4 rounded-lg border" 
        style={{ 
          backgroundColor: "#1a1a1a", 
          borderColor: "#FFD700"
        }}>
        <h2 className="text-xl font-semibold mb-3" style={{ color: "#FFD700" }}>
          📋 Cortes Agendados para Hoje ({today})
        </h2>
        {todayAppointmentsList.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {todayAppointmentsList.map((appt) => (
              <div 
                key={appt.id} 
                className="p-3 rounded border"
                style={{ 
                  borderColor: appt.status_atrasado === 'atrasado' ? '#FF0000' : 
                              appt.notified_15min ? '#FFD700' : '#00FF00',
                  backgroundColor: "#000"
                }}
              >
                <div className="font-medium text-white">{appt.customer_name}</div>
                <div className="text-sm text-gray-300">📞 {appt.customer_phone}</div>
                <div className="text-lg font-bold text-white">🕒 {appt.time}</div>
                <div className="text-xs mt-1">
                  {appt.status_atrasado === 'atrasado' ? (
                    <span style={{ color: "#FF0000" }}>⚠️ ATRASADO</span>
                  ) : appt.notified_15min ? (
                    <span style={{ color: "#FFD700" }}>⏰ Lembrete enviado</span>
                  ) : (
                    <span style={{ color: "#00FF00" }}>✅ No prazo</span>
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
        <section className="mb-6 p-4 rounded-lg border" 
          style={{ 
            backgroundColor: "#1a1a1a", 
            borderColor: "#FFD700"
          }}>
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold" style={{ color: "#FFD700" }}>
              ⚠️ {pendingAppointments.length} Agendamento(s) Pendente(s)
            </h2>
          </div>
          <div className="mt-2 space-y-2 max-h-40 overflow-y-auto">
            {pendingAppointments.map((appt) => (
              <div 
                key={appt.id} 
                className="flex justify-between items-center p-3 rounded"
                style={{ 
                  backgroundColor: "#000",
                  border: "1px solid #FFD700"
                }}
              >
                <div className="flex-1">
                  <div className="font-medium text-white">{appt.customer_name}</div>
                  <div className="text-sm" style={{ color: "#FFD700" }}>
                    📞 {appt.customer_phone} - 📅 {appt.date} às 🕒 {appt.time}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => acceptAppointment(appt.id)}
                    className="px-3 py-1 rounded text-sm transition-colors font-bold"
                    style={{
                      backgroundColor: "#FFD700",
                      color: "#000"
                    }}
                  >
                    ✅ Aceitar
                  </button>
                  <button
                    onClick={() => rejectAppointment(appt.id)}
                    className="px-3 py-1 rounded text-sm transition-colors font-bold"
                    style={{
                      backgroundColor: "#FF0000",
                      color: "#000"
                    }}
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
      <section className="mb-6 p-4 rounded-lg border" style={{ borderColor: "#FFD700", backgroundColor: "#1a1a1a" }}>
        <h2 className="text-xl font-semibold mb-3" style={{ color: "#FFD700" }}>Status da Barbearia</h2>
        <div className="flex gap-2 flex-wrap">
          {['aberto', 'fechado', 'almoco', 'manutencao'].map((s) => (
            <button
              key={s}
              onClick={() => updateStatus(s)}
              className={`px-3 py-2 rounded text-sm transition-colors font-bold ${
                status === s 
                  ? 'bg-yellow-500 text-black' 
                  : 'bg-gray-800 hover:bg-gray-700 text-white'
              }`}
            >
              {s.toUpperCase()}
            </button>
          ))}
          <button
            onClick={() => setShowBlockModal(true)}
            className="px-3 py-2 rounded text-sm transition-colors font-bold ml-auto"
            style={{
              backgroundColor: "#FF0000",
              color: "#000"
            }}
          >
            Bloquear Horários
          </button>
        </div>
      </section>

      {/* Seção Principal - Pessoas na Barbearia */}
      <section className="mb-6 p-6 rounded-lg text-center relative"
        style={{ 
          background: "linear-gradient(135deg, #FFD700 0%, #FFA500 100%)",
          boxShadow: "0 4px 20px rgba(255, 215, 0, 0.4)"
        }}>
        <h2 className="text-2xl font-bold mb-2" style={{ color: "#000" }}>CLIENTES NA BARBEARIA</h2>
        <div className="text-5xl font-bold mb-1" style={{ color: "#000" }}>
          {peopleInShop}
        </div>
        <p style={{ color: "#000" }}>Aguardando atendimento</p>
        
        {/* Botão para zerar contador */}
        <button
          onClick={resetDailyCounter}
          className="absolute top-2 right-2 px-2 py-1 rounded text-xs transition-colors font-bold"
          style={{
            backgroundColor: "#000",
            color: "#FFD700"
          }}
          title="Zerar contador do dia"
        >
          🔄 Zerar
        </button>
      </section>

      {/* Seção Estatísticas */}
      <section className="mb-6 grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg border text-center"
          style={{ 
            borderColor: "#FFD700",
            backgroundColor: "#1a1a1a"
          }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: "#FFD700" }}>
            🔥 PRIORIDADE
          </h3>
          <div className="text-2xl font-bold text-white">
            {priorityAppointments}
          </div>
          <p className="text-xs mt-1" style={{ color: "#FFD700" }}>Agendados para HOJE</p>
        </div>
        <div className="p-4 rounded-lg border text-center"
          style={{ 
            borderColor: "#FFD700",
            backgroundColor: "#1a1a1a"
          }}>
          <h3 className="text-sm font-semibold mb-1" style={{ color: "#FFD700" }}>✂️ CORTES HOJE</h3>
          <div className="text-2xl font-bold text-white">
            {completedCuts}
          </div>
          <p className="text-xs mt-1" style={{ color: "#FFD700" }}>Realizados</p>
        </div>
      </section>

      {/* Controles de Fila SIMPLIFICADOS */}
      <section className="mb-6 p-4 rounded-lg border" style={{ borderColor: "#FFD700", backgroundColor: "#1a1a1a" }}>
        <h2 className="text-lg font-semibold mb-3" style={{ color: "#FFD700" }}>Controles Rápidos</h2>

        <div className="flex gap-3">
          <button
            onClick={() => updateQueue('in')}
            className="flex-1 py-3 rounded font-bold transition-colors text-center"
            style={{
              backgroundColor: "#00FF00",
              color: "#000"
            }}
          >
            ✅ Entrou (1)
          </button>
          <button
            onClick={() => updateQueue('out')}
            className="flex-1 py-3 rounded font-bold transition-colors text-center"
            style={{
              backgroundColor: "#FF0000", 
              color: "#000"
            }}
          >
            ❌ Saiu (2)
          </button>
        </div>
        <div className="mt-2 text-center text-xs" style={{ color: "#FFD700" }}>
          Teclas: 1 = Entrada, 2 = Saída | Use os botões ou teclas do teclado
        </div>
      </section>

      {/* Agendamentos do Dia - APENAS CONFIRMADOS (exclui os que chegaram) */}
      <section className="p-4 rounded-lg border" style={{ borderColor: "#FFD700", backgroundColor: "#1a1a1a" }}>
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-lg font-semibold" style={{ color: "#FFD700" }}>
            Agendamentos Confirmados ({selectedDate})
          </h2>
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-400">Hoje: {today}</span>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="p-2 rounded border text-white text-sm"
              style={{
                backgroundColor: "#000",
                borderColor: "#FFD700"
              }}
            />
          </div>
        </div>
        
        {appointments.length > 0 ? (
          <div className="space-y-2 max-h-60 overflow-y-auto">
            {appointments.map((appt) => (
              <div 
                key={appt.id} 
                className="flex justify-between items-center p-3 rounded border"
                style={{ 
                  borderColor: appt.status_atrasado === 'atrasado' ? '#FF0000' : 
                              appt.status_atrasado === 'presente' ? '#00FF00' : '#FFD700',
                  backgroundColor: "#000"
                }}
              >
                <div className="flex-1">
                  <div className="font-medium text-white">{appt.customer_name}</div>
                  <div className="text-sm text-gray-400">📞 {appt.customer_phone}</div>
                  <div className="text-xs text-gray-500">
                    🕒 {appt.time} - 
                    {appt.status_atrasado === 'atrasado' ? ' ⚠️ ATRASADO' : 
                     appt.status_atrasado === 'presente' ? ' ✅ PRESENTE' : 
                     ' 🔄 AGUARDANDO'}
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => confirmArrival(appt.id, appt.customer_name, appt.customer_phone)}
                    className="px-2 py-1 rounded text-xs transition-colors font-bold"
                    style={{
                      backgroundColor: "#FFD700",
                      color: "#000"
                    }}
                  >
                    ✅ Chegou
                  </button>
                  <button
                    onClick={() => rejectAppointment(appt.id)}
                    className="px-2 py-1 rounded text-xs transition-colors font-bold"
                    style={{
                      backgroundColor: "#FF0000",
                      color: "#000"
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-gray-400 text-center py-4 text-sm">Nenhum agendamento confirmado para esta data</p>
        )}
      </section>

      {/* Modal de Bloqueio */}
      {showBlockModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="p-6 rounded-lg border max-w-md w-full"
            style={{
              backgroundColor: "#1a1a1a",
              borderColor: "#FFD700"
            }}>
            <h3 className="text-xl font-bold mb-4" style={{ color: "#FFD700" }}>Bloquear Horários</h3>
            <form onSubmit={handleBlockTime}>
              <div className="space-y-4">
                <div>
                  <label className="block text-white mb-2">Data</label>
                  <input
                    type="date"
                    value={blockForm.date}
                    onChange={(e) => setBlockForm({...blockForm, date: e.target.value})}
                    className="w-full p-3 rounded border text-white"
                    style={{
                      backgroundColor: "#000",
                      borderColor: "#FFD700"
                    }}
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
                      className="w-full p-3 rounded border text-white"
                      style={{
                        backgroundColor: "#000",
                        borderColor: "#FFD700"
                      }}
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-white mb-2">Hora Fim</label>
                    <input
                      type="time"
                      value={blockForm.end_time}
                      onChange={(e) => setBlockForm({...blockForm, end_time: e.target.value})}
                      className="w-full p-3 rounded border text-white"
                      style={{
                        backgroundColor: "#000",
                        borderColor: "#FFD700"
                      }}
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
                    className="w-full p-3 rounded border text-white"
                    style={{
                      backgroundColor: "#000",
                      borderColor: "#FFD700"
                    }}
                    placeholder="Ex: Manutenção, Folga, etc."
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  className="flex-1 py-3 rounded font-bold transition-colors"
                  style={{
                    backgroundColor: "#FF0000",
                    color: "#000"
                  }}
                >
                  Bloquear Horário
                </button>
                <button
                  type="button"
                  onClick={() => setShowBlockModal(false)}
                  className="flex-1 py-3 rounded font-bold transition-colors"
                  style={{
                    backgroundColor: "#666",
                    color: "#000"
                  }}
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
          <div className="p-6 rounded-lg border max-w-md w-full"
            style={{
              backgroundColor: "#1a1a1a",
              borderColor: "#FFD700"
            }}>
            <h3 className="text-xl font-bold mb-4" style={{ color: "#FFD700" }}>
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
                      className="p-2 rounded text-sm transition-colors font-bold"
                      style={{
                        backgroundColor: "#FFD700",
                        color: "#000"
                      }}
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
                className="flex-1 py-3 rounded font-bold transition-colors"
                style={{
                  backgroundColor: "#666",
                  color: "#000"
                }}
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded-lg text-sm"
          style={{
            backgroundColor: "#1a1a1a",
            border: "1px solid #FF0000",
            color: "#FF0000"
          }}>
          <strong>Erro:</strong> {error}
          <button 
            onClick={() => setError(null)}
            className="ml-3 text-xs underline"
          >
            Fechar
          </button>
        </div>
      )}

      <div className="mt-6 text-center text-xs" style={{ color: "#FFD700" }}>
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