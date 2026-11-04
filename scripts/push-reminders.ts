import { prisma } from "../src/lib/db";
import { closeApnsSessions } from "../src/lib/push/apns";
import { sendDueReminders } from "../src/lib/push/reminders";

async function main() {
  const results = await sendDueReminders(new Date());
  console.log(`[push] Erinnerungen: ${JSON.stringify(results)}`);
}

main()
  .catch((err) => {
    console.error("[push] Erinnerungen fehlgeschlagen", err);
    process.exitCode = 1;
  })
  .finally(async () => {
    closeApnsSessions();
    await prisma.$disconnect();
  });
