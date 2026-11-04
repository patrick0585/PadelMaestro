import { prisma } from "@/lib/db";
import { http2Transport, type ApnsEnvironment, type ApnsResult, type ApnsTransport } from "./apns";
import { loadApnsConfig, type ApnsConfig } from "./config";

export type PushMessage = { title: string; body: string; gameDayId: string; groupId: string };
export type SendSummary = { sent: number; removed: number; dryRun: boolean };

type Device = { id: string; token: string; environment: string };
type Outcome = "sent" | "removed" | "failed";

const other = (e: ApnsEnvironment): ApnsEnvironment => (e === "sandbox" ? "production" : "sandbox");
const short = (token: string) => token.slice(0, 8);
const isUnregistered = (r: ApnsResult) => !r.ok && r.status === 410 && r.reason === "Unregistered";
const isBadToken = (r: ApnsResult) => !r.ok && r.reason === "BadDeviceToken";

async function sendToDevice(
  device: Device,
  payload: object,
  transport: ApnsTransport,
  config: ApnsConfig,
): Promise<Outcome> {
  const first: ApnsEnvironment = device.environment === "sandbox" ? "sandbox" : "production";
  const attempt = (environment: ApnsEnvironment) =>
    transport({ environment, token: device.token, payload, config });
  try {
    let result = await attempt(first);
    if (result.ok) return "sent";
    if (isBadToken(result)) {
      const second = other(first);
      result = await attempt(second);
      if (result.ok) {
        await prisma.pushDevice.updateMany({ where: { id: device.id }, data: { environment: second } });
        return "sent";
      }
    }
    if (isUnregistered(result) || isBadToken(result)) {
      await prisma.pushDevice.deleteMany({ where: { id: device.id } });
      return "removed";
    }
    if (!result.ok) console.error(`[push] ${short(device.token)}: ${result.status} ${result.reason}`);
    return "failed";
  } catch (err) {
    console.error(`[push] ${short(device.token)}: Versand fehlgeschlagen`, err instanceof Error ? err.message : err);
    return "failed";
  }
}

export async function sendToPlayers(
  playerIds: string[],
  message: PushMessage,
  deps: { transport?: ApnsTransport; config?: ApnsConfig | null } = {},
): Promise<SendSummary> {
  if (playerIds.length === 0) return { sent: 0, removed: 0, dryRun: false };
  const config = deps.config === undefined ? loadApnsConfig() : deps.config;
  const devices = await prisma.pushDevice.findMany({
    where: { playerId: { in: playerIds } },
    select: { id: true, token: true, environment: true },
  });
  if (!config) {
    console.log(`[push] dry-run "${message.title}": ${message.body} (${devices.length} Geräte)`);
    return { sent: 0, removed: 0, dryRun: true };
  }
  const transport = deps.transport ?? http2Transport;
  const payload = {
    aps: { alert: { title: message.title, body: message.body }, sound: "default" },
    gameDayId: message.gameDayId,
    groupId: message.groupId,
  };
  const summary: SendSummary = { sent: 0, removed: 0, dryRun: false };
  for (const device of devices) {
    const outcome = await sendToDevice(device, payload, transport, config);
    if (outcome === "sent") summary.sent++;
    else if (outcome === "removed") summary.removed++;
  }
  return summary;
}
