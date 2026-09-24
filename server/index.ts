import "dotenv/config";
import crypto from "node:crypto";
import bcrypt from "bcryptjs";
import cookieParser from "cookie-parser";
import cors from "cors";
import express, {
  type NextFunction,
  type Request,
  type Response,
} from "express";
import helmet from "helmet";
import { OAuth2Client } from "google-auth-library";
import { registerAdminRoutes } from "./admin.js";
import { z } from "zod";
import {
  Prisma,
  PrismaClient,
  EventStatus,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  ReservationStatus,
  TicketStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
const port = Number(process.env.PORT ?? process.env.API_PORT ?? 4100);
const isProduction = process.env.NODE_ENV === "production";
const sessionCookie = "balada_session";
const webhookSecret = process.env.PAYMENT_WEBHOOK_SECRET;
const frontendOrigin = process.env.FRONTEND_ORIGIN ?? "http://localhost:5180";
const ticketQrSecret =
  process.env.TICKET_QR_SECRET ??
  (isProduction ? undefined : "balada-dev-only-qr-secret");
if (!ticketQrSecret)
  throw new Error("TICKET_QR_SECRET precisa estar configurada em produção.");
const googleClientId = process.env.GOOGLE_CLIENT_ID;
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;
const googleRedirectUri =
  process.env.GOOGLE_REDIRECT_URI ??
  `http://localhost:${port}/api/auth/google/callback`;
const googleClient = new OAuth2Client(
  googleClientId,
  googleClientSecret,
  googleRedirectUri,
);

// Na Railway a API fica atrás de um proxy; sem isso request.ip seria o do proxy
// e o limite de tentativas de login valeria para todo mundo junto.
if (isProduction) app.set("trust proxy", 1);
app.use(helmet());
app.use(
  cors({
    origin: frontendOrigin,
    credentials: true,
    methods: ["GET", "POST", "PATCH", "PUT", "DELETE"],
  }),
);
app.use(express.json({ limit: "100kb" }));
app.use(cookieParser());

const hash = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex");
const newToken = () => crypto.randomBytes(32).toString("hex");
// O token do QR é derivado do código do ingresso: o banco guarda só o hash,
// mas a API consegue recriá-lo para mostrar ao dono do ingresso.
const qrToken = (ticketCode: string) =>
  crypto.createHmac("sha256", ticketQrSecret).update(ticketCode).digest("hex");
// Em produção o front (Vercel) e a API (Railway) ficam em sites diferentes,
// então o cookie precisa de SameSite=None para ir junto nas chamadas fetch.
const cookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? ("none" as const) : ("lax" as const),
  path: "/",
};
const publicUser = (user: {
  id: string;
  name: string;
  email: string;
  role: UserRole;
}) => ({ id: user.id, name: user.name, email: user.email, role: user.role });

type AuthRequest = Request & { user?: { id: string; role: UserRole } };
async function authenticate(
  request: AuthRequest,
  response: Response,
  next: NextFunction,
) {
  const rawToken = request.cookies[sessionCookie] as string | undefined;
  if (!rawToken)
    return response.status(401).json({ error: "Autenticação necessária." });
  const session = await prisma.sessions.findFirst({
    where: { token: hash(rawToken), expires_at: { gt: new Date() } },
    select: { user_id: true, user: { select: { role: true, status: true } } },
  });
  if (!session || session.user.status !== UserStatus.ACTIVE)
    return response.status(401).json({ error: "Sessão inválida ou expirada." });
  request.user = { id: session.user_id, role: session.user.role };
  return next();
}
function requireRole(...roles: UserRole[]) {
  return (request: AuthRequest, response: Response, next: NextFunction) => {
    if (!request.user || !roles.includes(request.user.role))
      return response.status(403).json({ error: "Permissão insuficiente." });
    return next();
  };
}
async function setSession(response: Response, userId: string) {
  const rawToken = newToken();
  await prisma.sessions.create({
    data: {
      user_id: userId,
      token: hash(rawToken),
      expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
    },
  });
  response.cookie(sessionCookie, rawToken, {
    ...cookieOptions,
    maxAge: 1000 * 60 * 60 * 24 * 30,
  });
}

