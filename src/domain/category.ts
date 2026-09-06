import { categoryHues, type CategoryHue } from '@/theme/tokens';
import type { Cap } from './cap';
import type { Entry, Series } from './model';

/**
 * A category's identity: what it is called, and what it looks like.
 *
 * **This file exists under a constraint it must not break.** `tetos.tsx` argues, correctly, that a
 * budget screen whose first step is "crie uma categoria" has put its own filing ahead of the
 * owner's money. Categories are discovered from what somebody actually spends on; they are not a
 * table to curate before the app becomes useful.
 *
 * So identity here is **assigned, never demanded**. Every category name the ledger has ever seen
 * gets an icon and a colour immediately, derived from the name itself — deterministic, stable, and
 * good enough that the owner may never open the editor at all. A stored `Category` row then
 * *overrides* that assignment for the names somebody cared enough to dress themselves.
 *
 * The distinction matters more than it looks. It means the donut is never grey, a fresh ledger is
 * never a wall of "escolha uma cor", and the management screen is a place to refine rather than a
 * toll gate. Curation is a reward for caring, not a tax for starting.
 *
 * The ceiling stays in `cap.ts`. To the owner, a teto is a property of a category and the editor
 * presents it that way — but the pace arithmetic, the alerts and the storage that back it are
 * already built and already tested, and folding them in here to flatter one form would be
 * rewriting working machinery for the sake of a screen's convenience.
 */

/** The drawn icon set. Names are the vocabulary, not the drawings — those live in `CategoryIcon`. */
export const categoryIcons = [
  'tag',
  'home',
  'lamp',
  'fork',
  'cart',
  'car',
  'heart',
  'spark',
  'repeat',
  'card',
  'wallet',
  'bolt',
  'book',
  'gift',
  'plane',
  'pet',
] as const;

export type CategoryIconName = (typeof categoryIcons)[number];

/** What the owner has explicitly dressed. Absent for every category they have not touched. */
export interface Category {
  /** The name is the key. It is also what every `Entry.category` and `Series.category` stores. */
  name: string;
  icon: CategoryIconName;
  hue: CategoryHue;
  /** The owner's own note about what belongs in here. Null when they did not write one. */
  description: string | null;
}

/** A category as any screen needs it: identity resolved, ceiling attached when there is one. */
export interface CategoryView {
  name: string;
  icon: CategoryIconName;
  hue: CategoryHue;
  description: string | null;
  /** The ceiling, or null when this category has none. */
  capCents: number | null;
  /** True when the owner dressed this one themselves rather than taking the assigned look. */
  authored: boolean;
}

/**
 * The starting vocabulary, and the single source of truth for it.
 *
 * Before this existed there were two divergent hardcoded lists — eight names in `lancar.tsx` and
 * twelve in `recorrencia.tsx`, so a category offered when setting up a recurring bill could not be
 * offered when recording a one-off. That is the kind of split nobody notices until they go looking
 * for "Moradia" in the wrong screen and conclude the app lost it.
 *
 * These are suggestions the pickers fall back to, never a fixed set. The owner's own words always
 * sort first, and a name typed once becomes part of the vocabulary forever.
 */
export const seedCategories: readonly { name: string; icon: CategoryIconName; hue: CategoryHue }[] = [
  // Five hues against twelve names means collisions are arithmetic, not oversight. They are placed
  // so that the categories most likely to appear in the same top-five never share one: Alimentação,
  // Mercado, Transporte, Moradia and Assinaturas hold all five between them. The icon separates the
  // rest, which is the division of labour this file is built on — colour for a handful of arcs,
  // glyph for the finer identity.
  { name: 'Moradia', icon: 'home', hue: 'teal' },
  { name: 'Casa', icon: 'lamp', hue: 'teal' },
  { name: 'Alimentação', icon: 'fork', hue: 'terracotta' },
  { name: 'Mercado', icon: 'cart', hue: 'bronze' },
  { name: 'Transporte', icon: 'car', hue: 'azure' },
  { name: 'Saúde', icon: 'heart', hue: 'bronze' },
  { name: 'Lazer', icon: 'spark', hue: 'terracotta' },
  { name: 'Assinaturas', icon: 'repeat', hue: 'plum' },
  { name: 'Cartão', icon: 'card', hue: 'azure' },
  { name: 'Dívidas', icon: 'wallet', hue: 'plum' },
  { name: 'Renda', icon: 'wallet', hue: 'bronze' },
  { name: 'Outros', icon: 'tag', hue: 'teal' },
];

/**
 * A stable number from a name.
 *
 * FNV-1a, and the reason it is written out rather than reached for: the assignment must not move.
 * "Alimentação" has to draw the same colour on every device, every launch, and after any reorder of
 * the ledger, because a category that changes colour between two openings of the same screen reads
 * as a different category. Anything derived from array position or insertion order fails that.
 */
