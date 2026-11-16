'use strict';
/* RO Builds — companion app para o RO Survivors (ro-survivors.com) */

const SITE = 'https://ro-survivors.com/';
const TALENTS_URL = 'https://ro-survivors.com/talents.html';
const KEY = 'rob.v1';

const STATS = [
  ['STR', 'Força'], ['AGI', 'Agilidade'], ['VIT', 'Vitalidade'],
  ['INT', 'Inteligência'], ['DEX', 'Destreza'], ['LUK', 'Sorte'],
];

// Sugestões (editáveis). Confirmar com os nomes reais do jogo.
const JOBS = {
  'Espadachim': ['Cavaleiro', 'Templário'],
  'Mago': ['Bruxo', 'Sábio'],
  'Arqueiro': ['Caçador', 'Bardo', 'Odalisca'],
  'Noviço': ['Sacerdote', 'Monge'],
  'Mercador': ['Ferreiro', 'Alquimista'],
  'Gatuno': ['Mercenário', 'Arruaceiro'],
};

const SLOTS = ['Cabeça (topo)', 'Cabeça (meio)', 'Cabeça (baixo)', 'Arma', 'Escudo',
  'Armadura', 'Capa', 'Sapatos', 'Acessório 1', 'Acessório 2'];

/* ---------------- utilidades ---------------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const fmtDate = (t) => t ? new Date(t).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2200);
}
function setStatus(msg) { $('#status').textContent = msg || ''; }

/* ---------------- ponte nativa ---------------- */
const hasNative = typeof window.Native !== 'undefined';
const pending = {};
let seq = 0;
window.__nativeCb = (id, ok, data) => {
  const p = pending[id];
  if (!p) return;
  delete pending[id];
  ok ? p.res(data) : p.rej(new Error(data || 'erro'));
};
function nativeCall(fn, ...args) {
  return new Promise((res, rej) => {
    const id = 'c' + (++seq);
    pending[id] = { res, rej };
    window.Native[fn](id, ...args);
  });
}
async function httpGet(url) {
  if (hasNative) return nativeCall('httpGet', url);
  const r = await fetch(url);
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.text();
}
async function renderPage(url, waitMs = 5000) {
  if (!hasNative) throw new Error('Disponível apenas no app Android');
  const raw = await nativeCall('render', url, waitMs);
  const data = typeof raw === 'string' ? JSON.parse(raw) : raw;
  if (!data) throw new Error('Página vazia');
  if (data.error) throw new Error(data.error);
  return data;
}
function openUrl(url) { hasNative ? window.Native.openUrl(url) : window.open(url, '_blank'); }
function shareText(text) {
  if (hasNative) return window.Native.share(text);
  if (navigator.share) return navigator.share({ text }).catch(() => {});
  navigator.clipboard?.writeText(text).then(() => toast('Copiado!'));
}

/* ---------------- armazenamento ---------------- */
function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.builds)) return d;
  } catch (e) { /* ignora */ }
  return { builds: [], currentId: null, talents: null };
}
const db = load();
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(db)); }
  catch (e) { toast('Erro ao salvar: ' + e.message); }
}

function newBuild(base = {}) {
  const stats = {};
  STATS.forEach(([k]) => { stats[k] = 0; });
  return Object.assign({
    id: uid(), name: 'Nova build', job: '', job2: '', baseLv: 1, jobLv: 1,
    points: 48, stats, talents: [], equip: {}, pet: '', notes: '', updated: Date.now(),
  }, JSON.parse(JSON.stringify(base)), base.id ? {} : { id: uid() });
}
function current() {
  let b = db.builds.find((x) => x.id === db.currentId);
  if (!b) {
    b = newBuild();
    db.builds.unshift(b);
    db.currentId = b.id;
    save();
  }
  return b;
}
function touch(b) { b.updated = Date.now(); save(); }

