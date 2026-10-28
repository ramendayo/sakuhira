import LocalDateTime from "./LocalDateTime";

export default function LastResumedAt({ timestamp, className = "mt-3 text-xs leading-6 text-muted" }: { timestamp: number | null; className?: string }) {
  return <p className={className}>最終再開：{timestamp === null ? "記録なし" : <LocalDateTime timestamp={timestamp} />}</p>;
}
