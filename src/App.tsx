import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  BrowserRouter,
  Link,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import "./App.css";

const API_BASE = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");
const apiUrl = (path: string) => `${API_BASE}${path}`;

type EventItem = {
  id: string;
  title: string;
  venue: string;
  city: string;
  date: string;
  day: string;
  month: string;
  time: string;
  category: string;
  price: number;
  ticketTypeId?: string;
  image: string;
  tags: string[];
};
const events: EventItem[] = [
  {
    id: "sundown",
    title: "Sundown Sessions",
    venue: "Arca Club",
    city: "São Paulo, SP",
    date: "29 AGO 2026",
    day: "29",
    month: "AGO",
    time: "22:00",
    category: "Eletrônica",
    price: 85,
    tags: ["Hoje", "Sábado"],
    image:
      "https://images.unsplash.com/photo-1571266028243-d220c9c3b7de?auto=format&fit=crop&w=1200&q=85",
  },
  {
    id: "baile",
    title: "Baile da Aurora",
    venue: "Vila JK",
    city: "São Paulo, SP",
    date: "05 SET 2026",
    day: "05",
    month: "SET",
    time: "23:00",
    category: "Funk",
    price: 60,
    tags: ["Sábado"],
    image:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "selva",
    title: "Selva Tropical",
    venue: "Casa Flora",
    city: "Rio de Janeiro, RJ",
    date: "12 SET 2026",
    day: "12",
    month: "SET",
    time: "20:00",
    category: "Festas",
    price: 72,
    tags: ["Sábado", "Bar"],
    image:
      "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "disco",
    title: "Disco Fever",
    venue: "Tokyo Rose",
    city: "Belo Horizonte, MG",
    date: "19 SET 2026",
    day: "19",
    month: "SET",
    time: "22:30",
    category: "Shows",
    price: 90,
    tags: ["Sábado"],
    image:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "terraço",
    title: "Terraço 360",
    venue: "Vista Rooftop",
    city: "São Paulo, SP",
    date: "28 AGO 2026",
    day: "28",
    month: "AGO",
    time: "19:00",
    category: "Bares",
    price: 45,
    tags: ["Hoje", "Bar"],
    image:
      "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=900&q=85",
  },
  {
    id: "brava",
    title: "Brava Festival",
    venue: "Marina da Glória",
    city: "Rio de Janeiro, RJ",
    date: "26 SET 2026",
    day: "26",
    month: "SET",
    time: "16:00",
    category: "Festivais",
    price: 140,
    tags: ["Sábado", "VIP"],
    image:
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=85",
  },
];
const categories = [
  "Todos",
  "Baladas",
  "Shows",
  "Festas",
  "Bares",
  "Festivais",
  "Eletrônica",
  "Funk",
  "Sertanejo",
  "Pagode",
  "Rock",
  "VIP",
];
const venues = [
  {
    name: "Arca Club",
    city: "São Paulo, SP",
    type: "Eletrônica",
    image:
      "https://images.unsplash.com/photo-1566737236500-c8ac43014a67?auto=format&fit=crop&w=900&q=85",
  },
  {
    name: "Vila JK",
    city: "São Paulo, SP",
    type: "Balada",
    image:
      "https://images.unsplash.com/photo-1574391884720-bbc3740c59d1?auto=format&fit=crop&w=900&q=85",
  },
  {
    name: "Vista Rooftop",
    city: "São Paulo, SP",
    type: "Bar",
    image:
      "https://images.unsplash.com/photo-1515003197210-e0cd71810b5f?auto=format&fit=crop&w=900&q=85",
  },
  {
    name: "Casa Flora",
    city: "Rio de Janeiro, RJ",
    type: "Festas",
    image:
      "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=900&q=85",
  },
];
const moods = [
  { icon: "✦", label: "Qualquer rolê" },
  { icon: "◉", label: "Balada" },
  { icon: "♫", label: "Show" },
  { icon: "♢", label: "Bar" },
  { icon: "✹", label: "Festival" },
];

