// Área administrativa: cadastro de eventos, locais e ingressos, e um resumo
// de vendas. ADMIN vê tudo; ORGANIZER só os eventos do próprio organizador.
import crypto from "node:crypto";
import type { Express, Request, RequestHandler } from "express";
import { z } from "zod";
import {
  EventStatus,
  OrderStatus,
  Prisma,
  TicketTypeStatus,
  UserRole,
  type PrismaClient,
} from "@prisma/client";

type AuthRequest = Request & { user?: { id: string; role: UserRole } };
type Deps = {
  app: Express;
  prisma: PrismaClient;
  authenticate: RequestHandler;
  requireRole: (...roles: UserRole[]) => RequestHandler;
  fail: (statusCode: number, message: string) => Error;
};

export const eventCategories = ["CLUB", "SHOW", "PARTY", "BAR", "FESTIVAL"];

const optionalText = (max: number) =>
  z.preprocess(
    (value) => (typeof value === "string" && !value.trim() ? undefined : value),
    z.string().trim().max(max).optional(),
  );
const optionalDate = z.preprocess(
  (value) => (value === "" || value === null ? undefined : value),
  z.coerce.date().optional(),
);
const money = z.coerce
  .number()
  .min(0, "Valor não pode ser negativo.")
  .max(100000)
  .transform((value) => Math.round(value * 100) / 100);

const ticketTypeInput = z
  .object({
    id: z.string().uuid().optional(),
    name: z.string().trim().min(2, "Dê um nome ao ingresso.").max(150),
    description: optionalText(500),
    price: money,
    serviceFee: money,
    quantity: z.coerce.number().int().min(0).max(1000000),
    maxQuantity: z.coerce.number().int().min(1).max(5).default(5),
    salesStartAt: optionalDate,
    salesEndAt: optionalDate,
    active: z.boolean().default(true),
  })
  .refine(
    (ticket) =>
      !ticket.salesStartAt ||
      !ticket.salesEndAt ||
      ticket.salesEndAt > ticket.salesStartAt,
    { message: "O fim das vendas precisa ser depois do início.", path: ["salesEndAt"] },
  );
const venueInput = z.object({
  name: z.string().trim().min(2, "Informe o nome do local.").max(200),
  address: optionalText(255),
  number: optionalText(30),
  neighborhood: optionalText(150),
  city: z.string().trim().min(2, "Informe a cidade.").max(150),
  state: optionalText(100),
  capacity: z.preprocess(
    (value) => (value === "" || value === null ? undefined : value),
    z.coerce.number().int().min(1).optional(),
  ),
});
const eventInput = z
  .object({
    name: z.string().trim().min(3, "Dê um nome ao evento.").max(200),
    description: optionalText(5000),
    category: z.enum(eventCategories as [string, ...string[]]),
    startAt: z.coerce.date(),
    endAt: optionalDate,
    doorsOpenAt: optionalDate,
    bannerUrl: z.preprocess(
      (value) => (typeof value === "string" && !value.trim() ? undefined : value),
      z.string().trim().url("Use um link de imagem válido (https://...).").optional(),
    ),
    ageRating: optionalText(20),
    // Sem status na edição, o evento mantém o que já tinha (ex.: cancelado).
    status: z.enum(["DRAFT", "PUBLISHED"]).optional(),
    venueId: z.string().uuid().optional(),
    venue: venueInput.optional(),
    artists: z.array(z.string().trim().min(1).max(200)).max(20).default([]),
    ticketTypes: z
      .array(ticketTypeInput)
      .min(1, "Cadastre pelo menos um tipo de ingresso.")
      .max(10),
    repeat: z
      .object({
        frequency: z.enum(["daily", "weekly"]),
        count: z.coerce.number().int().min(2).max(60),
      })
      .optional(),
  })
  .refine((event) => event.venueId || event.venue, {
    message: "Escolha ou cadastre um local.",
    path: ["venueId"],
  })
  .refine((event) => !event.endAt || event.endAt > event.startAt, {
    message: "O término precisa ser depois do início.",
    path: ["endAt"],
  })
  .refine((event) => !event.doorsOpenAt || event.doorsOpenAt <= event.startAt, {
    message: "A abertura da casa precisa ser antes do início.",
    path: ["doorsOpenAt"],
  });
