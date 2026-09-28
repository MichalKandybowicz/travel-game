let audioContext: AudioContext | undefined
const volumeStorageKey = 'travel-game-turn-volume'

function readVolume(): number {
  try {
    const stored = window.localStorage.getItem(volumeStorageKey)
    if (stored === null) return 70
    const value = Number(stored)
    return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 70
  } catch {
    return 70
  }
}

let volume = readVolume()

export function getTurnSoundVolume(): number {
  return volume
}

export function setTurnSoundVolume(value: number): void {
  volume = Math.max(0, Math.min(100, value))
  try {
    window.localStorage.setItem(volumeStorageKey, String(volume))
  } catch {
    // Sound still works when browser storage is unavailable.
  }
}

export function prepareTurnSound(): void {
  if (!window.AudioContext) return
  audioContext ??= new AudioContext()
  if (audioContext.state === 'suspended') {
    void audioContext.resume().catch(() => {})
  }
}

export function playTurnSound(): void {
  if (!audioContext || audioContext.state !== 'running' || volume === 0) return

  const now = audioContext.currentTime
  for (const [delay, pitch, peakVolume] of [
    [0, 660, 0.56],
    [0.075, 880, 0.32],
  ] as const) {
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const start = now + delay

    oscillator.type = 'sine'
    oscillator.frequency.setValueAtTime(pitch, start)
    oscillator.frequency.exponentialRampToValueAtTime(pitch * 0.72, start + 0.2)
    gain.gain.setValueAtTime(0.001, start)
    gain.gain.exponentialRampToValueAtTime(
      peakVolume * (volume / 100),
      start + 0.012,
    )
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.26)

    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.27)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
    }
  }
}

export function playCurseSound(): void {
  if (!audioContext || audioContext.state !== 'running' || volume === 0) return

  const now = audioContext.currentTime
  for (const [delay, frequency, peakVolume] of [
    [0, 520, 0.28],
    [0.09, 370, 0.22],
  ] as const) {
    const oscillator = audioContext.createOscillator()
    const gain = audioContext.createGain()
    const start = now + delay

    oscillator.type = 'triangle'
    oscillator.frequency.setValueAtTime(frequency, start)
    oscillator.frequency.exponentialRampToValueAtTime(
      frequency * 0.45,
      start + 0.42,
    )
    gain.gain.setValueAtTime(0.001, start)
    gain.gain.exponentialRampToValueAtTime(
      peakVolume * (volume / 100),
      start + 0.025,
    )
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.44)

    oscillator.connect(gain)
    gain.connect(audioContext.destination)
    oscillator.start(start)
    oscillator.stop(start + 0.45)
    oscillator.onended = () => {
      oscillator.disconnect()
      gain.disconnect()
    }
  }
}