/* ---------------- código de compartilhamento ---------------- */
function encodeBuild(b) {
  const json = JSON.stringify(b);
  return 'ROB1:' + btoa(unescape(encodeURIComponent(json)));
}
function decodeBuilds(text) {
  const out = [];
  const re = /ROB1:([A-Za-z0-9+/=]+)/g;
  let m;
  while ((m = re.exec(text))) {
    try { out.push(JSON.parse(decodeURIComponent(escape(atob(m[1]))))); } catch (e) { /* ignora */ }
  }
  if (!out.length) {
    try {
      const j = JSON.parse(text);
      (Array.isArray(j) ? j : [j]).forEach((x) => x && x.stats && out.push(x));
    } catch (e) { /* ignora */ }
  }
  return out;
}
function buildSummary(b) {
  const lines = [];
  lines.push(`⚔️ ${b.name}`);
  lines.push(`Classe: ${b.job || '?'}${b.job2 ? ' → ' + b.job2 : ''} | Base ${b.baseLv} / Classe ${b.jobLv}`);
  lines.push('Atributos: ' + STATS.map(([k]) => `${k} ${b.stats[k] || 0}`).join(' · '));
  if (b.talents.length) lines.push('Talentos: ' + b.talents.map((t) => `${t.name} ${t.lv}`).join(', '));
  const eq = SLOTS.filter((s) => b.equip[s] && b.equip[s].item);
  if (eq.length) {
    lines.push('Equipamentos:');
    eq.forEach((s) => {
      const e = b.equip[s];
      lines.push(`  ${s}: ${e.refine ? '+' + e.refine + ' ' : ''}${e.item}${e.cards ? ' [' + e.cards + ']' : ''}`);
    });
  }
  if (b.pet) lines.push('Pet: ' + b.pet);
  if (b.notes) lines.push('Notas: ' + b.notes);
  lines.push('');
  lines.push('Código para importar no RO Builds:');
  lines.push(encodeBuild(b));
  return lines.join('\n');
}

/* ---------------- talentos (dados do site) ---------------- */
function extractLines(page) {
  const lines = [];
  const seen = new Set();
  const push = (s, head) => {
    s = (s || '').replace(/\s+/g, ' ').trim();
    if (!s || s.length > 400 || seen.has(s)) return;
    seen.add(s);
    lines.push({ t: s, head: !!head });
  };
  // 1) HTML completo (pega também conteúdo de abas escondidas)
  if (page.html) {
    try {
      const doc = new DOMParser().parseFromString(page.html, 'text/html');
      doc.querySelectorAll('script,style,noscript,svg,nav,footer').forEach((n) => n.remove());
      const blocks = doc.body ? doc.body.querySelectorAll('*') : [];
      blocks.forEach((el) => {
        const hasChildEl = Array.from(el.children).some((c) => !['B', 'I', 'STRONG', 'EM', 'SPAN', 'SMALL', 'BR'].includes(c.tagName));
        if (hasChildEl) return;
        const head = /^H[1-4]$/.test(el.tagName) || /title|name|header|nombre|titulo/i.test(el.className || '');
        push(el.textContent, head);
      });
    } catch (e) { /* ignora */ }
  }
  // 2) texto renderizado
  if (lines.length < 10 && page.text) page.text.split('\n').forEach((l) => push(l, false));
  return lines;
}
function talentNameCandidates() {
  const t = db.talents;
  if (!t || !t.lines) return [];
  return t.lines
    .map((l) => l.t)
    .filter((s) => s.length >= 3 && s.length <= 40 && s.split(' ').length <= 5 && !/[.:;!?]$/.test(s) && !/^\d+$/.test(s))
    .slice(0, 800);
}
async function refreshTalents() {
  setStatus('Carregando talentos…');
  try {
    const page = await renderPage(TALENTS_URL, 6000);
    const lines = extractLines(page);
    db.talents = { fetchedAt: Date.now(), title: page.title, lines, resources: page.resources || [] };
    save();
    toast(`${lines.length} linhas carregadas do site`);
  } catch (e) {
    toast('Falhou: ' + e.message);
  } finally {
    setStatus('');
    if (tab === 'talents') render();
  }
}

/* ---------------- telas ---------------- */
let tab = 'builder';
let talentQuery = '';
let modalOpen = null;

