import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { prisma } from "../src/lib/db";
import { createInvitation } from "../src/lib/invitations/create";
import { listFounderInvitations, revokeFounderInvitation } from "../src/lib/invitations/manage";
import { InvitationNotFoundError } from "../src/lib/invitations/errors";
import { appUrl } from "../src/lib/mail/app-url";

const USAGE = "Usage: pnpm invite:founder [--note <text>] | --list | --revoke <id>";

export async function runInviteFounder(
  argv: string[],
  out: (line: string) => void,
): Promise<void> {
  let values;
  try {
    ({ values } = parseArgs({
      args: argv,
      options: {
        note: { type: "string" },
        list: { type: "boolean" },
        revoke: { type: "string" },
      },
      allowPositionals: false,
    }));
  } catch {
    out(USAGE);
    throw new Error("usage");
  }
  const modes = [values.list, values.revoke !== undefined, values.note !== undefined].filter(Boolean);
  const exclusive = values.list || values.revoke !== undefined;
  if (exclusive && modes.length > 1) {
    out(USAGE);
    throw new Error("usage");
  }

  if (values.list) {
    const rows = await listFounderInvitations();
    if (rows.length === 0) {
      out("Keine offenen Gründer-Links.");
      return;
    }
    out("id  note  gültig bis  verwendet");
    for (const r of rows) {
      out(
        [r.id, r.note || "-", r.expiresAt.toLocaleDateString("de-DE"), `${r.usedCount}/1`].join("  "),
      );
    }
    return;
  }

  if (values.revoke !== undefined) {
    try {
      await revokeFounderInvitation(values.revoke);
    } catch (err) {
      if (err instanceof InvitationNotFoundError) {
        out(`Gründer-Link ${values.revoke} nicht gefunden.`);
        throw new Error("not_found");
      }
      throw err;
    }
    out(`Gründer-Link ${values.revoke} widerrufen.`);
    return;
  }

  const { token, expiresAt } = await createInvitation({ kind: "founder", note: values.note });
  out(`Gründer-Link (gültig bis ${expiresAt.toLocaleDateString("de-DE")}):`);
  out(appUrl("/einladung/" + token));
  if (values.note) out(`Notiz: ${values.note}`);
}

async function main() {
  await runInviteFounder(process.argv.slice(2), (line) => console.log(line));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main()
    .catch((err) => {
      if (!(err instanceof Error && (err.message === "usage" || err.message === "not_found"))) {
        console.error(err);
      }
      process.exit(1);
    })
    .finally(() => prisma.$disconnect());
}
