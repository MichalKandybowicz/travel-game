import type { CustomMap, GameMap, MapSettings } from '@shared'

const serverUrl = import.meta.env.VITE_SERVER_URL || window.location.origin

const request = async <T>(
  path: string,
  token: string,
  init?: Parameters<typeof fetch>[1],
): Promise<T> => {
  const response = await fetch(`${serverUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  })
  if (!response.ok) {
    const result = (await response.json().catch(() => ({}))) as {
      message?: string
    }
    throw new Error(result.message ?? 'Nie udało się zapisać mapy.')
  }
  return (await response.json()) as T
}

export const loadCustomMaps = (token: string): Promise<CustomMap[]> =>
  request('/custom-maps', token)

export const saveCustomMap = (
  token: string,
  payload: { id?: string; name: string; settings: MapSettings; map: GameMap },
): Promise<CustomMap> =>
  payload.id
    ? request(`/custom-maps/${encodeURIComponent(payload.id)}`, token, {
        method: 'PUT',
        body: JSON.stringify(payload),
      })
    : request('/custom-maps', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      })

export const deleteCustomMap = (token: string, id: string): Promise<void> =>
  request(`/custom-maps/${encodeURIComponent(id)}`, token, {
    method: 'DELETE',
  })
