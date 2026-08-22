# Banco de dados

O projeto usa PostgreSQL no Neon, Prisma para modelagem/migrations e Beekeeper Studio para inspeção manual.

## Primeiro uso

1. Copie `.env.example` para `.env`.
2. Preencha `DATABASE_URL` com a connection string do Neon usando `sslmode=require`.
3. Gere o cliente: `npm run db:generate`.
4. Crie a primeira migration: `npm run db:migrate -- --name initial_schema`.
5. Defina `SEED_ADMIN_PASSWORD` no `.env` e popule o ambiente local: `npm run db:seed`.

Nunca execute `db:push` em produção. Migrations são a fonte de verdade do schema.

## Regras críticas

- `reservations` bloqueia estoque durante o checkout; `orders` registra a intenção de compra; `tickets` só nasce após confirmação do webhook.
- A reserva deve expirar por job/worker e liberar `reserved_quantity` dentro de uma transação.
- A criação da reserva deve usar transação e `SELECT ... FOR UPDATE` (ou equivalente) no `ticket_types`, verificando `quantity - sold_quantity - reserved_quantity` antes de incrementar o reservado.
- O limite de 5 deve somar itens de reservas `PENDING` não expiradas e pedidos ativos do mesmo usuário/evento.
- O webhook deve ser idempotente por `provider + external_event_id` antes de marcar pagamento e pedido como pagos.
- A validação do ticket deve bloquear a linha do ticket, verificar `ACTIVE`, marcar `USED` e inserir `ticket_validations` na mesma transação.
- O QR Code deve carregar apenas um token aleatório; o banco guarda somente seu hash em `tickets.qr_token_hash`.
- Valores de preço e taxa são congelados em `reservation_items` e `order_items`; nunca confiar no frontend.

## Estrutura

O schema inclui autenticação, organizadores, eventos, locais, artistas, lotes, tipos de ingresso, inventário, reservas, pedidos, pagamentos, webhooks, tickets, validações, reembolsos, cupons, favoritos, notificações, e-mails, endereços e auditoria.

O arquivo fonte é `prisma/schema.prisma`. O seed usa somente dados fictícios e exige `SEED_ADMIN_PASSWORD`; essa senha não fica armazenada no código.
