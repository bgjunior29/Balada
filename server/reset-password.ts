// Define uma senha nova para uma conta: npm run user:reset-password -- voce@email.com
// A senha é digitada no terminal e não aparece na tela nem fica em histórico.
import "dotenv/config";
import readline from "node:readline";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const email = process.argv[2]?.trim().toLowerCase();

function askHidden(question: string) {
  return new Promise<string>((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: true,
    });
    // Troca cada caractere digitado por "*".
    const output = rl as unknown as { _writeToOutput: (text: string) => void };
    output._writeToOutput = (text: string) => {
      process.stdout.write(text.startsWith(question) ? question : "*");
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write("\n");
      resolve(answer);
    });
  });
}

async function main() {
  if (!email) {
    console.error("Uso: npm run user:reset-password -- voce@email.com");
    process.exitCode = 1;
    return;
  }
  const user = await prisma.users.findUnique({ where: { email } });
  if (!user) {
    console.error(`Nenhuma conta com o e-mail ${email}.`);
    process.exitCode = 1;
    return;
  }
  const password = await askHidden("Nova senha: ");
  const confirm = await askHidden("Repita a senha: ");
  if (password !== confirm) {
    console.error("As senhas não conferem. Nada foi alterado.");
    process.exitCode = 1;
    return;
  }
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) {
    console.error("Use 8+ caracteres, com pelo menos uma letra e um número.");
    process.exitCode = 1;
    return;
  }
  await prisma.users.update({
    where: { id: user.id },
    data: { password_hash: await bcrypt.hash(password, 12) },
  });
  // Encerra as sessões abertas com a senha antiga.
  await prisma.sessions.deleteMany({ where: { user_id: user.id } });
  console.log(`Senha de ${email} alterada. Entre no site com a senha nova.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