const emailField = z
  .string()
  .trim()
  .email("Digite um e-mail válido.")
  .max(255)
  .transform((value) => value.toLowerCase());
const nameField = z
  .string()
  .trim()
  .min(2, "Digite seu nome completo.")
  .max(150, "Nome muito longo.");
const phoneField = z.preprocess(
  (value) => (typeof value === "string" && !value.trim() ? undefined : value),
  z
    .string()
    .trim()
    .regex(/^[0-9()+\s-]{8,30}$/, "Telefone inválido.")
    .optional(),
);
const registerSchema = z.object({
  name: nameField,
  email: emailField,
  phone: phoneField,
  password: z
    .string()
    .min(8, "A senha precisa ter pelo menos 8 caracteres.")
    .max(72, "A senha pode ter no máximo 72 caracteres.")
    .regex(/[A-Za-z]/, "Use pelo menos uma letra na senha.")
    .regex(/[0-9]/, "Use pelo menos um número na senha."),
});
const loginSchema = z.object({
  email: emailField,
  password: z.string().min(1, "Digite sua senha.").max(72),
});
const profileSchema = z.object({ name: nameField, phone: phoneField });

// Limite simples de tentativas de login por IP + e-mail (memória do processo).
const loginFailures = new Map<string, { count: number; until: number }>();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_FAILURES = 8;
function loginBlocked(key: string) {
  const entry = loginFailures.get(key);
  if (!entry) return false;
  if (entry.until < Date.now()) {
    loginFailures.delete(key);
    return false;
  }
  return entry.count >= LOGIN_MAX_FAILURES;
}
function registerLoginFailure(key: string) {
  const entry = loginFailures.get(key);
  if (!entry || entry.until < Date.now())
    loginFailures.set(key, { count: 1, until: Date.now() + LOGIN_WINDOW_MS });
  else entry.count += 1;
}

