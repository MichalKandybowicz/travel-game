import type { PlayerState, TokenType } from '@shared'
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
  if (!reward) return null

  return (
    <div className="camp-reward-backdrop">
      <section
        className="camp-reward-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="camp-reward-title"
        aria-describedby="camp-reward-story"
      >
        <small>Odkryto krąg run</small>
        <h2 id="camp-reward-title">Wybierz jedną runę</h2>
        <p id="camp-reward-story">
          {campStories[reward.storyIndex] ?? campStories[0]}
        </p>
        <div className="camp-reward-options">
          {reward.options.map((type, index) => {
            const rune = tokenPresentation(type)
            return (
              <button
                key={type}
                type="button"
                autoFocus={index === 0}
                onClick={() => onChoose(type)}
              >
                <span
                  className="token"
                  data-tone={rune.tone}
                  aria-hidden="true"
                >
                  <span className="token-icon">{rune.icon}</span>
                </span>
                <strong>{rune.label}</strong>
                <span>{tokenDescription(type)}</span>
              </button>
            )
          })}
        </div>
      </section>
    </div>
  )
}