type ApiEvent = {
  id: string;
  name: string;
  category: string | null;
  start_at: string;
  banner_url: string | null;
  thumbnail_url: string | null;
  venue: { name: string; city: string } | null;
  ticket_types: Array<{
    id: string;
    price: string | number;
    quantity: number;
    sold_quantity: number;
    reserved_quantity: number;
  }>;
};
function toEventItem(item: ApiEvent, index: number): EventItem {
  const date = new Date(item.start_at);
  const month = date
    .toLocaleDateString("pt-BR", { month: "short" })
    .replace(".", "")
    .toUpperCase();
  return {
    id: item.id,
    title: item.name,
    venue: item.venue?.name ?? "Local a confirmar",
    city: item.venue ? `${item.venue.city}, SP` : "São Paulo, SP",
    date: date
      .toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replaceAll(" de ", " ")
      .toUpperCase(),
    day: String(date.getDate()).padStart(2, "0"),
    month,
    time: date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    category: item.category ?? "Eventos",
    price: Number(item.ticket_types[0]?.price ?? 0),
    ticketTypeId: item.ticket_types[0]?.id,
    tags: ["Sábado"],
    image:
      item.banner_url ??
      item.thumbnail_url ??
      events[index % events.length].image,
  };
}
function useCatalog() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(apiUrl("/api/events"))
      .then(async (response) => {
        if (!response.ok)
          throw new Error("Não foi possível carregar os eventos.");
        const data = (await response.json()) as { events: ApiEvent[] };
        setItems(data.events.map(toEventItem));
      })
      .catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Catálogo indisponível.",
        ),
      )
      .finally(() => setLoading(false));
  }, []);
  return { items, loading, error };
}

type SessionUser = { id: string; name: string; email: string; role: string };

function Header() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user?: SessionUser } | null) =>
        setUser(data?.user ?? null),
      )
      .catch(() => setUser(null));
  }, []);
  return (
    <header className="header">
      <Link to="/" className="brand">
        <span className="brand-mark">b</span>
        <span>balada</span>
      </Link>
      <nav>
        <Link to="/eventos">Descobrir</Link>
        <a href="#categorias">Categorias</a>
        {user && <Link to="/meus-ingressos">Meus ingressos</Link>}
      </nav>
      <div className="header-actions">
        <button
          className="icon-button"
          aria-label="Buscar eventos"
          onClick={() => navigate("/eventos")}
        >
          ⌕
        </button>
        {user ? (
          <Link to="/perfil" className="profile-chip">
            <span>{user.name.charAt(0).toUpperCase()}</span>
            {user.name.split(" ")[0]}
          </Link>
        ) : (
          <>
            <Link to="/login" className="login-link">
              Entrar
            </Link>
            <Link to="/cadastro" className="primary-button small">
              Criar conta
            </Link>
          </>
        )}
      </div>
    </header>
  );
}
function EventCard({ event, index = 0 }: { event: EventItem; index?: number }) {
  return (
    <article
      className="event-card transition duration-300 hover:-translate-y-1 hover:shadow-xl"
      style={{ animationDelay: `${index * 70}ms` }}
    >
      <Link to={`/eventos/${event.id}`} className="event-image-wrap">
        <img src={event.image} alt={event.title} />
        <span className="event-date">
          <strong>{event.day}</strong>
          {event.month}
        </span>
        <span className="save-button">♡</span>
      </Link>
      <div className="event-card-body">
        <div className="eyebrow">
          {event.category} <span>·</span> {event.city}
        </div>
        <Link to={`/eventos/${event.id}`}>
          <h3>{event.title}</h3>
        </Link>
        <p className="event-meta">
          {event.date} · {event.time} <span>—</span> {event.venue}
        </p>
        <div className="event-card-footer">
          <span>
            A partir de <strong>R$ {event.price},00</strong>
          </span>
          <Link to={`/eventos/${event.id}`} className="arrow-link">
            Ver evento <span>↗</span>
          </Link>
        </div>
      </div>
    </article>
  );
}