// Só aceita caminhos internos do site como destino depois do login.
const safeReturnTo = (value: unknown) =>
  typeof value === "string" && /^\/(?!\/)[\w\-/?=&%.#]*$/.test(value)
    ? value
    : "/eventos";
const oauthCookie = "balada_oauth";
const loginError = (code: string) => `${frontendOrigin}/login?error=${code}`;
const reservationSchema = z.object({
  eventId: z.string().uuid(),
  paymentMethod: z
    .enum(["PIX", "CREDIT_CARD", "DEBIT_CARD", "OTHER"])
    .default("PIX"),
  items: z
    .array(
      z.object({
        ticketTypeId: z.string().uuid(),
        quantity: z.number().int().min(1).max(5),
      }),
    )
    .min(1)
    .max(20),
});

app.get("/api/health", (_request, response) =>
  response.json({ ok: true, service: "balada-api" }),
);
app.get("/api/auth/providers", (_request, response) =>
  response.json({ google: Boolean(googleClientId && googleClientSecret) }),
);
app.get("/api/auth/google", (request, response) => {
  if (!googleClientId || !googleClientSecret)
    return response.redirect(loginError("google_unavailable"));
  // O "state" amarra a volta do Google a este navegador (proteção contra CSRF)
  // e carrega a página para onde a pessoa volta depois do login.
  const nonce = newToken();
  const returnTo = safeReturnTo(request.query.returnTo);
  response.cookie(oauthCookie, nonce, {
    httpOnly: true,
    secure: isProduction,
    sameSite: "lax",
    maxAge: 10 * 60 * 1000,
    path: "/api/auth/google",
  });
  return response.redirect(
    googleClient.generateAuthUrl({
      scope: ["openid", "email", "profile"],
      prompt: "select_account",
      state: `${nonce}.${Buffer.from(returnTo).toString("base64url")}`,
    }),
  );
});
app.get("/api/auth/google/callback", async (request, response) => {
  try {
    const expectedNonce = request.cookies[oauthCookie] as string | undefined;
    response.clearCookie(oauthCookie, { path: "/api/auth/google" });
    if (!googleClientId || !googleClientSecret)
      return response.redirect(loginError("google_unavailable"));
    if (request.query.error === "access_denied")
      return response.redirect(loginError("google_cancelled"));
    const [nonce = "", encodedReturn = ""] = String(
      request.query.state ?? "",
    ).split(".");
    if (
      !expectedNonce ||
      nonce.length !== expectedNonce.length ||
      !crypto.timingSafeEqual(Buffer.from(nonce), Buffer.from(expectedNonce))
    )
      return response.redirect(loginError("google_expired"));
    const returnTo = safeReturnTo(
      Buffer.from(encodedReturn, "base64url").toString(),
    );
    if (typeof request.query.code !== "string")
      return response.redirect(loginError("google_invalid"));
    const { tokens } = await googleClient.getToken(request.query.code);
    if (!tokens.id_token)
      return response.redirect(loginError("google_invalid"));
    const ticket = await googleClient.verifyIdToken({
      idToken: tokens.id_token,
      audience: googleClientId,
    });
    const profile = ticket.getPayload();
    if (!profile?.sub || !profile.email || !profile.email_verified)
      return response.redirect(loginError("google_profile"));
    const profileName = profile.name ?? profile.email.split("@")[0];
    const googleEmail = profile.email.toLowerCase();
    const user = await prisma.$transaction(async (tx) => {
      const account = await tx.user_accounts.findFirst({
        where: { provider: "GOOGLE", provider_account_id: profile.sub },
        select: { user: true },
      });
      if (account) return account.user;
      const existingUser = await tx.users.findUnique({
        where: { email: googleEmail },
      });
      if (existingUser) {
        // Se o e-mail nunca foi confirmado, alguém pode ter criado a conta com
        // o e-mail de outra pessoa. O dono real (provado pelo Google) assume a
        // conta: a senha antiga e as sessões abertas deixam de valer.
        const takeOver = !existingUser.email_verified_at;
        if (takeOver)
          await tx.sessions.deleteMany({ where: { user_id: existingUser.id } });
        await tx.user_accounts.create({
          data: {
            user_id: existingUser.id,
            provider: "GOOGLE",
            provider_account_id: profile.sub,
            provider_email: profile.email,
          },
        });
        return tx.users.update({
          where: { id: existingUser.id },
          data: {
            avatar_url: profile.picture,
            email_verified_at: new Date(),
            ...(takeOver && { password_hash: null }),
          },
        });
      }
      return tx.users.upsert({
        where: { email: googleEmail },
        update: {
          name: profileName,
          avatar_url: profile.picture,
          email_verified_at: new Date(),
        },
        create: {
          name: profileName,
          email: googleEmail,
          avatar_url: profile.picture,
          status: UserStatus.ACTIVE,
          email_verified_at: new Date(),
          accounts: {
            create: {
              provider: "GOOGLE",
              provider_account_id: profile.sub,
              provider_email: profile.email,
            },
          },
        },
      });
    });
    if (user.status !== UserStatus.ACTIVE)
      return response.redirect(loginError("account_blocked"));
    await setSession(response, user.id);
    return response.redirect(`${frontendOrigin}${returnTo}`);
  } catch (error) {
    console.error("Falha no login Google:", error);
    return response.redirect(loginError("google_failed"));
  }
});
app.post("/api/auth/register", async (request, response, next) => {
  try {
    const input = registerSchema.parse(request.body);
    const exists = await prisma.users.findUnique({
      where: { email: input.email },
    });
    if (exists)
      return response
        .status(409)
        .json({ error: "Este e-mail já está cadastrado." });
    const user = await prisma.users
      .create({
        data: {
          name: input.name,
          email: input.email,
          phone: input.phone,
          password_hash: await bcrypt.hash(input.password, 12),
          status: UserStatus.ACTIVE,
        },
      })
      .catch((error: unknown) => {
        // Dois cadastros simultâneos com o mesmo e-mail.
        if (
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002"
        )
          throw new ApiError(409, "Este e-mail já está cadastrado.");
        throw error;
      });
    await setSession(response, user.id);
    return response.status(201).json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});
app.post("/api/auth/login", async (request, response, next) => {
  try {
    const input = loginSchema.parse(request.body);
    const limitKey = `${request.ip}:${input.email}`;
    if (loginBlocked(limitKey))
      return response.status(429).json({
        error: "Muitas tentativas. Aguarde 15 minutos e tente de novo.",
      });
    const user = await prisma.users.findUnique({
      where: { email: input.email },
      include: { accounts: { select: { provider: true } } },
    });
    if (user && !user.password_hash && user.accounts.length)
      return response.status(401).json({
        error:
          "Esta conta usa o login do Google. Clique em “Continuar com Google”.",
      });
    if (
      !user ||
      !user.password_hash ||
      !(await bcrypt.compare(input.password, user.password_hash))
    ) {
      registerLoginFailure(limitKey);
      return response.status(401).json({ error: "E-mail ou senha inválidos." });
    }
    loginFailures.delete(limitKey);
    if (user.status !== UserStatus.ACTIVE)
      return response.status(403).json({ error: "Conta indisponível." });
    await setSession(response, user.id);
    return response.json({ user: publicUser(user) });
  } catch (error) {
    return next(error);
  }
});
app.post(
  "/api/auth/logout",
  authenticate,
  async (request: AuthRequest, response, next) => {
    try {
      const rawToken = request.cookies[sessionCookie] as string;
      await prisma.sessions.deleteMany({ where: { token: hash(rawToken) } });
      response.clearCookie(sessionCookie, cookieOptions);
      return response.status(204).send();
    } catch (error) {
      return next(error);
    }
  },
);
app.get(
  "/api/auth/me",
  authenticate,
  async (request: AuthRequest, response, next) => {
    try {
      const user = await prisma.users.findUniqueOrThrow({
        where: { id: request.user!.id },
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          role: true,
          avatar_url: true,
          password_hash: true,
          accounts: { select: { provider: true } },
        },
      });
      const { password_hash, accounts, ...rest } = user;
      return response.json({
        user: {
          ...rest,
          hasPassword: Boolean(password_hash),
          google: accounts.some((account) => account.provider === "GOOGLE"),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);
app.patch(
  "/api/auth/me",
  authenticate,
  async (request: AuthRequest, response, next) => {
    try {
      const input = profileSchema.parse(request.body);
      const user = await prisma.users.update({
        where: { id: request.user!.id },
        data: { name: input.name, phone: input.phone ?? null },
      });
      return response.json({ user: publicUser(user) });
    } catch (error) {
      return next(error);
    }
  },
);

const upcomingEvent = () => ({
  status: EventStatus.PUBLISHED,
  deleted_at: null,
  OR: [
    { end_at: { gte: new Date() } },
    { end_at: null, start_at: { gte: new Date() } },
  ],
});
app.get("/api/events", async (_request, response, next) => {
  try {
    const events = await prisma.events.findMany({
      where: upcomingEvent(),
      orderBy: { start_at: "asc" },
      include: {
        venue: true,
        artists: {
          orderBy: { position: "asc" },
          select: { artist: { select: { name: true } } },
        },
        ticket_types: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            name: true,
            description: true,
            price: true,
            service_fee: true,
            quantity: true,
            sold_quantity: true,
            reserved_quantity: true,
            max_quantity: true,
          },
        },
      },
    });
    return response.json({ events });
  } catch (error) {
    return next(error);
  }
});
app.get("/api/events/:id", async (request, response, next) => {
  try {
    const event = await prisma.events.findFirst({
      where: {
        id: request.params.id,
        status: EventStatus.PUBLISHED,
        deleted_at: null,
      },
      include: {
        venue: true,
        artists: { include: { artist: true }, orderBy: { position: "asc" } },
        ticket_types: { where: { status: "ACTIVE" } },
      },
    });
    if (!event)
      return response.status(404).json({ error: "Evento não encontrado." });
    return response.json({ event });
  } catch (error) {
    return next(error);
  }
});

app.post(
  "/api/reservations",
  authenticate,
  async (request: AuthRequest, response, next) => {
    try {
      const input = reservationSchema.parse(request.body);
      const now = new Date();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
      const result = await prisma.$transaction(
        async (tx) => {
          const event = await tx.events.findFirst({
            where: { id: input.eventId, ...upcomingEvent() },
            select: { id: true },
          });
          if (!event) throw new ApiError(404, "Evento não encontrado.");
          const requestedTotal = input.items.reduce(
            (total, item) => total + item.quantity,
            0,
          );
          const [pendingReservations, activeOrders] = await Promise.all([
            tx.reservations.findMany({
              where: {
                user_id: request.user!.id,
                event_id: input.eventId,
                status: ReservationStatus.PENDING,
                expires_at: { gt: now },
              },
              include: { items: true },
            }),
            tx.orders.findMany({
              where: {
                user_id: request.user!.id,
                event_id: input.eventId,
                status: OrderStatus.PAID,
              },
              include: { items: true },
            }),
          ]);
          const alreadyHeld = pendingReservations
            .flatMap((reservation) => reservation.items)
            .reduce((total, item) => total + item.quantity, 0);
          const alreadyBought = activeOrders
            .flatMap((order) => order.items)
            .reduce((total, item) => total + item.quantity, 0);
          if (alreadyHeld + alreadyBought + requestedTotal > 5)
            throw new ApiError(
              409,
              "O limite de 5 ingressos por evento foi atingido.",
            );
          const lockedTypes = await tx.$queryRaw<
            Array<{
              id: string;
              price: Prisma.Decimal;
              service_fee: Prisma.Decimal;
              quantity: number;
              sold_quantity: number;
              reserved_quantity: number;
              max_quantity: number;
              sales_start_at: Date | null;
              sales_end_at: Date | null;
            }>
          >(
            Prisma.sql`SELECT id, price, service_fee, quantity, sold_quantity, reserved_quantity, max_quantity, sales_start_at, sales_end_at FROM ticket_types WHERE id IN (${Prisma.join(input.items.map((item) => Prisma.sql`${item.ticketTypeId}::uuid`))}) AND event_id = ${input.eventId}::uuid AND status = 'ACTIVE' FOR UPDATE`,
          );
          if (lockedTypes.length !== input.items.length)
            throw new ApiError(400, "Um dos ingressos não está disponível.");
          const byId = new Map(
            lockedTypes.map((ticket) => [ticket.id, ticket]),
          );
          let subtotal = new Prisma.Decimal(0);
          let serviceFee = new Prisma.Decimal(0);
          const reservationItems = input.items.map((item) => {
            const ticket = byId.get(item.ticketTypeId)!;
            if (
              (ticket.sales_start_at && ticket.sales_start_at > now) ||
              (ticket.sales_end_at && ticket.sales_end_at < now)
            )
              throw new ApiError(409, "As vendas deste ingresso estão fechadas.");
            if (item.quantity > ticket.max_quantity)
              throw new ApiError(
                409,
                `Máximo de ${ticket.max_quantity} unidades para este ingresso.`,
              );
            const available =
              ticket.quantity - ticket.sold_quantity - ticket.reserved_quantity;
            if (available < item.quantity)
              throw new ApiError(
                409,
                "Quantidade indisponível para um dos ingressos.",
              );
            const total = ticket.price.mul(item.quantity);
            const fee = ticket.service_fee.mul(item.quantity);
            subtotal = subtotal.add(total);
            serviceFee = serviceFee.add(fee);
            return {
              fee,
              ticket_type_id: ticket.id,
              quantity: item.quantity,
              unit_price: ticket.price,
              total_price: total,
            };
          });
          const reservation = await tx.reservations.create({
            data: {
              user_id: request.user!.id,
              event_id: input.eventId,
              expires_at: expiresAt,
              items: {
                create: reservationItems.map(({ fee: _fee, ...item }) => item),
              },
            },
          });
          for (const item of input.items) {
            await tx.ticket_types.update({
              where: { id: item.ticketTypeId },
              data: { reserved_quantity: { increment: item.quantity } },
            });
            await tx.inventory_transactions.create({
              data: {
                ticket_type_id: item.ticketTypeId,
                type: "RESERVATION",
                quantity: item.quantity,
                reference_type: "RESERVATION",
                reference_id: reservation.id,
              },
            });
          }
          const order = await tx.orders.create({
            data: {
              user_id: request.user!.id,
              event_id: input.eventId,
              reservation_id: reservation.id,
              order_number: `BD-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`,
              subtotal,
              service_fee: serviceFee,
              total: subtotal.add(serviceFee),
              items: {
                create: reservationItems.map((item) => ({
                  ticket_type_id: item.ticket_type_id,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  service_fee: item.fee,
                  total_price: item.total_price,
                })),
              },
              payments: {
                create: {
                  provider: "MOCK",
                  method: input.paymentMethod as PaymentMethod,
                  amount: subtotal.add(serviceFee),
                  currency: "BRL",
                },
              },
            },
          });
          return { reservation, order };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
      return response.status(201).json(result);
    } catch (error) {
      return next(error);
    }
  },
);

// Devolve ao estoque o que a reserva segurava. O updateMany condicional garante
// que só uma transação (job de expiração ou webhook) libera a mesma reserva.
async function releaseReservation(
  tx: Prisma.TransactionClient,
  reservationId: string,
  reservationStatus: ReservationStatus,
  orderStatus: OrderStatus,
  paymentStatus: PaymentStatus,
) {
  const claimed = await tx.reservations.updateMany({
    where: { id: reservationId, status: ReservationStatus.PENDING },
    data: { status: reservationStatus },
  });
  if (!claimed.count) return false;
  const items = await tx.reservation_items.findMany({
    where: { reservation_id: reservationId },
  });
  for (const item of items) {
    await tx.ticket_types.update({
      where: { id: item.ticket_type_id },
      data: { reserved_quantity: { decrement: item.quantity } },
    });
    await tx.inventory_transactions.create({
      data: {
        ticket_type_id: item.ticket_type_id,
        type: "RELEASE",
        quantity: item.quantity,
        reference_type: "RESERVATION",
        reference_id: reservationId,
      },
    });
  }
  await tx.orders.updateMany({
    where: { reservation_id: reservationId, status: OrderStatus.PENDING },
    data: { status: orderStatus },
  });
  await tx.payments.updateMany({
    where: {
      order: { reservation_id: reservationId },
      status: { in: [PaymentStatus.PENDING, PaymentStatus.PROCESSING] },
    },
    data: { status: paymentStatus },
  });
  return true;
}
async function expireReservations() {
  const expired = await prisma.reservations.findMany({
    where: {
      status: ReservationStatus.PENDING,
      expires_at: { lte: new Date() },
    },
    select: { id: true },
    take: 100,
  });
  for (const reservation of expired)
    await prisma.$transaction((tx) =>
      releaseReservation(
        tx,
        reservation.id,
        ReservationStatus.EXPIRED,
        OrderStatus.EXPIRED,
        PaymentStatus.EXPIRED,
      ),
    );
}

app.post("/api/payments/webhook", async (request, response, next) => {
  try {
    if (!webhookSecret || request.header("x-webhook-secret") !== webhookSecret)
      return response.status(401).json({ error: "Webhook não autorizado." });
    const payload = z
      .object({
        provider: z.string(),
        externalEventId: z.string(),
        paymentId: z.string().uuid(),
        status: z.enum(["PAID", "FAILED", "CANCELLED", "EXPIRED"]),
      })
      .parse(request.body);
    const result = await prisma.$transaction(async (tx) => {
      const webhook = await tx.payment_webhooks
        .create({
          data: {
            provider: payload.provider,
            external_event_id: payload.externalEventId,
            event_type: "payment.updated",
            payload: request.body,
          },
        })
        .catch((error: unknown) => {
          if (
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
          )
            return null;
          throw error;
        });
      if (!webhook) return { duplicate: true };
      const payment = await tx.payments.findUnique({
        where: { id: payload.paymentId },
        include: { order: { include: { reservation: true, items: true } } },
      });
      if (!payment) throw new ApiError(404, "Pagamento não encontrado.");
      const status = payload.status as PaymentStatus;
      const markProcessed = () =>
        tx.payment_webhooks.update({
          where: { id: webhook.id },
          data: { processed: true, processed_at: new Date() },
        });
      // Pedido já pago não volta atrás por um evento atrasado de falha.
      if (payment.order.status === OrderStatus.PAID) {
        await markProcessed();
        return { duplicate: false, status: OrderStatus.PAID };
      }
      if (status !== PaymentStatus.PAID) {
        await tx.payments.update({
          where: { id: payment.id },
          data: { status, paid_at: null },
        });
        if (payment.order.reservation)
          await releaseReservation(
            tx,
            payment.order.reservation.id,
            ReservationStatus.CANCELLED,
            status === PaymentStatus.FAILED
              ? OrderStatus.FAILED
              : status === PaymentStatus.EXPIRED
                ? OrderStatus.EXPIRED
                : OrderStatus.CANCELLED,
            status,
          );
        await markProcessed();
        return { duplicate: false, status };
      }
      // Marca como pago de forma condicional: dois webhooks PAID simultâneos
      // (com ids externos diferentes) não emitem ingressos em dobro.
      const paid = await tx.orders.updateMany({
        where: { id: payment.order_id, status: { not: OrderStatus.PAID } },
        data: { status: OrderStatus.PAID, paid_at: new Date() },
      });
      if (!paid.count) {
        await markProcessed();
        return { duplicate: false, status: OrderStatus.PAID };
      }
      await tx.payments.update({
        where: { id: payment.id },
        data: { status, paid_at: new Date() },
      });
      // Se a reserva já expirou, o estoque reservado já foi devolvido pelo job.
      const stillReserved = payment.order.reservation
        ? (
            await tx.reservations.updateMany({
              where: {
                id: payment.order.reservation.id,
                status: ReservationStatus.PENDING,
              },
              data: { status: ReservationStatus.CONFIRMED },
            })
          ).count > 0
        : false;
      for (const item of payment.order.items) {
        await tx.ticket_types.update({
          where: { id: item.ticket_type_id },
          data: {
            sold_quantity: { increment: item.quantity },
            ...(stillReserved && {
              reserved_quantity: { decrement: item.quantity },
            }),
          },
        });
        await tx.inventory_transactions.create({
          data: {
            ticket_type_id: item.ticket_type_id,
            type: "SALE",
            quantity: item.quantity,
            reference_type: "ORDER",
            reference_id: payment.order_id,
          },
        });
        for (let index = 0; index < item.quantity; index += 1) {
          const code = `TKT-${crypto.randomBytes(6).toString("hex").toUpperCase()}`;
          await tx.tickets.create({
            data: {
              order_id: payment.order_id,
              order_item_id: item.id,
              user_id: payment.order.user_id,
              event_id: payment.order.event_id,
              ticket_type_id: item.ticket_type_id,
              code,
              qr_token_hash: hash(qrToken(code)),
              status: TicketStatus.ACTIVE,
            },
          });
        }
      }
      await tx.payment_webhooks.update({
        where: { id: webhook.id },
        data: { processed: true, processed_at: new Date() },
      });
      return { duplicate: false, status: "PAID" };
    });
    return response.json(result);
  } catch (error) {
    return next(error);
  }
});

app.get(
  "/api/tickets",
  authenticate,
  async (request: AuthRequest, response, next) => {
    try {
      const tickets = await prisma.tickets.findMany({
        where: { user_id: request.user!.id },
        orderBy: { issued_at: "desc" },
        include: {
          event: {
            select: {
              name: true,
              start_at: true,
              venue: { select: { name: true, city: true } },
            },
          },
          ticket_type: { select: { name: true } },
          order: { select: { order_number: true } },
        },
      });
      return response.json({
        tickets: tickets.map(({ qr_token_hash: _hash, ...ticket }) => ({
          ...ticket,
          qrToken: ticket.status === TicketStatus.ACTIVE ? qrToken(ticket.code) : null,
        })),
      });
    } catch (error) {
      return next(error);
    }
  },
);
const validationSchema = z.object({
  token: z.string().min(20).max(200),
  eventId: z.string().uuid(),
  deviceIdentifier: z.string().max(255).optional(),
});
app.post(
  "/api/tickets/validate",
  authenticate,
  requireRole(UserRole.STAFF, UserRole.ADMIN),
  async (request: AuthRequest, response, next) => {
    try {
      const input = validationSchema.parse(request.body);
      const result = await prisma.$transaction(async (tx) => {
        const ticket = await tx.$queryRaw<
          Array<{ id: string; status: TicketStatus; event_id: string }>
        >(
          Prisma.sql`SELECT id, status, event_id FROM tickets WHERE qr_token_hash = ${hash(input.token)} FOR UPDATE`,
        );
        const found = ticket[0];
        if (!found) return { result: "INVALID" };
        if (found.event_id !== input.eventId) return { result: "INVALID" };
        if (found.status !== TicketStatus.ACTIVE) {
          await tx.ticket_validations.create({
            data: {
              ticket_id: found.id,
              event_id: input.eventId,
              staff_user_id: request.user!.id,
              result:
                found.status === TicketStatus.USED
                  ? "ALREADY_USED"
                  : found.status,
              device_identifier: input.deviceIdentifier,
            },
          });
          return {
            result:
              found.status === TicketStatus.USED
                ? "ALREADY_USED"
                : found.status,
          };
        }
        await tx.tickets.update({
          where: { id: found.id },
          data: { status: TicketStatus.USED, used_at: new Date() },
        });
        await tx.ticket_validations.create({
          data: {
            ticket_id: found.id,
            event_id: input.eventId,
            staff_user_id: request.user!.id,
            result: "VALID",
            device_identifier: input.deviceIdentifier,
          },
        });
        return { result: "VALID" };
      });
      return response.json(result);
    } catch (error) {
      return next(error);
    }
  },
);

class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}
registerAdminRoutes({
  app,
  prisma,
  authenticate: authenticate as express.RequestHandler,
  requireRole,
  fail: (statusCode, message) => new ApiError(statusCode, message),
});
app.use(
  (
    error: unknown,
    _request: Request,
    response: Response,
    _next: NextFunction,
  ) => {
    if (error instanceof z.ZodError)
      return response.status(400).json({
        error: "Dados inválidos.",
        fields: error.flatten().fieldErrors,
      });
    if (error instanceof ApiError)
      return response.status(error.statusCode).json({ error: error.message });
    // JSON malformado ou corpo grande demais (express.json).
    if (
      error instanceof Error &&
      "status" in error &&
      typeof error.status === "number" &&
      error.status < 500
    )
      return response.status(error.status).json({ error: "Requisição inválida." });
    // Conflito de transação Serializable: duas compras disputando o mesmo lote.
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2034"
    )
      return response
        .status(409)
        .json({ error: "Muita procura agora. Tente novamente." });
    console.error(error);
    return response.status(500).json({ error: "Erro interno do servidor." });
  },
);
const server = app.listen(port, () =>
  console.log(`balada API em http://localhost:${port}`),
);
const runExpiration = () =>
  expireReservations().catch((error: unknown) =>
    console.error("Falha ao expirar reservas:", error),
  );
void runExpiration();
const expirationTimer = setInterval(runExpiration, 60 * 1000);
const shutdown = async () => {
  clearInterval(expirationTimer);
  server.close();
  await prisma.$disconnect();
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
