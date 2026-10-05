export const PROPERTIES = {
  tag: { label: "Tags", prefix: "otag", kind: "tag", hint: "removal" },
  type: { label: "Card Type", prefix: "t", kind: "text", hint: "artifact" },
  subtype: {
    label: "Creature Type",
    prefix: "t",
    kind: "text",
    hint: "dragon",
  },
  cmc: { label: "CMC", prefix: "cmc", kind: "number", hint: "3" },
  power: { label: "Power", prefix: "pow", kind: "number", hint: "4" },
  toughness: { label: "Toughness", prefix: "tou", kind: "number", hint: "4" },
  oracle: {
    label: "Oracle Text",
    prefix: "o",
    kind: "text",
    hint: "draw a card",
  },
  name: { label: "Name", prefix: "name", kind: "text", hint: "Lightning Bolt" },
  mana: { label: "Mana Cost", prefix: "mana", kind: "text", hint: "{2}{G}" },
  color: { label: "Color", prefix: "c", kind: "text", hint: "WUBRG or C" },
  identity: { label: "Color Identity", prefix: "id", kind: "text", hint: "WU" },
  rarity: { label: "Rarity", prefix: "r", kind: "text", hint: "rare" },
  set: { label: "Set", prefix: "set", kind: "text", hint: "neo" },
  format: { label: "Format", prefix: "f", kind: "text", hint: "commander" },
  keyword: {
    label: "Keyword",
    prefix: "keyword",
    kind: "text",
    hint: "flying",
  },
  artist: { label: "Artist", prefix: "a", kind: "text", hint: "John Avon" },
  flavor: { label: "Flavor Text", prefix: "ft", kind: "text", hint: "dragon" },
  loyalty: { label: "Loyalty", prefix: "loy", kind: "number", hint: "3" },
  pt: { label: "Power + Toughness", prefix: "pt", kind: "number", hint: "8" },
  produces: {
    label: "Produces Mana",
    prefix: "produces",
    kind: "text",
    hint: "G",
  },
  price: { label: "Price (USD)", prefix: "usd", kind: "number", hint: "5" },
  watermark: { label: "Watermark", prefix: "wm", kind: "text", hint: "simic" },
  is: {
    label: "Card Property",
    prefix: "is",
    kind: "text",
    hint: "commander or dfc",
  },
  has: {
    label: "Has Property",
    prefix: "has",
    kind: "text",
    hint: "watermark",
  },
  game: { label: "Game", prefix: "game", kind: "text", hint: "paper" },
  language: { label: "Language", prefix: "lang", kind: "text", hint: "en" },
} as const
export type Property = keyof typeof PROPERTIES
export const OPERATORS = ["=", "!=", "<", "<=", ">", ">="] as const
export type Operator = typeof OPERATORS[number]
export type Modifier = "all" | "any" | "none"
export type Link = "and" | "or"
export interface Criterion {
  id: string
  type: Property
  value: string
  operator: Operator
}
export interface Stack {
  id: string
  modifier: Modifier
  link: Link
  items: Criterion[]
}
export interface ColorFilter {
  colors: string[]
  mode: "at_most" | "at_least" | "exactly"
  identity: boolean
}
export type Payload = {
  version: 1
  kind: "criterion"
  criterion: Omit<Criterion, "id">
  source?: { stackId: string; chipId: string }
} | { version: 1; kind: "modifier"; value: Modifier } | {
  version: 1
  kind: "link"
  value: Link
}
export const DRAG_TYPE = "application/x-supertype-search"
export const uid = () => crypto.randomUUID()
export function newCriterion(
  type: Property,
  value = "",
  operator: Operator = "=",
): Criterion {
  return { id: uid(), type, value, operator }
}
export function newStack(modifier: Modifier = "all"): Stack {
  return { id: uid(), modifier, link: "and", items: [] }
}
function quote(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`
}
export function criterionQuery(item: Criterion): string {
  const definition = PROPERTIES[item.type]
  if (!definition) throw new Error("Unknown chip type.")
  const value = item.value.trim()
  if (!value) throw new Error(`Enter a value for ${definition.label}.`)
  if (value.length > 500 || /[\r\n\x00-\x1f]/.test(value))
    throw new Error(
      `${definition.label} must be a single value under 500 characters.`,
    )
  if (definition.kind === "number") {
    if (!OPERATORS.includes(item.operator))
      throw new Error("Invalid numeric operator.")
    const stat = item.type === "power" || item.type === "toughness"
    const numeric = /^-?\d+(?:\.\d+)?$/.test(value)
    const symbolic =
      stat &&
      /^-?(?:\d+(?:\.\d+)?|\*)(?:[+-](?:\d+(?:\.\d+)?|\*))*$/.test(value)
    if (!numeric && !symbolic)
      throw new Error(
        `${definition.label} needs a number${
          stat ? " or printed value such as *" : ""
        }.`,
      )
    return `${definition.prefix}${item.operator}${value}`
  }
  if (definition.kind === "tag") {
    const slug = value.toLowerCase().replace(/\s+/g, "-")
    if (!/^[a-z0-9][a-z0-9-]*$/.test(slug))
      throw new Error(
        "Tags use a tag name or slug, such as card draw or removal.",
      )
    return `otag:${slug}`
  }
  return `${definition.prefix}:${quote(value)}`
}
export function buildSearch(
  stacks: Stack[],
  filter?: ColorFilter,
  commander = false,
): string {
  let expression = ""
  for (const [index, stack] of stacks.entries()) {
    if (!stack.items.length) continue
    const terms = stack.items.map((item) => {
      try {
        return criterionQuery(item)
      } catch (error) {
        throw new Error(`Stack ${index + 1}: ${(error as Error).message}`)
      }
    })
    if (!["all", "any", "none"].includes(stack.modifier))
      throw new Error("Invalid stack modifier.")
    const clause =
      stack.modifier === "any"
        ? `(${terms.join(" OR ")})`
        : stack.modifier === "none"
          ? `(${terms.map((term) => `-${term}`).join(" ")})`
          : `(${terms.join(" ")})`
    if (expression && !["and", "or"].includes(stack.link))
      throw new Error("Invalid stack link.")
    expression = expression
      ? `(${expression}${stack.link === "or" ? " OR " : " "}${clause})`
      : clause
  }
  const globals: string[] = []
  if (filter?.colors.length) {
    if (!filter.colors.every((color) => /^[WUBRG]$/.test(color)))
      throw new Error("Invalid color filter.")
    const op = ({ at_most: "<=", at_least: ">=", exactly: "=" } as const)[
      filter.mode
    ]
    if (!op) throw new Error("Invalid color mode.")
    globals.push(
      `${
        filter.identity ? "id" : "c"
      }${op}${[...new Set(filter.colors)].join("")}`,
    )
  }
  if (commander) globals.push("is:commander")
  return [expression, ...globals].filter(Boolean).join(" ")
}
export function decodePayload(raw: string): Payload | null {
  try {
    const data = JSON.parse(raw)
    if (data.version !== 1) return null
    if (data.kind === "modifier" && ["all", "any", "none"].includes(data.value))
      return data
    if (data.kind === "link" && ["and", "or"].includes(data.value)) return data
    if (
      data.kind === "criterion" &&
      data.criterion &&
      Object.prototype.hasOwnProperty.call(PROPERTIES, data.criterion.type) &&
      typeof data.criterion.value === "string" &&
      data.criterion.value.length <= 500 &&
      OPERATORS.includes(data.criterion.operator) &&
      (!data.source ||
        (typeof data.source.stackId === "string" &&
          typeof data.source.chipId === "string"))
    )
      return data
    return null
  } catch {
    return null
  }
}
export function applyDrop(
  stacks: Stack[],
  targetId: string,
  payload: Payload,
  beforeId?: string,
): Stack[] {
  const target = stacks.find((stack) => stack.id === targetId)
  if (!target) return stacks
  if (payload.kind === "modifier")
    return stacks.map((stack) =>
      stack.id === targetId ? { ...stack, modifier: payload.value } : stack,
    )
  if (payload.kind === "link")
    return stacks[0]?.id === targetId
      ? stacks
      : stacks.map((stack) =>
          stack.id === targetId ? { ...stack, link: payload.value } : stack,
        )
  const original = payload.source
    ? stacks
        .find((stack) => stack.id === payload.source!.stackId)
        ?.items.find((item) => item.id === payload.source!.chipId)
    : null
  if (payload.source && !original) return stacks
  if (original && original.id === beforeId) return stacks
  const item =
    original ??
    newCriterion(
      payload.criterion.type,
      payload.criterion.value,
      payload.criterion.operator,
    )
  return stacks.map((stack) => {
    const items = stack.items.filter((chip) => chip.id !== item.id)
    if (stack.id !== targetId) return { ...stack, items }
    const index = beforeId
      ? items.findIndex((chip) => chip.id === beforeId)
      : -1
    items.splice(index < 0 ? items.length : index, 0, item)
    return { ...stack, items }
  })
}
export const initialStacks = () => {
  const first = newStack("all")
  first.items = [
    newCriterion("type", "creature"),
    newCriterion("cmc", "3", "<="),
  ]
  const second = newStack("none")
  second.items = [newCriterion("type", "land")]
  return [first, second]
}
export function typesFromLine(
  line: string,
): { type: Property; value: string }[] {
  const [main = "", sub = ""] = line.split(/\s*[—–]\s*/)
  return [
    ...main
      .split(/\s+/)
      .filter(Boolean)
      .map((value) => ({ type: "type" as Property, value })),
    ...sub
      .split(/\s+/)
      .filter(Boolean)
      .map((value) => ({
        type: /\b(creature|kindred|tribal)\b/i.test(main)
          ? "subtype" as Property
          : "type" as Property,
        value,
      })),
  ]
}
