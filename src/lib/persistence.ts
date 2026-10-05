import {decodePayload, initialStacks, uid, type Stack, type ColorFilter} from './query.ts';

export const STORAGE_KEY = 'automagic.search.v1';
export interface SearchTab {
  id: string;
  name: string;
  stacks: Stack[];
  filter: ColorFilter;
}
export const blankFilter = (): ColorFilter => ({colors: [], mode: 'at_most', identity: true});
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const identifier = (value: unknown): value is string => typeof value === 'string' && value.length > 0 && value.length <= 100;

// Reject a malformed snapshot as a whole; partial restoration changes query meaning.
export function parseTabs(raw: string | null): SearchTab[] | null {
  try {
    const tabs: unknown = JSON.parse(raw || 'null');
    const ids = new Set<string>();
    function uniqueId(value: unknown) {
      if (!identifier(value) || ids.has(value)) return false;
      ids.add(value);
      return true;
    }
    if (!Array.isArray(tabs) || !tabs.length || tabs.length > 12) return null;
    for (const tab of tabs) {
      if (!record(tab) || !uniqueId(tab.id) || typeof tab.name !== 'string' || tab.name.length > 100 || !record(tab.filter)) return null;
      const filter = tab.filter;
      if (!Array.isArray(filter.colors) || filter.colors.length > 5 || !filter.colors.every(c => typeof c === 'string' && /^[WUBRG]$/.test(c)) || new Set(filter.colors).size !== filter.colors.length || typeof filter.identity !== 'boolean' || !['at_most','at_least','exactly'].includes(String(filter.mode))) return null;
      if (!Array.isArray(tab.stacks) || !tab.stacks.length || tab.stacks.length > 100) return null;
      for (const stack of tab.stacks) {
        if (!record(stack) || !uniqueId(stack.id) || !['all','any','none'].includes(String(stack.modifier)) || !['and','or'].includes(String(stack.link)) || !Array.isArray(stack.items) || stack.items.length > 100) return null;
        for (const chip of stack.items) {
          if (!record(chip) || !uniqueId(chip.id) || !decodePayload(JSON.stringify({version:1,kind:'criterion',criterion:chip}))) return null;
        }
      }
    }
    return tabs as SearchTab[];
  } catch {return null;}
}
export function loadTabs(): SearchTab[] {
  try {
    const saved = parseTabs(localStorage.getItem(STORAGE_KEY));
    if (saved) return saved;
  } catch { /* Storage can be unavailable in restricted browser contexts. */ }
  return [{id:uid(), name:'Search 1', stacks:initialStacks(), filter:blankFilter()}];
}
