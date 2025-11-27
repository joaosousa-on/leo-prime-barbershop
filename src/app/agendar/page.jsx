"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

export default function AgendarPage() {
  const [status, setStatus] = useState("carregando");
  const [services, setServices] = useState([]);
  const [availableSlots, setAvailableSlots] = useState([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  
  // Estado para armazenar a URL do WhatsApp gerada
  const [finalWhatsappUrl, setFinalWhatsappUrl] = useState("");

  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    service_id: ""
  });
  
  const [blockedMessage, setBlockedMessage] = useState("");
  const [isDateBlocked, setIsDateBlocked] = useState(false);
  const [showTimeDropdown, setShowTimeDropdown] = useState(false);
  
  // Estados de Bloqueio da Loja
  const [isShopBlocked, setIsShopBlocked] = useState(false);
  const [shopBlockMessage, setShopBlockMessage] = useState("");

  const [confirmedAppointment, setConfirmedAppointment] = useState({
    date: "",
    time: "",
    customer_name: "",
    service_name: ""
  });

  const dropdownRef = useRef(null);

  // Configurações da Barbearia
  const whatsappNumber = "5571987404707"; 
  const whatsappFormatted = "(71) 98740-4707";
  const address = "Rua São José, Jardim Nova Esperança";
  const city = "Salvador, Bahia";
  const whatsappLinkGeneral = `https://wa.me/${whatsappNumber}?text=Olá, gostaria de tirar uma dúvida sobre a LEO PRIME BARBERSHOP!`;

  // --- FUNÇÕES AUXILIARES ---

  const getLocalDate = () => {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - (offset * 60 * 1000));
    return localDate.toISOString().split('T')[0];
  };

  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, '');
    const limited = numbers.slice(0, 11);
    if (limited.length <= 2) return limited;
    if (limited.length <= 7) return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;
    return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7, 11)}`;
  };

  const formatName = (value) => {
    const noNumbers = value.replace(/[0-9]/g, '');
    return noNumbers
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const formatDisplayDate = (dateString) => {
    try {
      const [year, month, day] = dateString.split('-');
      return `${day}/${month}/${year}`;
    } catch (error) {
      return dateString;
    }
  };

  // --- LÓGICA DE BLOQUEIO ---

  const checkShopBlock = async () => {
    try {
      const today = getLocalDate();
      
      const { data: activeBlocks, error } = await supabase
        .from('blocks')
        .select('*')
        .eq('date', today)
        .eq('reason', 'BLOQUEIO_GERAL')
        .maybeSingle();

      if (error) {
        console.log('ℹ️ Erro ao verificar bloqueio:', error.message);
        return;
      }

      if (activeBlocks) {
        setIsShopBlocked(true);
        setShopBlockMessage(activeBlocks.reason || "Barbearia fechada temporariamente.");
        setAvailableSlots([]);
        setSelectedTime("");
        setShowTimeDropdown(false);
      } else {
        setIsShopBlocked(false);
        setShopBlockMessage("");
      }

    } catch (error) {
      console.log('ℹ️ Erro geral bloqueio:', error);
    }
  };

  // --- EFEITOS (UseEffect) ---

  useEffect(() => {
    loadInitialData();
    
    const statusSub = supabase
      .channel('public:shop_status')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'shop_status' }, 
        (payload) => {
          if (payload.new) setStatus(payload.new.status);
        }
      )
      .subscribe();

    const blocksSub = supabase
      .channel('public:blocks')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'blocks' },
        async () => {
          await checkShopBlock();
          if (selectedDate) await loadAvailableSlots(selectedDate);
        }
      )
      .subscribe();

    return () => {
      statusSub.unsubscribe();
      blocksSub.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setShowTimeDropdown(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (selectedDate) {
      loadAvailableSlots(selectedDate);
    } else {
      setAvailableSlots([]);
      setBlockedMessage("");
      setIsDateBlocked(false);
    }
  }, [selectedDate]);

  const loadInitialData = async () => {
    try {
      const today = getLocalDate();
      setSelectedDate(today);

      const { data: statusData } = await supabase
        .from('shop_status')
        .select('status')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (statusData) setStatus(statusData.status);

      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('active', true)
        .order('price_cents', { ascending: false });

      if (servicesData) setServices(servicesData);

      await checkShopBlock();
      await loadAvailableSlots(today);
    } catch (error) {
      console.error("Erro inicial:", error);
    }
  };

  // --- LÓGICA DE HORÁRIOS ---

  const isTimeInPast = (dateString, timeString) => {
    try {
      const now = new Date();
      const [year, month, day] = dateString.split('-').map(Number);
      const [hours, minutes] = timeString.split(':').map(Number);
      const selectedDateTime = new Date(year, month - 1, day, hours, minutes);
      return selectedDateTime < now;
    } catch (error) {
      return false;
    }
  };

  const generateTimeSlots = (startTime, endTime, intervalMinutes = 70) => {
    const slots = [];
    const [startHours, startMinutes] = startTime.split(':').map(Number);
    const [endHours, endMinutes] = endTime.split(':').map(Number);
    
    let currentHours = startHours;
    let currentMinutes = startMinutes;
    
    while (currentHours < endHours || (currentHours === endHours && currentMinutes < endMinutes)) {
      const timeString = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}`;
      slots.push(timeString);
      currentMinutes += intervalMinutes;
      while (currentMinutes >= 60) {
        currentMinutes -= 60;
        currentHours += 1;
      }
    }
    return slots;
  };

  const loadAvailableSlots = async (date) => {
    setLoading(true);
    setBlockedMessage("");
    setIsDateBlocked(false);
    
    try {
      await checkShopBlock();
      if (isShopBlocked) {
        setLoading(false);
        return;
      }

      // Busca agendamentos CONFIRMADOS ou PENDENTES para bloquear
      // Ignora os cancelados, permitindo que o horário apareça livre
      const { data: existingAppointments } = await supabase
        .from('appointments')
        .select('time')
        .eq('date', date)
        .in('status', ['confirmed', 'pending']);

      const [year, month, day] = date.split('-').map(Number);
      const dateObj = new Date(year, month - 1, day);
      const weekday = dateObj.getDay();
      
      let startTime = "09:00";
      let endTime = weekday === 0 ? "12:00" : "22:00"; 
      
      const allSlots = generateTimeSlots(startTime, endTime, 70);
      const today = getLocalDate();

      const available = allSlots.filter(timeString => {
        const isBooked = existingAppointments?.some(apt => apt.time.slice(0,5) === timeString);
        const isPast = date === today && isTimeInPast(date, timeString);
        return !isBooked && !isPast;
      });

      setAvailableSlots(available);
      
      if (available.length === 0) {
        setBlockedMessage(date === today ? "Sem horários para hoje" : "Data lotada");
      }
      
    } catch (error) {
      console.error("Erro slots:", error);
    } finally {
      setLoading(false);
    }
  };

  // --- ENVIO DO FORMULÁRIO (LÓGICA DE UPSERT/RECICLAGEM) ---

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    await checkShopBlock();
    if (isShopBlocked) {
      alert("Agendamentos bloqueados no momento.");
      return;
    }
    
    if (!formData.customer_name || !formData.customer_phone || !selectedDate || !selectedTime || !formData.service_id) {
      alert("Preencha todos os campos.");
      return;
    }

    setLoading(true);

    try {
      // 1. Verifica se JÁ EXISTE algum registro nesse horário (mesmo cancelado)
      const { data: existingSlot, error: checkError } = await supabase
        .from('appointments')
        .select('*')
        .eq('date', selectedDate)
        .eq('time', selectedTime)
        .maybeSingle();

      if (checkError) throw checkError;

      // Dados do novo agendamento
      const appointmentData = {
        customer_name: formData.customer_name,
        customer_phone: formData.customer_phone,
        service_id: parseInt(formData.service_id, 10),
        date: selectedDate,
        time: selectedTime,
        status: 'pending',
        // Reseta campos de controle
        status_atrasado: null,
        notified_15min: false,
        notified_atrasado: false,
        created_at: new Date().toISOString() // Atualiza a data de criação para agora
      };

      let dbError = null;

      if (existingSlot) {
        // --- CENÁRIO A: JÁ EXISTE REGISTRO ---
        
        if (existingSlot.status === 'cancelled') {
          // Se está CANCELADO, nós RECICLAMOS (Update)
          console.log("♻️ Reciclando horário cancelado:", existingSlot.id);
          
          const { error } = await supabase
            .from('appointments')
            .update(appointmentData)
            .eq('id', existingSlot.id);
            
          dbError = error;
        } else {
          // Se está CONFIRMED ou PENDING, é colisão real
          alert("Ops! Esse horário acabou de ser ocupado por outro cliente.");
          await loadAvailableSlots(selectedDate);
          setLoading(false);
          return;
        }

      } else {
        // --- CENÁRIO B: NÃO EXISTE REGISTRO (Insert) ---
        console.log("✨ Criando novo horário");
        
        const { error } = await supabase
          .from('appointments')
          .insert([appointmentData]);
          
        dbError = error;
      }

      // Tratamento de Erro Unificado
      if (dbError) {
        console.error("❌ ERRO AO SALVAR:", JSON.stringify(dbError, null, 2));
        throw new Error(dbError.message || "Erro ao salvar no banco");
      }

      // Sucesso
      const serviceName = services.find(s => s.id == formData.service_id)?.name || 'Corte';
      
      setConfirmedAppointment({
        date: selectedDate,
        time: selectedTime,
        customer_name: formData.customer_name,
        service_name: serviceName
      });

      const message = `📅 *NOVO AGENDAMENTO*\n\n👤 *Cliente:* ${formData.customer_name}\n📞 *Tel:* ${formData.customer_phone}\n📅 *Data:* ${formatDisplayDate(selectedDate)}\n🕒 *Hora:* ${selectedTime}\n✂️ *Serviço:* ${serviceName}\n\n*Aguardando confirmação!*`;
      
      const encodedMessage = encodeURIComponent(message);
      const finalUrl = `https://wa.me/${whatsappNumber}?text=${encodedMessage}`;
      
      setFinalWhatsappUrl(finalUrl);
      setSuccess(true);

    } catch (error) {
      console.error("❌ Erro no handleSubmit:", error);
      alert(`Erro ao realizar agendamento: ${error.message || "Tente novamente."}`);
    } finally {
      setLoading(false);
    }
  };

  // --- TELA DE SUCESSO ---
  const SuccessMessage = () => {
    useEffect(() => {
      if (finalWhatsappUrl) {
        const timer = setTimeout(() => {
          window.open(finalWhatsappUrl, '_blank');
        }, 1000);
        return () => clearTimeout(timer);
      }
    }, []);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 py-16" style={{ background: "linear-gradient(135deg, #000 0%, #1a1a1a 100%)" }}>
        <div className="max-w-md w-full bg-gray-900 p-8 rounded-xl border border-yellow-500 shadow-2xl">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-3xl font-bold mb-2 text-white">Solicitação Enviada!</h1>
          
          <div className="bg-black p-4 rounded-lg mb-6 border border-gray-800 text-left">
            <p className="text-gray-400 text-sm">Resumo:</p>
            <p className="text-white font-bold text-lg">{confirmedAppointment.customer_name}</p>
            <p className="text-yellow-500">{formatDisplayDate(confirmedAppointment.date)} às {confirmedAppointment.time}</p>
            <p className="text-white text-sm">{confirmedAppointment.service_name}</p>
          </div>

          <p className="text-white mb-6">
            Para finalizar, envie a mensagem de confirmação para o barbeiro no WhatsApp.
          </p>

          <a
            href={finalWhatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="block w-full py-4 rounded-lg text-lg font-bold mb-4 animate-pulse"
            style={{
              backgroundColor: "#25D366",
              color: "#000",
              boxShadow: "0 4px 15px rgba(37, 211, 102, 0.4)"
            }}
          >
            👉 CONFIRMAR NO WHATSAPP
          </a>

          <button
            onClick={() => window.location.reload()}
            className="text-gray-400 hover:text-white text-sm underline"
          >
            Voltar para o início
          </button>
        </div>
      </div>
    );
  };

  if (success) return <SuccessMessage />;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #000 0%, #1a1a1a 100%)" }}>
      <div className="flex justify-between items-center p-4 sm:p-6 border-b border-gray-800">
        <Link href="/" className="text-xl font-bold text-yellow-500">LEO PRIME</Link>
        <div className={`text-sm font-bold ${status === 'aberto' ? 'text-green-500' : 'text-red-500'}`}>
          {status === 'aberto' ? 'ABERTO' : status.toUpperCase()}
        </div>
      </div>

      <div className="flex-1 max-w-3xl mx-auto w-full p-4 sm:p-6">
        <h1 className="text-3xl md:text-4xl font-black text-center mb-2 text-yellow-500">AGENDAMENTO</h1>
        <p className="text-center text-gray-400 mb-8">Reserve seu horário com facilidade</p>

        {isShopBlocked && (
          <div className="bg-red-900/30 border border-red-500 p-6 rounded-lg text-center mb-8">
            <div className="text-4xl mb-2">🚫</div>
            <h2 className="text-xl font-bold text-white mb-2">AGENDAMENTOS SUSPENSOS</h2>
            <p className="text-red-300 mb-4">{shopBlockMessage}</p>
            <a href={whatsappLinkGeneral} className="inline-block bg-green-600 text-white px-6 py-2 rounded font-bold">
              Falar no WhatsApp
            </a>
          </div>
        )}

        <form onSubmit={handleSubmit} className={`space-y-6 ${isShopBlocked ? 'opacity-50 pointer-events-none' : ''}`}>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-white text-sm font-bold mb-1 block">Seu Nome</label>
              <input
                type="text"
                name="customer_name"
                value={formData.customer_name}
                onChange={(e) => setFormData({...formData, customer_name: formatName(e.target.value)})}
                className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white focus:border-yellow-500 outline-none"
                placeholder="Nome completo"
                required
              />
            </div>
            <div>
              <label className="text-white text-sm font-bold mb-1 block">Seu Telefone</label>
              <input
                type="tel"
                name="customer_phone"
                value={formData.customer_phone}
                onChange={(e) => setFormData({...formData, customer_phone: formatPhone(e.target.value)})}
                className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white focus:border-yellow-500 outline-none"
                placeholder="(71) 99999-9999"
                required
              />
            </div>
          </div>

          <div>
            <label className="text-white text-sm font-bold mb-1 block">Serviço</label>
            <select
              name="service_id"
              value={formData.service_id}
              onChange={(e) => setFormData({...formData, service_id: e.target.value})}
              className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white focus:border-yellow-500 outline-none"
              required
            >
              <option value="">Selecione...</option>
              {services.map(s => (
                <option key={s.id} value={s.id}>{s.name} - R$ {(s.price_cents/100).toFixed(2)}</option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="text-white text-sm font-bold mb-1 block">Data</label>
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                min={getLocalDate()}
                className="w-full bg-gray-900 border border-gray-700 rounded p-3 text-white focus:border-yellow-500 outline-none"
                required
              />
            </div>
            
            <div className="relative" ref={dropdownRef}>
              <label className="text-white text-sm font-bold mb-1 block">Horário</label>
              <div
                onClick={() => !isDateBlocked && availableSlots.length > 0 && setShowTimeDropdown(!showTimeDropdown)}
                className={`w-full bg-gray-900 border border-gray-700 rounded p-3 text-white flex items-center justify-between cursor-pointer ${availableSlots.length === 0 ? 'opacity-50' : ''}`}
              >
                <span>{selectedTime || (availableSlots.length > 0 ? "Selecione um horário" : "Indisponível")}</span>
                <span className="text-yellow-500">▼</span>
              </div>

              {showTimeDropdown && (
                <div className="absolute z-20 w-full mt-1 bg-gray-900 border border-yellow-500 rounded max-h-60 overflow-y-auto shadow-xl">
                  {availableSlots.map(slot => (
                    <div
                      key={slot}
                      onClick={() => { setSelectedTime(slot); setShowTimeDropdown(false); }}
                      className="p-3 hover:bg-yellow-500 hover:text-black cursor-pointer text-white border-b border-gray-800"
                    >
                      {slot}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {blockedMessage && <p className="text-red-400 text-center font-bold">{blockedMessage}</p>}

          <button
            type="submit"
            disabled={loading || isShopBlocked || !selectedTime}
            className="w-full py-4 rounded-lg font-bold text-lg transition-all transform hover:scale-105 disabled:opacity-50 disabled:transform-none"
            style={{ backgroundColor: "#FFD700", color: "#000" }}
          >
            {loading ? "Processando..." : "SOLICITAR AGENDAMENTO"}
          </button>

        </form>
      </div>

      <footer className="p-6 text-center text-gray-600 text-sm border-t border-gray-900">
        <p>© 2025 Leo Prime Barbershop</p>
      </footer>
    </div>
  );
}