function Home() {
  const { items, loading, error } = useCatalog();
  const catalog = items.length ? items : events;
  const [mood, setMood] = useState("Qualquer rolê");
  const [period, setPeriod] = useState("Hoje");
  const [budget, setBudget] = useState("Qualquer preço");
  const [search, setSearch] = useState("");
  const navigate = useNavigate();
  const moodCategory =
    mood === "Qualquer rolê"
      ? ""
      : mood === "Show"
        ? "Shows"
        : mood === "Bar"
          ? "Bares"
          : mood === "Festival"
            ? "Festivais"
            : "Baladas";
  const filtered = useMemo(
    () =>
      catalog.filter(
        (event) =>
          (!moodCategory || event.category === moodCategory) &&
          (period === "Qualquer dia" || event.tags.includes(period)) &&
          (budget === "Qualquer preço" ||
            (budget === "Até R$ 70"
              ? event.price <= 70
              : budget === "R$ 70–120"
                ? event.price > 70 && event.price <= 120
                : event.price > 120)),
      ),
    [catalog, moodCategory, period, budget],
  );
  return (
    <>
      <Header />
      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="kicker">A cidade está viva</span>
            <h1>
              O que você
              <br />
              <em>quer viver?</em>
            </h1>
            <p>
              Conte o clima. A gente encontra o próximo lugar onde sua noite
              começa.
            </p>
            <Link to="/eventos" className="primary-button">
              Explorar eventos <span>↗</span>
            </Link>
            <div className="home-search">
              <span>⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                onKeyDown={(event) =>
                  event.key === "Enter" &&
                  navigate(`/eventos?q=${encodeURIComponent(search)}`)
                }
                placeholder="Busque evento, artista ou local"
                aria-label="Buscar eventos"
              />
              <button
                type="button"
                onClick={() =>
                  navigate(`/eventos?q=${encodeURIComponent(search)}`)
                }
              >
                Buscar
              </button>
            </div>
          </div>
          <div className="hero-art">
            <img src={catalog[0].image} alt="Público em um show noturno" />
            <div className="floating-note">
              <span className="pulse-dot"></span>
              <div>
                <strong>1.240 pessoas</strong>
                <small>estão descobrindo eventos</small>
              </div>
            </div>
          </div>
        </section>
        {error && (
          <div className="catalog-notice" role="status">
            {error} Exibindo a última curadoria disponível.
          </div>
        )}
        <section className="discovery-panel">
          <div className="discovery-heading">
            <div>
              <span className="kicker">Seu rolê, suas regras</span>
              <h2>Vamos encontrar seu próximo plano.</h2>
            </div>
            <span className="location-badge">⌖ São Paulo</span>
          </div>
          <div className="question-row">
            <span className="question-label">Eu quero</span>
            <div className="choice-row">
              {moods.map((item) => (
                <button
                  key={item.label}
                  className={mood === item.label ? "choice active" : "choice"}
                  onClick={() => setMood(item.label)}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="question-row">
            <span className="question-label">Quando</span>
            <div className="choice-row">
              <button
                className={period === "Hoje" ? "choice active" : "choice"}
                onClick={() => setPeriod("Hoje")}
              >
                Hoje
              </button>
              <button
                className={period === "Sábado" ? "choice active" : "choice"}
                onClick={() => setPeriod("Sábado")}
              >
                Este sábado
              </button>
              <button
                className={
                  period === "Qualquer dia" ? "choice active" : "choice"
                }
                onClick={() => setPeriod("Qualquer dia")}
              >
                Qualquer dia
              </button>
            </div>
          </div>
          <div className="question-row">
            <span className="question-label">Meu orçamento</span>
            <div className="choice-row">
              <button
                className={
                  budget === "Qualquer preço" ? "choice active" : "choice"
                }
                onClick={() => setBudget("Qualquer preço")}
              >
                Qualquer preço
              </button>
              <button
                className={budget === "Até R$ 70" ? "choice active" : "choice"}
                onClick={() => setBudget("Até R$ 70")}
              >
                Até R$ 70
              </button>
              <button
                className={budget === "R$ 70–120" ? "choice active" : "choice"}
                onClick={() => setBudget("R$ 70–120")}
              >
                R$ 70–120
              </button>
              <button
                className={
                  budget === "Acima de R$ 120" ? "choice active" : "choice"
                }
                onClick={() => setBudget("Acima de R$ 120")}
              >
                VIP
              </button>
            </div>
          </div>
        </section>
        <section className="venue-section px-5 sm:px-0">
          <div className="section-heading">
            <div>
              <span className="kicker">Lugares que fazem a noite</span>
              <h2>Conheça os espaços.</h2>
            </div>
            <Link to="/eventos" className="text-link">
              Ver todos <span>↗</span>
            </Link>
          </div>
          <div className="venue-grid">
            {venues.map((venue, index) => (
              <Link
                to="/eventos"
                className="venue-card group"
                key={venue.name}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <img src={venue.image} alt={venue.name} loading="lazy" />
                <div className="venue-card-overlay">
                  <span>{venue.type}</span>
                  <strong>{venue.name}</strong>
                  <small>{venue.city}</small>
                </div>
              </Link>
            ))}
          </div>
        </section>
        <section className="section-block events-section">
          <div className="section-heading">
            <div>
              <span className="kicker">
                {filtered.length
                  ? "Combina com você"
                  : "Tente outra combinação"}
              </span>
              <h2>
                {filtered.length ? "O melhor da noite" : "Nada por aqui ainda"}
              </h2>
            </div>
            <Link to="/eventos" className="text-link">
              Explorar todos <span>↗</span>
            </Link>
          </div>
          <div className="event-grid">
            {(loading ? catalog.slice(0, 3) : filtered.slice(0, 3)).map(
              (event, index) => (
                <EventCard event={event} index={index} key={event.id} />
              ),
            )}
          </div>
        </section>
        <section className="trend-strip">
          <div>
            <span className="kicker">Agora na balada</span>
            <h2>
              O que está
              <br />
              <em>em alta.</em>
            </h2>
          </div>
          <div className="trend-items">
            <div>
              <strong>01</strong>
              <span>Eletrônica</span>
            </div>
            <div>
              <strong>02</strong>
              <span>Rooftops</span>
            </div>
            <div>
              <strong>03</strong>
              <span>Festivais</span>
            </div>
          </div>
          <Link to="/eventos" className="outline-button">
            Ver tendências <span>↗</span>
          </Link>
        </section>
        <section className="section-block" id="categorias">
          <div className="section-heading">
            <div>
              <span className="kicker">Escolha seu clima</span>
              <h2>Mais formas de sair</h2>
            </div>
          </div>
          <div className="category-row">
            {categories.slice(1).map((item) => (
              <Link key={item} to="/eventos" className="category-pill">
                {item}
              </Link>
            ))}
          </div>
        </section>
      </main>
      <Footer />
    </>
  );
}
function EventsPage() {
  const { items, loading, error } = useCatalog();
  const catalog = items.length ? items : events;
  const [searchParams] = useSearchParams();
  const [term, setTerm] = useState(searchParams.get("q") ?? "");
  const [category, setCategory] = useState("Todos");
  const results = catalog.filter(
    (event) =>
      `${event.title} ${event.venue} ${event.city}`
        .toLowerCase()
        .includes(term.toLowerCase()) &&
      (category === "Todos" || event.category === category),
  );
  return (
    <>
      <Header />
      <main className="page-content">
        <div className="page-intro">
          <span className="kicker">Descubra algo novo</span>
          <h1>Todos os eventos</h1>
          <p>Escolha seu próximo destino.</p>
        </div>
        <div className="filters">
          <div className="search-field">
            <span>⌕</span>
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Evento, artista ou local"
            />
          </div>
          <button className="filter-button">
            Data <span>⌄</span>
          </button>
          <button className="filter-button">
            Preço <span>⌄</span>
          </button>
        </div>
        <div className="category-row listing-categories">
          {categories.map((item) => (
            <button
              key={item}
              className={
                category === item ? "category-pill active" : "category-pill"
              }
              onClick={() => setCategory(item)}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="results-label">
          {loading
            ? "Carregando experiências..."
            : `${results.length} experiências encontradas`}
        </div>
        {error && (
          <div className="catalog-notice" role="status">
            {error} Exibindo a curadoria disponível.
          </div>
        )}
        <div className="event-grid">
          {results.map((event, index) => (
            <EventCard event={event} index={index} key={event.id} />
          ))}
        </div>
      </main>
      <Footer />
    </>
  );
}
function EventDetails() {
  const { items, loading, error } = useCatalog();
  const catalog = items.length ? items : events;
  const { id } = useParams();
  const event = catalog.find((item) => item.id === id) ?? catalog[0];
  const [quantity, setQuantity] = useState(1);
  const navigate = useNavigate();
  return (
    <>
      <Header />
      <main className="details-page">
        <Link to="/eventos" className="back-link">
          ← Voltar para eventos
        </Link>
        {loading && (
          <div className="catalog-notice" role="status">
            Atualizando disponibilidade...
          </div>
        )}
        {error && (
          <div className="catalog-notice" role="status">
            {error}
          </div>
        )}
        <div className="detail-hero">
          <img src={event.image} alt={event.title} />
          <div className="detail-overlay">
            <span className="kicker">{event.category}</span>
            <h1>{event.title}</h1>
            <p>
              {event.date} · {event.time} · {event.venue}
            </p>
          </div>
        </div>
        <div className="detail-layout">
          <section className="detail-copy">
            <span className="kicker">Sobre o evento</span>
            <h2>Uma noite para lembrar.</h2>
            <p>
              Prepare-se para uma experiência única, com música, encontros e
              aquela energia que só a noite sabe criar. Chegue cedo, encontre
              sua turma e deixe o resto acontecer.
            </p>
            <div className="info-list">
              <div>
                <span>⌖</span>
                <div>
                  <small>Local</small>
                  <strong>{event.venue}</strong>
                  <p>Av. Brigadeiro Faria Lima, 166</p>
                </div>
              </div>
              <div>
                <span>◷</span>
                <div>
                  <small>Data e horário</small>
                  <strong>{event.date}</strong>
                  <p>Abertura da casa às {event.time}</p>
                </div>
              </div>
            </div>
          </section>
          <aside className="ticket-box">
            <span className="kicker">Escolha seu ingresso</span>
            <div className="ticket-option">
              <div>
                <strong>Entrada antecipada</strong>
                <small>Acesso à pista</small>
              </div>
              <strong>R$ {event.price},00</strong>
            </div>
            <div className="ticket-option">
              <div>
                <strong>VIP Experience</strong>
                <small>Área exclusiva + welcome drink</small>
              </div>
              <strong>R$ 180,00</strong>
            </div>
            <div className="quantity-row">
              <span>Quantidade</span>
              <div className="stepper">
                <button onClick={() => setQuantity(Math.max(1, quantity - 1))}>
                  −
                </button>
                <strong>{quantity}</strong>
                <button onClick={() => setQuantity(Math.min(5, quantity + 1))}>
                  +
                </button>
              </div>
            </div>
            <div className="total-row">
              <span>Total</span>
              <strong>R$ {event.price * quantity},00</strong>
            </div>
            <button
              className="primary-button full"
              onClick={() =>
                navigate("/checkout", { state: { event, quantity } })
              }
            >
              Continuar <span>→</span>
            </button>
            <small className="secure-note">
              ⌾ Compra segura · limite de 5 ingressos
            </small>
          </aside>
        </div>
      </main>
    </>
  );
}
function Checkout() {
  const location = useLocation();
  const state = location.state as
    | { event?: EventItem; quantity?: number }
    | undefined;
  const event = state?.event ?? events[0];
  const quantity = state?.quantity ?? 1;
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CREDIT_CARD">(
    "PIX",
  );
  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setError("");
    if (!/^[0-9a-f-]{36}$/i.test(event.id) || !event.ticketTypeId) {
      setError(
        "Este evento ainda está em modo de demonstração e não aceita reservas reais.",
      );
      return;
    }
    setIsSubmitting(true);
    try {
      const response = await fetch(apiUrl("/api/reservations"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          eventId: event.id,
          items: [{ ticketTypeId: event.ticketTypeId, quantity }],
          paymentMethod,
        }),
      });
      const data = (await response.json()) as { error?: string };
      if (response.status === 401) {
        navigate("/login", { state: { returnTo: "/checkout" } });
        return;
      }
      if (!response.ok)
        throw new Error(data.error ?? "Não foi possível criar sua reserva.");
      navigate("/pagamento/pendente");
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Não foi possível concluir o checkout.",
      );
    } finally {
      setIsSubmitting(false);
    }
  };
  return (
    <>
      <Header />
      <main className="checkout-page">
        <Link to={`/eventos/${event.id}`} className="back-link">
          ← Voltar
        </Link>
        <div className="checkout-heading">
          <span className="kicker">Quase lá</span>
          <h1>Finalize sua compra</h1>
        </div>
        <div className="checkout-layout">
          <form id="checkout-form" className="checkout-form" onSubmit={submit}>
            <div className="form-section">
              <h3>Seus dados</h3>
              <div className="field-grid">
                <label>
                  Nome completo
                  <input
                    required
                    minLength={3}
                    placeholder="Como no documento"
                  />
                </label>
                <label>
                  E-mail
                  <input required type="email" placeholder="voce@email.com" />
                </label>
                <label>
                  Telefone
                  <input required minLength={8} placeholder="(00) 00000-0000" />
                </label>
              </div>
            </div>
            <div className="form-section">
              <h3>Forma de pagamento</h3>
              <div className="payment-tabs">
                <button
                  type="button"
                  onClick={() => setPaymentMethod("CREDIT_CARD")}
                  className={
                    paymentMethod === "CREDIT_CARD"
                      ? "payment-tab active"
                      : "payment-tab"
                  }
                >
                  ▣ Cartão
                </button>
                <button
                  type="button"
                  onClick={() => setPaymentMethod("PIX")}
                  className={
                    paymentMethod === "PIX"
                      ? "payment-tab active"
                      : "payment-tab"
                  }
                >
                  ◇ Pix
                </button>
              </div>
              <label
                className={
                  paymentMethod === "PIX" ? "payment-fields-hidden" : ""
                }
              >
                Número do cartão
                <input
                  required={paymentMethod === "CREDIT_CARD"}
                  inputMode="numeric"
                  minLength={16}
                  placeholder="0000 0000 0000 0000"
                />
              </label>
              <div
                className={`field-grid ${paymentMethod === "PIX" ? "payment-fields-hidden" : ""}`}
              >
                <label>
                  Validade
                  <input
                    required={paymentMethod === "CREDIT_CARD"}
                    placeholder="MM/AA"
                  />
                </label>
                <label>
                  CVV
                  <input
                    required={paymentMethod === "CREDIT_CARD"}
                    minLength={3}
                    placeholder="000"
                  />
                </label>
              </div>
            </div>
            {error && (
              <div className="checkout-error" role="alert">
                <strong>Não foi possível continuar</strong>
                <span>{error}</span>
              </div>
            )}
            <button
              type="submit"
              disabled={isSubmitting}
              className="primary-button full mobile-only"
            >
              {isSubmitting
                ? "Processando..."
                : `Pagar R$ ${event.price * quantity},00`}
            </button>
          </form>
          <aside className="order-summary">
            <span className="kicker">Resumo do pedido</span>
            <div className="summary-event">
              <img src={event.image} alt="" />
              <div>
                <strong>{event.title}</strong>
                <small>
                  {event.date} · {event.time}
                </small>
              </div>
            </div>
            <div className="summary-line">
              <span>{quantity}x Entrada antecipada</span>
              <strong>R$ {event.price * quantity},00</strong>
            </div>
            <div className="summary-line">
              <span>Taxa de serviço</span>
              <strong>R$ 8,50</strong>
            </div>
            <div className="summary-total">
              <span>Total</span>
              <strong>R$ {event.price * quantity + 8.5},50</strong>
            </div>
            <button
              type="submit"
              form="checkout-form"
              disabled={isSubmitting}
              className="primary-button full desktop-only"
            >
              {isSubmitting ? (
                "Processando..."
              ) : (
                <>
                  Pagar agora <span>→</span>
                </>
              )}
            </button>
            <small className="secure-note">
              ⌾ Seus dados são protegidos e criptografados
            </small>
          </aside>
        </div>
      </main>
    </>
  );
}
function Account() {
  const [user, setUser] = useState<SessionUser | null>(null);
  useEffect(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user?: SessionUser } | null) =>
        setUser(data?.user ?? null),
      )
      .catch(() => setUser(null));
  }, []);
  if (!user)
    return (
      <main className="page-content profile-page max-w-5xl mx-auto px-5 sm:px-8">
        <div className="empty-state">
          <span className="kicker">Área privada</span>
          <h1>Entre para acessar seus ingressos.</h1>
          <Link to="/login" className="primary-button">
            Entrar <span>→</span>
          </Link>
        </div>
      </main>
    );
  return (
    <>
      <Header />
      <main className="page-content account-page">
        <div className="page-intro">
          <span className="kicker">Olá, {user.name.split(" ")[0]}</span>
          <h1>Seus ingressos</h1>
          <p>O próximo momento já tem endereço.</p>
        </div>
        <div className="account-tabs">
          <button className="active">Próximos</button>
          <button>Histórico</button>
        </div>
        <div className="ticket-list">
          <div className="owned-ticket">
            <div className="ticket-image">
              <img src={events[0].image} alt="" />
              <span>
                29
                <br />
                <small>AGO</small>
              </span>
            </div>
            <div className="owned-ticket-info">
              <span className="kicker">Eletrônica · São Paulo</span>
              <h3>{events[0].title}</h3>
              <p>
                {events[0].date} · {events[0].time}
                <br />
                {events[0].venue}
              </p>
              <div>
                <button className="outline-button">Ver ingresso</button>
                <button className="download-link">↓ Baixar PDF</button>
              </div>
            </div>
            <div className="qr-placeholder">
              ▦<small>QR CODE</small>
            </div>
          </div>
        </div>
      </main>
    </>
  );
}
function Login({ signup = false }: { signup?: boolean }) {
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [googleError] = useState(() =>
    new URLSearchParams(window.location.search).get("error") ===
    "google_unavailable"
      ? "Login Google ainda não foi configurado."
      : "",
  );
  const navigate = useNavigate();
  const startGoogleLogin = () => {
    window.location.href = "/api/auth/google";
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.includes("@")) return setError("Digite um e-mail válido.");
    if (password.length < 8)
      return setError("A senha precisa ter pelo menos 8 caracteres.");
    setError("");
    const response = await fetch(apiUrl(`/api/auth/${signup ? "register" : "login"}`), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(
        signup ? { name, email, password } : { email, password },
      ),
    });
    const data = (await response.json()) as { error?: string };
    if (!response.ok)
      return setError(data.error ?? "Não foi possível concluir.");
    navigate("/eventos");
  };
  return (
    <>
      <Header />
      <main className="auth-page bg-[radial-gradient(circle_at_top,#eef2ff,transparent_42%)]">
        <form
          className="auth-card rounded-2xl border border-slate-200/80 bg-white/90 p-6 shadow-2xl shadow-slate-900/10 backdrop-blur sm:p-10"
          onSubmit={submit}
          noValidate
        >
          <span className="brand-mark">b</span>
          <span className="kicker">
            {signup ? "Comece agora" : "Bem-vindo de volta"}
          </span>
          <h1>{signup ? "Crie sua conta." : "Entre na balada."}</h1>
          <p>
            {signup
              ? "Seu próximo momento começa aqui."
              : "Continue de onde a noite parou."}
          </p>
          <button
            type="button"
            className="google-button"
            onClick={startGoogleLogin}
          >
            G <span>Continuar com Google</span>
          </button>
          {googleError && (
            <small className="form-error" role="alert">
              {googleError}
            </small>
          )}
          <div className="or">
            <span>ou use seu e-mail</span>
          </div>
          {signup && (
            <label>
              Nome completo
              <input
                required
                minLength={3}
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Seu nome"
              />
            </label>
          )}
          <label>
            E-mail
            <input
              required
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="voce@email.com"
            />
          </label>
          <label>
            Senha
            <input
              required
              type="password"
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="mínimo de 8 caracteres"
            />
          </label>
          {error && (
            <small className="form-error" role="alert">
              {error}
            </small>
          )}
          <button className="primary-button full">
            {signup ? "Criar minha conta" : "Entrar"} <span>→</span>
          </button>
          <small className="auth-switch">
            {signup ? "Já tem uma conta? " : "Ainda não tem uma conta? "}
            <Link to={signup ? "/login" : "/cadastro"}>
              {signup ? "Entrar" : "Criar conta"}
            </Link>
          </small>
        </form>
      </main>
    </>
  );
}
function Profile() {
  const [user, setUser] = useState<SessionUser | null>(null);
  const navigate = useNavigate();
  useEffect(() => {
    fetch(apiUrl("/api/auth/me"), { credentials: "include" })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: { user?: SessionUser } | null) =>
        setUser(data?.user ?? null),
      )
      .catch(() => setUser(null));
  }, []);
  const logout = async () => {
    await fetch(apiUrl("/api/auth/logout"), { method: "POST", credentials: "include" });
    navigate("/");
  };
  if (!user)
    return (
      <main className="page-content profile-page max-w-5xl mx-auto px-5 sm:px-8">
        <div className="empty-state">
          <span className="kicker">Área privada</span>
          <h1>Entre para ver seu perfil.</h1>
          <Link to="/login" className="primary-button">
            Entrar <span>→</span>
          </Link>
        </div>
      </main>
    );
  return (
    <>
      <Header />
      <main className="page-content profile-page max-w-5xl mx-auto px-5 sm:px-8">
        <div className="profile-header">
          <div className="profile-avatar shadow-lg shadow-orange-500/20">
            {user.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <span className="kicker">Sua conta</span>
            <h1>{user.name}</h1>
            <p>{user.email}</p>
          </div>
        </div>
        <div className="profile-grid">
          <Link
            to="/meus-ingressos"
            className="profile-option transition hover:-translate-y-1 hover:shadow-lg"
          >
            <strong>Meus ingressos</strong>
            <span>Veja seus tickets e próximos eventos →</span>
          </Link>
          <button
            className="profile-option transition hover:-translate-y-1 hover:shadow-lg"
            onClick={logout}
          >
            <strong>Sair da conta</strong>
            <span>Encerrar sua sessão com segurança →</span>
          </button>
        </div>
      </main>
    </>
  );
}
function Footer() {
  return (
    <footer>
      <Link to="/" className="brand">
        <span className="brand-mark">b</span>
        <span>balada</span>
      </Link>
      <span>Experiências que ficam.</span>
      <small>© 2026 balada</small>
    </footer>
  );
}
function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/eventos" element={<EventsPage />} />
        <Route path="/eventos/:id" element={<EventDetails />} />
        <Route path="/checkout" element={<Checkout />} />
        <Route path="/meus-ingressos" element={<Account />} />
        <Route path="/perfil" element={<Profile />} />
        <Route path="/login" element={<Login />} />
        <Route path="/cadastro" element={<Login signup />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </BrowserRouter>
  );
}
export default App;

