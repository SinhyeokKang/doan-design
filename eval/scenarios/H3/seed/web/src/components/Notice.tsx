type NoticeProps = { message: string };

export function Notice({ message }: NoticeProps) {
  return <aside style={{ color: "var(--color-muted)" }}>{message}</aside>;
}