function render() {
  const titles = { builder: 'Montador', talents: 'Talentos', builds: 'Builds', more: 'Mais' };
  $('#title').textContent = titles[tab];
  document.querySelectorAll('.tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  const v = $('#view');
  ({ builder: viewBuilder, talents: viewTalents, builds: viewBuilds, more: viewMore })[tab](v);
}

/* ----- Montador ----- */
function viewBuilder(v) {
  const b = current();
  const used = STATS.reduce((s, [k]) => s + (Number(b.stats[k]) || 0), 0);
  const left = (Number(b.points) || 0) - used;
  const job2s = JOBS[b.job] || Object.values(JOBS).flat();
  const cands = talentNameCandidates();

  v.innerHTML = `
  <div class="card">
    <label>Nome da build</label>
    <input data-f="name" value="${esc(b.name)}">
    <div class="grid2">
      <div><label>1ª classe</label><input data-f="job" list="dl-job1" value="${esc(b.job)}" placeholder="ex: Espadachim"></div>
      <div><label>2ª classe</label><input data-f="job2" list="dl-job2" value="${esc(b.job2)}" placeholder="ex: Cavaleiro"></div>
      <div><label>Nível base</label><input data-f="baseLv" type="number" inputmode="numeric" value="${esc(b.baseLv)}"></div>
      <div><label>Nível de classe</label><input data-f="jobLv" type="number" inputmode="numeric" value="${esc(b.jobLv)}"></div>
    </div>
    <datalist id="dl-job1">${Object.keys(JOBS).map((j) => `<option value="${esc(j)}">`).join('')}</datalist>
    <datalist id="dl-job2">${job2s.map((j) => `<option value="${esc(j)}">`).join('')}</datalist>
  </div>

  <div class="card">
    <h2>Atributos <small>Restam <span class="pts ${left < 0 ? 'over' : 'ok'}">${left}</span> de
      <input data-f="points" type="number" inputmode="numeric" value="${esc(b.points)}" style="width:64px;padding:4px;display:inline-block"></small></h2>
    ${STATS.map(([k, n]) => `
      <div class="stat">
        <div class="name"><b>${k}</b>${n}</div>
        <button class="btn round" data-stat="${k}" data-d="-1">−</button>
        <div class="val">${b.stats[k] || 0}</div>
        <button class="btn round" data-stat="${k}" data-d="1">+</button>
      </div>`).join('')}
    <div class="btns"><button class="btn small" data-act="reset-stats">Zerar atributos</button></div>
  </div>

  <div class="card">
    <h2>Talentos <small>${b.talents.reduce((s, t) => s + (t.lv || 0), 0)} pontos</small></h2>
    ${b.talents.length ? '' : '<div class="muted">Nenhum talento. Adicione abaixo ou pela aba Talentos.</div>'}
    ${b.talents.map((t, i) => `
      <div class="talent">
        <div class="grow">${esc(t.name)}</div>
        <button class="btn round" data-tal="${i}" data-d="-1">−</button>
        <div class="lv">${t.lv}</div>
        <button class="btn round" data-tal="${i}" data-d="1">+</button>
        <button class="btn small red" data-taldel="${i}">✕</button>
      </div>`).join('')}
    <div class="row" style="margin-top:8px">
      <input class="grow" id="newTalent" list="dl-tal" placeholder="Nome do talento">
      <button class="btn gold" data-act="add-talent">Adicionar</button>
    </div>
    <datalist id="dl-tal">${cands.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
  </div>

  <div class="card">
    <h2>Equipamentos</h2>
    ${SLOTS.map((s) => {
      const e = b.equip[s] || {};
      return `<div class="slot">
        <div class="slotname">${esc(s)}</div>
        <div class="row">
          <input class="grow" data-eq="${esc(s)}" data-k="item" value="${esc(e.item)}" placeholder="Item">
          <input class="refine" data-eq="${esc(s)}" data-k="refine" type="number" inputmode="numeric" value="${esc(e.refine)}" placeholder="+0">
        </div>
        <input style="margin-top:6px" data-eq="${esc(s)}" data-k="cards" value="${esc(e.cards)}" placeholder="Cartas (separe por vírgula)">
      </div>`;
    }).join('')}
  </div>

  <div class="card">
    <label>Pet</label>
    <input data-f="pet" value="${esc(b.pet)}" placeholder="Pet e acessório">
    <label>Notas / estilo de jogo</label>
    <textarea data-f="notes" placeholder="Ex.: build de crítico, focar AGI até o nível X…">${esc(b.notes)}</textarea>
  </div>

  <div class="btns" style="margin-bottom:12px">
    <button class="btn gold" data-act="share">Compartilhar</button>
    <button class="btn" data-act="dup">Duplicar</button>
    <button class="btn" data-act="new">Nova build</button>
    <button class="btn" data-act="search">Buscar builds na internet</button>
  </div>`;
}

/* ----- Talentos ----- */
function viewTalents(v) {
  const t = db.talents;
  const q = talentQuery.trim().toLowerCase();
  let lines = t ? t.lines : [];
  if (q) lines = lines.filter((l) => l.t.toLowerCase().includes(q));
  const shown = lines.slice(0, 300);
  const hl = (s) => {
    const e = esc(s);
    if (!q) return e;
    const re = new RegExp(esc(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    return e.replace(re, (m) => `<mark>${m}</mark>`);
  };

  v.innerHTML = `
  <div class="card">
    <div class="muted">Dados lidos de ro-survivors.com/talents.html · Atualizado: ${fmtDate(t && t.fetchedAt)}</div>
    <div class="btns">
      <button class="btn gold" data-act="refresh-talents">${t ? 'Atualizar' : 'Carregar'} do site</button>
      <button class="btn" data-act="open-talents">Abrir no navegador</button>
    </div>
    ${hasNative ? '' : '<div class="muted" style="margin-top:8px">⚠️ Leitura do site só funciona no app Android.</div>'}
  </div>
  ${t ? `
    <input id="tq" placeholder="Buscar talento, efeito, classe…" value="${esc(talentQuery)}" style="margin-bottom:8px">
    <div class="muted" style="margin-bottom:6px">${lines.length} resultado(s)${lines.length > shown.length ? ' — mostrando 300' : ''}. Toque em ＋ para adicionar à build atual.</div>
    <div class="card" style="padding:4px 10px">
      ${shown.map((l) => `
        <div class="line ${l.head ? 'head' : ''}">
          <div class="grow">${hl(l.t)}</div>
          ${l.t.length <= 60 ? `<button class="btn small" data-addtal="${esc(l.t)}">＋</button>` : ''}
        </div>`).join('') || '<div class="empty">Nada encontrado.</div>'}
    </div>` : '<div class="empty">Toque em “Carregar do site” para baixar os talentos.</div>'}`;
}

/* ----- Builds ----- */
function viewBuilds(v) {
  const recs = Array.isArray(window.RECOMENDADAS) ? window.RECOMENDADAS : [];
  const item = (b, rec, i) => `
    <div class="list-item">
      <div class="t">${esc(b.name)} ${b.id === db.currentId && !rec ? '<span class="pill">atual</span>' : ''}</div>
      <div class="s">${esc(b.job || '?')}${b.job2 ? ' → ' + esc(b.job2) : ''} · ${STATS.map(([k]) => `${k} ${b.stats?.[k] || 0}`).join(' ')}</div>
      ${rec && b.descricao ? `<div class="s">${esc(b.descricao)}</div>` : ''}
      ${rec ? '' : `<div class="s">Editada: ${fmtDate(b.updated)}</div>`}
      <div class="btns">
        ${rec
          ? `<button class="btn small gold" data-userec="${i}">Usar como base</button>`
          : `<button class="btn small gold" data-open="${esc(b.id)}">Abrir</button>
             <button class="btn small" data-sharebuild="${esc(b.id)}">Compartilhar</button>
             <button class="btn small red" data-del="${esc(b.id)}">Excluir</button>`}
      </div>
    </div>`;

  v.innerHTML = `
  <div class="btns" style="margin:0 0 12px">
    <button class="btn gold" data-act="new">Nova build</button>
    <button class="btn" data-act="import">Importar código</button>
    <button class="btn" data-act="export-all">Exportar todas</button>
  </div>
  <h3 style="color:var(--gold);margin:6px 2px">Minhas builds (${db.builds.length})</h3>
  ${db.builds.map((b) => item(b, false)).join('') || '<div class="empty">Nenhuma build salva.</div>'}
  <h3 style="color:var(--gold);margin:16px 2px 6px">Recomendadas</h3>
  ${recs.map((b, i) => item(b, true, i)).join('') || '<div class="empty">Ainda não há builds recomendadas nesta versão.<br>Use “Buscar builds na internet” no Montador.</div>'}`;
}

/* ----- Mais ----- */
function viewMore(v) {
  const t = db.talents;
  const ver = hasNative && window.Native.version ? window.Native.version() : 'web';
  v.innerHTML = `
  <div class="card">
    <h2>Jogo</h2>
    <div class="btns">
      <button class="btn gold" data-act="open-game">Abrir RO Survivors</button>
      <button class="btn" data-act="open-talents">Página de talentos</button>
    </div>
  </div>
  <div class="card">
    <h2>Diagnóstico <small>para melhorar o app</small></h2>
    <div class="muted">Arquivos que a página de talentos carregou na última atualização: ${t ? t.resources.length : 0}. Compartilhe isso com quem está desenvolvendo o app para que os dados sejam lidos de forma mais precisa.</div>
    <div class="btns"><button class="btn" data-act="share-diag" ${t ? '' : 'disabled'}>Compartilhar diagnóstico</button></div>
  </div>
  <div class="card">
    <h2>Dados</h2>
    <div class="btns">
      <button class="btn" data-act="export-all">Backup (exportar todas)</button>
      <button class="btn" data-act="import">Restaurar / importar</button>
      <button class="btn red" data-act="clear-talents">Limpar cache de talentos</button>
    </div>
  </div>
  <div class="muted" style="text-align:center;margin:16px 0">RO Builds v${esc(ver)} · fã-app não oficial para ro-survivors.com</div>`;
}

/* ---------------- modal ---------------- */
function openModal(html, onReady) {
  closeModal();
  const bg = document.createElement('div');
  bg.className = 'modal-bg';
  bg.innerHTML = `<div class="modal">${html}</div>`;
  bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
  document.body.appendChild(bg);
  modalOpen = bg;
  onReady && onReady(bg);
}
function closeModal() { if (modalOpen) { modalOpen.remove(); modalOpen = null; } }

function importDialog() {
  openModal(`
    <h3>Importar build</h3>
    <div class="muted">Cole aqui o texto compartilhado (com o código ROB1:…) ou um backup.</div>
    <textarea id="imp" style="min-height:160px;margin-top:8px"></textarea>
    <div class="btns">
      <button class="btn gold" id="impGo">Importar</button>
      <button class="btn" id="impCancel">Cancelar</button>
    </div>`, (m) => {
    $('#impCancel', m).onclick = closeModal;
    $('#impGo', m).onclick = () => {
      const list = decodeBuilds($('#imp', m).value);
      if (!list.length) return toast('Nenhuma build encontrada no texto');
      list.forEach((x) => db.builds.unshift(newBuild(Object.assign({}, x, { id: undefined, updated: Date.now() }))));
      db.currentId = db.builds[0].id;
      save();
      closeModal();
      toast(`${list.length} build(s) importada(s)`);
      tab = 'builds';
      render();
    };
  });
}

/* ---------------- eventos ---------------- */
document.querySelector('.tabs').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-tab]');
  if (!b) return;
  tab = b.dataset.tab;
  render();
  window.scrollTo(0, 0);
});

