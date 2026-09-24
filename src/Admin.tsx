import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Link,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { apiRequest, ApiRequestError } from "./api";
import { brl, categoryLabels, normalize } from "./catalog";

// ---------- Tipos da API ----------
type AdminEventRow = {
  id: string;
  name: string;
  status: string;
  category: string | null;
  start_at: string;
  banner_url: string | null;
  venue: { name: string; city: string } | null;
  capacity: number;
  sold: number;
  reserved: number;
  revenue: number;
};
type Overview = {
  upcomingEvents: number;
  draftEvents: number;
  ticketsSold: number;
  revenue: number;
  paidOrders: number;
  pendingOrders: number;
};
type Venue = {
  id: string;
  name: string;
  address: string | null;
  number: string | null;
  neighborhood: string | null;
  city: string;
  state: string | null;
  capacity: number | null;
};
type AdminEventDetail = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  status: string;
  start_at: string;
  end_at: string | null;
  doors_open_at: string | null;
  banner_url: string | null;
  age_rating: string | null;
  venue_id: string | null;
  artists: Array<{ artist: { name: string } }>;
  ticket_types: Array<{
    id: string;
    name: string;
    description: string | null;
    price: string;
    service_fee: string;
    quantity: number;
    sold_quantity: number;
    reserved_quantity: number;
    max_quantity: number;
    sales_start_at: string | null;
    sales_end_at: string | null;
    status: string;
  }>;
};

const statusLabels: Record<string, string> = {
  DRAFT: "Rascunho",
  PUBLISHED: "Publicado",
  SOLD_OUT: "Esgotado",
  CANCELLED: "Cancelado",
  FINISHED: "Encerrado",
  ARCHIVED: "Arquivado",
};
const errorMessage = (error: unknown) => {
  if (error instanceof ApiRequestError && error.fields) {
    const messages = Object.values(error.fields).flat();
    if (messages.length) return messages.join(" ");
  }
  return error instanceof Error ? error.message : "Algo deu errado.";
};
// <input type="datetime-local"> trabalha no horário local, sem fuso.
const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return "";
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
};
const fromLocalInput = (value: string) =>
  value ? new Date(value).toISOString() : undefined;
const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });

export default function AdminArea() {
  return (
    <Routes>
      <Route index element={<Dashboard />} />
      <Route path="eventos/novo" element={<EventFormRoute />} />
      <Route path="eventos/:id" element={<EventFormRoute />} />
    </Routes>
  );
}

// Recria o formulário do zero ao trocar entre novo, editar e duplicar.
function EventFormRoute() {
  const { id } = useParams();
  const [params] = useSearchParams();
  return <EventForm key={`${id ?? "novo"}-${params.get("copiar") ?? ""}`} />;
}