type EventInput = z.infer<typeof eventInput>;

const slugify = (value: string) =>
  value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 150);
const shift = (date: Date | undefined, days: number) =>
  date ? new Date(date.getTime() + days * 24 * 60 * 60 * 1000) : undefined;

export function registerAdminRoutes({
  app,
  prisma,
  authenticate,
  requireRole,
  fail,
}: Deps) {
  const guard = [authenticate, requireRole(UserRole.ADMIN, UserRole.ORGANIZER)];
  const userOf = (request: Request) => (request as AuthRequest).user!;
  // Filtro de acesso: organizador só enxerga os próprios eventos.
  const scope = (request: Request): Prisma.eventsWhereInput => {
    const user = userOf(request);
    return user.role === UserRole.ADMIN
      ? { deleted_at: null }
      : { deleted_at: null, organizer: { user_id: user.id } };
  };
  const findOwnEvent = async (request: Request, id: string) => {
    const event = await prisma.events.findFirst({
      where: { id, ...scope(request) },
      include: {
        venue: true,
        artists: {
          orderBy: { position: "asc" },
          include: { artist: true },
        },
        ticket_types: { orderBy: { created_at: "asc" } },
      },
    });
    if (!event) throw fail(404, "Evento não encontrado.");
    return event;
  };
  const organizerFor = async (tx: Prisma.TransactionClient, userId: string) => {
    const existing = await tx.organizers.findUnique({ where: { user_id: userId } });
    if (existing) return existing;
    const user = await tx.users.findUniqueOrThrow({ where: { id: userId } });
    return tx.organizers.create({
      data: { user_id: userId, name: user.name, email: user.email, status: "ACTIVE" },
    });
  };
  const venueFor = async (tx: Prisma.TransactionClient, input: EventInput) => {
    if (input.venueId) {
      const venue = await tx.venues.findUnique({ where: { id: input.venueId } });
      if (!venue) throw fail(400, "Local não encontrado.");
      return venue.id;
    }
    const venue = await tx.venues.create({ data: input.venue! });
    return venue.id;
  };
  // Artistas são reaproveitados pelo nome para não duplicar cadastro.
  const setArtists = async (
    tx: Prisma.TransactionClient,
    eventId: string,
    names: string[],
  ) => {
    await tx.event_artists.deleteMany({ where: { event_id: eventId } });
    const unique = [...new Set(names.map((name) => name.trim()).filter(Boolean))];
    for (const [position, name] of unique.entries()) {
      const artist =
        (await tx.artists.findFirst({
          where: { name: { equals: name, mode: "insensitive" } },
        })) ?? (await tx.artists.create({ data: { name } }));
      await tx.event_artists.create({
        data: { event_id: eventId, artist_id: artist.id, position },
      });
    }
  };
  const eventData = (input: EventInput, dayOffset = 0) => ({
    name: input.name,
    description: input.description ?? null,
    category: input.category,
    start_at: shift(input.startAt, dayOffset)!,
    end_at: shift(input.endAt, dayOffset) ?? null,
    doors_open_at: shift(input.doorsOpenAt, dayOffset) ?? null,
    banner_url: input.bannerUrl ?? null,
    age_rating: input.ageRating ?? null,
  });
  const ticketData = (ticket: EventInput["ticketTypes"][number], dayOffset = 0) => ({
    name: ticket.name,
    description: ticket.description ?? null,
    price: ticket.price,
    service_fee: ticket.serviceFee,
    max_quantity: ticket.maxQuantity,
    sales_start_at: shift(ticket.salesStartAt, dayOffset) ?? null,
    sales_end_at: shift(ticket.salesEndAt, dayOffset) ?? null,
    status: ticket.active ? TicketTypeStatus.ACTIVE : TicketTypeStatus.INACTIVE,
  });

  app.get("/api/admin/overview", ...guard, async (request, response, next) => {
    try {
      const where = scope(request);
      const now = new Date();
      const [upcoming, drafts, sold, paid, pending] = await Promise.all([
        prisma.events.count({
          where: { ...where, status: EventStatus.PUBLISHED, start_at: { gte: now } },
        }),
        prisma.events.count({ where: { ...where, status: EventStatus.DRAFT } }),
        prisma.ticket_types.aggregate({
          where: { event: where },
          _sum: { sold_quantity: true },
        }),
        prisma.orders.aggregate({
          where: { event: where, status: OrderStatus.PAID },
          _sum: { total: true },
          _count: true,
        }),
        prisma.orders.count({
          where: { event: where, status: OrderStatus.PENDING },
        }),
      ]);
      return response.json({
        upcomingEvents: upcoming,
        draftEvents: drafts,
        ticketsSold: sold._sum.sold_quantity ?? 0,
        revenue: Number(paid._sum.total ?? 0),
        paidOrders: paid._count,
        pendingOrders: pending,
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/admin/events", ...guard, async (request, response, next) => {
    try {
      const events = await prisma.events.findMany({
        where: scope(request),
        orderBy: { start_at: "asc" },
        include: {
          venue: { select: { name: true, city: true } },
          ticket_types: {
            select: { quantity: true, sold_quantity: true, reserved_quantity: true },
          },
        },
      });
      const revenue = await prisma.orders.groupBy({
        by: ["event_id"],
        where: {
          status: OrderStatus.PAID,
          event_id: { in: events.map((event) => event.id) },
        },
        _sum: { total: true },
      });
      const revenueByEvent = new Map(
        revenue.map((row) => [row.event_id, Number(row._sum.total ?? 0)]),
      );
      return response.json({
        events: events.map(({ ticket_types, ...event }) => ({
          ...event,
          capacity: ticket_types.reduce((total, t) => total + t.quantity, 0),
          sold: ticket_types.reduce((total, t) => total + t.sold_quantity, 0),
          reserved: ticket_types.reduce((total, t) => total + t.reserved_quantity, 0),
          revenue: revenueByEvent.get(event.id) ?? 0,
        })),
      });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/admin/events/:id", ...guard, async (request, response, next) => {
    try {
      return response.json({ event: await findOwnEvent(request, String(request.params.id)) });
    } catch (error) {
      return next(error);
    }
  });

  app.get("/api/admin/venues", ...guard, async (_request, response, next) => {
    try {
      const venues = await prisma.venues.findMany({ orderBy: { name: "asc" } });
      return response.json({ venues });
    } catch (error) {
      return next(error);
    }
  });

  app.post("/api/admin/events", ...guard, async (request, response, next) => {
    try {
      const input = eventInput.parse(request.body);
      const user = userOf(request);
      const occurrences = input.repeat?.count ?? 1;
      const step = input.repeat?.frequency === "daily" ? 1 : 7;
      const created = await prisma.$transaction(
        async (tx) => {
          const organizer = await organizerFor(tx, user.id);
          const venueId = await venueFor(tx, input);
          const ids: string[] = [];
          for (let index = 0; index < occurrences; index += 1) {
            const offset = index * step;
            const startAt = shift(input.startAt, offset)!;
            const event = await tx.events.create({
              data: {
                ...eventData(input, offset),
                organizer_id: organizer.id,
                venue_id: venueId,
                slug: `${slugify(input.name)}-${startAt.toISOString().slice(0, 10)}-${crypto.randomBytes(2).toString("hex")}`,
                status: input.status ?? EventStatus.DRAFT,
                published_at: input.status === "PUBLISHED" ? new Date() : null,
              },
            });
            await setArtists(tx, event.id, input.artists);
            for (const ticket of input.ticketTypes) {
              const ticketType = await tx.ticket_types.create({
                data: {
                  ...ticketData(ticket, offset),
                  event_id: event.id,
                  quantity: ticket.quantity,
                },
              });
              await tx.inventory_transactions.create({
                data: {
                  ticket_type_id: ticketType.id,
                  type: "INITIAL",
                  quantity: ticket.quantity,
                  reference_type: "ADMIN",
                  reference_id: user.id,
                },
              });
            }
            ids.push(event.id);
          }
          return ids;
        },
        { timeout: 60000 },
      );
      return response.status(201).json({ ids: created });
    } catch (error) {
      return next(error);
    }
  });

  app.put("/api/admin/events/:id", ...guard, async (request, response, next) => {
    try {
      const input = eventInput.parse(request.body);
      const user = userOf(request);
      const current = await findOwnEvent(request, String(request.params.id));
      await prisma.$transaction(
        async (tx) => {
          const venueId = await venueFor(tx, input);
          await tx.events.update({
            where: { id: current.id },
            data: {
              ...eventData(input),
              venue_id: venueId,
              status: input.status ?? current.status,
              published_at:
                input.status === "PUBLISHED"
                  ? (current.published_at ?? new Date())
                  : current.published_at,
            },
          });
          await setArtists(tx, current.id, input.artists);
          const existing = new Map(current.ticket_types.map((t) => [t.id, t]));
          const kept = new Set<string>();
          for (const ticket of input.ticketTypes) {
            const previous = ticket.id ? existing.get(ticket.id) : undefined;
            if (ticket.id && !previous)
              throw fail(400, "Um dos ingressos não pertence a este evento.");
            if (previous) {
              kept.add(previous.id);
              // Estoque nunca pode ficar abaixo do que já foi vendido/reservado.
              const committed = previous.sold_quantity + previous.reserved_quantity;
              if (ticket.quantity < committed)
                throw fail(
                  409,
                  `“${ticket.name}” já tem ${committed} vendidos ou reservados; a quantidade não pode ser menor que isso.`,
                );
              await tx.ticket_types.update({
                where: { id: previous.id },
                data: { ...ticketData(ticket), quantity: ticket.quantity },
              });
              if (ticket.quantity !== previous.quantity)
                await tx.inventory_transactions.create({
                  data: {
                    ticket_type_id: previous.id,
                    type: "ADJUSTMENT",
                    quantity: ticket.quantity - previous.quantity,
                    reference_type: "ADMIN",
                    reference_id: user.id,
                  },
                });
            } else {
              const created = await tx.ticket_types.create({
                data: {
                  ...ticketData(ticket),
                  event_id: current.id,
                  quantity: ticket.quantity,
                },
              });
              await tx.inventory_transactions.create({
                data: {
                  ticket_type_id: created.id,
                  type: "INITIAL",
                  quantity: ticket.quantity,
                  reference_type: "ADMIN",
                  reference_id: user.id,
                },
              });
            }
          }
          // Ingresso removido do formulário: sai da venda, mas o histórico fica.
          const removed = current.ticket_types.filter((t) => !kept.has(t.id));
          if (removed.length)
            await tx.ticket_types.updateMany({
              where: { id: { in: removed.map((t) => t.id) } },
              data: { status: TicketTypeStatus.INACTIVE },
            });
        },
        { timeout: 30000 },
      );
      return response.json({ id: current.id });
    } catch (error) {
      return next(error);
    }
  });

  app.post(
    "/api/admin/events/:id/status",
    ...guard,
    async (request, response, next) => {
      try {
        const { status } = z
          .object({ status: z.enum(["DRAFT", "PUBLISHED", "CANCELLED"]) })
          .parse(request.body);
        const current = await findOwnEvent(request, String(request.params.id));
        await prisma.events.update({
          where: { id: current.id },
          data: {
            status,
            published_at:
              status === "PUBLISHED"
                ? (current.published_at ?? new Date())
                : current.published_at,
          },
        });
        return response.json({ id: current.id, status });
      } catch (error) {
        return next(error);
      }
    },
  );

  app.delete("/api/admin/events/:id", ...guard, async (request, response, next) => {
    try {
      const current = await findOwnEvent(request, String(request.params.id));
      const orders = await prisma.orders.count({
        where: {
          event_id: current.id,
          status: { in: [OrderStatus.PAID, OrderStatus.PENDING] },
        },
      });
      if (orders)
        throw fail(
          409,
          "Este evento já tem pedidos. Cancele o evento em vez de excluir.",
        );
      await prisma.events.update({
        where: { id: current.id },
        data: { deleted_at: new Date(), status: EventStatus.ARCHIVED },
      });
      return response.status(204).send();
    } catch (error) {
      return next(error);
    }
  });
}
