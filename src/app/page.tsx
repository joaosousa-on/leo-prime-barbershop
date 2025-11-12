"use client";

import Link from "next/link";

export default function HomePage() {
  const whatsapp = "5571987404707"; // formato internacional
  const whatsappFormatted = "(71) 98740-4707";
  const address = "Rua São José, Jardim Nova Esperança";
  const city = "Salvador, Bahia";
  const cep = "41370-070";

  const whatsappLink = `https://wa.me/${whatsapp}?text=Olá, gostaria de agendar um horário na LEO PRIME BARBERSHOP!`;

  return (
    <div className="min-h-screen flex flex-col">
      {/* Hero Section */}
      <section className="flex-1 flex flex-col items-center justify-center text-center px-6 py-16" style={{ background: "linear-gradient(135deg, #000 0%, #1a1a1a 100%)" }}>
        <div className="max-w-4xl">
          {/* Logo/Nome */}
          <h1 className="text-5xl md:text-7xl font-black mb-4" style={{ color: "var(--color-brand-gold)", textShadow: "0 2px 20px rgba(255, 215, 0, 0.3)" }}>
            LEO PRIME
          </h1>
          <h2 className="text-3xl md:text-5xl font-bold text-white mb-6">
            BARBERSHOP
          </h2>

          {/* Tagline */}
          <p className="text-xl md:text-2xl text-white/80 mb-12 max-w-2xl mx-auto">
            Estilo, tradição e excelência em cada corte
          </p>

          {/* CTA Principal */}
          <a
            href={whatsappLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-block px-10 py-5 rounded-lg text-xl font-bold transition-all transform hover:scale-105 hover:shadow-2xl"
            style={{
              backgroundColor: "var(--color-brand-gold)",
              color: "#000",
              boxShadow: "0 4px 20px rgba(255, 215, 0, 0.4)"
            }}
          >
            🔥 Consulte e Agende seu corte agora
          </a>

          {/* Botão Secundário */}
          <div className="mt-6">
            <Link
              href="/agendar"
              className="inline-block px-8 py-4 rounded-lg text-lg font-semibold transition-all hover:bg-white/10"
              style={{
                border: "2px solid var(--color-brand-gold)",
                color: "var(--color-brand-gold)"
              }}
            >
              Ver Horários Disponíveis
            </Link>
          </div>
        </div>
      </section>

      {/* Informações de Contato */}
      <section className="py-16 px-6" style={{ backgroundColor: "#0a0a0a" }}>
        <div className="max-w-6xl mx-auto grid md:grid-cols-3 gap-8">
          
          {/* WhatsApp */}
          <div className="text-center p-6 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#111" }}>
            <div className="text-4xl mb-4">📱</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: "var(--color-brand-gold)" }}>
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

          {/* Endereço */}
          <div className="text-center p-6 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#111" }}>
            <div className="text-4xl mb-4">📍</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: "var(--color-brand-gold)" }}>
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
              style={{ color: "var(--color-brand-gold)" }}
            >
              Ver no Mapa →
            </a>
          </div>

          {/* Horário */}
          <div className="text-center p-6 rounded-lg" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#111" }}>
            <div className="text-4xl mb-4">⏰</div>
            <h3 className="text-xl font-bold mb-2" style={{ color: "var(--color-brand-gold)" }}>
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

      {/* Serviços Destacados */}
      <section className="py-16 px-6" style={{ backgroundColor: "#000" }}>
        <div className="max-w-6xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-12" style={{ color: "var(--color-brand-gold)" }}>
            Nossos Serviços
          </h2>
          <div className="grid md:grid-cols-4 gap-6">
            {[
              { icon: "✂️", title: "Corte Completo", desc: "Estilo e precisão" },
              { icon: "💈", title: "Barba", desc: "Modelagem e acabamento" },
              { icon: "🪒", title: "Barba + Corte", desc: "Combo premium" },
              { icon: "👶", title: "Infantil", desc: "Atendimento especial" }
            ].map((service, i) => (
              <div key={i} className="p-6 rounded-lg transition-all hover:scale-105" style={{ border: "1px solid rgba(255, 215, 0, 0.2)", backgroundColor: "#0a0a0a" }}>
                <div className="text-5xl mb-3">{service.icon}</div>
                <h3 className="text-xl font-bold mb-2 text-white">{service.title}</h3>
                <p className="text-white/60">{service.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-20 px-6 text-center" style={{ background: "linear-gradient(135deg, #1a1a1a 0%, #000 100%)" }}>
        <h2 className="text-4xl md:text-5xl font-bold mb-6 text-white">
          Pronto para o novo visual?
        </h2>
        <p className="text-xl text-white/80 mb-8 max-w-2xl mx-auto">
          Agende agora pelo WhatsApp e garanta seu horário
        </p>
        <a
          href={whatsappLink}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-block px-12 py-5 rounded-lg text-xl font-bold transition-all transform hover:scale-105"
          style={{
            backgroundColor: "var(--color-brand-gold)",
            color: "#000",
            boxShadow: "0 4px 20px rgba(255, 215, 0, 0.4)"
          }}
        >
          Agendar no WhatsApp →
        </a>
      </section>

      {/* Rodapé */}
      <footer className="py-6 px-6 text-center text-white/60 text-sm" style={{ backgroundColor: "#000", borderTop: "1px solid rgba(255, 215, 0, 0.1)" }}>
        <p>© 2025 LEO PRIME BARBERSHOP. Todos os direitos reservados.</p>
        <p className="mt-2">{address}, {city} - CEP: {cep}</p>
      </footer>
    </div>
  );
}