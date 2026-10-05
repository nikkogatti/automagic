import type {DragEvent} from 'react';
import {PROPERTIES,OPERATORS,DRAG_TYPE,decodePayload,type Criterion,type Payload} from '../lib/query';
export function drag(e: DragEvent, p: Payload) {
  e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(p))
  e.dataTransfer.effectAllowed =
    p.kind === "criterion" && p.source ? "move" : "copy"
}
export default function SearchChip({
  item,
  source,
  add,
  change,
  remove,
  drop,
}: {
  item: Criterion
  source?: { stackId: string; chipId: string }
  add?: () => void
  change?: (i: Criterion) => void
  remove?: () => void
  drop?: (p: Payload) => void
}) {
  const d = PROPERTIES[item.type]
  return (
    <div
      className="search-chip"
      draggable
      onDragStart={(e) =>
        drag(e, { version: 1, kind: "criterion", criterion: item, source })
      }
      onDragOver={drop ? (e) => e.preventDefault() : undefined}
      onDrop={
        drop
          ? (e) => {
              const p = decodePayload(e.dataTransfer.getData(DRAG_TYPE))
              if (p) {
                e.preventDefault()
                e.stopPropagation()
                drop(p)
              }
            }
          : undefined
      }
      title={`${d.prefix} — drag into a stack`}
    >
      <span className="chip-label">{d.label}</span>
      {change ? (
        <>
          {d.kind === "number" && (
            <select
              aria-label={`${d.label} comparison`}
              value={item.operator}
              onChange={(e) =>
                change({
                  ...item,
                  operator: e.target.value as Criterion["operator"],
                })
              }
            >
              {OPERATORS.map((op) => (
                <option key={op}>{op}</option>
              ))}
            </select>
          )}
          <input
            aria-label={`${d.label} value`}
            value={item.value}
            placeholder={d.hint}
            onChange={(e) => change({ ...item, value: e.target.value })}
          />
        </>
      ) : (
        <button
          className="chip-value"
          aria-label={`Add ${d.label}: ${item.value || "new value"}`}
          onClick={add}
        >
          {item.value || "+"}
        </button>
      )}
      {remove && (
        <button
          className="chip-remove"
          aria-label={`Remove ${d.label}: ${item.value}`}
          onClick={remove}
        >
          ×
        </button>
      )}
    </div>
  )
}
