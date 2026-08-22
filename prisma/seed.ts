import "dotenv/config";
import {
  PrismaClient,
  EventStatus,
  TicketGender,
  TicketTypeStatus,
  UserRole,
  UserStatus,
} from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const seedPassword = process.env.SEED_ADMIN_PASSWORD;
  if (!seedPassword)
    throw new Error(
      "SEED_ADMIN_PASSWORD precisa estar configurada para executar o seed.",
    );
  const password_hash = await bcrypt.hash(seedPassword, 12);
  const admin = await prisma.users.upsert({
    where: { email: "admin@balada.local" },
    update: {},
    create: {
      name: "Admin balada",
      email: "admin@balada.local",
      password_hash,
      role: UserRole.ADMIN,
      status: UserStatus.ACTIVE,
      email_verified_at: new Date(),
    },
  });
  const organizer = await prisma.organizers.upsert({
    where: { user_id: admin.id },
    update: {},
    create: {
      user_id: admin.id,
      name: "balada events",
      description: "Organizador de experiências noturnas",
      status: "ACTIVE",
    },
  });
  const venue = await prisma.venues.create({
    data: {
      name: "Arca Club",
      address: "Av. Brigadeiro Faria Lima",
      number: "166",
      neighborhood: "Pinheiros",
      city: "São Paulo",
      state: "SP",
      capacity: 1800,
    },
  });
  const event = await prisma.events.upsert({
    where: { slug: "sundown-sessions-2026" },
    update: {},
    create: {
      organizer_id: organizer.id,
      venue_id: venue.id,
      name: "Sundown Sessions",
      slug: "sundown-sessions-2026",
      description: "Uma noite para lembrar.",
      category: "CLUB",
      status: EventStatus.PUBLISHED,
      start_at: new Date("2026-08-29T22:00:00-03:00"),
      doors_open_at: new Date("2026-08-29T21:00:00-03:00"),
      age_rating: "18+",
      published_at: new Date(),
    },
  });
  const batch = await prisma.ticket_batches.create({
    data: {
      event_id: event.id,
      name: "Lote antecipado",
      starts_at: new Date(),
      ends_at: new Date("2026-08-29T18:00:00-03:00"),
    },
  });
  const ticketType = await prisma.ticket_types.create({
    data: {
      event_id: event.id,
      ticket_batch_id: batch.id,
      name: "Entrada antecipada",
      description: "Acesso à pista",
      gender: TicketGender.UNISEX,
      price: 85,
      service_fee: 8.5,
      quantity: 500,
      max_quantity: 5,
      status: TicketTypeStatus.ACTIVE,
    },
  });
  await prisma.inventory_transactions.create({
    data: {
      ticket_type_id: ticketType.id,
      type: "INITIAL",
      quantity: 500,
      reference_type: "SEED",
    },
  });
  console.log(`Seed concluído: ${admin.email} e evento ${event.slug}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
