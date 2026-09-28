import type { GameState, PlayerState } from '@shared'
import { cardLabels } from '../labels.js'
import { tokenPresentation } from '../tokenPresentation.js'

interface PlayerEffect {
  label: string
  description: string
  kind: 'shield' | 'curse'
  icon: string
}

export function PlayerEffects({
  player,
  game,
}: {
  player: PlayerState
  game: GameState
}) {
  const marketCurseCaster = game.players.find(
    (candidate) => candidate.id === game.marketLockedUntilPlayerId,
  )
  const effects: PlayerEffect[] = (
    [
      player.curseShieldAvailable && {
        label: 'Ochrona',
        description:
          'Ochronny krąg zablokuje następną klątwę wymierzoną w gracza.',
        kind: 'shield',
        icon: '◆',
      },
      player.extraMoveCostPending && {
        label: cardLabels.path_fracture!.name,
        description:
          'Następne przejście kosztuje o 1 dowolny punkt ruchu więcej.',
        kind: 'curse',
        icon: '☠',
      },
      player.fogCostsHidden && {
        label: cardLabels.fog_of_forgetting!.name,
        description: 'Rozpoznane koszty są ukryte do końca tury tego gracza.',
        kind: 'curse',
        icon: '☠',
      },
      (player.nextPurchaseCostIncrease ?? 0) > 0 && {
        label: cardLabels.poverty_curse!.name,
        description: `Następny zakup kosztuje o ${player.nextPurchaseCostIncrease} złota więcej.`,
        kind: 'curse',
        icon: '☠',
      },
      player.shortcutBlocked && {
        label: cardLabels.tangled_roots!.name,
        description: 'Gracz nie może użyć skrótu do końca swojej tury.',
        kind: 'curse',
        icon: '☠',
      },
      player.marketBlocked && {
        label: cardLabels.closed_market!.name,
        description: 'Gracz nie może kupować kart do końca swojej tury.',
        kind: 'curse',
        icon: '☠',
      },
      player.skipNextTurn && {
        label: tokenPresentation('CURSE_SKIP_LEADER').label,
        description: 'Gracz straci swoją następną turę.',
        kind: 'curse',
        icon: '☠',
      },
      Boolean(game.marketLockedUntilPlayerId) && {
        label: tokenPresentation('CURSE_MARKET').label,
        description: `Zakupy wszystkich graczy są zablokowane do początku następnej tury ${marketCurseCaster?.name ?? 'rzucającego klątwę'}.`,
        kind: 'curse',
        icon: '☠',
      },
    ] satisfies Array<PlayerEffect | false | undefined>
  ).filter((effect): effect is PlayerEffect => Boolean(effect))

  if (effects.length === 0) return null

  return (
    <div className="player-effects" aria-label={`Efekty gracza ${player.name}`}>
      {effects.map((effect) => (
        <div
          key={effect.label}
          className="player-effect"
          data-kind={effect.kind}
          title={effect.description}
        >
          <span className="player-effect-icon" aria-hidden="true">
            {effect.icon}
          </span>
          <strong>{effect.label}</strong>
          <span className="player-effect-description">
            {effect.description}
          </span>
        </div>
      ))}
    </div>
  )
}
