export function ReasonChips({ reasons }: { reasons: { code: string; text: string }[] }) {
  return (
    <div className="lf-reasons">
      {reasons.map((r) => (
        <span className="lf-badge lf-b-muted" key={r.code + r.text}>
          {r.text}
        </span>
      ))}
    </div>
  )
}
