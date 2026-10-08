import { Icon } from './Icon'

export function SafetyTips({ text }: { text: string }) {
  return (
    <div className="lf-callout warn">
      <Icon name="info" />
      <span>{text}</span>
    </div>
  )
}