const view = $('#view');

view.addEventListener('input', (e) => {
  const el = e.target;
  if (el.id === 'tq') {
    talentQuery = el.value;
    clearTimeout(viewTalents._t);
    viewTalents._t = setTimeout(() => {
      const pos = el.selectionStart;
      render();
      const n = $('#tq');
      if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (x) { /* ignora */ } }
    }, 250);
    return;
  }
  const b = current();
  if (el.dataset.f) {
    const f = el.dataset.f;
    b[f] = el.type === 'number' ? Number(el.value) || 0 : el.value;
    touch(b);
    if (f === 'points') {
      const used = STATS.reduce((s, [k]) => s + (Number(b.stats[k]) || 0), 0);
      const p = $('.pts');
      if (p) { p.textContent = b.points - used; p.className = 'pts ' + (b.points - used < 0 ? 'over' : 'ok'); }
    }
  } else if (el.dataset.eq) {
    const s = el.dataset.eq;
    b.equip[s] = b.equip[s] || {};
    b.equip[s][el.dataset.k] = el.dataset.k === 'refine' ? (Number(el.value) || 0) : el.value;
    touch(b);
  }
});

view.addEventListener('change', (e) => {
  // trocar a 1ª classe atualiza as sugestões da 2ª
  if (e.target.dataset.f === 'job') render();
});

