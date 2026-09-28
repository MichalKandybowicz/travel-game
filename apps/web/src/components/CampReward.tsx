import type { PlayerState, TokenType } from '@shared'
import { useEffect, useRef } from 'react'
import { tokenDescription, tokenPresentation } from '../tokenPresentation.js'

const campStories = [
  'Kamienie kręgu rozbłysły, gdy stanąłeś pośrodku. Trzy runy unoszą się nad ziemią — jedna z nich może należeć do ciebie.',
  'Przez krąg run przetoczył się podmuch magicznej energii. Spomiędzy pradawnych znaków wyłoniły się trzy runy.',
  'Na kamieniach pojawiły się świecące symbole. Gdy dotknąłeś jednego z nich, krąg odsłonił trzy runy do wyboru.',
]

export function CampReward({
  player,
  onChoose,
}: {
  player: PlayerState
  onChoose: (tokenType: TokenType) => void
}) {
  const reward = player.pendingCampReward
  const campId = reward?.campId
  const panelRef = useRef<HTMLElement>(null)

  useEffect(() => {
    if (campId) panelRef.current?.focus({ preventScroll: true })
  }, [campId])

  if (!reward) return null

  return (
    <section
      ref={panelRef}
      className="camp-reward-dialog"
      tabIndex={-1}
      aria-labelledby="camp-reward-title"
      aria-describedby="camp-reward-story"
    >
      <small>Odkryto krąg run</small>
      <h2 id="camp-reward-title">Wybierz jedną runę</h2>
      <p id="camp-reward-story">
        {campStories[reward.storyIndex] ?? campStories[0]}
      </p>
      <div className="camp-reward-options">
        {reward.options.map((type) => {
          const rune = tokenPresentation(type)
          return (
            <button key={type} type="button" onClick={() => onChoose(type)}>
              <span className="token" data-tone={rune.tone} aria-hidden="true">
                <span className="token-icon">{rune.icon}</span>
              </span>
              <strong>{rune.label}</strong>
              <span>{tokenDescription(type)}</span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
