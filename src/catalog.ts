// Dados e regras do catálogo: conversão da API, datas e busca.
// Fica fora do App.tsx para que as telas só cuidem de exibição.

export const brl = (value: number) =>
  value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export type TicketOption = {
  id?: string;
  name: string;
  description: string;
  price: number;
  fee: number;
  available: number;
  maxPerOrder: number;
};
export type EventItem = {
  id: string;
  title: string;
  venue: string;
  address?: string;
  city: string;
  startsAt: string;
  date: string;
  day: string;
  month: string;
  weekday: string;
  time: string;
  category: string;
  description?: string;
  artists: string[];
  price: number;
  tickets?: TicketOption[];
  image: string;
};

export const ticketsOf = (event: EventItem): TicketOption[] =>
  event.tickets ?? [
    {
      name: "Entrada antecipada",
      description: "Acesso à pista",
      price: event.price,
      fee: 0,
      available: 100,
      maxPerOrder: 5,
    },
  ];
export const availableOf = (event: EventItem) =>
  ticketsOf(event).reduce((total, ticket) => total + ticket.available, 0);

function describeDate(date: Date) {
  return {
    startsAt: date.toISOString(),
    date: date
      .toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "numeric",
      })
      .replaceAll(" de ", " ")
      .replace(".", "")
      .toUpperCase(),
    day: String(date.getDate()).padStart(2, "0"),
    month: date
      .toLocaleDateString("pt-BR", { month: "short" })
      .replace(".", "")
      .toUpperCase(),
    weekday: date
      .toLocaleDateString("pt-BR", { weekday: "long" })
      .replace("-feira", ""),
    time: date.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
    }),
  };
}

// Curadoria de demonstração, usada só quando a API está fora do ar. As datas
// são relativas a hoje para a vitrine nunca mostrar eventos no passado.
function demoEvent(
  daysFromNow: number,
  hour: number,
  event: Omit<EventItem, keyof ReturnType<typeof describeDate>>,
): EventItem {
  const date = new Date();
  date.setDate(date.getDate() + daysFromNow);
  date.setHours(hour, 0, 0, 0);
  return { ...event, ...describeDate(date) };
}
export const demoEvents: EventItem[] = [
  demoEvent(0, 22, {
    id: "sundown",
    title: "Sundown Sessions",
    venue: "Arca Club",
    city: "São Paulo, SP",
    category: "Baladas",
    artists: ["Selvagem", "Carol Seubert"],
    price: 85,
    image:
      "https://images.unsplash.com/photo-1571266028243-d220c9c3b7de?auto=format&fit=crop&w=1200&q=85",
  }),
  demoEvent(1, 19, {
    id: "terraco",
    title: "Terraço 360",
    venue: "Vista Rooftop",
    city: "São Paulo, SP",
    category: "Bares",
    artists: [],
    price: 45,
    image:
      "https://images.unsplash.com/photo-1519671482749-fd09be7ccebf?auto=format&fit=crop&w=900&q=85",
  }),
  demoEvent(3, 23, {
    id: "baile",
    title: "Baile da Aurora",
    venue: "Vila JK",
    city: "São Paulo, SP",
    category: "Festas",
    artists: ["DJ Aurora"],
    price: 60,
    image:
      "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=900&q=85",
  }),
  demoEvent(9, 20, {
    id: "selva",
    title: "Selva Tropical",
    venue: "Casa Flora",
    city: "Rio de Janeiro, RJ",
    category: "Festas",
    artists: [],
    price: 72,
    image:
      "https://images.unsplash.com/photo-1506157786151-b8491531f063?auto=format&fit=crop&w=900&q=85",
  }),
  demoEvent(24, 22, {
    id: "disco",
    title: "Disco Fever",
    venue: "Tokyo Rose",
    city: "Belo Horizonte, MG",
    category: "Shows",
    artists: ["Banda Lumière"],
    price: 90,
    image:
      "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?auto=format&fit=crop&w=900&q=85",
  }),
  demoEvent(95, 16, {
    id: "brava",
    title: "Brava Festival",
    venue: "Marina da Glória",
    city: "Rio de Janeiro, RJ",
    category: "Festivais",
    artists: ["Vários artistas"],
    price: 140,
    image:
      "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=85",
  }),
];

