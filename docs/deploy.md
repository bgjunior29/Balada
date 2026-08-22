# Deploy

## Railway: API

Crie um projeto na Railway apontando para este repositorio. O arquivo `railway.json` ja define build, comando de start e healthcheck.

Configure estas variaveis no servico da Railway:

```env
DATABASE_URL=connection-string-do-Neon
API_PORT=4000
FRONTEND_ORIGIN=https://seu-projeto.vercel.app
PAYMENT_WEBHOOK_SECRET=um-segredo-forte
GOOGLE_CLIENT_ID=seu-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=seu-client-secret
GOOGLE_REDIRECT_URI=https://sua-api.up.railway.app/api/auth/google/callback
```

Depois do primeiro deploy, confirme `https://sua-api.up.railway.app/api/health`.

## Vercel: frontend

Importe o mesmo repositorio na Vercel. O `vercel.json` configura o build Vite e o fallback de SPA.

Configure:

```env
VITE_API_URL=https://sua-api.up.railway.app
```

Faca um novo deploy depois de salvar a variavel. A URL da Vercel deve ser colocada em `FRONTEND_ORIGIN` na Railway.

## Banco

O Neon ja possui a migration inicial. Para uma nova instalacao, use `npm run db:deploy` com `DATABASE_URL` configurada. Nunca comite `.env` ou chaves OAuth.

## OAuth Google

No Google Cloud Console, cadastre como redirect URI a URL configurada em `GOOGLE_REDIRECT_URI`. Para producao ela deve ser HTTPS e apontar para a API Railway.
