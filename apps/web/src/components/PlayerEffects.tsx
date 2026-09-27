import type { PlayerState } from '@shared'

interface PlayerEffect {
  label: string
  description: string
  kind: 'shield' | 'curse'
  icon: string
}

export function PlayerEffects({ player }: { player: PlayerState }) {
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
        label: 'Droższy ruch',
        description: 'Następne przejście kosztuje o 1 punkt ruchu więcej.',
        kind: 'curse',
        icon: '☠',
      },
      player.fogCostsHidden && {
        label: 'Ukryte koszty',
        description: 'Rozpoznane koszty są ukryte do końca tury tego gracza.',
        kind: 'curse',
        icon: '☠',
      },
      (player.nextPurchaseCostIncrease ?? 0) > 0 && {
        label: `Zakup +${player.nextPurchaseCostIncrease}`,
        description: `Następny zakup kosztuje o ${player.nextPurchaseCostIncrease} złota więcej.`,
        kind: 'curse',
        icon: '☠',
      },
      player.shortcutBlocked && {
        label: 'Bez skrótu',
        description: 'Gracz nie może użyć skrótu do końca swojej tury.',
        kind: 'curse',
        icon: '☠',
      },
      player.marketBlocked && {
        label: 'Sklep zamknięty',
        description: 'Gracz nie może kupować kart do końca swojej tury.',
        kind: 'curse',
        icon: '☠',
      },
      player.skipNextTurn && {
        label: 'Pominie turę',
        description: 'Gracz straci swoją następną turę.',
        kind: 'curse',
        icon: '☠',
      },
    ] satisfies Array<PlayerEffect | false | undefined>
  ).filter((effect): effect is PlayerEffect => Boolean(effect))

  if (effects.length === 0) return null

  return (
    <div className="player-effects" aria-label={`Efekty gracza ${player.name}`}>
      {effects.map((effect) => (
        <span
          key={effect.label}
          className="player-effect"
          data-kind={effect.kind}
          title={effect.description}
          aria-label={`${effect.label}: ${effect.description}`}
        >
          <span aria-hidden="true">{effect.icon}</span>
          {effect.label}
        </span>
      ))}
    </div>
  )
}
