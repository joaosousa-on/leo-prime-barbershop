"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export default function HomePage() {
  const whatsapp = "5571987404707";
  const whatsappFormatted = "(71) 98740-4707";
  const instagram = "leo_barbershop225";
  const address = "Rua São José, Jardim Nova Esperança";
  const city = "Salvador, Bahia";
  const cep = "41370-070";
  const [status, setStatus] = useState("carregando");
  const [connectionStatus, setConnectionStatus] = useState("Conectando...");
  const [lastUpdate, setLastUpdate] = useState(null);
  const [isClient, setIsClient] = useState(false);
  const [services, setServices] = useState([]);

  const whatsappLink = `https://wa.me/${whatsapp}?text=Olá, gostaria de agendar um horário na LEO PRIME BARBERSHOP!`;
  const instagramLink = `https://instagram.com/${instagram}`;

  useEffect(() => {
    setIsClient(true);
    loadServices();
  }, []);

  const formatTimeSafe = (date) => {
    if (!date || !isClient) return "--:--:--";
    return date.toLocaleTimeString();
  };

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

  useEffect(() => {
    let intervalId;
    let subscription;

    const initializeRealtime = async () => {
      console.log("Iniciando sistema em tempo real na página principal...");
      
      await loadStatus();

      intervalId = setInterval(async () => {
        await loadStatus();
        setLastUpdate(new Date());
      }, 10000);

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
              className="flex items-center justify-center gap-2 px-10 py-5 rounded-lg text-xl font-bold transition-all transform hover:scale-105 hover:shadow-2xl"
              style={{
                backgroundColor: "#25D366",
                color: "#000",
                boxShadow: "0 4px 20px rgba(37, 211, 102, 0.4)"
              }}
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893-.001-3.189-1.262-6.209-3.553-8.503"/>
              </svg>
              WhatsApp Barbearia
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

          <div className="mt-8 flex justify-center gap-6">
            <a
              href={instagramLink}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-6 py-3 rounded-lg transition-all transform hover:scale-105"
              style={{
                background: "linear-gradient(45deg, #405DE6, #5851DB, #833AB4, #C13584, #E1306C, #FD1D1D, #F56040, #F77737, #FCAF45, #FFDC80)",
                color: "#FFFFFF",
                boxShadow: "0 4px 20px rgba(225, 48, 108, 0.4)"
              }}
            >
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
              <span className="font-semibold">Siga @leo_barbershop225</span>
            </a>
          </div>
        </div>
      </section>

      <section className="py-16 px-6" style={{ backgroundColor: "#0a0a0a" }}>
        <div className="max-w-6xl mx-auto grid md:grid-cols-4 gap-8">
          
          <div className="text-center p-6 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#111" }}>
            <div className="text-4xl mb-4 flex justify-center">
              <svg className="w-12 h-12" fill="#25D366" viewBox="0 0 24 24">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893-.001-3.189-1.262-6.209-3.553-8.503"/>
              </svg>
            </div>
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
              Segunda a Sábado<br />
              09:00 - 20:00<br />
              Domingo<br />
              09:00 - 12:00
            </p>
          </div>

          <div className="text-center p-6 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#111" }}>
            <div className="text-4xl mb-4 flex justify-center">
              <svg className="w-12 h-12" fill="url(#instagram-gradient)" viewBox="0 0 24 24">
                <defs>
                  <linearGradient id="instagram-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#405DE6" />
                    <stop offset="15%" stopColor="#5851DB" />
                    <stop offset="30%" stopColor="#833AB4" />
                    <stop offset="50%" stopColor="#C13584" />
                    <stop offset="70%" stopColor="#E1306C" />
                    <stop offset="85%" stopColor="#FD1D1D" />
                    <stop offset="100%" stopColor="#FCAF45" />
                  </linearGradient>
                </defs>
                <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
              </svg>
            </div>
            <h3 className="text-xl font-bold mb-2" style={{ color: "#FFD700" }}>
              Instagram
            </h3>
            <a
              href={instagramLink}
              target="_blank"
              rel="noopener noreferrer"
              className="text-white/80 hover:text-white transition-colors text-lg block"
            >
              @leo_barbershop225
            </a>
            <p className="text-white/60 text-sm mt-2">
              Siga nosso trabalho
            </p>
          </div>

        </div>
      </section>

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
            className="flex items-center justify-center gap-2 px-12 py-5 rounded-lg text-xl font-bold transition-all transform hover:scale-105"
            style={{
              backgroundColor: "#25D366",
              color: "#000",
              boxShadow: "0 4px 20px rgba(37, 211, 102, 0.4)"
            }}
          >
            <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893-.001-3.189-1.262-6.209-3.553-8.503"/>
            </svg>
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
            📅 Agendar Online
          </Link>
        </div>

        <div className="mt-8 flex justify-center gap-6">
          <a
            href={instagramLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-6 py-3 rounded-lg transition-all transform hover:scale-105"
            style={{
              background: "linear-gradient(45deg, #405DE6, #5851DB, #833AB4, #C13584, #E1306C, #FD1D1D, #F56040, #F77737, #FCAF45, #FFDC80)",
              color: "#FFFFFF",
              boxShadow: "0 4px 20px rgba(225, 48, 108, 0.4)"
            }}
          >
            <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            <span>Siga @leo_barbershop225</span>
          </a>
        </div>
      </section>

      <footer className="py-6 px-6 text-center text-white/60 text-sm" style={{ backgroundColor: "#000", borderTop: "1px solid rgba(255, 215, 0, 0.1)" }}>
        <p>© 2025 LEO PRIME BARBERSHOP. Todos os direitos reservados.</p>
        <p className="mt-2">{address}, {city} - CEP: {cep}</p>
        <div className="mt-4 flex justify-center gap-6">
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="#25D366" viewBox="0 0 24 24">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893-.001-3.189-1.262-6.209-3.553-8.503"/>
            </svg>
            WhatsApp
          </a>
          <a
            href={instagramLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 hover:text-white transition-colors"
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
            </svg>
            Instagram
          </a>
        </div>
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