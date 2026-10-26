// Les fenêtres propres à l'open space : le tiroir de l'analyste, les skills, le règlement du bureau.
import { useRef, useState } from 'react';
import { sfx } from '../audio/sfx.ts';
import { RULES_TEMPLATE } from '../local/bureau.ts';
import { api } from '../local/api.ts';
import { lsGet, lsSet } from '../local/db.ts';
import { useDrawer, type DrawerData } from '../local/drawer.ts';
import { useSkills } from '../local/skills.ts';
import { useOffice } from '../state/store.ts';
import { Shell } from './Rooms.tsx';
import { fmtDate } from './format.ts';

const HEX = /^#[0-9a-f]{6}$/i;

// ── Le tiroir de l'analyste ──
export function DrawerRoom() {
  const d = useDrawer();
  const [tab, setTab] = useState<'colors' | 'texts' | 'notes'>('colors');
  const [cName, setCName] = useState('');
  const [cHex, setCHex] = useState('#ff8a3d');
  const [tLabel, setTLabel] = useState('');
  const [tValue, setTValue] = useState('');
  const [note, setNote] = useState('');
  const count = d.colors.length + d.texts.length + d.notes.length;
  return (
    <Shell title="Le tiroir de l’analyste" sub={count ? `${count} référence${count > 1 ? 's' : ''} : l’analyste les lit avant chaque mission` : 'Ses références pour chaque mission'}>
      <div className="seg tabs">
        <button className={tab === 'colors' ? 'on' : ''} onClick={() => setTab('colors')}>🎨 Couleurs {d.colors.length ? `(${d.colors.length})` : ''}</button>
        <button className={tab === 'texts' ? 'on' : ''} onClick={() => setTab('texts')}>🔤 Types de texte {d.texts.length ? `(${d.texts.length})` : ''}</button>
        <button className={tab === 'notes' ? 'on' : ''} onClick={() => setTab('notes')}>📌 À retenir {d.notes.length ? `(${d.notes.length})` : ''}</button>
      </div>

      {tab === 'colors' && (
        <section className="room-sec">
          <p className="small muted">Les couleurs de ta charte. L’analyste les cite quand il propose des visuels, et les utilise s’il fait une page.</p>
          <div className="drawer-list">
            {d.colors.map((c) => (
              <div key={c.id} className="drawer-item">
                <input type="color" aria-label={`Couleur ${c.name}`} value={HEX.test(c.hex) ? c.hex : '#000000'} onChange={(e) => d.update('colors', c.id, { hex: e.target.value })} />
                <input className="text" aria-label="Nom de la couleur" value={c.name} onChange={(e) => d.update('colors', c.id, { name: e.target.value })} />
                <code>{c.hex.toUpperCase()}</code>
                <button className="btn small ghost" onClick={() => d.remove('colors', c.id)} aria-label="Retirer">✕</button>
              </div>
            ))}
            {!d.colors.length && <p className="muted small">Aucune couleur pour l’instant.</p>}
          </div>
          <form className="drawer-add" onSubmit={(e) => { e.preventDefault(); if (!HEX.test(cHex)) return; d.addColor(cName, cHex); setCName(''); sfx('check'); }}>
            <input id="color-hex" type="color" value={cHex} onChange={(e) => setCHex(e.target.value)} aria-label="Couleur" />
            <input id="color-name" className="text" placeholder="Nom (ex. Orange principal, Fond, Texte)" value={cName} onChange={(e) => setCName(e.target.value)} />
            <button className="btn small primary" type="submit">Ajouter</button>
          </form>
        </section>
      )}

      {tab === 'texts' && (
        <section className="room-sec">
          <p className="small muted">Typographies, ton, formats attendus. Par exemple : « Titres : Montserrat Bold », « Ton : chaleureux, tutoiement », « Format : rapport de 2 pages ».</p>
          <div className="drawer-list">
            {d.texts.map((t) => (
              <div key={t.id} className="drawer-item text-ref">
                <input className="text label" aria-label="Libellé" value={t.label} onChange={(e) => d.update('texts', t.id, { label: e.target.value })} />
                <input className="text" aria-label="Valeur" value={t.value} onChange={(e) => d.update('texts', t.id, { value: e.target.value })} />
                <button className="btn small ghost" onClick={() => d.remove('texts', t.id)} aria-label="Retirer">✕</button>
              </div>
            ))}
            {!d.texts.length && <p className="muted small">Aucun type de texte pour l’instant.</p>}
          </div>
          <form className="drawer-add" onSubmit={(e) => { e.preventDefault(); if (!tValue.trim()) return; d.addText(tLabel, tValue); setTLabel(''); setTValue(''); sfx('check'); }}>
            <input id="text-label" className="text label" placeholder="Libellé (ex. Ton)" value={tLabel} onChange={(e) => setTLabel(e.target.value)} />
            <input id="text-value" className="text" placeholder="Valeur (ex. chaleureux et professionnel, vouvoiement)" value={tValue} onChange={(e) => setTValue(e.target.value)} />
            <button className="btn small primary" type="submit">Ajouter</button>
          </form>
        </section>
      )}

      {tab === 'notes' && (
        <section className="room-sec">
          <p className="small muted">Ce que l’équipe doit retenir pour la suite. L’analyste peut aussi y ranger lui-même une information importante pendant une mission.</p>
          <div className="drawer-list">
            {d.notes.slice().reverse().map((n) => (
              <div key={n.id} className="drawer-item note">
                <div>
                  <span>{n.text}</span>
                  <small className="muted">{n.by === 'analyste' ? '🤖 rangé par l’analyste' : '✍️ ajouté par toi'} · {fmtDate(n.at)}{n.mission ? ` · ${n.mission}` : ''}</small>
                </div>
                <button className="btn small ghost" onClick={() => d.remove('notes', n.id)} aria-label="Retirer">✕</button>
              </div>
            ))}
            {!d.notes.length && <p className="muted small">Rien à retenir pour l’instant.</p>}
          </div>
          <form className="drawer-add" onSubmit={(e) => { e.preventDefault(); if (!note.trim()) return; d.addNote(note, 'toi'); setNote(''); sfx('check'); }}>
            <input id="note-text" className="text" placeholder="Ex. Notre cible : les 25-40 ans urbains. Lancement prévu en mars." value={note} onChange={(e) => setNote(e.target.value)} />
            <button className="btn small primary" type="submit">Ranger</button>
          </form>
        </section>
      )}
    </Shell>
  );
}

