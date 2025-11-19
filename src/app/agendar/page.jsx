"use client";

import { useEffect, useState } from "react";
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
  const [formData, setFormData] = useState({
    customer_name: "",
    customer_phone: "",
    service_id: ""
  });

  const whatsapp = "5571987404707";
  const whatsappFormatted = "(71) 98740-4707";
  const address = "Rua São José, Jardim Nova Esperança";
  const city = "Salvador, Bahia";
  const cep = "41370-070";
  const whatsappLink = `https://wa.me/${whatsapp}?text=Olá, gostaria de agendar um horário na LEO PRIME BARBERSHOP!`;

  // Formatação do telefone
  const formatPhone = (value) => {
    const numbers = value.replace(/\D/g, '');
    const limited = numbers.slice(0, 11);
    
    if (limited.length <= 2) {
      return limited;
    } else if (limited.length <= 7) {
      return `(${limited.slice(0, 2)}) ${limited.slice(2)}`;
    } else {
      return `(${limited.slice(0, 2)}) ${limited.slice(2, 7)}-${limited.slice(7, 11)}`;
    }
  };

  // Formatação do nome - primeira letra maiúscula e sem números
  const formatName = (value) => {
    const noNumbers = value.replace(/[0-9]/g, '');
    return noNumbers
      .toLowerCase()
      .split(' ')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  // Carrega dados iniciais
  useEffect(() => {
    loadInitialData();
    
    const statusSub = supabase
      .channel('public:shop_status')
      .on('postgres_changes', 
        { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'shop_status' 
        }, 
        (payload) => {
          if (payload.new) {
            setStatus(payload.new.status);
          }
        }
      )
      .subscribe();

    return () => {
      statusSub.unsubscribe();
    };
  }, []);

  const loadInitialData = async () => {
    try {
      // Carrega status
      const { data: statusData } = await supabase
        .from('shop_status')
        .select('status')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (statusData) {
        setStatus(statusData.status);
      }

      // Carrega serviços ativos do banco
      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('active', true)
        .order('price_cents', { ascending: false });

      if (servicesData) {
        setServices(servicesData);
      }
    } catch (error) {
      console.error("Erro ao carregar dados:", error);
    }
  };

  // Quando a data muda, carrega os horários disponíveis
  useEffect(() => {
    if (selectedDate) {
      loadAvailableSlots(selectedDate);
    }
  }, [selectedDate]);

  const loadAvailableSlots = async (date) => {
    setLoading(true);
    try {
      // Busca agendamentos existentes para a data (apenas confirmados)
      const { data: existingAppointments } = await supabase
        .from('appointments')
        .select('time')
        .eq('date', date)
        .eq('status', 'confirmed');

      // Busca bloqueios para a data
      const { data: blocks } = await supabase
        .from('blocks')
        .select('*')
        .eq('date', date);

      // Busca disponibilidade padrão
      const dateObj = new Date(date);
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

      setAvailableSlots(slots);
    } catch (error) {
      console.error("Erro ao carregar horários:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // 🔥 CORREÇÃO: Validação do serviço obrigatório
    if (!formData.customer_name || !formData.customer_phone || !selectedDate || !selectedTime || !formData.service_id) {
      alert("Por favor, preencha todos os campos obrigatórios.");
      return;
    }

    // Validação do telefone (deve ter pelo menos 10 dígitos)
    const phoneNumbers = formData.customer_phone.replace(/\D/g, '');
    if (phoneNumbers.length < 10) {
      alert("Por favor, insira um número de telefone válido com DDD.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase
        .from('appointments')
        .insert([{
          customer_name: formData.customer_name,
          customer_phone: formData.customer_phone,
          service_id: formData.service_id,
          date: selectedDate,
          time: selectedTime,
          status: 'pending'
        }]);

      if (error) throw error;

      setSuccess(true);
      setFormData({ customer_name: "", customer_phone: "", service_id: "" });
      setSelectedDate("");
      setSelectedTime("");
      setAvailableSlots([]);
    } catch (error) {
      console.error("Erro ao agendar:", error);
      alert("Erro ao realizar agendamento. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    
    // Formatação específica para cada campo
    let formattedValue = value;
    
    if (name === 'customer_phone') {
      formattedValue = formatPhone(value);
    } else if (name === 'customer_name') {
      formattedValue = formatName(value);
    }
    
    setFormData(prev => ({
      ...prev,
      [name]: formattedValue
    }));
  };

  // Calcula a data mínima (amanhã) e máxima (30 dias)
  const today = new Date();
  const minDate = new Date(today);
  minDate.setDate(today.getDate() + 1);
  
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + 30);

  const formatDate = (date) => {
    return date.toISOString().split('T')[0];
  };

  const getStatusColor = () => {
    switch(status) {
      case 'aberto': return 'text-green-400';
      case 'fechado': return 'text-red-400';
      case 'almoco': return 'text-yellow-400';
      case 'manutencao': return 'text-orange-400';
      default: return 'text-gray-400';
    }
  };

  const getStatusText = () => {
    switch(status) {
      case 'aberto': return 'Aberto ✓';
      case 'fechado': return 'Fechado';
      case 'almoco': return 'Horário de Almoço';
      case 'manutencao': return 'Em Manutenção';
      default: return 'Carregando...';
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center text-center px-6 py-16" style={{ background: "linear-gradient(135deg, #000 0%, #1a1a1a 100%)" }}>
        <div className="max-w-4xl">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-5xl md:text-6xl font-black mb-4" style={{ color: "#FFD700", textShadow: "0 2px 20px rgba(255, 215, 0, 0.3)" }}>
            Agendamento Solicitado!
          </h1>
          <p className="text-xl text-white/80 mb-6 max-w-2xl mx-auto">
            Seu agendamento para <strong>{selectedDate}</strong> às <strong>{selectedTime}</strong> foi enviado para confirmação.
          </p>
          <p className="text-lg text-yellow-500 mb-8">
            Aguarde a confirmação do barbeiro. Você receberá uma notificação quando for confirmado.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => setSuccess(false)}
              className="px-8 py-4 rounded-lg text-lg font-bold transition-all transform hover:scale-105"
              style={{
                backgroundColor: "#FFD700",
                color: "#000",
                boxShadow: "0 4px 20px rgba(255, 215, 0, 0.4)"
              }}
            >
              Fazer Novo Agendamento
            </button>
            <Link
              href="/"
              className="px-8 py-4 rounded-lg text-lg font-semibold transition-all hover:bg-white/10"
              style={{
                border: "2px solid #FFD700",
                color: "#FFD700"
              }}
            >
              Voltar para Home
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "linear-gradient(135deg, #000 0%, #1a1a1a 100%)" }}>
      {/* Header */}
      <div className="flex justify-between items-center p-6">
        <Link href="/" className="text-2xl font-bold" style={{ color: "#FFD700" }}>
          LEO PRIME
        </Link>
        <div className={`text-sm font-semibold ${getStatusColor()}`}>
          {getStatusText()}
        </div>
      </div>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-8">
        <div className="max-w-4xl">
          <h1 className="text-4xl md:text-6xl font-black mb-4" style={{ color: "#FFD700", textShadow: "0 2px 20px rgba(255, 215, 0, 0.3)" }}>
            AGENDAMENTO
          </h1>
          <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
            Escolha o serviço, data e horário desejados
          </p>
        </div>
      </section>

      {/* Formulário de Agendamento */}
      <section className="py-8 px-6" style={{ backgroundColor: "#0a0a0a" }}>
        <div className="max-w-2xl mx-auto">
          <div className="p-8 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#111" }}>
            <h2 className="text-2xl font-bold text-center mb-6" style={{ color: "#FFD700" }}>
              Preencha seus dados
            </h2>

            <form onSubmit={handleSubmit}>
              {/* Informações Pessoais */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-white mb-3 font-semibold">
                    Nome *
                  </label>
                  <input
                    type="text"
                    name="customer_name"
                    value={formData.customer_name}
                    onChange={handleInputChange}
                    className="w-full p-4 rounded-lg text-white transition-all"
                    style={{ 
                      backgroundColor: "#000",
                      border: "1px solid rgba(255, 215, 0, 0.3)",
                      outline: "none"
                    }}
                    placeholder="Seu nome completo"
                    required
                    pattern="[A-Za-zÀ-ÿ\s]+"
                    title="Por favor, insira apenas letras"
                  />
                  <p className="text-yellow-500 text-xs mt-1">
                    Apenas letras são permitidas
                  </p>
                </div>
                <div>
                  <label className="block text-white mb-3 font-semibold">
                    Telefone *
                  </label>
                  <input
                    type="tel"
                    name="customer_phone"
                    value={formData.customer_phone}
                    onChange={handleInputChange}
                    className="w-full p-4 rounded-lg text-white transition-all"
                    style={{ 
                      backgroundColor: "#000",
                      border: "1px solid rgba(255, 215, 0, 0.3)",
                      outline: "none"
                    }}
                    placeholder="(71) 98765-4321"
                    required
                    pattern="\(\d{2}\)\s\d{4,5}-\d{4}"
                    title="Formato: (DDD) 9XXXX-XXXX"
                  />
                  <p className="text-yellow-500 text-xs mt-1">
                    Formato: (DDD) 9XXXX-XXXX
                  </p>
                </div>
              </div>

              {/* Serviço - AGORA OBRIGATÓRIO */}
              <div className="mb-6">
                <label className="block text-white mb-3 font-semibold">
                  Serviço Desejado *
                </label>
                <select
                  name="service_id"
                  value={formData.service_id}
                  onChange={handleInputChange}
                  className="w-full p-4 rounded-lg text-white transition-all"
                  style={{ 
                    backgroundColor: "#000",
                    border: "1px solid rgba(255, 215, 0, 0.3)",
                    outline: "none"
                  }}
                  required
                >
                  <option value="">Selecione um serviço</option>
                  {services.map(service => (
                    <option key={service.id} value={service.id} className="text-white bg-black">
                      {service.name} - R$ {(service.price_cents / 100).toFixed(2)}
                    </option>
                  ))}
                </select>
                <p className="text-yellow-500 text-xs mt-1">
                  * Campo obrigatório
                </p>
              </div>

              {/* Data e Horário */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <div>
                  <label className="block text-white mb-3 font-semibold">
                    Data *
                  </label>
                  <input
                    type="date"
                    value={selectedDate}
                    onChange={(e) => {
                      setSelectedDate(e.target.value);
                      setSelectedTime("");
                    }}
                    min={formatDate(minDate)}
                    max={formatDate(maxDate)}
                    className="w-full p-4 rounded-lg text-white transition-all"
                    style={{ 
                      backgroundColor: "#000",
                      border: "1px solid rgba(255, 215, 0, 0.3)",
                      outline: "none"
                    }}
                    required
                  />
                </div>
                <div>
                  <label className="block text-white mb-3 font-semibold">
                    Horário *
                  </label>
                  <select
                    value={selectedTime}
                    onChange={(e) => setSelectedTime(e.target.value)}
                    disabled={!selectedDate || loading}
                    className="w-full p-4 rounded-lg text-white transition-all disabled:opacity-50"
                    style={{ 
                      backgroundColor: "#000",
                      border: "1px solid rgba(255, 215, 0, 0.3)",
                      outline: "none"
                    }}
                    required
                  >
                    <option value="">Selecione um horário</option>
                    {availableSlots.map(slot => (
                      <option key={slot} value={slot} className="text-white bg-black">
                        {slot}
                      </option>
                    ))}
                  </select>
                  {loading && (
                    <p className="text-yellow-500 text-sm mt-2">Carregando horários disponíveis...</p>
                  )}
                  {selectedDate && availableSlots.length === 0 && !loading && (
                    <p className="text-red-400 text-sm mt-2">Nenhum horário disponível para esta data</p>
                  )}
                </div>
              </div>

              {/* Botão de Agendamento */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 rounded-lg text-xl font-bold transition-all transform hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none"
                style={{
                  backgroundColor: loading ? "#666" : "#FFD700",
                  color: "#000",
                  boxShadow: loading ? "none" : "0 4px 20px rgba(255, 215, 0, 0.4)"
                }}
              >
                {loading ? "Enviando..." : "Solicitar Agendamento"}
              </button>
            </form>

            <div className="mt-6 text-center text-yellow-500 text-sm">
              * Após o envio, aguarde a confirmação do barbeiro
            </div>
          </div>
        </div>
      </section>

      {/* Informações de Contato */}
      <section className="py-8 px-6" style={{ backgroundColor: "#000" }}>
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-6">
          <div className="text-center p-6 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#0a0a0a" }}>
            <div className="text-3xl mb-3">📱</div>
            <h3 className="text-lg font-bold mb-2" style={{ color: "#FFD700" }}>WhatsApp</h3>
            <a href={whatsappLink} className="text-white/80 hover:text-white">{whatsappFormatted}</a>
          </div>
          <div className="text-center p-6 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#0a0a0a" }}>
            <div className="text-3xl mb-3">📍</div>
            <h3 className="text-lg font-bold mb-2" style={{ color: "#FFD700" }}>Localização</h3>
            <p className="text-white/80 text-sm">{address}, {city}</p>
          </div>
          <div className="text-center p-6 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#0a0a0a" }}>
            <div className="text-3xl mb-3">⏰</div>
            <h3 className="text-lg font-bold mb-2" style={{ color: "#FFD700" }}>Horário</h3>
            <p className="text-white/80 text-sm">Seg-Sex: 09:00-19:00<br/>Sáb: 09:00-17:00</p>
          </div>
        </div>
      </section>

      {/* Rodapé */}
      <footer className="py-6 px-6 text-center text-white/60 text-sm" style={{ backgroundColor: "#000", borderTop: "1px solid rgba(255, 215, 0, 0.1)" }}>
        <p>© 2025 LEO PRIME BARBERSHOP. Todos os direitos reservados.</p>
      </footer>
    </div>
  );
}