import type { ExplainResponse } from '../types'
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
import MultiDocument from './MultiDocument'

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
      return <TimelineBlock result={result} t={t} />
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
      <MultiDocument
        result={result}
        t={t}
        renderBlocks={(partResult) => (
          <>
            {resolveProfile(partResult).blocks.filter((id) => !COMMON.has(id)).map((id) => (
              <Specific key={id} id={id} result={partResult} t={t} />
            ))}
          </>
        )}
      />
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
