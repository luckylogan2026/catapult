import type { Page, PageType, Block } from '../domain/types';
import { strings } from '../config';
import { defaultInclude } from '../db/boardRepo';
import type { PageTypeDef, TemplateDef } from './types';
import { cover } from './templates/cover';
import { instructions } from './templates/instructions';
import { principles } from './templates/principles';
import { dailyRitual } from './templates/dailyRitual';
import { visionBoard } from './templates/visionBoard';
import { legacy } from './templates/legacy';
import { chapters } from './templates/chapters';
import { manifesto } from './templates/manifesto';
import { profile } from './templates/profile';
import { goals } from './templates/goals';
import { affirmationsIntro } from './templates/affirmationsIntro';
import { affirmations } from './templates/affirmations';
import { masterAffirmations } from './templates/masterAffirmations';
import { aspProcess } from './templates/aspProcess';
import { freeCanvas } from './templates/freeCanvas';

// The registry is the single list of available page types, in the order
// the add-page picker shows them. A board may hold any number of pages
// of any type, several of the same type included.
export const pageTypeRegistry: PageTypeDef[] = [
  cover,
  instructions,
  principles,
  dailyRitual,
  visionBoard,
  legacy,
  chapters,
  manifesto,
  profile,
  goals,
  affirmationsIntro,
  affirmations,
  masterAffirmations,
  aspProcess,
  freeCanvas,
];

export function getPageTypeDef(type: PageType): PageTypeDef {
  const def = pageTypeRegistry.find((d) => d.type === type);
  if (!def) throw new Error(`unknown page type: ${type}`);
  return def;
}

export function getTemplate(def: PageTypeDef, templateId: string): TemplateDef {
  return def.templates.find((t) => t.id === templateId) ?? def.templates[0];
}

type SlotStrings = Record<string, { slots?: Record<string, string> }>;

/** The prompt copy for a slot, from strings.json. */
export function slotPrompt(type: PageType, promptKey?: string): string {
  if (!promptKey) return '';
  return (strings.pageTypes as SlotStrings)[type]?.slots?.[promptKey] ?? '';
}

// A fresh page of a type: text slots become empty editable blocks, media
// slots stay empty until the user drops content in.
export function createPage(type: PageType, title: string): Page {
  const def = getPageTypeDef(type);
  const template = getTemplate(def, def.defaultTemplateId);
  const blocks: Block[] = template.slots
    .filter((s) => s.kind === 'text')
    .map((s, i) => ({
      id: crypto.randomUUID(),
      kind: 'text' as const,
      slotId: s.id,
      text: s.prefill ? slotPrompt(type, s.promptKey) : '',
      rect: { ...s.rect },
      z: i + 1,
      style: s.textStyle,
    }));
  return {
    id: crypto.randomUUID(),
    type,
    title,
    subtitle: '',
    layout: def.defaultLayout ?? 'template',
    templateId: template.id,
    blocks,
    include: defaultInclude(),
  };
}
