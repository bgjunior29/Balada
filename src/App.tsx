import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import {
  availableOf,
  brl,
  calendarFile,
  dayBadge,
  demoEvents,
  filterEvents,
  monthLabel,
  priceOptions,
  ticketsOf,
  toEventItem,
  weekAgenda,
  whenOptions,
  yearAgenda,
  type ApiEvent,
  type EventItem,
  type Filters,
} from "./catalog";
import { apiUrl, readJson, storage } from "./api";
import {
  SessionContext,
  canManageEvents,
  fetchSessionUser,
  useSession,
  type SessionUser,
} from "./session";
import "./App.css";

// A área administrativa só é baixada por quem abre /admin.
const AdminArea = lazy(() => import("./Admin"));

const fallbackCategories = [
  "Baladas",
  "Shows",
  "Festas",
  "Bares",
  "Festivais",
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
  { icon: "✦", label: "Qualquer rolê", category: "" },
  { icon: "◉", label: "Balada", category: "Baladas" },
  { icon: "♫", label: "Show", category: "Shows" },
  { icon: "♢", label: "Bar", category: "Bares" },
  { icon: "✹", label: "Festival", category: "Festivais" },
];

// ---------- Catálogo ----------
// Só cai na curadoria de demonstração se a API estiver fora do ar; uma lista
// vazia vinda da API é mostrada como vazia, não como eventos fictícios.
function useCatalog() {
  const [items, setItems] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  useEffect(() => {
    fetch(apiUrl("/api/events"))
      .then(async (response) => {
        const data = response.ok
          ? await readJson<{ events: ApiEvent[] }>(response)
          : null;
        if (!data) throw new Error("Não foi possível carregar os eventos.");
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
  return { catalog: error ? demoEvents : items, loading, error };
}
const categoriesOf = (catalog: EventItem[]) => {
  const found = [...new Set(catalog.map((event) => event.category))].sort();
  return found.length ? found : fallbackCategories;
};

function useFavorites() {
  const [favorites, setFavorites] = useState<string[]>(() =>
    storage.get<string[]>("balada:favoritos", []),
  );
  const toggle = (id: string) =>
    setFavorites((current) => {
      const next = current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id];
      storage.set("balada:favoritos", next);
      return next;
    });
  return { favorites, toggle };
}

// ---------- Sessão ----------
function SessionProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    setUser(await fetchSessionUser());
    setLoading(false);
  }, []);
  const signOut = useCallback(async () => {
    await fetch(apiUrl("/api/auth/logout"), {
      method: "POST",
      credentials: "include",
    }).catch(() => undefined);
    setUser(null);
  }, []);
  useEffect(() => {
    void fetchSessionUser().then((found) => {
      setUser(found);
      setLoading(false);
    });
  }, []);
  const value = useMemo(
    () => ({ user, loading, refresh, signOut }),
    [user, loading, refresh, signOut],
  );
  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

function Avatar({ user, className }: { user: SessionUser; className: string }) {
  const [broken, setBroken] = useState(false);
  return (
    <span className={className}>
      {user.avatar_url && !broken ? (
        <img
          src={user.avatar_url}
          alt=""
          referrerPolicy="no-referrer"
          onError={() => setBroken(true)}
        />
      ) : (
        user.name.charAt(0).toUpperCase()
      )}
    </span>
  );
}

// ---------- Estrutura ----------
function Header() {
  const { user } = useSession();
  return (
    <header className="header">
      <Link to="/" className="brand">
        <span className="brand-mark">b</span>
        <span>balada</span>
      </Link>
      <nav aria-label="Principal">
        <NavLink to="/eventos" end>
          Descobrir
        </NavLink>
        <Link to="/eventos?quando=hoje">Hoje</Link>
        <Link to="/#agenda-do-ano">Agenda do ano</Link>
        {user && <NavLink to="/meus-ingressos">Meus ingressos</NavLink>}
        {canManageEvents(user) && <NavLink to="/admin">Admin</NavLink>}
      </nav>
      <div className="header-actions">
        <Link
          className="icon-button"
          aria-label="Buscar eventos"
          to="/eventos?foco=1"
        >
          ⌕
        </Link>
        {user ? (
          <Link to="/perfil" className="profile-chip">
            <Avatar user={user} className="avatar-dot" />
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
// No celular o menu do topo some; esta barra fica fixa embaixo.
function MobileNav() {
  const { user } = useSession();
  return (
    <nav className="mobile-nav" aria-label="Navegação">
      <NavLink to="/" end>
        <span>⌂</span>Início
      </NavLink>
      <NavLink to="/eventos" end>
        <span>⌕</span>Buscar
      </NavLink>
      <Link to="/eventos?quando=hoje">
        <span>◷</span>Hoje
      </Link>
      <NavLink to={user ? "/meus-ingressos" : "/login"}>
        <span>▦</span>Ingressos
      </NavLink>
      <NavLink to={user ? "/perfil" : "/cadastro"}>
        <span>◉</span>
        {user ? "Perfil" : "Conta"}
      </NavLink>
    </nav>
  );
}
function Footer() {
  return (
    <footer>
      <Link to="/" className="brand">
        <span className="brand-mark">b</span>
        <span>balada</span>
      </Link>
      <span>Rolês de todo dia e os grandes eventos do ano.</span>
      <small>© {new Date().getFullYear()} balada</small>
    </footer>
  );
}
// Rola até a âncora (#agenda-do-ano) e para o topo ao trocar de página.
function ScrollManager() {
  const { pathname, hash } = useLocation();
  useEffect(() => {
    if (hash) {
      const target = document.getElementById(hash.slice(1));
      if (target) {
        target.scrollIntoView({ behavior: "smooth" });
        return;
      }
    }
    window.scrollTo(0, 0);
  }, [pathname, hash]);
  return null;
}

// ---------- Cartão de evento ----------
function EventCard({
  event,
  index = 0,
  favorite,
  onToggleFavorite,
}: {
  event: EventItem;
  index?: number;
  favorite: boolean;
  onToggleFavorite: (id: string) => void;
}) {
  const badge = dayBadge(event);
  const available = availableOf(event);
  return (
    <article
      className="event-card transition duration-300 hover:-translate-y-1 hover:shadow-xl"
      style={{ animationDelay: `${Math.min(index, 8) * 70}ms` }}
    >
      <div className="event-image-wrap">
        <Link to={`/eventos/${event.id}`} tabIndex={-1} aria-hidden="true">
          <img
            src={event.image}
            alt=""
            loading="lazy"
            onError={(error) => {
              error.currentTarget.style.display = "none";
            }}
          />
        </Link>
        <span className="event-date">
          <strong>{event.day}</strong>
          {event.month}
        </span>
        <div className="event-badges">
          {badge && <span className="badge live">{badge}</span>}
          {available === 0 ? (
            <span className="badge">Esgotado</span>
          ) : available <= 20 ? (
            <span className="badge warn">Últimos ingressos</span>
          ) : null}
        </div>
        <button
          type="button"
          className={favorite ? "save-button saved" : "save-button"}
          aria-label={favorite ? "Remover dos salvos" : "Salvar evento"}
          aria-pressed={favorite}
          onClick={() => onToggleFavorite(event.id)}
        >
          {favorite ? "♥" : "♡"}
        </button>
      </div>
      <div className="event-card-body">
        <div className="eyebrow">
          {event.category} <span>·</span> {event.city}
        </div>
        <Link to={`/eventos/${event.id}`}>
          <h3>{event.title}</h3>
        </Link>
        <p className="event-meta">
          <span className="capitalize">{event.weekday}</span>, {event.date} ·{" "}
          {event.time} <span>—</span> {event.venue}
        </p>
        <div className="event-card-footer">
          <span>
            {available === 0 ? (
              "Ingressos esgotados"
            ) : (
              <>
                A partir de <strong>{brl(event.price)}</strong>
              </>
            )}
          </span>
          <Link to={`/eventos/${event.id}`} className="arrow-link">
            {available === 0 ? "Ver evento" : "Comprar"} <span>↗</span>
          </Link>
        </div>
      </div>
    </article>
  );
}
function EventGrid({
  events,
  loading,
  skeletons = 3,
}: {
  events: EventItem[];
  loading?: boolean;
  skeletons?: number;
}) {
  const { favorites, toggle } = useFavorites();
  return (
    <div className="event-grid" aria-busy={loading}>
      {loading
        ? Array.from({ length: skeletons }, (_, index) => (
            <div className="event-card skeleton" key={index} />
          ))
        : events.map((event, index) => (
            <EventCard
              event={event}
              index={index}
              key={event.id}
              favorite={favorites.includes(event.id)}
              onToggleFavorite={toggle}
            />
          ))}
    </div>
  );
}

// ---------- Home ----------
function Home() {
  const { catalog, loading, error } = useCatalog();
  const [mood, setMood] = useState("");
  const [when, setWhen] = useState("");
  const [budget, setBudget] = useState("");
  const [search, setSearch] = useState("");
  const [dayIndex, setDayIndex] = useState(0);
  const navigate = useNavigate();
  const week = useMemo(() => weekAgenda(catalog), [catalog]);
  const year = useMemo(() => yearAgenda(catalog), [catalog]);
  const matches = useMemo(
    () =>
      filterEvents(
        catalog,
        {
          q: "",
          categoria: mood,
          quando: when,
          mes: "",
          preco: budget,
          cidade: "",
          ordem: "data",
          salvos: false,
        },
        [],
      ),
    [catalog, mood, when, budget],
  );
  const discoveryLink = `/eventos?${new URLSearchParams(
    Object.entries({ categoria: mood, quando: when, preco: budget }).filter(
      ([, value]) => value,
    ),
  )}`;
  const goSearch = (formEvent: FormEvent) => {
    formEvent.preventDefault();
    navigate(`/eventos?q=${encodeURIComponent(search.trim())}`);
  };
  const selectedDay = week[dayIndex];
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
              Do rolê de hoje à noite ao festival do ano. Encontre, escolha e
              garanta seu ingresso em poucos toques.
            </p>
            <form className="home-search" role="search" onSubmit={goSearch}>
              <span aria-hidden="true">⌕</span>
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Busque evento, artista, local ou cidade"
                aria-label="Buscar eventos"
                enterKeyHint="search"
              />
              <button type="submit">Buscar</button>
            </form>
            <div className="quick-links">
              <Link to="/eventos?quando=hoje">Hoje</Link>
              <Link to="/eventos?quando=fim-de-semana">Fim de semana</Link>
              <Link to="/#agenda-do-ano">Agenda do ano</Link>
            </div>
          </div>
          <div className="hero-art">
            <img
              src={(catalog[0] ?? demoEvents[0]).image}
              alt=""
              onError={(event) => {
                event.currentTarget.style.display = "none";
              }}
            />
            {!loading && catalog.length > 0 && (
              <div className="floating-note">
                <span className="pulse-dot"></span>
                <div>
                  <strong>
                    {catalog.length}{" "}
                    {catalog.length === 1 ? "evento" : "eventos"} à venda
                  </strong>
                  <small>
                    {week[0].items.length
                      ? `${week[0].items.length} acontecendo hoje`
                      : "garanta o seu antes que esgote"}
                  </small>
                </div>
              </div>
            )}
          </div>
        </section>
        {error && (
          <div className="catalog-notice" role="status">
            {error} Exibindo uma curadoria de demonstração.
          </div>
        )}

        <section className="section-block" aria-labelledby="agenda-semana">
          <div className="section-heading">
            <div>
              <span className="kicker">Todo dia tem rolê</span>
              <h2 id="agenda-semana">Agenda da semana</h2>
            </div>
            <Link to="/eventos?quando=7-dias" className="text-link">
              Ver a semana <span>↗</span>
            </Link>
          </div>
          <div className="day-tabs" role="tablist">
            {week.map((entry, index) => (
              <button
                key={entry.day.toISOString()}
                role="tab"
                aria-selected={index === dayIndex}
                className={index === dayIndex ? "day-tab active" : "day-tab"}
                onClick={() => setDayIndex(index)}
              >
                <small>{entry.label}</small>
                <strong>{entry.day.getDate()}</strong>
                <span>
                  {entry.items.length
                    ? `${entry.items.length} ${entry.items.length === 1 ? "evento" : "eventos"}`
                    : "—"}
                </span>
              </button>
            ))}
          </div>
          {loading || selectedDay.items.length ? (
            <EventGrid events={selectedDay.items.slice(0, 6)} loading={loading} />
          ) : (
            <div className="inline-empty">
              <p>
                Nada marcado para{" "}
                {dayIndex === 0 ? "hoje" : selectedDay.label.toLowerCase()}{" "}
                ainda.
              </p>
              <Link to="/eventos" className="outline-button">
                Ver próximos eventos <span>↗</span>
              </Link>
            </div>
          )}
        </section>

        <section className="discovery-panel">
          <div className="discovery-heading">
            <div>
              <span className="kicker">Seu rolê, suas regras</span>
              <h2>Vamos encontrar seu próximo plano.</h2>
            </div>
            <Link to={discoveryLink} className="location-badge">
              {loading
                ? "Buscando..."
                : `${matches.length} ${matches.length === 1 ? "resultado" : "resultados"} ↗`}
            </Link>
          </div>
          <div className="question-row">
            <span className="question-label">Eu quero</span>
            <div className="choice-row">
              {moods.map((item) => (
                <button
                  key={item.label}
                  aria-pressed={mood === item.category}
                  className={mood === item.category ? "choice active" : "choice"}
                  onClick={() => setMood(item.category)}
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
              {whenOptions
                .filter((option) =>
                  ["", "hoje", "fim-de-semana", "mes"].includes(option.value),
                )
                .map((option) => (
                  <button
                    key={option.value}
                    aria-pressed={when === option.value}
                    className={when === option.value ? "choice active" : "choice"}
                    onClick={() => setWhen(option.value)}
                  >
                    {option.label}
                  </button>
                ))}
            </div>
          </div>
          <div className="question-row">
            <span className="question-label">Meu orçamento</span>
            <div className="choice-row">
              {priceOptions.map((option) => (
                <button
                  key={option.value}
                  aria-pressed={budget === option.value}
                  className={budget === option.value ? "choice active" : "choice"}
                  onClick={() => setBudget(option.value)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <section className="section-block events-section">
          <div className="section-heading">
            <div>
              <span className="kicker">
                {loading || matches.length
                  ? "Combina com você"
                  : "Tente outra combinação"}
              </span>
              <h2>
                {loading
                  ? "Carregando..."
                  : matches.length
                    ? "O melhor da noite"
                    : "Nada com esse filtro ainda"}
              </h2>
            </div>
            <Link to={discoveryLink} className="text-link">
              Ver todos <span>↗</span>
            </Link>
          </div>
          <EventGrid events={matches.slice(0, 3)} loading={loading} />
        </section>

        <section
          className="section-block"
          id="agenda-do-ano"
          aria-labelledby="agenda-ano-titulo"
        >
          <div className="section-heading">
            <div>
              <span className="kicker">Planeje com antecedência</span>
              <h2 id="agenda-ano-titulo">Agenda do ano</h2>
            </div>
            <Link to="/eventos?quando=ano" className="text-link">
              Todos do ano <span>↗</span>
            </Link>
          </div>
          <div className="month-grid">
            {year.map(({ key, items }) => (
              <Link
                key={key}
                to={`/eventos?mes=${key}`}
                className={items.length ? "month-card" : "month-card empty"}
              >
                <span>{monthLabel(key)}</span>
                <strong>{items.length || "—"}</strong>
                <small>
                  {items.length
                    ? items
                        .slice(0, 2)
                        .map((event) => event.title)
                        .join(" · ")
                    : "Em breve"}
                </small>
              </Link>
            ))}
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
                to={`/eventos?q=${encodeURIComponent(venue.name)}`}
                className="venue-card group"
                key={venue.name}
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <img
                  src={venue.image}
                  alt=""
                  loading="lazy"
                  onError={(error) => {
                    error.currentTarget.style.display = "none";
                  }}
                />
                <div className="venue-card-overlay">
                  <span>{venue.type}</span>
                  <strong>{venue.name}</strong>
                  <small>{venue.city}</small>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="section-block" id="categorias">
          <div className="section-heading">
            <div>
              <span className="kicker">Escolha seu clima</span>
              <h2>Mais formas de sair</h2>
            </div>
          </div>
          <div className="category-row">
            {categoriesOf(catalog).map((item) => (
              <Link
                key={item}
                to={`/eventos?categoria=${encodeURIComponent(item)}`}
                className="category-pill"
              >
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

// ---------- Busca ----------
const filterKeys = [
  "q",
  "categoria",
  "quando",
  "mes",
  "preco",
  "cidade",
  "ordem",
  "salvos",
] as const;
function EventsPage() {
  const { catalog, loading, error } = useCatalog();
  const { favorites } = useFavorites();
  const [params, setParams] = useSearchParams();
  const [term, setTerm] = useState(params.get("q") ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const filters: Filters = {
    q: params.get("q") ?? "",
    categoria: params.get("categoria") ?? "",
    quando: params.get("quando") ?? "",
    mes: params.get("mes") ?? "",
    preco: params.get("preco") ?? "",
    cidade: params.get("cidade") ?? "",
    ordem: params.get("ordem") ?? "data",
    salvos: params.get("salvos") === "1",
  };
  // Os filtros ficam na URL: dá para compartilhar a busca e usar o "voltar".
  const update = (changes: Partial<Record<(typeof filterKeys)[number], string>>) =>
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete("foco");
        for (const [key, value] of Object.entries(changes))
          if (value) next.set(key, value);
          else next.delete(key);
        return next;
      },
      { replace: true },
    );
  // Espera a pessoa parar de digitar antes de filtrar.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (term !== (params.get("q") ?? "")) update({ q: term.trim() });
    }, 250);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);
  useEffect(() => {
    if (params.get("foco") === "1") inputRef.current?.focus();
  }, [params]);
  const results = filterEvents(catalog, filters, favorites);
  const cities = [...new Set(catalog.map((event) => event.city))].sort();
  const activeCount = filterKeys.filter(
    (key) => key !== "ordem" && params.get(key),
  ).length;
  const clearAll = () => {
    setTerm("");
    setParams({}, { replace: true });
  };
  const title = filters.q
    ? `Resultados para “${filters.q}”`
    : filters.mes
      ? monthLabel(filters.mes)
      : filters.quando
        ? (whenOptions.find((option) => option.value === filters.quando)
            ?.label ?? "Eventos")
        : filters.salvos
          ? "Eventos salvos"
          : "Todos os eventos";
  return (
    <>
      <Header />
      <main className="page-content">
        <div className="page-intro">
          <span className="kicker">Descubra algo novo</span>
          <h1>{title}</h1>
          <p>Rolês de hoje, do fim de semana e os grandes eventos do ano.</p>
        </div>
        <form
          className="filters"
          role="search"
          onSubmit={(event) => {
            event.preventDefault();
            update({ q: term.trim() });
            inputRef.current?.blur();
          }}
        >
          <div className="search-field">
            <span aria-hidden="true">⌕</span>
            <input
              ref={inputRef}
              type="search"
              value={term}
              onChange={(event) => setTerm(event.target.value)}
              placeholder="Evento, artista, local ou cidade"
              aria-label="Buscar eventos"
              enterKeyHint="search"
            />
            {term && (
              <button
                type="button"
                className="clear-button"
                aria-label="Limpar busca"
                onClick={() => {
                  setTerm("");
                  update({ q: "" });
                }}
              >
                ×
              </button>
            )}
          </div>
          <select
            className="filter-select"
            aria-label="Cidade"
            value={filters.cidade}
            onChange={(event) => update({ cidade: event.target.value })}
          >
            <option value="">Todas as cidades</option>
            {cities.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
          <select
            className="filter-select"
            aria-label="Ordenar"
            value={filters.ordem}
            onChange={(event) =>
              update({
                ordem: event.target.value === "data" ? "" : event.target.value,
              })
            }
          >
            <option value="data">Mais próximos</option>
            <option value="preco">Menor preço</option>
          </select>
        </form>
        <div className="filter-group" aria-label="Quando">
          {whenOptions.map((option) => (
            <button
              key={option.value}
              aria-pressed={filters.quando === option.value && !filters.mes}
              className={
                filters.quando === option.value && !filters.mes
                  ? "chip active"
                  : "chip"
              }
              onClick={() => update({ quando: option.value, mes: "" })}
            >
              {option.label}
            </button>
          ))}
          {filters.mes && (
            <button
              className="chip active"
              onClick={() => update({ mes: "" })}
              aria-label={`Remover filtro ${monthLabel(filters.mes)}`}
            >
              {monthLabel(filters.mes)} ×
            </button>
          )}
        </div>
        <div className="filter-group" aria-label="Preço">
          {priceOptions.map((option) => (
            <button
              key={option.value}
              aria-pressed={filters.preco === option.value}
              className={filters.preco === option.value ? "chip active" : "chip"}
              onClick={() => update({ preco: option.value })}
            >
              {option.label}
            </button>
          ))}
          <button
            aria-pressed={filters.salvos}
            className={filters.salvos ? "chip active" : "chip"}
            onClick={() => update({ salvos: filters.salvos ? "" : "1" })}
          >
            ♥ Salvos{favorites.length ? ` (${favorites.length})` : ""}
          </button>
        </div>
        <div className="category-row listing-categories">
          {["", ...categoriesOf(catalog)].map((item) => (
            <button
              key={item || "todos"}
              aria-pressed={filters.categoria === item}
              className={
                filters.categoria === item
                  ? "category-pill active"
                  : "category-pill"
              }
              onClick={() => update({ categoria: item })}
            >
              {item || "Todos"}
            </button>
          ))}
        </div>
        <div className="results-bar">
          <span className="results-label" aria-live="polite">
            {loading
              ? "Carregando experiências..."
              : `${results.length} ${results.length === 1 ? "experiência encontrada" : "experiências encontradas"}`}
          </span>
          {activeCount > 0 && (
            <button className="text-link" onClick={clearAll}>
              Limpar filtros ({activeCount})
            </button>
          )}
        </div>
        {error && (
          <div className="catalog-notice" role="status">
            {error} Exibindo uma curadoria de demonstração.
          </div>
        )}
        {!loading && !results.length ? (
          <div className="empty-state">
            <span className="kicker">Nenhum resultado</span>
            <h2>Não achamos nada com esses filtros.</h2>
            <p>Tente outra data, tire um filtro ou busque por outro termo.</p>
            <div className="empty-actions">
              {activeCount > 0 && (
                <button className="primary-button" onClick={clearAll}>
                  Limpar filtros
                </button>
              )}
              <Link to="/eventos?quando=ano" className="outline-button">
                Ver agenda do ano
              </Link>
            </div>
          </div>
        ) : (
          <EventGrid events={results} loading={loading} skeletons={6} />
        )}
      </main>
      <Footer />
    </>
  );
}

// ---------- Evento ----------
type CheckoutState = { event: EventItem; ticketIndex: number; quantity: number };
const CHECKOUT_KEY = "balada:checkout";
function EventDetails() {
  const { catalog, loading, error } = useCatalog();
  const { favorites, toggle } = useFavorites();
  const { id } = useParams();
  const event = catalog.find((item) => item.id === id);
  const [ticketIndex, setTicketIndex] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [shareNote, setShareNote] = useState("");
  const navigate = useNavigate();
  if (!event)
    return (
      <>
        <Header />
        <main className="details-page">
          <Link to="/eventos" className="back-link">
            ← Voltar para eventos
          </Link>
          <div className="empty-state">
            <span className="kicker">
              {loading ? "Um instante" : "Evento indisponível"}
            </span>
            <h1>
              {loading
                ? "Carregando evento..."
                : error || "Este evento não foi encontrado ou já aconteceu."}
            </h1>
            {!loading && (
              <Link to="/eventos" className="primary-button">
                Ver próximos eventos <span>→</span>
              </Link>
            )}
          </div>
        </main>
        <Footer />
      </>
    );
  const tickets = ticketsOf(event);
  const ticket = tickets[ticketIndex] ?? tickets[0];
  const maxQuantity = ticket?.maxPerOrder ?? 0;
  const soldOut = !ticket || maxQuantity < 1;
  const safeQuantity = Math.min(Math.max(quantity, 1), Math.max(maxQuantity, 1));
  const favorite = favorites.includes(event.id);
  const related = catalog
    .filter((item) => item.id !== event.id && item.category === event.category)
    .slice(0, 3);
  const share = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: event.title, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareNote("Link copiado!");
    } catch {
      setShareNote("");
    }
  };
  const downloadCalendar = () => {
    const blob = new Blob([calendarFile(event)], { type: "text/calendar" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `${event.title}.ics`;
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const buy = () => {
    const state: CheckoutState = {
      event,
      ticketIndex: tickets.indexOf(ticket),
      quantity: safeQuantity,
    };
    storage.set(CHECKOUT_KEY, state, "session");
    navigate("/checkout", { state });
  };
  return (
    <>
      <Header />
      <main className="details-page">
        <Link to="/eventos" className="back-link">
          ← Voltar para eventos
        </Link>
        {error && (
          <div className="catalog-notice" role="status">
            {error} Exibindo uma curadoria de demonstração.
          </div>
        )}
        <div className="detail-hero">
          <img src={event.image} alt="" />
          <div className="detail-overlay">
            <span className="kicker">
              {event.category}
              {dayBadge(event) && ` · ${dayBadge(event)}`}
            </span>
            <h1>{event.title}</h1>
            <p>
              <span className="capitalize">{event.weekday}</span>, {event.date}{" "}
              · {event.time} · {event.venue}
            </p>
          </div>
        </div>
        <div className="detail-actions">
          <button
            type="button"
            className="outline-button"
            aria-pressed={favorite}
            onClick={() => toggle(event.id)}
          >
            {favorite ? "♥ Salvo" : "♡ Salvar"}
          </button>
          <button type="button" className="outline-button" onClick={share}>
            ↗ Compartilhar
          </button>
          <button
            type="button"
            className="outline-button"
            onClick={downloadCalendar}
          >
            ◷ Adicionar à agenda
          </button>
          {shareNote && (
            <small className="secure-note" role="status">
              {shareNote}
            </small>
          )}
        </div>
        <div className="detail-layout">
          <section className="detail-copy">
            <span className="kicker">Sobre o evento</span>
            <h2>Uma noite para lembrar.</h2>
            <p>
              {event.description ??
                "Prepare-se para uma experiência única, com música, encontros e aquela energia que só a noite sabe criar. Chegue cedo, encontre sua turma e deixe o resto acontecer."}
            </p>
            <div className="info-list">
              <div>
                <span>⌖</span>
                <div>
                  <small>Local</small>
                  <strong>{event.venue}</strong>
                  <p>{[event.address, event.city].filter(Boolean).join(" · ")}</p>
                </div>
              </div>
              <div>
                <span>◷</span>
                <div>
                  <small>Data e horário</small>
                  <strong>
                    <span className="capitalize">{event.weekday}</span>,{" "}
                    {event.date}
                  </strong>
                  <p>Início às {event.time}</p>
                </div>
              </div>
              {event.artists.length > 0 && (
                <div>
                  <span>♫</span>
                  <div>
                    <small>Line-up</small>
                    <strong>{event.artists.join(" · ")}</strong>
                  </div>
                </div>
              )}
            </div>
          </section>
          <aside className="ticket-box">
            <span className="kicker">Escolha seu ingresso</span>
            {tickets.map((option, index) => (
              <button
                type="button"
                key={option.id ?? option.name}
                className={
                  index === ticketIndex ? "ticket-option active" : "ticket-option"
                }
                aria-pressed={index === ticketIndex}
                disabled={option.maxPerOrder < 1}
                onClick={() => {
                  setTicketIndex(index);
                  setQuantity(1);
                }}
              >
                <div>
                  <strong>{option.name}</strong>
                  <small>
                    {option.maxPerOrder < 1
                      ? "Esgotado"
                      : option.available <= 20
                        ? `Restam ${option.available}`
                        : option.description}
                  </small>
                </div>
                <strong>{brl(option.price)}</strong>
              </button>
            ))}
            {!tickets.length && (
              <small className="secure-note">
                Nenhum ingresso à venda no momento.
              </small>
            )}
            <div className="quantity-row">
              <span>Quantidade</span>
              <div className="stepper">
                <button
                  type="button"
                  aria-label="Diminuir quantidade"
                  disabled={safeQuantity <= 1}
                  onClick={() => setQuantity(Math.max(1, safeQuantity - 1))}
                >
                  −
                </button>
                <strong aria-live="polite">{safeQuantity}</strong>
                <button
                  type="button"
                  aria-label="Aumentar quantidade"
                  disabled={safeQuantity >= maxQuantity}
                  onClick={() =>
                    setQuantity(Math.min(maxQuantity, safeQuantity + 1))
                  }
                >
                  +
                </button>
              </div>
            </div>
            {ticket?.fee ? (
              <div className="summary-line">
                <span>Taxa de serviço</span>
                <strong>{brl(ticket.fee * safeQuantity)}</strong>
              </div>
            ) : null}
            <div className="total-row">
              <span>Total</span>
              <strong>
                {brl(ticket ? (ticket.price + ticket.fee) * safeQuantity : 0)}
              </strong>
            </div>
            <button
              className="primary-button full"
              disabled={soldOut}
              onClick={buy}
            >
              {soldOut ? "Esgotado" : "Comprar ingresso"} <span>→</span>
            </button>
            <small className="secure-note">
              ⌾ Compra segura · até 5 ingressos por evento
            </small>
          </aside>
        </div>
        {related.length > 0 && (
          <section className="related">
            <div className="section-heading">
              <div>
                <span className="kicker">Você também pode curtir</span>
                <h2>Mais {event.category.toLowerCase()}</h2>
              </div>
            </div>
            <EventGrid events={related} />
          </section>
        )}
      </main>
      <Footer />
    </>
  );
}

// ---------- Compra ----------
function Checkout() {
  const location = useLocation();
  const state =
    (location.state as CheckoutState | null) ??
    storage.get<CheckoutState | null>(CHECKOUT_KEY, null, "session");
  const { user, loading } = useSession();
  const navigate = useNavigate();
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CREDIT_CARD">(
    "PIX",
  );
  if (!state?.event)
    return (
      <>
        <Header />
        <main className="checkout-page">
          <div className="empty-state">
            <span className="kicker">Carrinho vazio</span>
            <h1>Escolha um evento para continuar.</h1>
            <Link to="/eventos" className="primary-button">
              Ver eventos <span>→</span>
            </Link>
          </div>
        </main>
      </>
    );
  const { event, quantity } = state;
  const ticket = ticketsOf(event)[state.ticketIndex] ?? ticketsOf(event)[0];
  const subtotal = ticket.price * quantity;
  const fees = ticket.fee * quantity;
  const total = subtotal + fees;
  const authState = { returnTo: "/checkout", checkout: state };
  const submit = async (formEvent: FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    setError("");
    if (!ticket.id) {
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
          items: [{ ticketTypeId: ticket.id, quantity }],
          paymentMethod,
        }),
      });
      if (response.status === 401) {
        navigate("/login", { state: authState });
        return;
      }
      const data = await readJson<{
        error?: string;
        order?: { order_number: string; total: string };
        reservation?: { expires_at: string };
      }>(response);
      if (!response.ok || !data?.order)
        throw new Error(data?.error ?? "Não foi possível criar sua reserva.");
      storage.set(CHECKOUT_KEY, null, "session");
      navigate("/pagamento/pendente", {
        state: {
          orderNumber: data.order.order_number,
          total: Number(data.order.total),
          eventTitle: event.title,
          expiresAt: data.reservation?.expires_at,
          method: paymentMethod,
        },
      });
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
  const summary = (
    <aside className="order-summary">
      <span className="kicker">Resumo do pedido</span>
      <div className="summary-event">
        <img src={event.image} alt="" />
        <div>
          <strong>{event.title}</strong>
          <small>
            {event.date} · {event.time} · {event.venue}
          </small>
        </div>
      </div>
      <div className="summary-line">
        <span>
          {quantity}x {ticket.name}
        </span>
        <strong>{brl(subtotal)}</strong>
      </div>
      <div className="summary-line">
        <span>Taxa de serviço</span>
        <strong>{brl(fees)}</strong>
      </div>
      <div className="summary-total">
        <span>Total</span>
        <strong>{brl(total)}</strong>
      </div>
      {user && (
        <button
          type="submit"
          form="checkout-form"
          disabled={isSubmitting}
          className="primary-button full desktop-only"
        >
          {isSubmitting ? (
            "Reservando..."
          ) : (
            <>
              Confirmar e pagar <span>→</span>
            </>
          )}
        </button>
      )}
      <small className="secure-note">
        ⌾ Ingressos reservados por 15 minutos após confirmar
      </small>
    </aside>
  );
  return (
    <>
      <Header />
      <main className="checkout-page">
        <Link to={`/eventos/${event.id}`} className="back-link">
          ← Voltar ao evento
        </Link>
        <ol className="steps" aria-label="Etapas da compra">
          <li className="done">Ingresso</li>
          <li className={user ? "done" : "current"}>Conta</li>
          <li className={user ? "current" : ""}>Pagamento</li>
        </ol>
        <div className="checkout-heading">
          <span className="kicker">Quase lá</span>
          <h1>Finalize sua compra</h1>
        </div>
        <div className="checkout-layout">
          {loading ? (
            <div className="checkout-form">
              <p className="results-label">Verificando sua conta...</p>
            </div>
          ) : !user ? (
            <div className="checkout-form">
              <div className="form-section">
                <h3>Entre para continuar</h3>
                <p className="muted">
                  Seus ingressos ficam salvos na sua conta, com QR Code para a
                  entrada. Leva menos de um minuto.
                </p>
                <div className="empty-actions left">
                  <Link to="/login" state={authState} className="primary-button">
                    Entrar <span>→</span>
                  </Link>
                  <Link
                    to="/cadastro"
                    state={authState}
                    className="outline-button"
                  >
                    Criar conta
                  </Link>
                </div>
              </div>
            </div>
          ) : (
            <form
              id="checkout-form"
              className="checkout-form"
              onSubmit={submit}
            >
              <div className="form-section">
                <h3>Comprando como</h3>
                <div className="buyer-card">
                  <Avatar user={user} className="avatar-dot large" />
                  <div>
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                  </div>
                  <Link to="/perfil" className="text-link">
                    Editar
                  </Link>
                </div>
              </div>
              <div className="form-section">
                <h3>Forma de pagamento</h3>
                <div className="payment-tabs" role="radiogroup">
                  <button
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === "PIX"}
                    onClick={() => setPaymentMethod("PIX")}
                    className={
                      paymentMethod === "PIX"
                        ? "payment-tab active"
                        : "payment-tab"
                    }
                  >
                    ◇ Pix
                    <small>Aprovação na hora</small>
                  </button>
                  <button
                    type="button"
                    role="radio"
                    aria-checked={paymentMethod === "CREDIT_CARD"}
                    onClick={() => setPaymentMethod("CREDIT_CARD")}
                    className={
                      paymentMethod === "CREDIT_CARD"
                        ? "payment-tab active"
                        : "payment-tab"
                    }
                  >
                    ▣ Cartão de crédito
                    <small>Pagamento em ambiente seguro</small>
                  </button>
                </div>
                <p className="muted">
                  Ao confirmar, seus ingressos ficam reservados por 15 minutos
                  enquanto você conclui o pagamento.
                </p>
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
                {isSubmitting ? "Reservando..." : `Confirmar e pagar ${brl(total)}`}
              </button>
            </form>
          )}
          {summary}
        </div>
      </main>
    </>
  );
}
function useCountdown(until?: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!until) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [until]);
  if (!until) return null;
  const left = Math.max(0, new Date(until).getTime() - now);
  return {
    expired: left === 0,
    label: `${String(Math.floor(left / 60000)).padStart(2, "0")}:${String(
      Math.floor((left % 60000) / 1000),
    ).padStart(2, "0")}`,
  };
}
function PaymentPending() {
  const state = useLocation().state as {
    orderNumber?: string;
    total?: number;
    eventTitle?: string;
    expiresAt?: string;
    method?: string;
  } | null;
  const countdown = useCountdown(state?.expiresAt);
  return (
    <>
      <Header />
      <main className="page-content profile-page max-w-5xl mx-auto px-5 sm:px-8">
        <div className="empty-state">
          <span className="kicker">Reserva criada</span>
          <h1>
            {countdown?.expired ? "Sua reserva expirou." : "Aguardando pagamento."}
          </h1>
          {state?.orderNumber && (
            <p>
              Pedido <strong>{state.orderNumber}</strong>
              {state.eventTitle && <> · {state.eventTitle}</>}
              {state.total !== undefined && <> · {brl(state.total)}</>}
            </p>
          )}
          {countdown && !countdown.expired && (
            <div className="countdown" role="timer" aria-live="off">
              <small>Ingressos reservados por</small>
              <strong>{countdown.label}</strong>
            </div>
          )}
          <p className="muted">
            {countdown?.expired
              ? "Os ingressos voltaram a ficar disponíveis. Você pode tentar de novo."
              : `Assim que o ${state?.method === "CREDIT_CARD" ? "cartão" : "Pix"} for confirmado, seus ingressos aparecem em “Meus ingressos” com QR Code.`}
          </p>
          <div className="empty-actions">
            <Link to="/meus-ingressos" className="primary-button">
              Meus ingressos <span>→</span>
            </Link>
            <Link to="/eventos" className="outline-button">
              Continuar explorando
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

// ---------- Área da conta ----------
function PrivateNotice({ loading, title }: { loading: boolean; title: string }) {
  const { pathname } = useLocation();
  return (
    <>
      <Header />
      <main className="page-content profile-page max-w-5xl mx-auto px-5 sm:px-8">
        <div className="empty-state">
          <span className="kicker">Área privada</span>
          {loading ? (
            <h1>Carregando...</h1>
          ) : (
            <>
              <h1>{title}</h1>
              <div className="empty-actions">
                <Link
                  to="/login"
                  state={{ returnTo: pathname }}
                  className="primary-button"
                >
                  Entrar <span>→</span>
                </Link>
                <Link
                  to="/cadastro"
                  state={{ returnTo: pathname }}
                  className="outline-button"
                >
                  Criar conta
                </Link>
              </div>
            </>
          )}
        </div>
      </main>
    </>
  );
}
type OwnedTicket = {
  id: string;
  code: string;
  status: string;
  qrToken: string | null;
  event: {
    name: string;
    start_at: string;
    venue: { name: string; city: string } | null;
  };
  ticket_type: { name: string };
  order: { order_number: string };
};
const ticketStatusLabels: Record<string, string> = {
  USED: "Utilizado",
  CANCELLED: "Cancelado",
  REFUNDED: "Reembolsado",
  EXPIRED: "Expirado",
};
function Account() {
  const { user, loading } = useSession();
  const [tickets, setTickets] = useState<OwnedTicket[] | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"next" | "past">("next");
  const [openTicket, setOpenTicket] = useState<string | null>(null);
  const [mountedAt] = useState(() => Date.now());
  useEffect(() => {
    if (!user) return;
    fetch(apiUrl("/api/tickets"), { credentials: "include" })
      .then(async (response) => {
        const data = response.ok
          ? await readJson<{ tickets: OwnedTicket[] }>(response)
          : null;
        if (!data) throw new Error("Não foi possível carregar seus ingressos.");
        setTickets(data.tickets);
      })
      .catch((requestError: unknown) =>
        setError(
          requestError instanceof Error
            ? requestError.message
            : "Ingressos indisponíveis.",
        ),
      );
  }, [user]);
  if (!user)
    return (
      <PrivateNotice
        loading={loading}
        title="Entre para acessar seus ingressos."
      />
    );
  const visible = (tickets ?? []).filter((ticket) => {
    const upcoming =
      ticket.status === "ACTIVE" &&
      new Date(ticket.event.start_at).getTime() >=
        mountedAt - 12 * 60 * 60 * 1000;
    return tab === "next" ? upcoming : !upcoming;
  });
  return (
    <>
      <Header />
      <main className="page-content account-page">
        <div className="page-intro">
          <span className="kicker">Olá, {user.name.split(" ")[0]}</span>
          <h1>Seus ingressos</h1>
          <p>Mostre o QR Code na entrada. Ele funciona mesmo com o brilho baixo.</p>
        </div>
        <div className="account-tabs" role="tablist">
          <button
            role="tab"
            aria-selected={tab === "next"}
            className={tab === "next" ? "active" : ""}
            onClick={() => setTab("next")}
          >
            Próximos
          </button>
          <button
            role="tab"
            aria-selected={tab === "past"}
            className={tab === "past" ? "active" : ""}
            onClick={() => setTab("past")}
          >
            Histórico
          </button>
        </div>
        {error && (
          <div className="catalog-notice" role="status">
            {error}
          </div>
        )}
        <div className="ticket-list">
          {tickets === null && !error && (
            <div className="results-label">Carregando ingressos...</div>
          )}
          {tickets !== null && !visible.length && (
            <div className="empty-state">
              <h2>
                {tab === "next"
                  ? "Nenhum ingresso para os próximos eventos."
                  : "Seu histórico ainda está vazio."}
              </h2>
              {tab === "next" && (
                <Link to="/eventos" className="primary-button">
                  Descobrir eventos <span>↗</span>
                </Link>
              )}
            </div>
          )}
          {visible.map((ticket) => {
            const date = new Date(ticket.event.start_at);
            return (
              <div className="owned-ticket" key={ticket.id}>
                <div className="ticket-image">
                  <span>
                    {String(date.getDate()).padStart(2, "0")}
                    <br />
                    <small>
                      {date
                        .toLocaleDateString("pt-BR", { month: "short" })
                        .replace(".", "")
                        .toUpperCase()}
                    </small>
                  </span>
                </div>
                <div className="owned-ticket-info">
                  <span className="kicker">
                    {ticket.ticket_type.name}
                    {ticket.event.venue && <> · {ticket.event.venue.city}</>}
                  </span>
                  <h3>{ticket.event.name}</h3>
                  <p>
                    {date.toLocaleDateString("pt-BR")} ·{" "}
                    {date.toLocaleTimeString("pt-BR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                    <br />
                    {ticket.event.venue?.name ?? "Local a confirmar"} ·{" "}
                    {ticket.code}
                  </p>
                  {ticket.qrToken ? (
                    <div>
                      <button
                        className="outline-button"
                        onClick={() =>
                          setOpenTicket(
                            openTicket === ticket.id ? null : ticket.id,
                          )
                        }
                      >
                        {openTicket === ticket.id
                          ? "Ocultar QR Code"
                          : "Mostrar QR Code"}
                      </button>
                    </div>
                  ) : (
                    <p>{ticketStatusLabels[ticket.status] ?? ticket.status}</p>
                  )}
                </div>
                <div className="qr-placeholder">
                  {ticket.qrToken && openTicket === ticket.id ? (
                    <QRCodeSVG value={ticket.qrToken} size={120} />
                  ) : (
                    <>
                      ▦<small>QR CODE</small>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>
    </>
  );
}

// ---------- Login e cadastro ----------
const authErrors: Record<string, string> = {
  google_unavailable: "O login com Google ainda não foi configurado.",
  google_cancelled: "Login com Google cancelado.",
  google_expired: "A tentativa de login expirou. Tente de novo.",
  google_invalid: "O Google não confirmou seu login. Tente novamente.",
  google_profile: "Sua conta Google não tem um e-mail verificado.",
  google_failed: "Não foi possível entrar com o Google agora. Tente de novo.",
  account_blocked: "Esta conta está indisponível. Fale com o suporte.",
};
type FieldErrors = Partial<Record<"name" | "email" | "phone" | "password", string>>;
function passwordChecks(password: string) {
  return [
    { ok: password.length >= 8, label: "8+ caracteres" },
    { ok: /[A-Za-z]/.test(password), label: "uma letra" },
    { ok: /[0-9]/.test(password), label: "um número" },
  ];
}
function useGoogleAvailable() {
  const [available, setAvailable] = useState<boolean | null>(null);
  useEffect(() => {
    fetch(apiUrl("/api/auth/providers"))
      .then((response) =>
        response.ok ? readJson<{ google?: boolean }>(response) : null,
      )
      .then((data) => setAvailable(Boolean(data?.google)))
      .catch(() => setAvailable(false));
  }, []);
  return available;
}
function Login({ signup = false }: { signup?: boolean }) {
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    password: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [params] = useSearchParams();
  const urlError = authErrors[params.get("error") ?? ""] ?? "";
  const googleAvailable = useGoogleAvailable();
  const { user, refresh } = useSession();
  const navigate = useNavigate();
  const location = useLocation();
  const redirect = location.state as {
    returnTo?: string;
    checkout?: CheckoutState;
  } | null;
  const returnTo = redirect?.returnTo ?? "/eventos";
  const finish = useCallback(
    () => navigate(returnTo, { replace: true, state: redirect?.checkout }),
    [navigate, returnTo, redirect?.checkout],
  );
  // Já logado (ex.: abriu /login em outra aba): segue direto.
  useEffect(() => {
    if (user) finish();
  }, [user, finish]);
  const setField = (field: keyof typeof form, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
  };
  const startGoogleLogin = () => {
    if (redirect?.checkout)
      storage.set(CHECKOUT_KEY, redirect.checkout, "session");
    window.location.href = apiUrl(
      `/api/auth/google?returnTo=${encodeURIComponent(returnTo)}`,
    );
  };
  const validate = (): FieldErrors => {
    const found: FieldErrors = {};
    if (signup && form.name.trim().length < 2)
      found.name = "Digite seu nome completo.";
    if (!/^\S+@\S+\.\S+$/.test(form.email.trim()))
      found.email = "Digite um e-mail válido.";
    if (signup && form.phone && !/^[0-9()+\s-]{8,30}$/.test(form.phone))
      found.phone = "Telefone inválido.";
    if (!form.password) found.password = "Digite sua senha.";
    else if (signup && passwordChecks(form.password).some((check) => !check.ok))
      found.password = "A senha precisa de 8+ caracteres, uma letra e um número.";
    return found;
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validate();
    setErrors(found);
    setError("");
    if (Object.keys(found).length) return;
    setIsSubmitting(true);
    try {
      const response = await fetch(
        apiUrl(`/api/auth/${signup ? "register" : "login"}`),
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(
            signup
              ? {
                  name: form.name,
                  email: form.email,
                  phone: form.phone,
                  password: form.password,
                }
              : { email: form.email, password: form.password },
          ),
        },
      );
      const data = await readJson<{
        error?: string;
        fields?: Record<string, string[]>;
      }>(response);
      if (!response.ok) {
        if (data?.fields)
          setErrors(
            Object.fromEntries(
              Object.entries(data.fields).map(([field, messages]) => [
                field,
                messages[0],
              ]),
            ),
          );
        setError(
          data?.fields ? "" : (data?.error ?? "Não foi possível concluir."),
        );
        return;
      }
      await refresh();
    } catch {
      setError("Sem conexão com o servidor. Tente novamente.");
    } finally {
      setIsSubmitting(false);
    }
  };
  const checks = passwordChecks(form.password);
  const fieldError = (field: keyof FieldErrors) =>
    errors[field] && (
      <small className="form-error" id={`${field}-error`} role="alert">
        {errors[field]}
      </small>
    );
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
            {redirect?.checkout
              ? "Entre para garantir seus ingressos. Seu carrinho está salvo."
              : signup
                ? "Salve eventos, compre ingressos e tenha tudo no celular."
                : "Continue de onde a noite parou."}
          </p>
          <button
            type="button"
            className="google-button"
            onClick={startGoogleLogin}
            disabled={googleAvailable === false}
          >
            <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
              <path
                fill="#FFC107"
                d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"
              />
              <path
                fill="#FF3D00"
                d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"
              />
              <path
                fill="#4CAF50"
                d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"
              />
              <path
                fill="#1976D2"
                d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"
              />
            </svg>
            <span>
              {googleAvailable === false
                ? "Login com Google indisponível"
                : "Continuar com Google"}
            </span>
          </button>
          {(urlError || error) && (
            <div className="auth-alert" role="alert">
              {urlError && !error ? urlError : error}
            </div>
          )}
          <div className="or">
            <span>ou use seu e-mail</span>
          </div>
          {signup && (
            <label>
              Nome completo
              <input
                name="name"
                autoComplete="name"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                placeholder="Seu nome"
                aria-invalid={Boolean(errors.name)}
                aria-describedby={errors.name ? "name-error" : undefined}
              />
              {fieldError("name")}
            </label>
          )}
          <label>
            E-mail
            <input
              name="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={form.email}
              onChange={(event) => setField("email", event.target.value)}
              placeholder="voce@email.com"
              aria-invalid={Boolean(errors.email)}
              aria-describedby={errors.email ? "email-error" : undefined}
            />
            {fieldError("email")}
          </label>
          {signup && (
            <label>
              Celular <span className="optional">(opcional)</span>
              <input
                name="phone"
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                value={form.phone}
                onChange={(event) => setField("phone", event.target.value)}
                placeholder="(11) 90000-0000"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "phone-error" : undefined}
              />
              {fieldError("phone")}
            </label>
          )}
          <label>
            Senha
            <div className="password-field">
              <input
                name="password"
                type={showPassword ? "text" : "password"}
                autoComplete={signup ? "new-password" : "current-password"}
                value={form.password}
                onChange={(event) => setField("password", event.target.value)}
                placeholder={signup ? "Crie uma senha" : "Sua senha"}
                aria-invalid={Boolean(errors.password)}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
              />
              <button
                type="button"
                onClick={() => setShowPassword((current) => !current)}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? "Ocultar" : "Mostrar"}
              </button>
            </div>
            {fieldError("password")}
            {signup && form.password && (
              <ul className="password-checks">
                {checks.map((check) => (
                  <li key={check.label} className={check.ok ? "ok" : ""}>
                    {check.ok ? "✓" : "○"} {check.label}
                  </li>
                ))}
              </ul>
            )}
          </label>
          <button className="primary-button full" disabled={isSubmitting}>
            {isSubmitting
              ? "Aguarde..."
              : signup
                ? "Criar minha conta"
                : "Entrar"}{" "}
            <span>→</span>
          </button>
          {signup && (
            <small className="legal-note">
              Ao criar a conta você concorda com os termos de uso e a política
              de privacidade da balada.
            </small>
          )}
          <small className="auth-switch">
            {signup ? "Já tem uma conta? " : "Ainda não tem uma conta? "}
            <Link to={signup ? "/login" : "/cadastro"} state={redirect}>
              {signup ? "Entrar" : "Criar conta"}
            </Link>
          </small>
        </form>
      </main>
    </>
  );
}

// ---------- Perfil ----------
function Profile() {
  const { user, loading, refresh, signOut } = useSession();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "" });
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  if (!user)
    return <PrivateNotice loading={loading} title="Entre para ver seu perfil." />;
  const startEditing = () => {
    setForm({ name: user.name, phone: user.phone ?? "" });
    setMessage("");
    setEditing(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      const response = await fetch(apiUrl("/api/auth/me"), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(form),
      });
      const data = await readJson<{
        error?: string;
        fields?: Record<string, string[]>;
      }>(response);
      if (!response.ok) {
        setMessage(
          Object.values(data?.fields ?? {})[0]?.[0] ??
            data?.error ??
            "Não foi possível salvar.",
        );
        return;
      }
      await refresh();
      setEditing(false);
      setMessage("Dados atualizados.");
    } catch {
      setMessage("Sem conexão com o servidor.");
    } finally {
      setSaving(false);
    }
  };
  const logout = async () => {
    await signOut();
    navigate("/");
  };
  return (
    <>
      <Header />
      <main className="page-content profile-page max-w-5xl mx-auto px-5 sm:px-8">
        <div className="profile-header">
          <Avatar
            user={user}
            className="profile-avatar shadow-lg shadow-orange-500/20"
          />
          <div>
            <span className="kicker">Sua conta</span>
            <h1>{user.name}</h1>
            <p>{user.email}</p>
            <div className="account-badges">
              {user.google && <span className="badge ok">Google conectado</span>}
              {user.hasPassword && <span className="badge">Login com senha</span>}
              {user.phone && <span className="badge">{user.phone}</span>}
            </div>
          </div>
        </div>
        {message && (
          <div className="catalog-notice" role="status">
            {message}
          </div>
        )}
        {editing ? (
          <form className="profile-form" onSubmit={save}>
            <label>
              Nome completo
              <input
                autoComplete="name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
              />
            </label>
            <label>
              Celular <span className="optional">(opcional)</span>
              <input
                type="tel"
                autoComplete="tel"
                value={form.phone}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    phone: event.target.value,
                  }))
                }
              />
            </label>
            <div className="empty-actions left">
              <button className="primary-button" disabled={saving}>
                {saving ? "Salvando..." : "Salvar"}
              </button>
              <button
                type="button"
                className="outline-button"
                onClick={() => setEditing(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <div className="profile-grid">
            <Link
              to="/meus-ingressos"
              className="profile-option transition hover:-translate-y-1 hover:shadow-lg"
            >
              <strong>Meus ingressos</strong>
              <span>QR Codes e próximos eventos →</span>
            </Link>
            {canManageEvents(user) && (
              <Link
                to="/admin"
                className="profile-option transition hover:-translate-y-1 hover:shadow-lg"
              >
                <strong>Área administrativa</strong>
                <span>Cadastre eventos e acompanhe as vendas →</span>
              </Link>
            )}
            <Link
              to="/eventos?salvos=1"
              className="profile-option transition hover:-translate-y-1 hover:shadow-lg"
            >
              <strong>Eventos salvos</strong>
              <span>O que você marcou com ♥ →</span>
            </Link>
            <button
              className="profile-option transition hover:-translate-y-1 hover:shadow-lg"
              onClick={startEditing}
            >
              <strong>Editar dados</strong>
              <span>Nome e celular →</span>
            </button>
            <button
              className="profile-option transition hover:-translate-y-1 hover:shadow-lg"
              onClick={logout}
            >
              <strong>Sair da conta</strong>
              <span>Encerrar sua sessão com segurança →</span>
            </button>
          </div>
        )}
      </main>
    </>
  );
}

function NotFound() {
  return (
    <>
      <Header />
      <main className="page-content">
        <div className="empty-state">
          <span className="kicker">Erro 404</span>
          <h1>Essa página saiu mais cedo da festa.</h1>
          <div className="empty-actions">
            <Link to="/" className="primary-button">
              Ir para o início
            </Link>
            <Link to="/eventos" className="outline-button">
              Ver eventos
            </Link>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}

function AdminGate() {
  const { user, loading } = useSession();
  if (!user)
    return (
      <PrivateNotice loading={loading} title="Entre com uma conta de administrador." />
    );
  if (!canManageEvents(user))
    return (
      <main className="page-content">
        <div className="empty-state">
          <span className="kicker">Acesso restrito</span>
          <h1>Esta área é só para administradores.</h1>
          <Link to="/" className="primary-button">
            Ir para o início
          </Link>
        </div>
      </main>
    );
  return (
    <Suspense
      fallback={
        <main className="page-content">
          <p className="results-label">Carregando painel...</p>
        </main>
      }
    >
      <AdminArea />
    </Suspense>
  );
}

function App() {
  return (
    <BrowserRouter>
      <SessionProvider>
        <ScrollManager />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/eventos" element={<EventsPage />} />
          <Route path="/eventos/:id" element={<EventDetails />} />
          <Route path="/checkout" element={<Checkout />} />
          <Route path="/pagamento/pendente" element={<PaymentPending />} />
          <Route path="/meus-ingressos" element={<Account />} />
          <Route path="/perfil" element={<Profile />} />
          <Route path="/login" element={<Login key="login" />} />
          <Route path="/cadastro" element={<Login key="cadastro" signup />} />
          <Route
            path="/admin/*"
            element={
              <>
                <Header />
                <AdminGate />
              </>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
        <MobileNav />
      </SessionProvider>
    </BrowserRouter>
  );
}
export default App;
