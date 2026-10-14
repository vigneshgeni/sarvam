export default function OutlineList({
  title,
  lines,
}: {
  title: string
  lines: string[]
}) {
  if (!lines.length) return null
  return (
    <section className="rounded-[32px] border-[1.5px] border-[#1A1A1A] p-5 flex flex-col gap-3">
      <h2 className="sv-display text-[26px] leading-none m-0">
        {title}<span className="text-[#D9603B]">.</span>
      </h2>
      <ol className="m-0 pl-0 list-none flex flex-col gap-2.5">
        {lines.map((line, i) => (
          <li key={line + i} className="flex gap-3 items-start">
            <span className="w-7 h-7 shrink-0 rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center text-[13px] font-bold">
              {i + 1}
            </span>
            <span className="text-[15.5px] leading-[1.45] pt-0.5">{line}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
