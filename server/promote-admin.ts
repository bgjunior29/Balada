// Dá acesso à área administrativa: npm run admin:promote -- voce@email.com
import "dotenv/config";
import { PrismaClient, UserRole } from "@prisma/client";

const prisma = new PrismaClient();
const email = process.argv[2]?.trim().toLowerCase();

async function main() {
  if (!email) {
    console.error("Uso: npm run admin:promote -- voce@email.com");
    process.exitCode = 1;
    return;
  }
  const user = await prisma.users.findUnique({ where: { email } });
  if (!user) {
    console.error(`Nenhuma conta com o e-mail ${email}. Crie a conta no site primeiro.`);
    process.exitCode = 1;
    return;
  }
  await prisma.users.update({
    where: { id: user.id },
    data: { role: UserRole.ADMIN },
  });
  console.log(`${user.name} (${email}) agora é administrador. Entre de novo no site.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
