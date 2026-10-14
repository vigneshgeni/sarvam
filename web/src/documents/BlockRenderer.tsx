import type { ExplainResponse } from '../types'
import { partAsResult } from './kinds'
import { resolveProfile, type BlockId } from './profiles'
import {
  AdviceBlock,
  ConsequenceBlock,
  DiagnosisBlock,
  DirectionsBlock,
  FormStepsBlock,
  ItemsBlock,
  KeyTermsBlock,
  LoanTermsBlock,
  NextEmiBlock,
  NotADiagnosisBlock,
  TimelineBlock,
  WarrantyBlock,
  WaysToPayBlock,
} from './blocks/KindBlocks'
import MedicineCard from '../components/MedicineCard'
import { LabValues } from '../components/v3/SummaryCard'

function Specific({
  id,
  result,
  t,
}: {
  id: BlockId
  result: ExplainResponse
  t: Record<string, string>
}) {
  switch (id) {
    case 'directions':
      return <DirectionsBlock result={result} t={t} />
    case 'waysToPay':
    case 'howToContest':
      return <WaysToPayBlock result={result} t={t} />
    case 'consequence':
      return <ConsequenceBlock result={result} />
    case 'items':
      return <ItemsBlock result={result} t={t} />
    case 'warranty':
      return <WarrantyBlock result={result} t={t} />
    case 'sections':
      return result.sections?.length ? <LabValues result={result} t={t} /> : null
    case 'notADiagnosis':
      return <NotADiagnosisBlock t={t} />
    case 'medicines':
      return result.medicines?.length ? (
        <MedicineCard medicines={result.medicines} resultId={result.title || 'med'} t={t} onCheckOriginal={() => undefined} />
      ) : null
    case 'diagnosis':
      return <DiagnosisBlock result={result} t={t} />
    case 'advice':
      return <AdviceBlock result={result} t={t} />
    case 'loanTerms':
      return <LoanTermsBlock result={result} t={t} />
    case 'nextEmi':
      return <NextEmiBlock result={result} t={t} />
    case 'keyTerms':
      return <KeyTermsBlock result={result} t={t} />
    case 'timeline':
      return <TimelineBlock result={result} />
    case 'formSteps':
      return <FormStepsBlock result={result} t={t} />
    default:
      return null
  }
}

const COMMON = new Set<BlockId>(['simpleWords', 'actions', 'watchOut', 'places', 'facts'])

export default function BlockRenderer({
  result,
  t,
}: {
  result: ExplainResponse
  t: Record<string, string>
}) {
  if ((result.parts?.length || 0) > 1) {
    return (
      <div className="flex flex-col gap-6">
        {result.parts!.map((part, index) => {
          const asResult = partAsResult(part, result)
          const profile = resolveProfile(asResult)
          return (
            <section key={part.part_id || part.title} className="flex flex-col gap-3">
              <div className="flex items-start gap-3">
                <span className="w-8 h-8 shrink-0 rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center text-[14px] font-bold" style={{ background: profile.visual.bg, color: profile.visual.ink }}>
                  {index + 1}
                </span>
                <div>
                  <h2 className="sv-display text-[26px] leading-[1.05] m-0">{part.title}</h2>
                  <p className="m-0 mt-1 text-[13px] text-[#575B58]">
                    {part.issuer ? `${part.issuer} · ` : ''}
                    {part.pages[0]}–{part.pages[1]}
                  </p>
                </div>
              </div>
              {profile.blocks.filter((id) => !COMMON.has(id)).map((id) => (
                <Specific key={id} id={id} result={asResult} t={t} />
              ))}
            </section>
          )
        })}
      </div>
    )
  }

  const profile = resolveProfile(result)
  return (
    <>
      {profile.blocks.filter((id) => !COMMON.has(id)).map((id) => (
        <Specific key={id} id={id} result={result} t={t} />
      ))}
    </>
  )
}
