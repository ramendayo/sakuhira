const formatter = new Intl.DateTimeFormat("ja-JP", { dateStyle: "medium", timeStyle: "short" });

export default function LocalDateTime({ timestamp }: { timestamp: number }) {
  const date = new Date(timestamp);
  return <time dateTime={date.toISOString()}>{formatter.format(date)}</time>;
}
