import LocalDateTime from "./LocalDateTime";

export default function LastResumedAt({ timestamp }: { timestamp: number | null }) {
  return <p className="mt-3 text-xs leading-6 text-muted">最終再開：{timestamp === null ? "記録なし" : <LocalDateTime timestamp={timestamp} />}</p>;
}