export type ApiEvent = {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  start_at: string;
  banner_url: string | null;
  thumbnail_url: string | null;
  venue: {
    name: string;
    city: string;
    state: string | null;
    address: string | null;
    number: string | null;
  } | null;
  artists?: Array<{ artist: { name: string } }>;
  ticket_types: Array<{
    id: string;
    name: string;
    description: string | null;
    price: string | number;
    service_fee: string | number;
    quantity: number;
    sold_quantity: number;
    reserved_quantity: number;
    max_quantity: number;
  }>;
};
// O banco guarda a categoria como código (ex.: CLUB); a interface usa rótulos.
export const categoryLabels: Record<string, string> = {
  CLUB: "Baladas",
  SHOW: "Shows",
  PARTY: "Festas",
  BAR: "Bares",
  FESTIVAL: "Festivais",
};
export function toEventItem(item: ApiEvent, index: number): EventItem {
  const tickets = item.ticket_types.map((ticket) => {
    const available = Math.max(
      0,
      ticket.quantity - ticket.sold_quantity - ticket.reserved_quantity,
    );
    return {
      id: ticket.id,
      name: ticket.name,
      description: ticket.description ?? "",
      price: Number(ticket.price),
      fee: Number(ticket.service_fee),
      available,
      maxPerOrder: Math.min(5, ticket.max_quantity, available),
    };
  });
  return {
    id: item.id,
    title: item.name,
    venue: item.venue?.name ?? "Local a confirmar",
    address: item.venue?.address
      ? [item.venue.address, item.venue.number].filter(Boolean).join(", ")
      : undefined,
    city: item.venue
      ? [item.venue.city, item.venue.state].filter(Boolean).join(", ")
      : "Local a confirmar",
    ...describeDate(new Date(item.start_at)),
    category: item.category
      ? (categoryLabels[item.category] ?? item.category)
      : "Eventos",
    description: item.description ?? undefined,
    artists: (item.artists ?? []).map((entry) => entry.artist.name),
    price: tickets.length ? Math.min(...tickets.map((t) => t.price)) : 0,
    tickets,
    image:
      item.banner_url ??
      item.thumbnail_url ??
      demoEvents[index % demoEvents.length].image,
  };
}

// ---------- Datas ----------
const startOfDay = (date: Date) => {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return copy;
};
const addDays = (date: Date, days: number) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};
export const isSameDay = (a: Date, b: Date) =>
  a.toDateString() === b.toDateString();