// ── Les skills ──
export function SkillsRoom() {
  const { skills, install, toggle, remove } = useSkills();
  const toast = useOffice((s) => s.toast);
  const [paste, setPaste] = useState('');
  const [url, setUrl] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const done = (name: string) => { sfx('done'); toast('info', `Skill « ${name} » installé.`); };
  const tryInstall = (text: string, source?: string) => {
    try { done(install(text, source).name); return true; } catch (e) { toast('error', e instanceof Error ? e.message : String(e)); return false; }
  };
  const fromUrl = async () => {
    let u = url.trim();
    if (!u) return;
    // un lien GitHub « blob » devient le fichier brut
    u = u.replace(/^https:\/\/github\.com\/([^/]+)\/([^/]+)\/blob\//, 'https://raw.githubusercontent.com/$1/$2/');
    setBusy(true);
    try {
      const p = await api.page(u);
      if (tryInstall(p.text, u)) setUrl('');
    } catch (e) {
      toast('error', e instanceof Error ? e.message : String(e));
    } finally { setBusy(false); }
  };
  return (
    <Shell title="Les skills" sub="Des méthodes que Roré et l’analyste appliquent quand la mission s’y prête" wide>
      <div className="skills">
        {skills.map((s) => (
          <div key={s.name} className={`skill ${s.enabled ? '' : 'off'}`}>
            <div className="skill-head">
              <label className="radio"><input type="checkbox" checked={s.enabled} onChange={() => toggle(s.name)} /> <b>{s.name}</b></label>
              {s.builtin ? <em className="pill">de départ</em> : <span className="small muted">installé le {fmtDate(s.installedAt)}</span>}
              <div className="row">
                <button className="btn small ghost" onClick={() => setOpen(open === s.name ? null : s.name)}>{open === s.name ? 'Masquer' : 'Lire'}</button>
                {!s.builtin && <button className="btn small ghost" onClick={() => remove(s.name)}>Supprimer</button>}
              </div>
            </div>
            <p className="small">{s.description}</p>
            {open === s.name && <pre className="plain skill-text">{s.content}</pre>}
          </div>
        ))}
      </div>
      <section className="room-sec">
        <h4>Installer un skill</h4>
        <p className="small muted">Un skill est un fichier texte (SKILL.md) : un en-tête avec <code>name:</code> et <code>description:</code>, puis la méthode. Même format que les skills de Claude.</p>
        <div className="row">
          <input ref={fileRef} type="file" accept=".md,.txt,text/markdown,text/plain" multiple hidden onChange={async (e) => {
            for (const f of Array.from(e.target.files ?? [])) tryInstall(await f.text(), f.name);
            e.target.value = '';
          }} />
          <button className="btn small primary" onClick={() => fileRef.current?.click()}>📄 Depuis un fichier .md</button>
        </div>
        <form className="drawer-add" onSubmit={(e) => { e.preventDefault(); void fromUrl(); }}>
          <input id="skill-url" className="text" placeholder="Ou un lien (ex. un SKILL.md sur GitHub)" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button className="btn small" type="submit" disabled={busy || !url.trim()}>{busy ? 'Téléchargement…' : 'Installer'}</button>
        </form>
        <textarea id="skill-paste" className="area" rows={5} placeholder={'Ou colle le texte du skill ici :\n---\nname: mon-skill\ndescription: À quoi il sert\n---\n# La méthode…'} value={paste} onChange={(e) => setPaste(e.target.value)} />
        <div className="row"><button className="btn small" disabled={!paste.trim()} onClick={() => { if (tryInstall(paste, 'collé')) setPaste(''); }}>Installer le texte collé</button></div>
      </section>
    </Shell>
  );
}

// ── Le règlement du bureau ──
export function RulesRoom() {
  const [text, setText] = useState(() => lsGet<string>('rules', '') || RULES_TEMPLATE);
  const toast = useOffice((s) => s.toast);
  return (
    <Shell title="Le règlement du bureau" sub="Roré le lit avant chaque mission">
      <p className="small muted">Écris ce que l’équipe doit savoir sur toi et ton entreprise, avec tes mots, comme pour briefer de nouveaux collègues.</p>
      <textarea id="rules-text" className="area" rows={14} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="row">
        <button className="btn primary" onClick={() => { lsSet('rules', text); sfx('check'); toast('info', 'Règlement enregistré.'); useOffice.setState({ modal: null }); }}>Enregistrer</button>
        <button className="btn ghost" onClick={() => setText(RULES_TEMPLATE)}>Repartir du modèle</button>
      </div>
    </Shell>
  );
}

/** Sauvegarde des réglages de l'équipe (tiroir, skills installés, règlement) dans un fichier, et restauration. */
export function backupData() {
  const skills = useSkills.getState().skills.filter((s) => !s.builtin);
  const d = useDrawer.getState();
  const drawer: DrawerData = { colors: d.colors, texts: d.texts, notes: d.notes };
  return { app: 'openspace', version: 1, at: new Date().toISOString(), rules: lsGet<string>('rules', ''), drawer, skills };
}

export function restoreData(raw: string) {
  const o = JSON.parse(raw) as Partial<ReturnType<typeof backupData>>;
  if (o.app !== 'openspace') throw new Error('Ce fichier n’est pas une sauvegarde de l’open space.');
  if (typeof o.rules === 'string') lsSet('rules', o.rules);
  if (o.drawer) useDrawer.getState().replaceAll(o.drawer);
  for (const s of o.skills ?? []) { try { useSkills.getState().install(s.content, s.source); } catch { /* déjà là */ } }
}
