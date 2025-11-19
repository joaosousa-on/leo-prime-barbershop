"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function HomePage() {
  const whatsapp = "5571987404707";
  const whatsappFormatted = "(71) 98740-4707";
  const address = "Rua São José, Jardim Nova Esperança";
  const city = "Salvador, Bahia";
  const cep = "41370-070";
  const [status, setStatus] = useState("carregando");
  const [connectionStatus, setConnectionStatus] = useState("Conectando...");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [services, setServices] = useState([]);

  const whatsappLink = `https://wa.me/${whatsapp}?text=Olá, gostaria de agendar um horário na LEO PRIME BARBERSHOP!`;

  // Detecta quando está no cliente
  useEffect(() => {
    setIsClient(true);
    loadServices();
  }, []);

  // Função para formatar o horário de forma segura
  const formatTimeSafe = (date) => {
    if (!date || !isClient) return "--:--:--";
    return date.toLocaleTimeString();
  };

  // Carrega serviços do banco
  const loadServices = async () => {
    try {
      const { data: servicesData } = await supabase
        .from('services')
        .select('*')
        .eq('active', true)
        .order('price_cents', { ascending: false });

      if (servicesData) {
        setServices(servicesData);
      }
    } catch (error) {
      console.error("Erro ao carregar serviços:", error);
    }
  };

  // Sistema de tempo real
  useEffect(() => {
    let intervalId;
    let subscription;

    const initializeRealtime = async () => {
      console.log("Iniciando sistema em tempo real na página principal...");
      
      await loadStatus();

      // Polling como fallback - verifica a cada 10 segundos
      intervalId = setInterval(async () => {
        await loadStatus();
        setLastUpdate(new Date());
      }, 10000);

      // WebSockets do Supabase
      try {
        subscription = supabase
          .channel('shop-status-channel')
          .on(
            'postgres_changes',
            {
              event: 'INSERT',
              schema: 'public',
              table: 'shop_status'
            },
            (payload) => {
              setConnectionStatus("✅ Status em Tempo Real");
              setStatus(payload.new.status);
              setLastUpdate(new Date());
              showStatusChangeNotification(payload.new.status);
            }
          )
          .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
              setConnectionStatus("✅ Status em Tempo Real");
            } else if (status === 'CHANNEL_ERROR') {
              setConnectionStatus("🔄 Atualizando a cada 10s");
            }
          });

      } catch (websocketError) {
        console.error('Erro no WebSocket:', websocketError);
        setConnectionStatus("🔄 Atualizando a cada 10s");
      }
    };

    // Função para mostrar notificação visual de mudança de status
    const showStatusChangeNotification = (newStatus) => {
      if (!isClient) return;
      
      const notification = document.createElement('div');
      notification.className = `fixed top-4 right-4 p-4 rounded-lg shadow-lg z-50 transition-all duration-500 ${
        newStatus === 'aberto' ? 'bg-green-500 text-white' :
        newStatus === 'fechado' ? 'bg-red-500 text-white' :
        newStatus === 'almoco' ? 'bg-yellow-500 text-black' :
        'bg-orange-500 text-white'
      }`;
      notification.innerHTML = `
        <div class="font-bold">Status Atualizado!</div>
        <div>Barbearia agora está: <strong>${getStatusText(newStatus)}</strong></div>
      `;
      
      document.body.appendChild(notification);
      
      setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100%)';
        setTimeout(() => {
          if (document.body.contains(notification)) {
            document.body.removeChild(notification);
          }
        }, 500);
      }, 3000);
    };

    initializeRealtime();

    return () => {
      if (intervalId) clearInterval(intervalId);
      if (subscription) {
        supabase.removeChannel(subscription);
      }
    };
  }, [isClient]);

  const loadStatus = async () => {
    try {
      const { data: statusData, error } = await supabase
        .from('shop_status')
        .select('status')
        .order('updated_at', { ascending: false })
        .limit(1)
        .single();

      if (error) throw error;

      if (statusData) {
        setStatus(statusData.status);
        setLastUpdate(new Date());
      }
    } catch (error) {
      console.error("Erro ao carregar status:", error);
      setConnectionStatus("❌ Erro ao carregar status");
    }
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

  const getStatusText = (currentStatus = status) => {
    switch(currentStatus) {
      case 'aberto': return 'Aberto ✓';
      case 'fechado': return 'Fechado';
      case 'almoco': return 'Horário de Almoço';
      case 'manutencao': return 'Em Manutenção';
      default: return 'Carregando...';
    }
  };

  const forceRefresh = async () => {
    setConnectionStatus("🔄 Atualizando...");
    await loadStatus();
  };

  return (
    <div className="min-h-screen flex flex-col">
      {/* Notificação de Status em Tempo Real */}
      <div className="fixed top-0 left-0 right-0 bg-black bg-opacity-90 text-white py-2 px-4 text-center text-sm z-40 border-b border-yellow-600">
        <div className="flex justify-center items-center gap-4">
          <span className={connectionStatus.includes("✅") ? "text-green-400" : "text-yellow-400"}>
            {connectionStatus}
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-400">
            Última atualização: {formatTimeSafe(lastUpdate)}
          </span>
          <button
            onClick={forceRefresh}
            className="ml-2 px-2 py-1 bg-yellow-600 hover:bg-yellow-500 text-white rounded text-xs transition-colors"
            title="Forçar atualização do status"
          >
            🔄
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16 mt-8" style={{ background: "linear-gradient(135deg, #000 0%, #1a1a1a 100%)" }}>
        <div className="max-w-4xl">
          <h1 className="text-5xl md:text-7xl font-black mb-4" style={{ color: "#FFD700", textShadow: "0 2px 20px rgba(255, 215, 0, 0.3)" }}>
            LEO PRIME
          </h1>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            BARBERSHOP
          </h2>

          <div className={`text-xl font-semibold mb-4 ${getStatusColor()} transition-all duration-500`}>
            {getStatusText()}
          </div>

          <div className="flex justify-center items-center gap-2 mb-6">
            <div className={`w-3 h-3 rounded-full animate-pulse ${
              status === 'aberto' ? 'bg-green-500' :
              status === 'fechado' ? 'bg-red-500' :
              status === 'almoco' ? 'bg-yellow-500' :
              'bg-orange-500'
            }`}></div>
            <span className="text-white/60 text-sm">
              Status atualizado em tempo real
            </span>
          </div>

          <p className="text-xl md:text-2xl text-white/80 mb-12 max-w-2xl mx-auto">
            Estilo, tradição e excelência em cada corte
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-10 py-5 rounded-lg text-xl font-bold transition-all transform hover:scale-105 hover:shadow-2xl"
              style={{
                backgroundColor: "#FFD700",
                color: "#000",
                boxShadow: "0 4px 20px rgba(255, 215, 0, 0.4)"
              }}
            >
              🔥 Agendar pelo WhatsApp
            </a>

            <Link
              href="/agendar"
              className="inline-block px-10 py-5 rounded-lg text-xl font-bold transition-all transform hover:scale-105"
              style={{
                border: "2px solid #FFD700",
                color: "#FFD700",
                boxShadow: "0 4px 20px rgba(255, 215, 0, 0.2)"
              }}
            >
              📅 Agendar Online
            </Link>
          </div>
        </div>
      </section>

      {/* Informações de Contato */}
      <section className="py-16 px-6" style={{ backgroundColor: "#0a0a0a" }}>
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
          
          <div className="text-center p-6 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#111" }}>
            <div className="text-4xl mb-4">📱</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: "#FFD700" }}>
              WhatsApp
            </h3>
            <a
              href={whatsappLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-white transition-colors text-lg"
            >
              {whatsappFormatted}
            </a>
          </div>

          <div className="text-center p-6 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#111" }}>
            <div className="text-4xl mb-4">📍</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: "#FFD700" }}>
              Localização
            </h3>
            <p className="text-white/80 text-lg">
              {address}<br />
              {city}<br />
              CEP: {cep}
            </p>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address + ", " + city + ", " + cep)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block mt-3 text-sm hover:underline"
              style={{ color: "#FFD700" }}
            >
              Ver no Mapa →
            </a>
          </div>

          <div className="text-center p-6 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#111" }}>
            <div className="text-4xl mb-4">⏰</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: "#FFD700" }}>
              Horário de Funcionamento
            </h3>
            <p className="text-white/80 text-lg">
              Segunda a Sexta<br />
              09:00 - 19:00<br />
              Sábado<br />
              09:00 - 17:00
            </p>
          </div>

        </div>
      </section>

      {/* Serviços Destacados - AGORA DINÂMICOS */}
      <section className="py-16 px-6" style={{ backgroundColor: "#000" }}>
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-12" style={{ color: "#FFD700" }}>
            Nossos Serviços
          </h2>
          {services.length > 0 ? (
            <div className="grid md:grid-cols-3 gap-6">
              {services.map((service) => (
                <div key={service.id} className="p-6 rounded-lg transition-all hover:scale-105" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#0a0a0a" }}>
                  <div className="text-5xl mb-3">{service.emoji || "💈"}</div>
                  <h3 className="text-xl font-bold mb-2 text-white">{service.name}</h3>
                  <p className="text-yellow-400 font-semibold">R$ {(service.price_cents / 100).toFixed(2)}</p>
                  {service.description && (
                    <p className="text-white/70 text-sm mt-2">{service.description}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="grid md:grid-cols-3 gap-6">
              {[
                { icon: "✂️", title: "Corte + Barba + Sobrancelha", desc: "Completo - R$ 30,00" },
                { icon: "💈", title: "Corte + Sobrancelha", desc: "Estilo total - R$ 25,00" },
                { icon: "✂️", title: "Corte de Cabelo", desc: "Precisão - R$ 25,00" },
                { icon: "🪒", title: "Pezinho de Cabelo", desc: "Ajuste - R$ 10,00" },
                { icon: "🧔", title: "Barba", desc: "Modelagem - R$ 10,00" },
                { icon: "⭐", title: "Barba Modelada", desc: "Estilo premium - R$ 15,00" }
              ].map((service, i) => (
                <div key={i} className="p-6 rounded-lg transition-all hover:scale-105" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#0a0a0a" }}>
                  <div className="text-5xl mb-3">{service.icon}</div>
                  <h3 className="text-xl font-bold mb-2 text-white">{service.title}</h3>
                  <p className="text-yellow-400 font-semibold">{service.desc}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 px-6 text-center" style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #000 100%)" }}>
        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
          Pronto para o novo visual?
        </h2>
        <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
          Agende agora e garanta seu horário
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-12 py-5 rounded-lg text-xl font-bold transition-all transform hover:scale-105"
            style={{
              backgroundColor: "#FFD700",
              color: "#000",
              boxShadow: "0 4px 20px rgba(255, 215, 0, 0.4)"
            }}
          >
            Agendar no WhatsApp →
          </a>
          <Link
            href="/agendar"
            className="inline-block px-12 py-5 rounded-lg text-xl font-bold transition-all transform hover:scale-105"
            style={{
              border: "2px solid #FFD700",
              color: "#FFD700",
              boxShadow: "0 4px 20px rgba(255, 215, 0, 0.2)"
            }}
          >
            Agendar Online
          </Link>
        </div>
      </section>

      {/* Rodapé */}
      <footer className="py-6 px-6 text-center text-white/60 text-sm" style={{ backgroundColor: "#000", borderTop: "1px solid rgba(255, 215, 0, 0.1)" }}>
        <p>© 2025 LEO PRIME BARBERSHOP. Todos os direitos reservados.</p>
        <p className="mt-2">{address}, {city} - CEP: {cep}</p>
        <div className="mt-2 text-yellow-500">
          <span className={connectionStatus.includes("✅") ? "text-green-400" : "text-yellow-400"}>
            {connectionStatus}
          </span>
          <span className="text-gray-400 mx-2">•</span>
          <span className="text-gray-400">
            Atualizado: {formatTimeSafe(lastUpdate)}
          </span>
        </div>
      </footer>
    </div>
  );
}