function hashName(name: string): number {
  let h = 0x811c9dc5;
  const key = name.trim().toLocaleLowerCase('pt-BR');
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/**
 * The look a category gets when nobody has chosen one.
 *
 * A seeded name keeps the look that was designed for it — "Mercado" should be the grocery cart and
 * not whatever the hash lands on. Everything else is assigned from the name, which is what lets a
 * category the owner invented this morning appear in the donut already dressed.
 */
export function assignedLook(name: string): { icon: CategoryIconName; hue: CategoryHue } {
  const key = name.trim().toLocaleLowerCase('pt-BR');
  const seeded = seedCategories.find((c) => c.name.toLocaleLowerCase('pt-BR') === key);
  if (seeded) return { icon: seeded.icon, hue: seeded.hue };

  const h = hashName(name);
  return {
    // `tag` is the deliberate default and is excluded from assignment: it means "no icon fits", and
    // handing it out at random would spend the one neutral glyph on a category that could have had
    // a real one.
    icon: categoryIcons[1 + (h % (categoryIcons.length - 1))] as CategoryIconName,
    hue: categoryHues[(h >>> 8) % categoryHues.length] as CategoryHue,
  };
}

/** Identity for one name, owner's choice first, assignment second. */
export function lookFor(name: string, categories: Category[]): { icon: CategoryIconName; hue: CategoryHue } {
  const key = name.trim().toLocaleLowerCase('pt-BR');
  const own = categories.find((c) => c.name.toLocaleLowerCase('pt-BR') === key);
  if (own) return { icon: own.icon, hue: own.hue };
  return assignedLook(name);
}

/**
 * Every category the ledger knows about, resolved and sorted for a management screen.
 *
 * The universe is the union of three things, in order of how much they prove the owner cares:
 * names they dressed, names they actually used, and the seed vocabulary. A name only ever appears
 * once regardless of how many of those it came from, matched case-insensitively so "assinaturas"
 * typed in a hurry does not become a second category beside "Assinaturas".
 */
export function categoryViews(
  categories: Category[],
  caps: Cap[],
  entries: Entry[],
  series: Series[],
): CategoryView[] {
  const byKey = new Map<string, string>();
  const remember = (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = trimmed.toLocaleLowerCase('pt-BR');
    if (!byKey.has(key)) byKey.set(key, trimmed);
  };

  for (const c of categories) remember(c.name);
  for (const e of entries) remember(e.category);
  for (const s of series) remember(s.category);
  for (const c of caps) remember(c.category);
  for (const s of seedCategories) remember(s.name);

  const authoredKeys = new Set(categories.map((c) => c.name.trim().toLocaleLowerCase('pt-BR')));

  return [...byKey.values()]
    .map((name) => {
      const key = name.toLocaleLowerCase('pt-BR');
      const own = categories.find((c) => c.name.trim().toLocaleLowerCase('pt-BR') === key);
      const look = own ? { icon: own.icon, hue: own.hue } : assignedLook(name);
      const cap = caps.find((c) => c.category.trim().toLocaleLowerCase('pt-BR') === key);
      return {
        name,
        icon: look.icon,
        hue: look.hue,
        description: own?.description ?? null,
        capCents: cap?.capCents ?? null,
        authored: authoredKeys.has(key),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * The picker's order: the owner's own vocabulary, by how much they use it, then the rest.
 *
 * Lifted out of `lancar.tsx` so that recording a one-off and setting up a recurring bill offer the
 * same names in the same order. A list that differs between two screens teaches the owner to
 * distrust both.
 */
export function pickerOrder(entries: Entry[], series: Series[], categories: Category[]): string[] {
  const used = new Map<string, { name: string; n: number }>();
  const bump = (name: string, weight: number) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const key = trimmed.toLocaleLowerCase('pt-BR');
    const at = used.get(key);
    if (at) at.n += weight;
    else used.set(key, { name: trimmed, n: weight });
  };

  for (const e of entries) bump(e.category, 1);
  // A recurring rule is one row but many months of intent, so it counts for more than a single
  // lançamento when deciding what the owner reaches for most.
  for (const s of series) bump(s.category, 3);

  const mine = [...used.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'pt-BR'));
  const seen = new Set(mine.map((m) => m.name.toLocaleLowerCase('pt-BR')));

  const authored = categories
    .map((c) => c.name.trim())
    .filter((n) => n && !seen.has(n.toLocaleLowerCase('pt-BR')));
  for (const n of authored) seen.add(n.toLocaleLowerCase('pt-BR'));

  const rest = seedCategories
    .map((c) => c.name)
    .filter((n) => !seen.has(n.toLocaleLowerCase('pt-BR')));

  return [...mine.map((m) => m.name), ...authored, ...rest];
}
