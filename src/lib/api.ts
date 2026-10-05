export interface CardFace {
  name: string
  type_line?: string
  oracle_text?: string
  mana_cost?: string
  colors?: string[]
  power?: string
  toughness?: string
  loyalty?: string
  defense?: string
  image_uris?: { normal: string; small: string }
}
export interface Card {
  id: string
  name: string
  type_line: string
  cmc: number
  mana_cost?: string
  oracle_text?: string
  colors?: string[]
  color_identity: string[]
  set: string
  collector_number: string
  power?: string
  toughness?: string
  loyalty?: string
  scryfall_uri: string
  image_uris?: { normal: string; small: string }
  card_faces?: CardFace[]
}
export interface OracleTag {
  name: string
  slug: string
  type: string
}
export interface CardData {
  card: Card
  tags: OracleTag[] | null
  tagError?: string
}
export interface SearchResults {
  cards: Card[]
  total: number
  hasMore: boolean
  page: number
  warnings?: string[]
}
export async function api<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal })
  const body = await response.json()
  if (!response.ok)
    throw new Error(body.error || `Request failed (${response.status})`)
  return body
}
export function cardImages(card: Card) {
  return card.image_uris
    ? [card.image_uris.normal]
    : card.card_faces?.flatMap((face) =>
        face.image_uris ? [face.image_uris.normal] : [],
      ) || []
}
