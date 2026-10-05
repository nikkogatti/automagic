import { test } from "node:test"
import assert from "node:assert/strict"
import {parseTabs, blankFilter} from './src/lib/persistence.ts';
import {
  newStack,
  newCriterion,
  buildSearch,
  applyDrop,
  decodePayload,
  criterionQuery,
  typesFromLine,
} from "./src/lib/query.ts"
test("All, Any and None compile explicit groups with left-to-right links", () => {
  const a = newStack("all"),
    b = newStack("any"),
    c = newStack("none")
  a.items = [newCriterion("type", "creature"), newCriterion("cmc", "3", "<=")]
  b.items = [newCriterion("tag", "card draw"), newCriterion("tag", "removal")]
  b.link = "or"
  c.items = [newCriterion("type", "land"), newCriterion("type", "artifact")]
  assert.equal(
    buildSearch([a, b, c]),
    '(((t:"creature" cmc<=3) OR (otag:card-draw OR otag:removal)) (-t:"land" -t:"artifact"))',
  )
  assert.equal(
    buildSearch([a, b], { colors: ["G"], identity: true, mode: "at_most" }),
    '((t:"creature" cmc<=3) OR (otag:card-draw OR otag:removal)) id<=G',
  )
})
test("Empty stacks skip; incomplete or injected criteria fail safely", () => {
  assert.equal(buildSearch([newStack()]), "")
  assert.throws(() => criterionQuery(newCriterion("cmc", "3 OR t:land")))
  assert.throws(() => criterionQuery(newCriterion("tag", "")))
  assert.equal(
    criterionQuery(newCriterion("oracle", 'draw "a" card')),
    'o:"draw \\"a\\" card"',
  )
  assert.equal(criterionQuery(newCriterion("power", "*")), "pow=*")
  assert.equal(
    decodePayload(
      '{"version":1,"kind":"criterion","criterion":{"type":"invented"}}',
    ),
    null,
  )
})
test("Copies create ids; moving and reordering preserves identity", () => {
  const a = newStack(),
    b = newStack()
  a.items = [newCriterion("type", "creature"), newCriterion("tag", "removal")]
  const p = {
    version: 1,
    kind: "criterion",
    criterion: a.items[0],
    source: { stackId: a.id, chipId: a.items[0].id },
  }
  const moved = applyDrop([a, b], b.id, p)
  assert.equal(moved[0].items.length, 1)
  assert.equal(moved[1].items[0].id, a.items[0].id)
  const reordered = applyDrop(
    [a, b],
    a.id,
    {
      ...p,
      criterion: a.items[1],
      source: { stackId: a.id, chipId: a.items[1].id },
    },
    a.items[0].id,
  )
  assert.equal(reordered[0].items[0].value, "removal")
  const copied = applyDrop([a, b], b.id, {
    version: 1,
    kind: "criterion",
    criterion: a.items[0],
  })
  assert.notEqual(copied[1].items[0].id, a.items[0].id)
  assert.equal(
    applyDrop([a, b], a.id, { version: 1, kind: "link", value: "or" })[0].link,
    "and",
  )
})
test("Card transcription separates supertypes and creature types", () => {
  assert.deepEqual(typesFromLine("Legendary Creature — Elf Druid"), [
    { type: "type", value: "Legendary" },
    { type: "type", value: "Creature" },
    { type: "subtype", value: "Elf" },
    { type: "subtype", value: "Druid" },
  ])
})

test('Saved searches validate identity, chip ids, colors and uniqueness', () => {
 const stack = newStack(); stack.items=[newCriterion('tag','removal')];
 const tabs=[{id:'tab-1',name:'Search 1',stacks:[stack],filter:blankFilter()}];
 assert.deepEqual(parseTabs(JSON.stringify(tabs)),tabs);
 for (const mutate of [
   t=>delete t[0].stacks[0].items[0].id,
   t=>t[0].filter.identity='false',
   t=>t[0].filter.colors=['X'],
   t=>t[0].filter.colors=['G','G'],
   t=>t[0].stacks.push(t[0].stacks[0]),
   t=>t[0].stacks[0].items[0].type='__proto__',
 ]) {const invalid=structuredClone(tabs);mutate(invalid);assert.equal(parseTabs(JSON.stringify(invalid)),null);}
 assert.equal(parseTabs('not JSON'),null);
 assert.equal(parseTabs('[]'),null);
});

test('Malformed or foreign drag payloads never become chips', () => {
 for (const payload of [null,{}, {version:2,kind:'modifier',value:'all'},
  {version:1,kind:'criterion',criterion:{type:'tag',value:'removal',operator:'=',},source:{stackId:2,chipId:'id'}},
  {version:1,kind:'criterion',criterion:{type:'tag',value:'removal',operator:'OR'}},
 ]) assert.equal(decodePayload(JSON.stringify(payload)),null);
});