export const monthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
export const monthLabel = (key: string) => {
  const [year, month] = key.split("-").map(Number);
  const label = new Date(year, month - 1, 1).toLocaleDateString("pt-BR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1).replace(" de ", " ");
};
export function dayBadge(event: EventItem, now = new Date()) {
  const date = new Date(event.startsAt);
  if (isSameDay(date, now)) return "Hoje";
  if (isSameDay(date, addDays(now, 1))) return "Amanhã";
  return "";
}

// ---------- Filtros ----------
export const whenOptions = [
  { value: "", label: "Qualquer data" },
  { value: "hoje", label: "Hoje" },
  { value: "amanha", label: "Amanhã" },
  { value: "fim-de-semana", label: "Fim de semana" },
  { value: "7-dias", label: "Próximos 7 dias" },
  { value: "mes", label: "Este mês" },
  { value: "ano", label: "Este ano" },
] as const;
export const priceOptions = [
  { value: "", label: "Qualquer preço" },
  { value: "ate-70", label: "Até R$ 70" },
  { value: "70-120", label: "R$ 70 a 120" },
  { value: "acima-120", label: "Acima de R$ 120" },
] as const;

function whenRange(when: string, now: Date): [Date, Date] | null {
  const today = startOfDay(now);
  switch (when) {
    case "hoje":
      return [today, addDays(today, 1)];
    case "amanha":
      return [addDays(today, 1), addDays(today, 2)];
    case "fim-de-semana": {
      // De sexta a domingo; se já for fim de semana, vale o atual.
      const day = today.getDay();
      const friday = day === 0 ? addDays(today, -2) : addDays(today, 5 - day);
      const start = friday < today ? today : friday;
      return [start, addDays(friday, 3)];
    }
    case "7-dias":
      return [today, addDays(today, 7)];
    case "mes":
      return [today, new Date(today.getFullYear(), today.getMonth() + 1, 1)];
    case "ano":
      return [today, new Date(today.getFullYear() + 1, 0, 1)];
    default:
      return null;
  }
}
function matchesPrice(price: number, range: string) {
  if (range === "ate-70") return price <= 70;
  if (range === "70-120") return price > 70 && price <= 120;
  if (range === "acima-120") return price > 120;
  return true;
}
// Busca sem acento e sem diferenciar maiúsculas: "sao paulo" acha "São Paulo".
export const normalize = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();

export type Filters = {
  q: string;
  categoria: string;
  quando: string;
  mes: string;
  preco: string;
  cidade: string;
  ordem: string;
  salvos: boolean;
};
export function filterEvents(
  catalog: EventItem[],
  filters: Filters,
  favorites: string[],
  now = new Date(),
) {
  const terms = normalize(filters.q).split(/\s+/).filter(Boolean);
  const range = whenRange(filters.quando, now);
  const results = catalog.filter((event) => {
    const date = new Date(event.startsAt);
    const haystack = normalize(
      [
        event.title,
        event.venue,
        event.city,
        event.category,
        event.description ?? "",
        ...event.artists,
        ...ticketsOf(event).map((ticket) => ticket.name),
      ].join(" "),
    );
    return (
      terms.every((term) => haystack.includes(term)) &&
      (!filters.categoria || event.category === filters.categoria) &&
      (!range || (date >= range[0] && date < range[1])) &&
      (!filters.mes || monthKey(date) === filters.mes) &&
      matchesPrice(event.price, filters.preco) &&
      (!filters.cidade || event.city === filters.cidade) &&
      (!filters.salvos || favorites.includes(event.id))
    );
  });
  return results.sort((a, b) =>
    filters.ordem === "preco"
      ? a.price - b.price
      : a.startsAt.localeCompare(b.startsAt),
  );
}

// Próximos 12 meses com a contagem de eventos de cada um.
export function yearAgenda(catalog: EventItem[], now = new Date()) {
  return Array.from({ length: 12 }, (_, offset) => {
    const key = monthKey(new Date(now.getFullYear(), now.getMonth() + offset, 1));
    const items = catalog.filter(
      (event) => monthKey(new Date(event.startsAt)) === key,
    );
    return { key, items };
  });
}
// Próximos 7 dias, para a agenda diária da home.
export function weekAgenda(catalog: EventItem[], now = new Date()) {
  const today = startOfDay(now);
  return Array.from({ length: 7 }, (_, offset) => {
    const day = addDays(today, offset);
    return {
      day,
      label:
        offset === 0
          ? "Hoje"
          : offset === 1
            ? "Amanhã"
            : day
                .toLocaleDateString("pt-BR", { weekday: "short" })
                .replace(".", ""),
      items: catalog.filter((event) =>
        isSameDay(new Date(event.startsAt), day),
      ),
    };
  });
}

// Arquivo .ics para "Adicionar à agenda" (Google Agenda, Apple, Outlook).
export function calendarFile(event: EventItem) {
  const start = new Date(event.startsAt);
  const end = new Date(start.getTime() + 5 * 60 * 60 * 1000);
  const stamp = (date: Date) =>
    date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const escape = (value: string) => value.replace(/([,;\\])/g, "\\$1");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//balada//pt-BR",
    "BEGIN:VEVENT",
    `UID:${event.id}@balada`,
    `DTSTAMP:${stamp(new Date())}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escape(event.title)}`,
    `LOCATION:${escape([event.venue, event.address, event.city].filter(Boolean).join(", "))}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}
