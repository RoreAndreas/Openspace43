// Les skills : des méthodes écrites (un fichier SKILL.md : un en-tête name/description, puis les consignes),
// que Roré et l'analyste lisent quand une mission s'y prête. Même format que les skills de Claude :
// un skill installé ici pourra servir tel quel quand on branchera Claude plus tard.
import { create } from 'zustand';
import { lsGet, lsSet } from './db.ts';
import { STARTER_SKILLS } from './starter-skills.ts';

export interface Skill {
  name: string;
  description: string;
  /** le texte complet du SKILL.md */
  content: string;
  enabled: boolean;
  builtin: boolean;
  installedAt: number;
  source?: string;
}

const MAX_SKILL = 30_000;
const MAX_SKILLS = 40;

/** Lit l'en-tête d'un SKILL.md (--- name: … description: … ---). */
export function parseSkill(text: string): { name: string; description: string; content: string } {
  const content = text.replace(/\r\n/g, '\n').trim();
  if (!content) throw new Error('Le fichier est vide.');
  if (content.length > MAX_SKILL) throw new Error('Ce skill est trop long (30 000 caractères au plus).');
  const fm = content.match(/^---\n([\s\S]*?)\n---/);
  const field = (k: string) => fm?.[1].match(new RegExp(`^${k}:\\s*(.+)$`, 'm'))?.[1].trim().replace(/^["']|["']$/g, '') ?? '';
  let name = field('name');
  let description = field('description');
  if (!name) name = content.match(/^#\s+(.+)$/m)?.[1] ?? '';
  if (!description) description = content.replace(/^---[\s\S]*?---/, '').split('\n').find((l) => l.trim() && !l.startsWith('#'))?.trim() ?? '';
  name = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
  if (!name) throw new Error('Je ne trouve pas le nom du skill (ligne « name: » en en-tête).');
  return { name, description: description.slice(0, 300), content };
}

interface SkillStore {
  skills: Skill[];
  install: (text: string, source?: string) => Skill;
  toggle: (name: string) => void;
  remove: (name: string) => void;
}

const builtins = (): Skill[] => STARTER_SKILLS.map((t) => ({ ...parseSkill(t), enabled: true, builtin: true, installedAt: 0 }));

const initial = (() => {
  const saved = lsGet<Skill[]>('skills', []);
  const list = Array.isArray(saved) ? saved.filter((s) => s && typeof s.name === 'string' && typeof s.content === 'string') : [];
  // les skills de départ sont toujours là (on peut les désactiver, pas les perdre)
  for (const b of builtins()) {
    const i = list.findIndex((s) => s.name === b.name && s.builtin);
    if (i < 0) list.unshift(b); else list[i] = { ...b, enabled: list[i].enabled };
  }
  return list;
})();

export const useSkills = create<SkillStore>((set, get) => {
  const commit = (skills: Skill[]) => { set({ skills }); lsSet('skills', skills); };
  return {
    skills: initial,
    install: (text, source) => {
      const p = parseSkill(text);
      const others = get().skills.filter((s) => s.name !== p.name || s.builtin);
      if (get().skills.some((s) => s.name === p.name && s.builtin)) throw new Error(`« ${p.name} » est un skill de départ : donne un autre nom au tien.`);
      if (others.length >= MAX_SKILLS) throw new Error('Trop de skills installés : supprimes-en un d’abord.');
      const skill: Skill = { ...p, enabled: true, builtin: false, installedAt: Date.now(), source };
      commit([...others, skill]);
      return skill;
    },
    toggle: (name) => commit(get().skills.map((s) => (s.name === name ? { ...s, enabled: !s.enabled } : s))),
    remove: (name) => commit(get().skills.filter((s) => s.name !== name || s.builtin)),
  };
});

export const activeSkills = () => useSkills.getState().skills.filter((s) => s.enabled);

/** La liste des skills, telle que l'équipe la lit dans ses consignes (le détail se lit avec use_skill). */
export function skillsPrompt(): string {
  const list = activeSkills();
  if (!list.length) return '';
  return ['## Skills installés (lis-en un avec use_skill avant de l’appliquer)', ...list.map((s) => `- ${s.name} : ${s.description}`)].join('\n');
}

export function findSkill(name: string): Skill | undefined {
  const n = String(name ?? '').trim().toLowerCase();
  return activeSkills().find((s) => s.name === n) ?? activeSkills().find((s) => s.name.includes(n) && n.length > 2);
}
