export type ArtifactTriggerSource =
  | "cron"
  | "rabbitmq"
  | "http_trigger"
  | "http_debug"
  | "http_force_send"
  | "signal";

export function buildTriggerReason(
  source: ArtifactTriggerSource,
  qualifier?: string,
  extra?: { signalType?: string },
): string {
  const base = qualifier ? `${source}:${qualifier}` : source;
  if (extra?.signalType) return `${base}:${extra.signalType}`;
  return base;
}
