import { requireAdmin } from "@/lib/admin/guard";
import { loadAdminOverview } from "@/lib/admin/overview";
import { AdminOverviewView } from "./overview-view";

export const dynamic = "force-dynamic";

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ willkommen?: string }>;
}) {
  const { willkommen } = await searchParams;
  const ctx = await requireAdmin();
  const overview = await loadAdminOverview(ctx.groupId);
  return <AdminOverviewView {...overview} welcome={willkommen === "1"} />;
}