// ---------- Painel ----------
const statusFilters = [
  { value: "", label: "Todos" },
  { value: "upcoming", label: "Próximos" },
  { value: "DRAFT", label: "Rascunhos" },
  { value: "past", label: "Já aconteceram" },
  { value: "CANCELLED", label: "Cancelados" },
];
function Dashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [events, setEvents] = useState<AdminEventRow[] | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [filter, setFilter] = useState("upcoming");
  const [term, setTerm] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now] = useState(() => Date.now());
  const load = () =>
    Promise.all([
      apiRequest<Overview>("/api/admin/overview"),
      apiRequest<{ events: AdminEventRow[] }>("/api/admin/events"),
    ])
      .then(([summary, list]) => {
        setOverview(summary);
        setEvents(list.events);
      })
      .catch((requestError: unknown) => setError(errorMessage(requestError)));
  useEffect(() => {
    void load();
  }, []);
  const visible = useMemo(
    () =>
      (events ?? []).filter((event) => {
        const past = new Date(event.start_at).getTime() < now;
        const matchesFilter =
          filter === ""
            ? true
            : filter === "upcoming"
              ? !past && event.status !== "CANCELLED"
              : filter === "past"
                ? past
                : event.status === filter;
        return (
          matchesFilter &&
          normalize(`${event.name} ${event.venue?.name ?? ""}`).includes(
            normalize(term),
          )
        );
      }),
    [events, filter, term, now],
  );
  const act = async (
    event: AdminEventRow,
    action: "publish" | "unpublish" | "cancel" | "delete",
  ) => {
    const confirmations: Record<string, string> = {
      cancel: `Cancelar “${event.name}”? O evento sai do site e as vendas param.${event.sold ? ` Atenção: ${event.sold} ingressos já foram vendidos e precisarão ser reembolsados.` : ""}`,
      delete: `Excluir “${event.name}”? Essa ação não pode ser desfeita.`,
    };
    if (confirmations[action] && !window.confirm(confirmations[action])) return;
    setBusyId(event.id);
    setError("");
    try {
      if (action === "delete")
        await apiRequest(`/api/admin/events/${event.id}`, { method: "DELETE" });
      else
        await apiRequest(`/api/admin/events/${event.id}/status`, {
          method: "POST",
          body: {
            status:
              action === "publish"
                ? "PUBLISHED"
                : action === "cancel"
                  ? "CANCELLED"
                  : "DRAFT",
          },
        });
      setNotice(
        {
          publish: "Evento publicado. Ele já aparece no site.",
          unpublish: "Evento voltou para rascunho e saiu do site.",
          cancel: "Evento cancelado.",
          delete: "Evento excluído.",
        }[action],
      );
      await load();
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusyId(null);
    }
  };
  return (
    <main className="page-content admin-page">
      <div className="admin-heading">
        <div className="page-intro">
          <span className="kicker">Área administrativa</span>
          <h1>Seus eventos</h1>
          <p>Cadastre rolês do dia a dia e os grandes eventos do ano.</p>
        </div>
        <Link to="/admin/eventos/novo" className="primary-button">
          + Novo evento
        </Link>
      </div>
      {overview && (
        <div className="stat-grid">
          <div className="stat">
            <small>Receita confirmada</small>
            <strong>{brl(overview.revenue)}</strong>
            <span>{overview.paidOrders} pedidos pagos</span>
          </div>
          <div className="stat">
            <small>Ingressos vendidos</small>
            <strong>{overview.ticketsSold}</strong>
            <span>{overview.pendingOrders} pagamentos pendentes</span>
          </div>
          <div className="stat">
            <small>Eventos no ar</small>
            <strong>{overview.upcomingEvents}</strong>
            <span>próximos e publicados</span>
          </div>
          <div className="stat">
            <small>Rascunhos</small>
            <strong>{overview.draftEvents}</strong>
            <span>ainda não aparecem no site</span>
          </div>
        </div>
      )}
      {notice && (
        <div className="admin-notice ok" role="status">
          {notice}
        </div>
      )}
      {error && (
        <div className="admin-notice" role="alert">
          {error}
        </div>
      )}
      <div className="admin-toolbar">
        <div className="filter-group">
          {statusFilters.map((option) => (
            <button
              key={option.value}
              className={filter === option.value ? "chip active" : "chip"}
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <input
          className="admin-search"
          type="search"
          value={term}
          onChange={(event) => setTerm(event.target.value)}
          placeholder="Buscar por nome ou local"
          aria-label="Buscar eventos"
        />
      </div>
      {events === null && !error && (
        <p className="results-label">Carregando eventos...</p>
      )}
      {events !== null && !visible.length && (
        <div className="empty-state">
          <h2>
            {events.length
              ? "Nenhum evento com esse filtro."
              : "Você ainda não cadastrou eventos."}
          </h2>
          <Link to="/admin/eventos/novo" className="primary-button">
            Cadastrar o primeiro
          </Link>
        </div>
      )}
      <div className="admin-list">
        {visible.map((event) => {
          const percent = event.capacity
            ? Math.round((event.sold / event.capacity) * 100)
            : 0;
          const busy = busyId === event.id;
          return (
            <article className="admin-row" key={event.id}>
              <div
                className="admin-thumb"
                style={
                  event.banner_url
                    ? { backgroundImage: `url(${JSON.stringify(event.banner_url)})` }
                    : undefined
                }
              />
              <div className="admin-row-main">
                <div className="admin-row-title">
                  <Link to={`/admin/eventos/${event.id}`}>
                    <strong>{event.name}</strong>
                  </Link>
                  <span className={`status-pill ${event.status.toLowerCase()}`}>
                    {statusLabels[event.status] ?? event.status}
                  </span>
                </div>
                <small>
                  {formatDateTime(event.start_at)} ·{" "}
                  {event.venue
                    ? `${event.venue.name}, ${event.venue.city}`
                    : "Sem local"}{" "}
                  ·{" "}
                  {event.category
                    ? (categoryLabels[event.category] ?? event.category)
                    : "Sem categoria"}
                </small>
                <div className="sales-bar" aria-label={`${percent}% vendido`}>
                  <span style={{ width: `${Math.min(percent, 100)}%` }} />
                </div>
                <small>
                  {event.sold}/{event.capacity} vendidos
                  {event.reserved ? ` · ${event.reserved} reservados` : ""} ·{" "}
                  {brl(event.revenue)}
                </small>
              </div>
              <div className="admin-actions">
                <Link to={`/admin/eventos/${event.id}`} className="outline-button">
                  Editar
                </Link>
                {event.status === "DRAFT" && (
                  <button
                    className="primary-button small"
                    disabled={busy}
                    onClick={() => act(event, "publish")}
                  >
                    Publicar
                  </button>
                )}
                {event.status === "PUBLISHED" && (
                  <>
                    <Link to={`/eventos/${event.id}`} className="text-link">
                      Ver no site ↗
                    </Link>
                    <button
                      className="text-button"
                      disabled={busy}
                      onClick={() => act(event, "unpublish")}
                    >
                      Despublicar
                    </button>
                  </>
                )}
                <Link
                  to={`/admin/eventos/novo?copiar=${event.id}`}
                  className="text-button"
                >
                  Duplicar
                </Link>
                {event.status !== "CANCELLED" && event.sold > 0 && (
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => act(event, "cancel")}
                  >
                    Cancelar
                  </button>
                )}
                {event.sold === 0 && event.reserved === 0 && (
                  <button
                    className="text-button danger"
                    disabled={busy}
                    onClick={() => act(event, "delete")}
                  >
                    Excluir
                  </button>
                )}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

// ---------- Formulário de evento ----------
type TicketDraft = {
  key: string;
  id?: string;
  name: string;
  description: string;
  price: string;
  serviceFee: string;
  quantity: string;
  maxQuantity: string;
  salesStartAt: string;
  salesEndAt: string;
  active: boolean;
  committed: number;
};
type VenueDraft = {
  name: string;
  address: string;
  number: string;
  neighborhood: string;
  city: string;
  state: string;
  capacity: string;
};
const emptyVenue: VenueDraft = {
  name: "",
  address: "",
  number: "",
  neighborhood: "",
  city: "",
  state: "",
  capacity: "",
};
let ticketKey = 0;
const newTicket = (name = "Entrada"): TicketDraft => ({
  key: `novo-${(ticketKey += 1)}`,
  name,
  description: "",
  price: "",
  serviceFee: "",
  quantity: "100",
  maxQuantity: "5",
  salesStartAt: "",
  salesEndAt: "",
  active: true,
  committed: 0,
});
type FormState = {
  name: string;
  description: string;
  category: string;
  startAt: string;
  endAt: string;
  doorsOpenAt: string;
  bannerUrl: string;
  ageRating: string;
  venueId: string;
  artists: string[];
  tickets: TicketDraft[];
  repeat: "" | "daily" | "weekly";
  repeatCount: string;
};
const emptyForm = (): FormState => ({
  name: "",
  description: "",
  category: "CLUB",
  startAt: "",
  endAt: "",
  doorsOpenAt: "",
  bannerUrl: "",
  ageRating: "18+",
  venueId: "",
  artists: [],
  tickets: [newTicket()],
  repeat: "",
  repeatCount: "4",
});
function formFromEvent(event: AdminEventDetail, copy: boolean): FormState {
  return {
    name: copy ? `${event.name} (cópia)` : event.name,
    description: event.description ?? "",
    category: event.category ?? "CLUB",
    startAt: copy ? "" : toLocalInput(event.start_at),
    endAt: copy ? "" : toLocalInput(event.end_at),
    doorsOpenAt: copy ? "" : toLocalInput(event.doors_open_at),
    bannerUrl: event.banner_url ?? "",
    ageRating: event.age_rating ?? "",
    venueId: event.venue_id ?? "",
    artists: event.artists.map((entry) => entry.artist.name),
    tickets: event.ticket_types
      .filter((ticket) => !copy || ticket.status === "ACTIVE")
      .map((ticket) => ({
        key: copy ? `novo-${(ticketKey += 1)}` : ticket.id,
        id: copy ? undefined : ticket.id,
        name: ticket.name,
        description: ticket.description ?? "",
        price: String(Number(ticket.price)),
        serviceFee: String(Number(ticket.service_fee)),
        quantity: String(ticket.quantity),
        maxQuantity: String(ticket.max_quantity),
        salesStartAt: copy ? "" : toLocalInput(ticket.sales_start_at),
        salesEndAt: copy ? "" : toLocalInput(ticket.sales_end_at),
        active: ticket.status === "ACTIVE",
        committed: copy ? 0 : ticket.sold_quantity + ticket.reserved_quantity,
      })),
    repeat: "",
    repeatCount: "4",
  };
}

function EventForm() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const copyFrom = params.get("copiar");
  const editing = Boolean(id);
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [status, setStatus] = useState("DRAFT");
  const [venues, setVenues] = useState<Venue[]>([]);
  const [newVenue, setNewVenue] = useState<VenueDraft | null>(null);
  const [artistInput, setArtistInput] = useState("");
  const [loading, setLoading] = useState(Boolean(id || copyFrom));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    apiRequest<{ venues: Venue[] }>("/api/admin/venues")
      .then((data) => {
        setVenues(data.venues);
        if (!data.venues.length) setNewVenue({ ...emptyVenue });
      })
      .catch((requestError: unknown) => setError(errorMessage(requestError)));
  }, []);
  useEffect(() => {
    const source = id ?? copyFrom;
    if (!source) return;
    apiRequest<{ event: AdminEventDetail }>(`/api/admin/events/${source}`)
      .then(({ event }) => {
        setForm(formFromEvent(event, !id));
        setStatus(id ? event.status : "DRAFT");
      })
      .catch((requestError: unknown) => setError(errorMessage(requestError)))
      .finally(() => setLoading(false));
  }, [id, copyFrom]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setTicket = (key: string, changes: Partial<TicketDraft>) =>
    set(
      "tickets",
      form.tickets.map((ticket) =>
        ticket.key === key ? { ...ticket, ...changes } : ticket,
      ),
    );
  const addArtist = () => {
    const names = artistInput
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name && !form.artists.includes(name));
    if (names.length) set("artists", [...form.artists, ...names]);
    setArtistInput("");
  };

  const save = async (publish: boolean, event?: FormEvent) => {
    event?.preventDefault();
    setError("");
    if (!form.name.trim() || !form.startAt) {
      setError("Preencha pelo menos o nome e a data de início.");
      return;
    }
    if (!form.venueId && !newVenue) {
      setError("Escolha um local ou cadastre um novo.");
      return;
    }
    const body = {
      name: form.name,
      description: form.description,
      category: form.category,
      startAt: fromLocalInput(form.startAt),
      endAt: fromLocalInput(form.endAt),
      doorsOpenAt: fromLocalInput(form.doorsOpenAt),
      bannerUrl: form.bannerUrl,
      ageRating: form.ageRating,
      status: publish ? "PUBLISHED" : editing ? undefined : "DRAFT",
      venueId: newVenue ? undefined : form.venueId,
      venue: newVenue ?? undefined,
      artists: form.artists,
      ticketTypes: form.tickets.map((ticket) => ({
        id: ticket.id,
        name: ticket.name,
        description: ticket.description,
        price: ticket.price.replace(",", ".") || "0",
        serviceFee: ticket.serviceFee.replace(",", ".") || "0",
        quantity: ticket.quantity || "0",
        maxQuantity: ticket.maxQuantity || "5",
        salesStartAt: fromLocalInput(ticket.salesStartAt),
        salesEndAt: fromLocalInput(ticket.salesEndAt),
        active: ticket.active,
      })),
      repeat:
        !editing && form.repeat
          ? { frequency: form.repeat, count: form.repeatCount }
          : undefined,
    };
    setSaving(true);
    try {
      if (editing)
        await apiRequest(`/api/admin/events/${id}`, { method: "PUT", body });
      else await apiRequest("/api/admin/events", { method: "POST", body });
      navigate("/admin");
    } catch (requestError) {
      setError(errorMessage(requestError));
      window.scrollTo({ top: 0, behavior: "smooth" });
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return (
      <main className="page-content">
        <p className="results-label">Carregando evento...</p>
      </main>
    );
  const selectedVenue = venues.find((venue) => venue.id === form.venueId);
  const lowestPrice = form.tickets.length
    ? Math.min(...form.tickets.map((ticket) => Number(ticket.price.replace(",", ".")) || 0))
    : 0;
  return (
    <main className="page-content admin-page">
      <Link to="/admin" className="back-link">
        ← Voltar ao painel
      </Link>
      <div className="page-intro">
        <span className="kicker">
          {editing
            ? `Editando · ${statusLabels[status] ?? status}`
            : copyFrom
              ? "Duplicando evento"
              : "Novo evento"}
        </span>
        <h1>{editing ? form.name || "Evento" : "Cadastrar evento"}</h1>
      </div>
      {error && (
        <div className="admin-notice" role="alert">
          {error}
        </div>
      )}
      <div className="admin-form-layout">
        <form className="admin-form" onSubmit={(event) => save(false, event)}>
          <fieldset>
            <legend>Informações</legend>
            <label className="wide">
              Nome do evento *
              <input
                required
                maxLength={200}
                value={form.name}
                onChange={(event) => set("name", event.target.value)}
                placeholder="Ex.: Sundown Sessions"
              />
            </label>
            <label>
              Categoria
              <select
                value={form.category}
                onChange={(event) => set("category", event.target.value)}
              >
                {Object.entries(categoryLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Classificação
              <select
                value={form.ageRating}
                onChange={(event) => set("ageRating", event.target.value)}
              >
                <option value="">Livre</option>
                <option value="14+">14+</option>
                <option value="16+">16+</option>
                <option value="18+">18+</option>
              </select>
            </label>
            <label className="wide">
              Descrição
              <textarea
                rows={4}
                maxLength={5000}
                value={form.description}
                onChange={(event) => set("description", event.target.value)}
                placeholder="O que rola, estilo musical, dress code, estacionamento..."
              />
            </label>
            <label className="wide">
              Imagem de capa (link)
              <input
                type="url"
                value={form.bannerUrl}
                onChange={(event) => set("bannerUrl", event.target.value)}
                placeholder="https://..."
              />
              <small>Use uma imagem horizontal, de preferência com 1200px de largura.</small>
            </label>
          </fieldset>

          <fieldset>
            <legend>Data e horário</legend>
            <label>
              Início *
              <input
                required
                type="datetime-local"
                value={form.startAt}
                onChange={(event) => set("startAt", event.target.value)}
              />
            </label>
            <label>
              Término
              <input
                type="datetime-local"
                value={form.endAt}
                min={form.startAt}
                onChange={(event) => set("endAt", event.target.value)}
              />
            </label>
            <label>
              Abertura da casa
              <input
                type="datetime-local"
                value={form.doorsOpenAt}
                max={form.startAt}
                onChange={(event) => set("doorsOpenAt", event.target.value)}
              />
            </label>
            {!editing && (
              <div className="wide repeat-box">
                <span>Repetir este evento</span>
                <div className="filter-group">
                  {[
                    { value: "", label: "Não repete" },
                    { value: "daily", label: "Todo dia" },
                    { value: "weekly", label: "Toda semana" },
                  ].map((option) => (
                    <button
                      type="button"
                      key={option.value}
                      className={form.repeat === option.value ? "chip active" : "chip"}
                      aria-pressed={form.repeat === option.value}
                      onClick={() =>
                        set("repeat", option.value as FormState["repeat"])
                      }
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {form.repeat && (
                  <label>
                    Quantas vezes (incluindo a primeira)
                    <input
                      type="number"
                      min={2}
                      max={60}
                      value={form.repeatCount}
                      onChange={(event) => set("repeatCount", event.target.value)}
                    />
                    <small>
                      Cria {form.repeatCount || 0} eventos separados, cada um com
                      o próprio estoque de ingressos. Ideal para happy hours e
                      festas fixas.
                    </small>
                  </label>
                )}
              </div>
            )}
          </fieldset>

          <fieldset>
            <legend>Local</legend>
            {newVenue ? (
              <>
                <label className="wide">
                  Nome do local *
                  <input
                    value={newVenue.name}
                    onChange={(event) =>
                      setNewVenue({ ...newVenue, name: event.target.value })
                    }
                    placeholder="Ex.: Arca Club"
                  />
                </label>
                <label className="wide">
                  Endereço
                  <input
                    value={newVenue.address}
                    onChange={(event) =>
                      setNewVenue({ ...newVenue, address: event.target.value })
                    }
                    placeholder="Rua, avenida..."
                  />
                </label>
                <label>
                  Número
                  <input
                    value={newVenue.number}
                    onChange={(event) =>
                      setNewVenue({ ...newVenue, number: event.target.value })
                    }
                  />
                </label>
                <label>
                  Bairro
                  <input
                    value={newVenue.neighborhood}
                    onChange={(event) =>
                      setNewVenue({ ...newVenue, neighborhood: event.target.value })
                    }
                  />
                </label>
                <label>
                  Cidade *
                  <input
                    value={newVenue.city}
                    onChange={(event) =>
                      setNewVenue({ ...newVenue, city: event.target.value })
                    }
                  />
                </label>
                <label>
                  Estado
                  <input
                    maxLength={2}
                    value={newVenue.state}
                    onChange={(event) =>
                      setNewVenue({
                        ...newVenue,
                        state: event.target.value.toUpperCase(),
                      })
                    }
                    placeholder="SP"
                  />
                </label>
                <label>
                  Capacidade
                  <input
                    type="number"
                    min={1}
                    value={newVenue.capacity}
                    onChange={(event) =>
                      setNewVenue({ ...newVenue, capacity: event.target.value })
                    }
                  />
                </label>
                {venues.length > 0 && (
                  <button
                    type="button"
                    className="text-button wide"
                    onClick={() => setNewVenue(null)}
                  >
                    ← Escolher um local já cadastrado
                  </button>
                )}
              </>
            ) : (
              <>
                <label className="wide">
                  Local *
                  <select
                    value={form.venueId}
                    onChange={(event) => set("venueId", event.target.value)}
                  >
                    <option value="">Selecione...</option>
                    {venues.map((venue) => (
                      <option key={venue.id} value={venue.id}>
                        {venue.name} · {venue.city}
                      </option>
                    ))}
                  </select>
                  {selectedVenue && (
                    <small>
                      {[
                        selectedVenue.address,
                        selectedVenue.number,
                        selectedVenue.neighborhood,
                      ]
                        .filter(Boolean)
                        .join(", ") || "Sem endereço cadastrado"}
                      {selectedVenue.capacity
                        ? ` · capacidade ${selectedVenue.capacity}`
                        : ""}
                    </small>
                  )}
                </label>
                <button
                  type="button"
                  className="text-button wide"
                  onClick={() => setNewVenue({ ...emptyVenue })}
                >
                  + Cadastrar novo local
                </button>
              </>
            )}
          </fieldset>

          <fieldset>
            <legend>Line-up</legend>
            <div className="wide">
              <div className="artist-input">
                <input
                  value={artistInput}
                  onChange={(event) => setArtistInput(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      addArtist();
                    }
                  }}
                  placeholder="Nome do artista ou DJ (Enter para adicionar)"
                  aria-label="Adicionar artista"
                />
                <button type="button" className="outline-button" onClick={addArtist}>
                  Adicionar
                </button>
              </div>
              {form.artists.length > 0 && (
                <ul className="artist-list">
                  {form.artists.map((artist) => (
                    <li key={artist}>
                      {artist}
                      <button
                        type="button"
                        aria-label={`Remover ${artist}`}
                        onClick={() =>
                          set(
                            "artists",
                            form.artists.filter((item) => item !== artist),
                          )
                        }
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </fieldset>

          <fieldset>
            <legend>Ingressos</legend>
            {form.tickets.map((ticket, index) => (
              <div
                className={ticket.active ? "ticket-editor" : "ticket-editor inactive"}
                key={ticket.key}
              >
                <div className="ticket-editor-head">
                  <strong>Ingresso {index + 1}</strong>
                  <div>
                    <label className="inline-check">
                      <input
                        type="checkbox"
                        checked={ticket.active}
                        onChange={(event) =>
                          setTicket(ticket.key, { active: event.target.checked })
                        }
                      />
                      À venda
                    </label>
                    {form.tickets.length > 1 && ticket.committed === 0 && (
                      <button
                        type="button"
                        className="text-button danger"
                        onClick={() =>
                          set(
                            "tickets",
                            form.tickets.filter((item) => item.key !== ticket.key),
                          )
                        }
                      >
                        Remover
                      </button>
                    )}
                  </div>
                </div>
                <label>
                  Nome *
                  <input
                    value={ticket.name}
                    onChange={(event) =>
                      setTicket(ticket.key, { name: event.target.value })
                    }
                    placeholder="Pista, VIP, Meia-entrada..."
                  />
                </label>
                <label>
                  Descrição curta
                  <input
                    value={ticket.description}
                    onChange={(event) =>
                      setTicket(ticket.key, { description: event.target.value })
                    }
                    placeholder="Ex.: Acesso à pista"
                  />
                </label>
                <label>
                  Preço (R$) *
                  <input
                    inputMode="decimal"
                    value={ticket.price}
                    onChange={(event) =>
                      setTicket(ticket.key, { price: event.target.value })
                    }
                    placeholder="0,00"
                  />
                </label>
                <label>
                  Taxa de serviço (R$)
                  <input
                    inputMode="decimal"
                    value={ticket.serviceFee}
                    onChange={(event) =>
                      setTicket(ticket.key, { serviceFee: event.target.value })
                    }
                    placeholder="0,00"
                  />
                </label>
                <label>
                  Quantidade total *
                  <input
                    type="number"
                    min={ticket.committed}
                    value={ticket.quantity}
                    onChange={(event) =>
                      setTicket(ticket.key, { quantity: event.target.value })
                    }
                  />
                  {ticket.committed > 0 && (
                    <small>{ticket.committed} já vendidos ou reservados</small>
                  )}
                </label>
                <label>
                  Máximo por pedido
                  <select
                    value={ticket.maxQuantity}
                    onChange={(event) =>
                      setTicket(ticket.key, { maxQuantity: event.target.value })
                    }
                  >
                    {[1, 2, 3, 4, 5].map((value) => (
                      <option key={value} value={value}>
                        {value}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Vendas começam
                  <input
                    type="datetime-local"
                    value={ticket.salesStartAt}
                    onChange={(event) =>
                      setTicket(ticket.key, { salesStartAt: event.target.value })
                    }
                  />
                </label>
                <label>
                  Vendas terminam
                  <input
                    type="datetime-local"
                    value={ticket.salesEndAt}
                    onChange={(event) =>
                      setTicket(ticket.key, { salesEndAt: event.target.value })
                    }
                  />
                </label>
              </div>
            ))}
            <button
              type="button"
              className="outline-button wide"
              onClick={() =>
                set("tickets", [
                  ...form.tickets,
                  newTicket(form.tickets.length ? "VIP" : "Entrada"),
                ])
              }
            >
              + Adicionar tipo de ingresso
            </button>
          </fieldset>

          <div className="admin-submit">
            <button type="submit" className="outline-button" disabled={saving}>
              {saving
                ? "Salvando..."
                : editing && status === "PUBLISHED"
                  ? "Salvar alterações"
                  : "Salvar rascunho"}
            </button>
            {!(editing && status === "PUBLISHED") && (
              <button
                type="button"
                className="primary-button"
                disabled={saving}
                onClick={() => save(true)}
              >
                {form.repeat && !editing
                  ? `Publicar ${form.repeatCount || 0} eventos`
                  : "Publicar no site"}{" "}
                <span>→</span>
              </button>
            )}
          </div>
        </form>

        <aside className="admin-preview">
          <span className="kicker">Prévia no site</span>
          <div className="event-card">
            <div className="event-image-wrap">
              {form.bannerUrl && (
                <img
                  src={form.bannerUrl}
                  alt=""
                  onError={(event) => {
                    event.currentTarget.style.display = "none";
                  }}
                />
              )}
              {form.startAt && (
                <span className="event-date">
                  <strong>
                    {String(new Date(form.startAt).getDate()).padStart(2, "0")}
                  </strong>
                  {new Date(form.startAt)
                    .toLocaleDateString("pt-BR", { month: "short" })
                    .replace(".", "")
                    .toUpperCase()}
                </span>
              )}
            </div>
            <div className="event-card-body">
              <div className="eyebrow">
                {categoryLabels[form.category] ?? form.category} <span>·</span>{" "}
                {newVenue?.city || selectedVenue?.city || "Cidade"}
              </div>
              <h3>{form.name || "Nome do evento"}</h3>
              <p className="event-meta">
                {form.startAt ? formatDateTime(fromLocalInput(form.startAt)!) : "Data"}{" "}
                <span>—</span>{" "}
                {newVenue?.name || selectedVenue?.name || "Local"}
              </p>
              <div className="event-card-footer">
                <span>
                  A partir de <strong>{brl(lowestPrice)}</strong>
                </span>
              </div>
            </div>
          </div>
          <small className="secure-note">
            Rascunhos não aparecem no site. Publique quando estiver tudo certo.
          </small>
        </aside>
      </div>
    </main>
  );
}