view.addEventListener('click', (e) => {
  const el = e.target.closest('button');
  if (!el) return;
  const b = current();
  const d = el.dataset;

  if (d.stat) {
    b.stats[d.stat] = Math.max(0, (Number(b.stats[d.stat]) || 0) + Number(d.d));
    touch(b); return render();
  }
  if (d.tal !== undefined) {
    const t = b.talents[Number(d.tal)];
    t.lv = Math.max(0, (t.lv || 0) + Number(d.d));
    touch(b); return render();
  }
  if (d.taldel !== undefined) { b.talents.splice(Number(d.taldel), 1); touch(b); return render(); }
  if (d.addtal) {
    if (b.talents.some((t) => t.name === d.addtal)) return toast('Já está na build');
    b.talents.push({ name: d.addtal, lv: 1 });
    touch(b); return toast(`“${d.addtal}” adicionado a ${b.name}`);
  }
  if (d.open) { db.currentId = d.open; save(); tab = 'builder'; return render(); }
  if (d.sharebuild) { const x = db.builds.find((y) => y.id === d.sharebuild); return x && shareText(buildSummary(x)); }
  if (d.del) {
    if (!confirm('Excluir esta build?')) return;
    db.builds = db.builds.filter((x) => x.id !== d.del);
    if (db.currentId === d.del) db.currentId = db.builds[0] ? db.builds[0].id : null;
    save(); return render();
  }
  if (d.userec !== undefined) {
    const r = window.RECOMENDADAS[Number(d.userec)];
    const nb = newBuild(Object.assign({}, r, { id: undefined, name: r.name + ' (cópia)' }));
    db.builds.unshift(nb); db.currentId = nb.id; save();
    tab = 'builder'; toast('Build criada a partir da recomendada'); return render();
  }

  switch (d.act) {
    case 'reset-stats': STATS.forEach(([k]) => { b.stats[k] = 0; }); touch(b); return render();
    case 'add-talent': {
      const inp = $('#newTalent');
      const name = inp.value.trim();
      if (!name) return toast('Digite o nome do talento');
      b.talents.push({ name, lv: 1 }); touch(b); return render();
    }
    case 'share': return shareText(buildSummary(b));
    case 'dup': {
      const nb = newBuild(Object.assign({}, b, { id: undefined, name: b.name + ' (cópia)' }));
      db.builds.unshift(nb); db.currentId = nb.id; save(); toast('Build duplicada'); return render();
    }
    case 'new': {
      const nb = newBuild();
      db.builds.unshift(nb); db.currentId = nb.id; save(); tab = 'builder'; return render();
    }
    case 'search': {
      const q = ['RO Survivors', 'build', b.job2 || b.job].filter(Boolean).join(' ');
      return openUrl('https://www.google.com/search?q=' + encodeURIComponent(q));
    }
    case 'refresh-talents': return refreshTalents();
    case 'open-talents': return openUrl(TALENTS_URL);
    case 'open-game': return openUrl(SITE);
    case 'import': return importDialog();
    case 'export-all':
      return shareText('Backup RO Builds (' + db.builds.length + ' builds)\n\n' + db.builds.map(encodeBuild).join('\n'));
    case 'share-diag': {
      const t = db.talents;
      return shareText('Diagnóstico RO Builds\nTítulo: ' + t.title + '\nLinhas: ' + t.lines.length +
        '\n\nRecursos:\n' + t.resources.join('\n') +
        '\n\nPrimeiras linhas:\n' + t.lines.slice(0, 60).map((l) => (l.head ? '# ' : '') + l.t).join('\n'));
    }
    case 'clear-talents': db.talents = null; save(); toast('Cache limpo'); return render();
  }
});

window.__onBack = () => {
  if (modalOpen) { closeModal(); return true; }
  if (tab !== 'builder') { tab = 'builder'; render(); return true; }
  return false;
};

render();
