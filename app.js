'use strict';

const CONFIG = window.AGENDA_CONFIG || {};
const SUPABASE_CONFIG_ERROR = getSupabaseConfigError(CONFIG);
const HAS_SUPABASE = !SUPABASE_CONFIG_ERROR && Boolean(window.supabase);
const LOCAL_KEY = 'umi_agenda_v6_state';
const LEGACY_KEY = 'axis_agenda_v2_state';

const COLORS = {
  accent: '#c9a96e', blue: '#6b9bd2', green: '#7ab87a', purple: '#9b87c4',
  red: '#d27b7b', teal: '#6ab8b0', pink: '#c47aaa', amber: '#c9a96e'
};
const COLOR_BG = {
  accent: 'rgba(201,169,110,.12)', blue: 'rgba(107,155,210,.12)', green: 'rgba(122,184,122,.12)',
  purple: 'rgba(155,135,196,.12)', red: 'rgba(210,123,123,.12)', teal: 'rgba(106,184,176,.12)',
  pink: 'rgba(196,122,170,.12)', amber: 'rgba(201,169,110,.12)'
};
const LINK_COLORS = {
  accent: 'Dorado', blue: 'Azul', green: 'Verde', purple: 'Morado', red: 'Rojo', teal: 'Teal', pink: 'Rosa', amber: 'Ámbar'
};
const STATUS_COLUMNS = [
  { id: 'backlog', name: 'Backlog', color: '#716d75' },
  { id: 'pendiente', name: 'Pendiente', color: COLORS.accent },
  { id: 'en-progreso', name: 'En progreso', color: COLORS.blue },
  { id: 'revision', name: 'Revisión', color: COLORS.purple },
  { id: 'completado', name: 'Completado', color: COLORS.green },
];
const STATUS_LABEL = Object.fromEntries(STATUS_COLUMNS.map(c => [c.id, c.name]));
const DEFAULT_EVENT_TYPES = [
  { key: 'trabajo', label: 'Trabajo', color: 'blue', icon: 'fa-briefcase', archived: false, sort_order: 10 },
  { key: 'personal', label: 'Personal', color: 'purple', icon: 'fa-user', archived: false, sort_order: 20 },
  { key: 'reunion', label: 'Reunión', color: 'green', icon: 'fa-users', archived: false, sort_order: 30 },
  { key: 'llamada', label: 'Llamada', color: 'teal', icon: 'fa-phone', archived: false, sort_order: 40 },
  { key: 'deadline', label: 'Deadline', color: 'red', icon: 'fa-flag', archived: false, sort_order: 50 },
  { key: 'bloque', label: 'Bloque de foco', color: 'accent', icon: 'fa-bullseye', archived: false, sort_order: 60 },
  { key: 'otro', label: 'Otro', color: 'amber', icon: 'fa-circle', archived: false, sort_order: 999 },
];
const EVENT_ICON_OPTIONS = [
  { value: 'fa-briefcase', label: 'Trabajo' },
  { value: 'fa-user', label: 'Personal' },
  { value: 'fa-users', label: 'Reunión' },
  { value: 'fa-phone', label: 'Llamada' },
  { value: 'fa-flag', label: 'Deadline' },
  { value: 'fa-bullseye', label: 'Foco' },
  { value: 'fa-calendar-day', label: 'Calendario' },
  { value: 'fa-location-dot', label: 'Lugar' },
  { value: 'fa-car', label: 'Traslado' },
  { value: 'fa-dumbbell', label: 'Entreno' },
  { value: 'fa-heart', label: 'Salud' },
  { value: 'fa-money-bill-wave', label: 'Finanzas' },
  { value: 'fa-lightbulb', label: 'Idea' },
  { value: 'fa-circle', label: 'General' },
];

let sb = null;
let currentUser = null;
let dataMode = HAS_SUPABASE ? 'supabase' : 'local';
let currentView = 'today';
let todayFilter = 'open';
let searchQuery = '';
let draggedTaskId = null;
let draggedCalendarItem = null;
let boardDragState = null;
let boardLinkMode = false;
let boardLinkSourceId = null;
let boardCurrentLinkColor = 'accent';
let boardContext = null;
let selectedBoardCardId = null;
let boardClipboard = null;
let boardSnapToGrid = true;
let calendarCursor = new Date();
let state = normalizeState(loadLocalState());

const $ = (id) => document.getElementById(id);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

function uid(prefix = 'id') {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}
function todayStr() { return toDateInputValue(new Date()); }
function toDateInputValue(date) {
  const d = new Date(date);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}
function addDays(dateStr, days) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateInputValue(d);
}
function addMonths(dateStr, months) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setMonth(d.getMonth() + months);
  return toDateInputValue(d);
}
function diffDays(fromDateStr, toDateStr) {
  const from = new Date(`${fromDateStr}T12:00:00`);
  const to = new Date(`${toDateStr}T12:00:00`);
  return Math.round((to - from) / 86400000);
}
function shiftDate(dateStr, days) {
  return dateStr ? addDays(dateStr, days) : null;
}
function fmtDate(dateStr, opts = {}) {
  if (!dateStr) return 'Sin fecha';
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('es-AR', opts.day ? opts : { day: 'numeric', month: 'short' });
}
function fmtLong(dateStr) {
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('es-AR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
}
function monthLabel(date) {
  return date.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });
}
function escapeHTML(str = '') {
  return String(str).replace(/[&<>'"]/g, ch => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' }[ch]));
}

function approxTime(time) {
  return time ? `~${String(time).slice(0, 5)}` : '';
}
function approxTimeHTML(time) {
  const label = approxTime(time);
  return label ? `<span class="approx-time">${label}</span>` : '';
}
function approxRange(start, end) {
  if (start && end) return `~${String(start).slice(0, 5)}–${String(end).slice(0, 5)}`;
  return approxTime(start);
}

function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function isOpenTask(t) { return t.status !== 'completado'; }
function taskStartDate(t) { return t?.due_date || null; }
function taskEndDate(t) { return t?.end_date || t?.due_date || null; }
function taskOccursOn(t, dateStr) {
  const start = taskStartDate(t);
  const end = taskEndDate(t);
  return Boolean(start && dateStr && start <= dateStr && dateStr <= end);
}
function taskSpansMultipleDays(t) {
  const start = taskStartDate(t);
  const end = taskEndDate(t);
  return Boolean(start && end && end > start);
}
function taskRangeLabel(t) {
  const start = taskStartDate(t);
  const end = taskEndDate(t);
  if (!start) return 'Sin fecha';
  if (!end || end === start) return fmtDate(start);
  return `${fmtDate(start)} → ${fmtDate(end)}`;
}
function isOverdue(t) { return taskEndDate(t) && taskEndDate(t) < todayStr() && isOpenTask(t); }
function projectById(id) { return state.projects.find(p => p.id === id); }
function projectName(id) { return projectById(id)?.name || 'Sin proyecto'; }
function projectColor(id) { return COLORS[projectById(id)?.color] || COLORS.accent; }
function projectBg(id) { return COLOR_BG[projectById(id)?.color] || COLOR_BG.accent; }
function taskColor(t) { return COLORS[t.tag] || COLORS.blue; }
function taskBg(t) { return COLOR_BG[t.tag] || COLOR_BG.blue; }
function toast(message, type = 'info') {
  const node = document.createElement('div');
  node.className = `toast ${type}`;
  node.textContent = message;
  $('toast-root').appendChild(node);
  setTimeout(() => node.remove(), 3600);
}

function getSupabaseConfigError(config) {
  const url = String(config.SUPABASE_URL || '').trim();
  const key = String(config.SUPABASE_ANON_KEY || config.SUPABASE_PUBLIC_KEY || '').trim();
  if (!url && !key) return 'missing';
  if (!url || !key) return 'incomplete';
  if (
    url.includes('TU-PROYECTO') ||
    key.includes('TU_SUPABASE') ||
    key.includes('TU_ANON') ||
    key.includes('TU_PUBLISHABLE')
  ) return 'placeholder';
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return 'url_protocol';
    if (!parsed.hostname.endsWith('.supabase.co') && !parsed.hostname.includes('localhost')) return 'url_host';
  } catch (_) {
    return 'url_invalid';
  }

  // Supabase ahora puede entregar dos formatos públicos válidos:
  // 1) Legacy anon/public key: JWT largo que empieza con "ey".
  // 2) Publishable key nueva: opaque key que empieza con "sb_publishable_".
  // Ambas son aptas para frontend si RLS está correctamente configurado.
  const isLegacyAnonJwt = key.startsWith('ey') && key.split('.').length === 3 && key.length > 80;
  const isPublishableKey = key.startsWith('sb_publishable_') && key.length > 40;
  if (!isLegacyAnonJwt && !isPublishableKey) return 'public_key_invalid';
  if (key.startsWith('sb_secret_') || key.toLowerCase().includes('service_role')) return 'secret_key_used';
  if (!window.supabase) return 'sdk_missing';
  return '';
}
function getSupabasePublicKey() {
  return String(CONFIG.SUPABASE_ANON_KEY || CONFIG.SUPABASE_PUBLIC_KEY || '').trim();
}
function supabaseConfigMessage(code = SUPABASE_CONFIG_ERROR) {
  return ({
    missing: 'Supabase no está configurado: config.js está vacío. La app queda en modo local.',
    incomplete: 'Supabase incompleto: falta URL o clave pública en config.js.',
    placeholder: 'Supabase no está activo: config.js todavía tiene valores de ejemplo.',
    url_protocol: 'La URL de Supabase debe usar https://.',
    url_invalid: 'La URL de Supabase no es válida.',
    url_host: 'La URL no parece ser de Supabase. Usá el Project URL, no la URL del dashboard.',
    public_key_invalid: 'La clave pública de Supabase no parece válida. Usá la publishable key sb_publishable_... o la legacy anon key que empieza con eyJ.',
    secret_key_used: 'No uses secret key ni service_role en frontend. Usá publishable key o anon public key.',
    sdk_missing: 'No cargó el SDK de Supabase. Revisá conexión o bloqueadores del navegador.'
  })[code] || 'Configuración Supabase inválida.';
}

function getDefaultState() {
  return {
    projects: [
      { id: uid('p'), name: 'Personal', description: 'Gestión personal, casa y vida diaria.', color: 'accent', archived: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: uid('p'), name: 'Trabajo', description: 'Tareas laborales, seguimiento y operación.', color: 'blue', archived: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ],
    tasks: [],
    events: [],
    event_types: DEFAULT_EVENT_TYPES.map(t => normalizeEventType({ ...t, id: uid('et'), created_at: new Date().toISOString(), updated_at: new Date().toISOString() })),
    daily_notes: [],
    board_cards: [],
    board_links: [],
  };
}
function loadLocalState() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (raw) return JSON.parse(raw);
    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) return migrateLegacyState(JSON.parse(legacy));
  } catch (err) { console.warn('No se pudo leer estado local', err); }
  return getDefaultState();
}
function saveLocalState() {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(state));
}
function migrateLegacyState(oldState) {
  const migrated = getDefaultState();
  const projectIdMap = new Map();
  if (Array.isArray(oldState.projects)) {
    migrated.projects = oldState.projects.map(p => {
      const id = p.id || uid('p');
      projectIdMap.set(p.id, id);
      return { id, name: p.name || 'Proyecto', description: p.desc || p.description || '', color: p.color || 'accent', archived: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    });
  }
  if (Array.isArray(oldState.tasks)) {
    migrated.tasks = oldState.tasks.map(t => ({
      id: t.id || uid('t'), project_id: projectIdMap.get(t.project) || t.project || null,
      title: t.title || 'Tarea sin título', description: t.desc || t.description || '', status: t.status || 'pendiente',
      priority: t.priority || 'media', due_date: t.dueDate || t.due_date || null, end_date: t.end_date || t.endDate || t.dueDate || t.due_date || null, start_time: t.start_time || null,
      duration_min: t.duration_min || null, tag: t.tag || 'blue', context: t.context || 'pc', energy: t.energy || 'media',
      repeat_rule: t.repeat_rule || 'none', sort_order: t.sort_order || 0, completed_at: t.status === 'completado' ? new Date().toISOString() : null,
      created_at: t.createdAt || t.created_at || new Date().toISOString(), updated_at: new Date().toISOString()
    }));
  }
  if (Array.isArray(oldState.events)) {
    migrated.events = oldState.events.map(e => ({
      id: e.id || uid('e'), project_id: e.project_id || null, title: e.title || 'Evento', notes: e.notes || '',
      event_date: e.date || e.event_date || todayStr(), start_time: e.time || e.start_time || null, end_time: e.end_time || null,
      type: e.type || 'otro', location: e.location || '', created_at: new Date().toISOString(), updated_at: new Date().toISOString()
    }));
  }
  return migrated;
}
function normalizeState(input) {
  const base = getDefaultState();
  const s = input && typeof input === 'object' ? input : base;
  return {
    projects: Array.isArray(s.projects) ? s.projects.map(normalizeProject) : base.projects,
    tasks: Array.isArray(s.tasks) ? s.tasks.map(normalizeTask) : [],
    events: Array.isArray(s.events) ? s.events.map(normalizeEvent) : [],
    event_types: Array.isArray(s.event_types) ? ensureAtLeastOneEventType(s.event_types.map(normalizeEventType)) : mergeEventTypes([]),
    daily_notes: Array.isArray(s.daily_notes) ? s.daily_notes.map(normalizeDailyNote) : [],
    board_cards: Array.isArray(s.board_cards) ? s.board_cards.map(normalizeBoardCard) : [],
    board_links: Array.isArray(s.board_links) ? s.board_links.map(normalizeBoardLink) : [],
  };
}

function slugifyTypeKey(value) {
  const raw = String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const slug = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 44);
  return slug || `tipo-${Date.now()}`;
}
function normalizeEventType(t) {
  const fallback = DEFAULT_EVENT_TYPES.find(x => x.key === (t.key || t.type || t.id)) || DEFAULT_EVENT_TYPES.find(x => x.key === 'otro');
  const key = slugifyTypeKey(t.key || t.type || t.label || fallback?.key || 'otro');
  const color = COLORS[t.color] ? t.color : (COLORS[fallback?.color] ? fallback.color : 'teal');
  const icon = EVENT_ICON_OPTIONS.some(i => i.value === t.icon) ? t.icon : (fallback?.icon || 'fa-circle');
  return {
    id: t.id || uid('et'),
    key,
    label: t.label || fallback?.label || key,
    color,
    icon,
    archived: Boolean(t.archived),
    sort_order: Number.isFinite(Number(t.sort_order)) ? Number(t.sort_order) : 100,
    created_at: t.created_at || new Date().toISOString(),
    updated_at: t.updated_at || new Date().toISOString()
  };
}
function mergeEventTypes(list) {
  const map = new Map();
  DEFAULT_EVENT_TYPES.forEach(t => map.set(t.key, normalizeEventType({ ...t, id: `default-${t.key}` })));
  if (Array.isArray(list)) list.map(normalizeEventType).forEach(t => map.set(t.key, t));
  return [...map.values()].sort((a, b) => (a.sort_order - b.sort_order) || a.label.localeCompare(b.label));
}

function ensureAtLeastOneEventType(list) {
  const normalized = Array.isArray(list) ? list.map(normalizeEventType) : [];
  if (normalized.some(t => !t.archived)) return normalized.sort((a,b) => (a.sort_order - b.sort_order) || a.label.localeCompare(b.label));
  return mergeEventTypes([]);
}

function activeEventTypes() {
  const list = (state.event_types || []).filter(t => !t.archived).sort((a,b) => (a.sort_order - b.sort_order) || a.label.localeCompare(b.label));
  return list.length ? list : mergeEventTypes([]).filter(t => !t.archived);
}
function eventTypeMeta(key) {
  const match = (state.event_types || []).find(t => t.key === key) || DEFAULT_EVENT_TYPES.find(t => t.key === key) || DEFAULT_EVENT_TYPES.find(t => t.key === 'otro');
  return normalizeEventType(match || { key: 'otro', label: 'Otro', color: 'teal', icon: 'fa-circle' });
}
function eventTypeColor(key) {
  return COLORS[eventTypeMeta(key).color] || COLORS.teal;
}

function normalizeProject(p) {
  return {
    id: p.id || uid('p'), name: p.name || 'Proyecto', description: p.description ?? p.desc ?? '', color: p.color || 'accent', archived: Boolean(p.archived),
    created_at: p.created_at || new Date().toISOString(), updated_at: p.updated_at || new Date().toISOString()
  };
}
function normalizeTask(t) {
  return {
    id: t.id || uid('t'), project_id: t.project_id ?? t.project ?? null, title: t.title || 'Tarea sin título', description: t.description ?? t.desc ?? '',
    status: t.status || 'pendiente', priority: t.priority || 'media', due_date: t.due_date ?? t.dueDate ?? null, end_date: t.end_date ?? t.endDate ?? t.due_date ?? t.dueDate ?? null,
    start_time: t.start_time || null, duration_min: t.duration_min ? Number(t.duration_min) : null,
    tag: t.tag || 'blue', context: t.context || 'pc', energy: t.energy || 'media', repeat_rule: t.repeat_rule || 'none', sort_order: Number(t.sort_order || 0),
    completed_at: t.completed_at || null, created_at: t.created_at || t.createdAt || new Date().toISOString(), updated_at: t.updated_at || new Date().toISOString()
  };
}
function normalizeEvent(e) {
  return {
    id: e.id || uid('e'), project_id: e.project_id || null, title: e.title || 'Evento', notes: e.notes || '', event_date: e.event_date || e.date || todayStr(),
    start_time: e.start_time || e.time || null, end_time: e.end_time || null, type: e.type || 'otro', location: e.location || '',
    created_at: e.created_at || new Date().toISOString(), updated_at: e.updated_at || new Date().toISOString()
  };
}
function normalizeDailyNote(n) {
  return {
    id: n.id || uid('n'), note_date: n.note_date || todayStr(), plan: n.plan || '', blockers: n.blockers || '', wins: n.wins || '',
    created_at: n.created_at || new Date().toISOString(), updated_at: n.updated_at || new Date().toISOString()
  };
}
function normalizeBoardCard(c) {
  return {
    id: c.id || uid('bc'), title: c.title || 'Tarjeta', text: c.text || '', category: c.category || 'idea', color: c.color || 'blue',
    x: Number.isFinite(Number(c.x)) ? Number(c.x) : 120, y: Number.isFinite(Number(c.y)) ? Number(c.y) : 120,
    width: Number(c.width || 240), height: Number(c.height || 150), created_at: c.created_at || new Date().toISOString(), updated_at: c.updated_at || new Date().toISOString()
  };
}
function normalizeBoardLink(l) {
  return {
    id: l.id || uid('bl'),
    source_id: l.source_id || l.from || null,
    target_id: l.target_id || l.to || null,
    label: l.label || '',
    color: LINK_COLORS[l.color] ? l.color : 'accent',
    created_at: l.created_at || new Date().toISOString(),
    updated_at: l.updated_at || new Date().toISOString()
  };
}

const api = {
  async init() {
    if (HAS_SUPABASE) {
      sb = window.supabase.createClient(CONFIG.SUPABASE_URL.trim(), getSupabasePublicKey(), {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      });
      const { data, error } = await sb.auth.getSession();
      if (error) throw error;
      currentUser = data.session?.user || null;
      sb.auth.onAuthStateChange(async (_event, session) => {
        const nextUser = session?.user || null;
        const changed = nextUser?.id !== currentUser?.id;
        currentUser = nextUser;
        if (currentUser && changed) await bootstrapApp();
        else if (!currentUser) showAuth();
      });
    }
  },
  async signIn(email, password, mode) {
    if (!HAS_SUPABASE) throw new Error(supabaseConfigMessage());
    const redirectTo = window.location.href.split('#')[0];
    if (mode === 'signup') return sb.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo } });
    return sb.auth.signInWithPassword({ email, password });
  },
  async logout() {
    if (HAS_SUPABASE && currentUser) await sb.auth.signOut();
    currentUser = null;
    dataMode = HAS_SUPABASE ? 'supabase' : 'local';
    showAuth();
  },
  async loadAll() {
    if (dataMode !== 'supabase' || !currentUser) return;
    const [projects, tasks, events, eventTypes, notes, boardCards, boardLinks] = await Promise.all([
      sb.from('projects').select('*').order('created_at', { ascending: true }),
      sb.from('tasks').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      sb.from('events').select('*').order('event_date', { ascending: true }).order('start_time', { ascending: true }),
      sb.from('event_types').select('*').order('sort_order', { ascending: true }).order('label', { ascending: true }),
      sb.from('daily_notes').select('*').order('note_date', { ascending: false }),
      sb.from('board_cards').select('*').order('created_at', { ascending: true }),
      sb.from('board_links').select('*').order('created_at', { ascending: true }),
    ]);
    for (const res of [projects, tasks, events, eventTypes, notes, boardCards, boardLinks]) if (res.error) throw res.error;
    state = normalizeState({ projects: projects.data, tasks: tasks.data, events: events.data, event_types: eventTypes.data, daily_notes: notes.data, board_cards: boardCards.data, board_links: boardLinks.data });
    if (state.projects.length === 0) await seedDefaultProjects();
    if (!eventTypes.data || eventTypes.data.length === 0) await seedDefaultEventTypes();
    saveLocalState();
  },
  async upsert(table, record) {
    const clean = stripClientOnly(record);
    if (dataMode === 'supabase' && currentUser) {
      clean.user_id = currentUser.id;
      const { data, error } = await sb.from(table).upsert(clean).select().single();
      if (error) throw error;
      return data;
    }
    saveLocalState();
    return record;
  },
  async remove(table, id) {
    if (dataMode === 'supabase' && currentUser) {
      const { error } = await sb.from(table).delete().eq('id', id);
      if (error) throw error;
    }
    saveLocalState();
  },
  async bulkUpsert(table, records) {
    if (!records.length) return records;
    if (dataMode === 'supabase' && currentUser) {
      const payload = records.map(r => ({ ...stripClientOnly(r), user_id: currentUser.id }));
      const { data, error } = await sb.from(table).upsert(payload).select();
      if (error) throw error;
      return data;
    }
    saveLocalState();
    return records;
  }
};
function stripClientOnly(record) {
  const clone = { ...record };
  delete clone.user;
  return clone;
}

async function seedDefaultProjects() {
  const defaults = getDefaultState().projects;
  state.projects = defaults;
  await api.bulkUpsert('projects', defaults);
}
async function seedDefaultEventTypes() {
  const defaults = mergeEventTypes([]).map((t, i) => normalizeEventType({ ...t, id: uid('et'), sort_order: t.sort_order || ((i + 1) * 10) }));
  state.event_types = defaults;
  await api.bulkUpsert('event_types', defaults);
}

async function persist(table, record, collection) {
  record.updated_at = new Date().toISOString();
  try {
    const saved = await api.upsert(table, record);
    const idx = state[collection].findIndex(x => x.id === record.id);
    state[collection][idx >= 0 ? idx : state[collection].length] = normalizeByCollection(collection, saved);
    saveLocalState();
    renderAll();
  } catch (err) {
    console.error(err);
    updateSyncIndicator('error');
    toast(`Error guardando: ${err.message}`, 'error');
  }
}
function normalizeByCollection(collection, row) {
  if (collection === 'projects') return normalizeProject(row);
  if (collection === 'tasks') return normalizeTask(row);
  if (collection === 'events') return normalizeEvent(row);
  if (collection === 'event_types') return normalizeEventType(row);
  if (collection === 'board_cards') return normalizeBoardCard(row);
  if (collection === 'board_links') return normalizeBoardLink(row);
  return normalizeDailyNote(row);
}
async function removeRecord(table, id, collection) {
  try {
    await api.remove(table, id);
    state[collection] = state[collection].filter(x => x.id !== id);
    saveLocalState();
    renderAll();
  } catch (err) {
    console.error(err);
    updateSyncIndicator('error');
    toast(`Error eliminando: ${err.message}`, 'error');
  }
}

async function bootstrapApp() {
  $('auth-screen').classList.add('hidden');
  $('app-shell').classList.remove('hidden');
  if (dataMode === 'supabase' && currentUser) {
    try {
      await api.loadAll();
      toast('Datos sincronizados con Supabase', 'success');
    } catch (err) {
      console.error(err);
      toast(`No pude cargar Supabase: ${err.message}`, 'error');
    }
  }
  renderAll();
}
function showAuth() {
  if (!HAS_SUPABASE) {
    dataMode = 'local';
    bootstrapApp();
    return;
  }
  $('app-shell').classList.add('hidden');
  $('auth-screen').classList.remove('hidden');
  $('auth-sync-status').innerHTML = '<strong>Supabase activo.</strong> Ingresá o creá tu cuenta para sincronizar.';
}

function renderAll() {
  renderChrome();
  if (currentView === 'today') renderToday();
  if (currentView === 'board') renderBoard();
  if (currentView === 'calendar') renderCalendar();
  if (currentView === 'projects') renderProjects();
  if (currentView === 'notes') renderNotes();
}
function renderChrome() {
  const active = state.tasks.filter(isOpenTask);
  const dueToday = state.tasks.filter(t => taskOccursOn(t, todayStr()) && isOpenTask(t));
  $('badge-today').textContent = dueToday.length;
  $('badge-board').textContent = (state.board_cards || []).length;
  $('badge-projects').textContent = state.projects.filter(p => !p.archived).length;
  $('sync-mode-label').textContent = dataMode === 'supabase' ? 'Supabase' : 'Local';
  $('settings-sync-copy').textContent = dataMode === 'supabase' ? 'Sincronización Supabase activa con RLS por usuario.' : 'Modo local activo. Los datos se guardan en este navegador.';
  updateSyncIndicator();
  $('user-display-name').textContent = currentUser?.email?.split('@')[0] || 'UMI';
  $('user-avatar').textContent = (currentUser?.email || 'Y')[0].toUpperCase();
  $('auth-setting-card').classList.toggle('hidden', dataMode !== 'supabase');
  renderProjectSelects();
  renderSidebarProjects();
  updateTopbar();
}

function updateSyncIndicator(status = null) {
  const pill = $('sync-indicator');
  if (!pill) return;
  const mode = status || dataMode;
  const label = mode === 'supabase' ? 'Supabase' : mode === 'error' ? 'Error' : 'Local';
  pill.className = `sync-pill ${mode === 'supabase' ? 'supabase' : mode === 'error' ? 'error' : 'local'}`;
  pill.innerHTML = `<span></span><strong>${label}</strong>`;
  pill.title = mode === 'supabase'
    ? 'Sincronización Supabase activa.'
    : mode === 'error'
      ? 'Hubo un problema de sincronización. Revisá el último aviso.'
      : 'Modo local: datos guardados en este navegador.';
}

function updateTopbar() {
  const titles = { today: 'Hoy', board: 'Tablero', calendar: 'Calendario', projects: 'Proyectos', notes: 'Cierre diario' };
  $('topbar-title').textContent = titles[currentView] || 'Agenda';
  const subs = {
    today: fmtLong(todayStr()),
    board: `${(state.board_cards || []).length} tarjetas · ${(state.board_links || []).length} conexiones`,
    calendar: monthLabel(calendarCursor),
    projects: `${state.projects.filter(p => !p.archived).length} proyectos activos`,
    notes: 'Plan, bloqueos y cierre operativo',
  };
  $('topbar-sub').textContent = subs[currentView] || '';
}
function getProjectMetrics(projectId) {
  const tasks = state.tasks.filter(t => t.project_id === projectId);
  const events = state.events.filter(e => e.project_id === projectId);
  const doneTasks = tasks.filter(t => t.status === 'completado');
  const openTasks = tasks.filter(isOpenTask);
  const pastEvents = events.filter(e => e.event_date && e.event_date < todayStr());
  const upcomingEvents = events.filter(e => e.event_date && e.event_date >= todayStr());
  const totalItems = tasks.length + events.length;
  const resolvedItems = doneTasks.length + pastEvents.length;
  const pct = totalItems ? Math.round(resolvedItems * 100 / totalItems) : 0;
  const nextEvent = upcomingEvents.slice().sort((a,b) => `${a.event_date || '9999'} ${a.start_time || '99:99'}`.localeCompare(`${b.event_date || '9999'} ${b.start_time || '99:99'}`))[0] || null;
  return { tasks, events, doneTasks, openTasks, pastEvents, upcomingEvents, totalItems, resolvedItems, pct, nextEvent };
}

function renderSidebarProjects() {
  const items = state.projects.filter(p => !p.archived).map(p => {
    const m = getProjectMetrics(p.id);
    const count = m.openTasks.length + m.upcomingEvents.length;
    return `<button class="nav-item project-filter" data-project-id="${p.id}" title="${m.openTasks.length} tareas abiertas · ${m.upcomingEvents.length} eventos próximos">
      <span class="project-dot" style="background:${COLORS[p.color] || COLORS.accent}"></span>
      <span>${escapeHTML(p.name)}</span><span class="nav-badge">${count}</span>
    </button>`;
  }).join('');
  $('sidebar-projects').innerHTML = items || '<div class="empty-state" style="padding:10px"><p>Sin proyectos</p></div>';
}
function renderProjectSelects() {
  const activeProjects = state.projects.filter(p => !p.archived);
  const options = '<option value="">Sin proyecto</option>' + activeProjects.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
  ['task-project', 'event-project'].forEach(id => { if ($(id)) $(id).innerHTML = options; });
  const filterOptions = '<option value="">Todos los proyectos</option>' + activeProjects.map(p => `<option value="${p.id}">${escapeHTML(p.name)}</option>`).join('');
  const currentFilter = $('filter-project')?.value || '';
  if ($('filter-project')) { $('filter-project').innerHTML = filterOptions; $('filter-project').value = currentFilter; }
  if ($('task-status')) $('task-status').innerHTML = STATUS_COLUMNS.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
  renderEventTypeControls();
}

function renderEventTypeControls() {
  const types = activeEventTypes();
  const typeOptions = types.map(t => `<option value="${escapeHTML(t.key)}">${escapeHTML(t.label)}</option>`).join('');
  const current = $('event-type')?.value;
  if ($('event-type')) {
    $('event-type').innerHTML = typeOptions || '<option value="otro">Otro</option>';
    $('event-type').value = types.some(t => t.key === current) ? current : (types[0]?.key || 'otro');
  }
  if ($('event-type-icon')) {
    const curIcon = $('event-type-icon').value || 'fa-circle';
    $('event-type-icon').innerHTML = EVENT_ICON_OPTIONS.map(i => `<option value="${i.value}">${i.label}</option>`).join('');
    $('event-type-icon').value = EVENT_ICON_OPTIONS.some(i => i.value === curIcon) ? curIcon : 'fa-circle';
  }
  if ($('event-type-color')) {
    const curColor = $('event-type-color').value || 'blue';
    $('event-type-color').innerHTML = Object.entries(LINK_COLORS).map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
    $('event-type-color').value = COLORS[curColor] ? curColor : 'blue';
  }
  if ($('event-types-list')) renderEventTypesList();
}

function filteredTasks(tasks) {
  let list = [...tasks];
  const q = searchQuery.toLowerCase();
  if (q) list = list.filter(t => [t.title, t.description, projectName(t.project_id), t.context].join(' ').toLowerCase().includes(q));
  return list;
}
function sortTasks(a, b) {
  const prio = { alta: 0, media: 1, baja: 2 };
  if ((taskStartDate(a) || '9999') !== (taskStartDate(b) || '9999')) return (taskStartDate(a) || '9999').localeCompare(taskStartDate(b) || '9999');
  if ((taskEndDate(a) || '9999') !== (taskEndDate(b) || '9999')) return (taskEndDate(a) || '9999').localeCompare(taskEndDate(b) || '9999');
  if ((a.start_time || '99:99') !== (b.start_time || '99:99')) return (a.start_time || '99:99').localeCompare(b.start_time || '99:99');
  return (prio[a.priority] ?? 9) - (prio[b.priority] ?? 9) || (a.created_at || '').localeCompare(b.created_at || '');
}
function renderToday() {
  const today = todayStr();
  const open = state.tasks.filter(isOpenTask);
  const overdue = state.tasks.filter(isOverdue).sort(sortTasks);
  const todayTasksAll = state.tasks.filter(t => taskOccursOn(t, today)).sort(sortTasks);
  const todayOpen = todayTasksAll.filter(isOpenTask);
  const doneToday = state.tasks.filter(t => t.completed_at?.slice(0, 10) === today);
  const inProgress = state.tasks.filter(t => t.status === 'en-progreso');
  const focusPct = todayTasksAll.length ? Math.round((todayTasksAll.filter(t => t.status === 'completado').length / todayTasksAll.length) * 100) : 0;
  $('stat-overdue').textContent = overdue.length;
  $('stat-today').textContent = todayOpen.length;
  $('stat-active').textContent = open.length;
  $('stat-done-today').textContent = doneToday.length;
  $('focus-score-label').textContent = `${focusPct}%`;
  $('focus-ring').style.strokeDashoffset = String(106.8 - (106.8 * focusPct / 100));
  $('today-heading').textContent = capitalize(fmtLong(today).split(',')[0] || 'Hoy');
  $('today-summary').textContent = buildTodaySummary(overdue.length, todayOpen.length, inProgress.length, doneToday.length);

  let todayList = todayTasksAll;
  if (todayFilter === 'open') todayList = todayList.filter(isOpenTask);
  if (todayFilter === 'done') todayList = todayList.filter(t => t.status === 'completado');
  const urgent = overdue.slice(0, 6);
  const combined = todayFilter === 'open' ? [...urgent, ...todayList.filter(t => !urgent.some(u => u.id === t.id))] : todayList;
  renderTaskList($('today-task-list'), filteredTasks(combined), { showDate: true, empty: 'Sin tareas en esta vista. No inventes trabajo: si no hay, no hay.' });

  const dayEvents = state.events.filter(e => e.event_date === today).sort((a,b) => (a.start_time || '99:99').localeCompare(b.start_time || '99:99'));
  $('today-events').innerHTML = dayEvents.length ? `<div class="timeline">${dayEvents.map(eventRowHTML).join('')}</div>` : emptyState('fa-clock', 'Sin eventos hoy. Agenda limpia.');

  const next7 = addDays(today, 7);
  const upcoming = state.tasks.filter(t => taskStartDate(t) > today && taskStartDate(t) <= next7 && isOpenTask(t)).sort(sortTasks).slice(0, 8);
  renderTaskList($('upcoming-list'), filteredTasks(upcoming), { showDate: true, compact: true, empty: 'Sin próximas tareas en 7 días.' });
}
function buildTodaySummary(overdue, todayOpen, inProgress, done) {
  if (overdue > 0) return `Tenés ${overdue} vencida${overdue > 1 ? 's' : ''}. Eso es deuda operativa: primero liquidar, después sofisticar.`;
  if (todayOpen > 0) return `${todayOpen} tarea${todayOpen > 1 ? 's' : ''} para cerrar hoy. En progreso: ${inProgress}. Completadas hoy: ${done}.`;
  return `Día despejado. Buen momento para adelantar backlog o planificar mañana con criterio.`;
}
function capitalize(s) { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function renderTaskList(container, tasks, opts = {}) {
  if (!tasks.length) { container.innerHTML = emptyState('fa-check-circle', opts.empty || 'Sin tareas.'); return; }
  container.innerHTML = `<div class="task-list ${opts.compact ? 'compact' : ''}">${tasks.map(t => taskRowHTML(t, opts)).join('')}</div>`;
}
function taskRowHTML(t, opts = {}) {
  const done = t.status === 'completado';
  const overdue = isOverdue(t);
  const p = projectById(t.project_id);
  return `<div class="task-row" data-task-id="${t.id}">
    <button class="task-check ${done ? 'done' : ''}" data-action="toggle-task" data-task-id="${t.id}" title="Completar">${done ? '<i class="fas fa-check"></i>' : ''}</button>
    <div class="task-copy" data-action="edit-task" data-task-id="${t.id}">
      <div class="task-title ${done ? 'done' : ''}">${escapeHTML(t.title)}</div>
      <div class="task-meta">
        ${opts.showDate && taskStartDate(t) ? `<span class="badge ${overdue ? 'red' : 'amber'}"><i class="fas fa-calendar-day"></i>${taskRangeLabel(t)}</span>` : ''}
        ${t.start_time ? `<span><i class="fas fa-clock"></i> ${approxTime(t.start_time)}</span>` : ''}
        ${t.duration_min ? `<span>${t.duration_min}m</span>` : ''}
        ${p ? `<span class="badge" style="color:${projectColor(t.project_id)};background:${projectBg(t.project_id)}">${escapeHTML(p.name)}</span>` : ''}
        <span>${escapeHTML(STATUS_LABEL[t.status] || t.status)}</span>
        ${t.repeat_rule && t.repeat_rule !== 'none' ? `<span class="badge green"><i class="fas fa-rotate"></i>${repeatLabel(t.repeat_rule)}</span>` : ''}
        ${overdue ? `<span class="badge red">Vencida</span>` : ''}${taskSpansMultipleDays(t) ? `<span class="badge" style="color:${taskColor(t)};background:${taskBg(t)}"><i class="fas fa-arrows-left-right-to-line"></i>Multidía</span>` : ''}
      </div>
    </div>
    <div class="task-actions">
      <div class="priority-bars ${t.priority}" title="Prioridad: ${t.priority}"><span></span><span></span><span></span></div>
      <button class="icon-btn" data-action="edit-task" data-task-id="${t.id}" title="Editar"><i class="fas fa-pen"></i></button>
    </div>
  </div>`;
}
function repeatLabel(value) { return ({ daily: 'Diaria', weekly: 'Semanal', monthly: 'Mensual' })[value] || value; }
function eventRowHTML(e) {
  const type = eventTypeMeta(e.type);
  const color = eventTypeColor(e.type);
  return `<div class="event-row" data-action="edit-event" data-event-id="${e.id}">
    <div class="event-time">${approxRange(e.start_time, e.end_time) || '—'}</div>
    <div>
      <div class="event-card-title">${escapeHTML(e.title)}</div>
      <div class="event-card-meta"><i class="fas ${type.icon}" style="color:${color}"></i> ${escapeHTML(type.label)}${e.location ? ` · ${escapeHTML(e.location)}` : ''}</div>
    </div>
    <span class="dot" style="background:${color}"></span>
  </div>`;
}
function emptyState(icon, text) { return `<div class="empty-state"><i class="fas ${icon}"></i><p>${escapeHTML(text)}</p></div>`; }

function renderBoard() {
  const project = $('filter-project').value;
  const priority = $('filter-priority').value;
  const context = $('filter-context').value;
  let list = filteredTasks(state.tasks);
  if (project) list = list.filter(t => t.project_id === project);
  if (priority) list = list.filter(t => t.priority === priority);
  if (context) list = list.filter(t => t.context === context);
  $('board').innerHTML = STATUS_COLUMNS.map(col => {
    const colTasks = list.filter(t => t.status === col.id).sort(sortTasks);
    return `<section class="kanban-col" data-status="${col.id}">
      <header class="col-header"><span class="col-stripe" style="background:${col.color}"></span><span class="col-name" style="color:${col.color}">${col.name}</span><span class="col-count">${colTasks.length}</span></header>
      <div class="col-dropzone" data-drop-status="${col.id}">${colTasks.map(kanbanCardHTML).join('') || '<div class="empty-state"><p>Sin tarjetas</p></div>'}</div>
      <button class="col-add" data-action="new-task-status" data-status="${col.id}">+ Agregar</button>
    </section>`;
  }).join('');
}
function kanbanCardHTML(t) {
  const p = projectById(t.project_id);
  const overdue = isOverdue(t);
  return `<article class="kanban-card" draggable="true" data-task-id="${t.id}" data-action="edit-task">
    <div class="card-top">
      <span class="badge" style="color:${taskColor(t)};background:${taskBg(t)}">${escapeHTML(t.tag || 'general')}</span>
      ${p ? `<span class="badge" style="color:${projectColor(t.project_id)};background:${projectBg(t.project_id)}">${escapeHTML(p.name)}</span>` : ''}
      ${overdue ? `<span class="badge red">Vencida</span>` : ''}${taskSpansMultipleDays(t) ? `<span class="badge" style="color:${taskColor(t)};background:${taskBg(t)}"><i class="fas fa-arrows-left-right-to-line"></i>Multidía</span>` : ''}
    </div>
    <div class="card-title">${escapeHTML(t.title)}</div>
    ${t.description ? `<div class="card-desc">${escapeHTML(t.description).slice(0, 120)}${t.description.length > 120 ? '…' : ''}</div>` : ''}
    <footer class="card-footer">
      <div class="priority-bars ${t.priority}"><span></span><span></span><span></span></div>
      ${t.context ? `<span class="badge">${contextIcon(t.context)} ${escapeHTML(t.context)}</span>` : ''}
      ${taskStartDate(t) ? `<span class="date" style="${overdue ? 'color:var(--red)' : ''}">${taskRangeLabel(t)}</span>` : ''}
    </footer>
  </article>`;
}
function contextIcon(ctx) { return ({ pc:'💻', telefono:'☎', calle:'↗', casa:'⌂', oficina:'▣', otro:'•' })[ctx] || '•'; }

function renderCalendar() {
  $('calendar-label').textContent = monthLabel(calendarCursor);
  const year = calendarCursor.getFullYear();
  const month = calendarCursor.getMonth();
  const first = new Date(year, month, 1);
  let start = first.getDay() - 1;
  if (start < 0) start = 6;
  const total = new Date(year, month + 1, 0).getDate();
  const prevTotal = new Date(year, month, 0).getDate();
  const days = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  let html = days.map(d => `<div class="cal-dayname">${d}</div>`).join('');
  for (let i = 0; i < start; i++) html += `<div class="cal-cell other"><div class="cal-date">${prevTotal - start + 1 + i}</div></div>`;
  for (let d = 1; d <= total; d++) {
    const date = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const events = state.events.filter(e => e.event_date === date).sort((a,b) => (a.start_time || '').localeCompare(b.start_time || ''));
    const tasks = state.tasks.filter(t => taskOccursOn(t, date) && isOpenTask(t)).sort(sortTasks);
    const hasMany = (events.length + tasks.length) > 4 ? 'has-many' : '';
    html += `<div class="cal-cell ${date === todayStr() ? 'today' : ''} ${hasMany}" data-action="date-click" data-date="${date}">
      <div class="cal-date">${d}</div>
      ${events.map(calEventChip).join('')}
      ${tasks.map(t => calTaskChip(t, date)).join('')}
    </div>`;
  }
  const cells = start + total;
  const remaining = cells % 7 ? 7 - (cells % 7) : 0;
  for (let i = 1; i <= remaining; i++) html += `<div class="cal-cell other"><div class="cal-date">${i}</div></div>`;
  $('calendar-grid').innerHTML = html;
  updateTopbar();
}
function calEventChip(e) {
  const color = eventTypeColor(e.type);
  const label = `${e.start_time ? `${approxTime(e.start_time)} ` : ''}${escapeHTML(e.title)}`;
  return `<span class="cal-chip cal-chip-event" draggable="true" data-cal-kind="event" data-event-id="${e.id}" data-action="edit-event" title="Click para editar · Arrastrar para mover" style="color:${color};background:${hexToBg(color)}"><i class="fas fa-calendar-day"></i> ${label}</span>`;
}
function calTaskChip(t, date) {
  const color = taskColor(t);
  const start = taskStartDate(t);
  const end = taskEndDate(t);
  const segment = start === end ? 'range-single' : date === start ? 'range-start' : date === end ? 'range-end' : 'range-middle';
  const tip = taskSpansMultipleDays(t)
    ? `Click para editar · Arrastrar para mover bloque completo · ${taskRangeLabel(t)}`
    : 'Click para editar · Arrastrar para mover · borrar fecha desde la tarea';
  return `<span class="cal-chip cal-chip-task ${segment}" draggable="true" data-cal-kind="task" data-task-id="${t.id}" data-action="edit-task" title="${tip}" style="color:${color};background:${hexToBg(color)}"><i class="fas fa-check-square"></i> ${date === start && t.start_time ? approxTimeHTML(t.start_time) + ' ' : ''}${escapeHTML(t.title)}</span>`;
}
function hexToBg(hex) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0,2),16), g = parseInt(clean.slice(2,4),16), b = parseInt(clean.slice(4,6),16);
  return `rgba(${r},${g},${b},.13)`;
}

function renderProjects() {
  const projects = state.projects.filter(p => !p.archived || searchQuery);
  if (!projects.length) { $('projects-grid').innerHTML = emptyState('fa-layer-group', 'Sin proyectos. Creá uno y bajá el caos a un tablero.'); return; }
  $('projects-grid').innerHTML = projects.map(p => {
    const m = getProjectMetrics(p.id);
    const color = COLORS[p.color] || COLORS.accent;
    const nextEventHTML = m.nextEvent ? `<div class="project-calendar-line"><i class="fas fa-calendar-day"></i><span>Próximo: ${fmtDate(m.nextEvent.event_date)}${m.nextEvent.start_time ? ' · ' + approxTime(m.nextEvent.start_time) : ''} · ${escapeHTML(m.nextEvent.title)}</span></div>` : '';
    return `<article class="project-card" data-action="edit-project" data-project-id="${p.id}">
      <div class="project-bar" style="background:${color}"></div>
      <div class="project-actions"><button class="icon-btn" data-action="project-to-board" data-project-id="${p.id}" title="Ver tablero"><i class="fas fa-columns"></i></button></div>
      <h4>${escapeHTML(p.name)}</h4>
      <p>${escapeHTML(p.description || 'Sin descripción')}</p>
      <div class="progress"><span style="width:${m.pct}%;background:${color}"></span></div>
      <div class="project-stats project-stats-grid">
        <span>${m.openTasks.length} tareas abiertas</span>
        <span>${m.doneTasks.length} tareas hechas</span>
        <span>${m.upcomingEvents.length} eventos próximos</span>
        <span>${m.pastEvents.length} eventos pasados</span>
        <span>${m.pct}% progreso global</span>
        ${p.archived ? '<span>Archivado</span>' : ''}
      </div>
      ${nextEventHTML}
    </article>`;
  }).join('');
}

function renderNotes() {
  const date = $('note-date').value || todayStr();
  $('note-date').value = date;
  const note = state.daily_notes.find(n => n.note_date === date);
  $('note-plan').value = note?.plan || '';
  $('note-blockers').value = note?.blockers || '';
  $('note-wins').value = note?.wins || '';
  const history = state.daily_notes.slice().sort((a,b) => b.note_date.localeCompare(a.note_date)).slice(0, 10);
  $('notes-history').innerHTML = history.length ? history.map(n => `<div class="note-history-card"><strong>${fmtDate(n.note_date, { day:'numeric', month:'long', year:'numeric' })}</strong><p>${escapeHTML(n.wins || n.plan || n.blockers || 'Sin contenido')}</p></div>`).join('') : emptyState('fa-pen-nib', 'Sin cierres guardados.');
}

function switchView(view) {
  currentView = view;
  $$('.view').forEach(v => v.classList.toggle('active', v.id === `view-${view}`));
  $$('.nav-item[data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $$('.bottom-item').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  $('sidebar').classList.remove('open');
  renderAll();
}

function openModal(id) { $(id).classList.add('open'); $(id).setAttribute('aria-hidden', 'false'); }
function closeModal(id) { $(id).classList.remove('open'); $(id).setAttribute('aria-hidden', 'true'); }
function resetTaskForm(defaults = {}) {
  $('task-id').value = defaults.id || '';
  $('task-modal-title').textContent = defaults.id ? 'Editar tarea' : 'Nueva tarea';
  $('task-title').value = defaults.title || '';
  $('task-description').value = defaults.description || '';
  $('task-status').value = defaults.status || 'pendiente';
  $('task-priority').value = defaults.priority || 'media';
  $('task-project').value = defaults.project_id || '';
  $('task-due-date').value = defaults.due_date || todayStr();
  $('task-end-date').value = defaults.end_date || defaults.due_date || todayStr();
  $('task-start-time').value = defaults.start_time || '';
  $('task-duration').value = defaults.duration_min || '';
  $('task-repeat').value = defaults.repeat_rule || 'none';
  $('task-context').value = defaults.context || 'pc';
  $('task-energy').value = defaults.energy || 'media';
  $('task-tag').value = defaults.tag || 'blue';
  $('btn-delete-task').classList.toggle('hidden', !defaults.id);
  $('btn-clear-task-date')?.classList.toggle('hidden', !defaults.id && !defaults.due_date && !defaults.end_date);
}
function openTaskModal(taskOrDefaults = {}) { resetTaskForm(taskOrDefaults); openModal('modal-task'); setTimeout(() => $('task-title').focus(), 50); }
function editTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (task) openTaskModal(task);
}
function resetEventForm(defaults = {}) {
  renderEventTypeControls();
  $('event-id').value = defaults.id || '';
  $('event-modal-title').textContent = defaults.id ? 'Editar evento' : 'Nuevo evento';
  $('event-title').value = defaults.title || '';
  $('event-date').value = defaults.event_date || todayStr();
  $('event-start-time').value = defaults.start_time || '';
  $('event-end-time').value = defaults.end_time || '';
  const selectedType = defaults.type || activeEventTypes()[0]?.key || 'otro';
  if (!$(`event-type`).querySelector(`option[value="${CSS.escape(selectedType)}"]`)) {
    const meta = eventTypeMeta(selectedType);
    $('event-type').insertAdjacentHTML('beforeend', `<option value="${escapeHTML(selectedType)}">${escapeHTML(meta.label)} (inactivo)</option>`);
  }
  $('event-type').value = selectedType;
  $('event-project').value = defaults.project_id || '';
  $('event-location').value = defaults.location || '';
  $('event-notes').value = defaults.notes || '';
  $('btn-delete-event').classList.toggle('hidden', !defaults.id);
}
function openEventModal(defaults = {}) { resetEventForm(defaults); openModal('modal-event'); setTimeout(() => $('event-title').focus(), 50); }
function editEvent(id) { const event = state.events.find(e => e.id === id); if (event) openEventModal(event); }
function resetProjectForm(defaults = {}) {
  $('project-id').value = defaults.id || '';
  $('project-modal-title').textContent = defaults.id ? 'Editar proyecto' : 'Nuevo proyecto';
  $('project-name').value = defaults.name || '';
  $('project-description').value = defaults.description || '';
  $('project-color').value = defaults.color || 'accent';
  $('project-archived').value = String(Boolean(defaults.archived));
  $('btn-delete-project').classList.toggle('hidden', !defaults.id);
}
function openProjectModal(defaults = {}) { resetProjectForm(defaults); openModal('modal-project'); setTimeout(() => $('project-name').focus(), 50); }
function editProject(id) { const project = state.projects.find(p => p.id === id); if (project) openProjectModal(project); }

async function saveTaskFromForm(event) {
  event.preventDefault();
  const id = $('task-id').value || uid('t');
  const existing = state.tasks.find(t => t.id === id);
  const startDate = $('task-due-date').value || null;
  let endDate = $('task-end-date').value || startDate || null;
  if (startDate && endDate && endDate < startDate) endDate = startDate;
  const task = normalizeTask({
    ...(existing || {}), id,
    title: $('task-title').value.trim(), description: $('task-description').value.trim(), status: $('task-status').value,
    priority: $('task-priority').value, project_id: $('task-project').value || null, due_date: startDate, end_date: endDate,
    start_time: $('task-start-time').value || null, duration_min: $('task-duration').value || null, repeat_rule: $('task-repeat').value,
    context: $('task-context').value, energy: $('task-energy').value, tag: $('task-tag').value,
    completed_at: $('task-status').value === 'completado' ? (existing?.completed_at || new Date().toISOString()) : null,
    created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString()
  });
  if (!task.title) return toast('La tarea necesita título.', 'error');
  await persist('tasks', task, 'tasks');
  closeModal('modal-task');
  toast('Tarea guardada', 'success');
}
async function saveEventFromForm(event) {
  event.preventDefault();
  const id = $('event-id').value || uid('e');
  const existing = state.events.find(e => e.id === id);
  const item = normalizeEvent({
    ...(existing || {}), id, title: $('event-title').value.trim(), event_date: $('event-date').value,
    start_time: $('event-start-time').value || null, end_time: $('event-end-time').value || null, type: $('event-type').value,
    project_id: $('event-project').value || null, location: $('event-location').value.trim(), notes: $('event-notes').value.trim(),
    created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString()
  });
  if (!item.title || !item.event_date) return toast('El evento necesita título y fecha.', 'error');
  await persist('events', item, 'events');
  closeModal('modal-event');
  toast('Evento guardado', 'success');
}
async function saveProjectFromForm(event) {
  event.preventDefault();
  const id = $('project-id').value || uid('p');
  const existing = state.projects.find(p => p.id === id);
  const item = normalizeProject({
    ...(existing || {}), id, name: $('project-name').value.trim(), description: $('project-description').value.trim(),
    color: $('project-color').value, archived: $('project-archived').value === 'true',
    created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString()
  });
  if (!item.name) return toast('El proyecto necesita nombre.', 'error');
  await persist('projects', item, 'projects');
  closeModal('modal-project');
  toast('Proyecto guardado', 'success');
}

function renderEventTypesList() {
  const container = $('event-types-list');
  if (!container) return;
  const types = (state.event_types || []).slice().sort((a,b) => (a.sort_order - b.sort_order) || a.label.localeCompare(b.label));
  container.innerHTML = types.map(t => {
    const color = COLORS[t.color] || COLORS.teal;
    const uses = state.events.filter(e => e.type === t.key).length;
    return `<div class="event-type-row ${t.archived ? 'archived' : ''}">
      <div class="event-type-preview" style="color:${color};background:${hexToBg(color)}"><i class="fas ${t.icon}"></i></div>
      <div class="event-type-copy"><strong>${escapeHTML(t.label)}</strong><span>${escapeHTML(t.key)} · ${uses} eventos${t.archived ? ' · oculto' : ''}</span></div>
      <button class="icon-btn" data-action="edit-event-type" data-type-key="${escapeHTML(t.key)}" title="Editar tipo"><i class="fas fa-pen"></i></button>
      <button class="icon-btn" data-action="toggle-event-type" data-type-key="${escapeHTML(t.key)}" title="${t.archived ? 'Mostrar' : 'Ocultar'}"><i class="fas ${t.archived ? 'fa-eye' : 'fa-eye-slash'}"></i></button>
      <button class="icon-btn danger" data-action="delete-event-type" data-type-key="${escapeHTML(t.key)}" title="Eliminar"><i class="fas fa-trash"></i></button>
    </div>`;
  }).join('') || emptyState('fa-tags', 'Sin tipos configurados. Agregá al menos uno.');
}
function openEventTypeModal(type = null) {
  const isEdit = Boolean(type);
  $('event-type-modal-title').textContent = isEdit ? 'Editar tipo' : 'Nuevo tipo';
  $('event-type-id').value = type?.id || '';
  $('event-type-original-key').value = type?.key || '';
  $('event-type-label').value = type?.label || '';
  $('event-type-key').value = type?.key || '';
  $('event-type-key').disabled = isEdit;
  $('event-type-color').value = type?.color || 'blue';
  $('event-type-icon').value = type?.icon || 'fa-circle';
  $('event-type-archived').value = String(Boolean(type?.archived));
  $('event-type-sort').value = type?.sort_order || nextEventTypeSortOrder();
  $('btn-delete-event-type').classList.toggle('hidden', !isEdit);
  openModal('modal-event-type');
  setTimeout(() => $('event-type-label')?.focus(), 60);
}
function nextEventTypeSortOrder() {
  return Math.max(0, ...(state.event_types || []).map(t => Number(t.sort_order || 0))) + 10;
}
async function saveEventTypeFromForm(event) {
  event.preventDefault();
  const id = $('event-type-id').value || uid('et');
  const originalKey = $('event-type-original-key').value;
  const existing = state.event_types.find(t => t.id === id || t.key === originalKey);
  const label = $('event-type-label').value.trim();
  const key = existing?.key || slugifyTypeKey($('event-type-key').value || label);
  if (!label) return toast('El tipo necesita nombre.', 'error');
  const duplicate = state.event_types.find(t => t.key === key && t.id !== id && t.key !== originalKey);
  if (duplicate) return toast('Ya existe un tipo con esa clave.', 'error');
  const item = normalizeEventType({
    ...(existing || {}),
    id,
    key,
    label,
    color: $('event-type-color').value,
    icon: $('event-type-icon').value,
    archived: $('event-type-archived').value === 'true',
    sort_order: Number($('event-type-sort').value || nextEventTypeSortOrder()),
    created_at: existing?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString()
  });
  await persist('event_types', item, 'event_types');
  closeModal('modal-event-type');
  toast('Tipo guardado', 'success');
}
async function toggleEventType(key) {
  const type = state.event_types.find(t => t.key === key);
  if (!type) return;
  if (!type.archived && activeEventTypes().length <= 1) return toast('Debe quedar al menos un tipo activo.', 'error');
  type.archived = !type.archived;
  await persist('event_types', type, 'event_types');
  toast(type.archived ? 'Tipo ocultado' : 'Tipo activado', 'success');
}
async function deleteEventType(key, { confirmDelete = true } = {}) {
  const type = state.event_types.find(t => t.key === key);
  if (!type) return;
  if (activeEventTypes().filter(t => t.key !== key).length === 0) return toast('No podés eliminar el último tipo activo.', 'error');
  const uses = state.events.filter(e => e.type === key);
  const fallback = activeEventTypes().find(t => t.key !== key)?.key || 'otro';
  const msg = uses.length
    ? `Este tipo tiene ${uses.length} evento(s). Se reasignarán a "${eventTypeMeta(fallback).label}". ¿Continuar?`
    : '¿Eliminar este tipo?';
  if (confirmDelete && !confirm(msg)) return;
  uses.forEach(e => { e.type = fallback; e.updated_at = new Date().toISOString(); });
  if (uses.length) await api.bulkUpsert('events', uses);
  await removeRecord('event_types', type.id, 'event_types');
  closeModal('modal-event-type');
  toast('Tipo eliminado', 'success');
}
function editEventTypeByKey(key) {
  const type = state.event_types.find(t => t.key === key);
  if (type) openEventTypeModal(type);
}

async function saveDailyNote(event) {
  event.preventDefault();
  const date = $('note-date').value || todayStr();
  const existing = state.daily_notes.find(n => n.note_date === date);
  const item = normalizeDailyNote({
    ...(existing || {}), id: existing?.id || uid('n'), note_date: date,
    plan: $('note-plan').value.trim(), blockers: $('note-blockers').value.trim(), wins: $('note-wins').value.trim(),
    created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString()
  });
  await persist('daily_notes', item, 'daily_notes');
  toast('Cierre diario guardado', 'success');
}
async function toggleTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  const wasOpen = task.status !== 'completado';
  task.status = wasOpen ? 'completado' : 'pendiente';
  task.completed_at = wasOpen ? new Date().toISOString() : null;
  await persist('tasks', task, 'tasks');
  if (wasOpen && task.repeat_rule && task.repeat_rule !== 'none') await createNextRecurringTask(task);
}
async function createNextRecurringTask(task) {
  if (!task.due_date) return;
  const nextDate = task.repeat_rule === 'daily' ? addDays(task.due_date, 1) : task.repeat_rule === 'weekly' ? addDays(task.due_date, 7) : addMonths(task.due_date, 1);
  const spanDays = taskEndDate(task) ? diffDays(task.due_date, taskEndDate(task)) : 0;
  const clone = normalizeTask({ ...task, id: uid('t'), status: 'pendiente', due_date: nextDate, end_date: shiftDate(nextDate, spanDays), completed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  state.tasks.push(clone);
  await api.upsert('tasks', clone);
  saveLocalState();
  toast(`Tarea recurrente creada para ${taskRangeLabel(clone)}`, 'success');
}

async function quickAdd(event) {
  event.preventDefault();
  const title = $('quick-title').value.trim();
  if (!title) return;
  const when = $('quick-when').value;
  const due = when === 'today' ? todayStr() : when === 'tomorrow' ? addDays(todayStr(), 1) : null;
  const task = normalizeTask({ id: uid('t'), title, status: 'pendiente', priority: $('quick-priority').value, due_date: due, end_date: due, tag: 'amber', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  state.tasks.push(task);
  await api.upsert('tasks', task);
  saveLocalState();
  $('quick-title').value = '';
  renderAll();
  toast('Capturado', 'success');
}

function handleDocumentClick(event) {
  const closeId = event.target.closest('[data-close]')?.dataset.close;
  if (closeId) return closeModal(closeId);
  const navView = event.target.closest('[data-view]')?.dataset.view;
  if (navView) return switchView(navView);
  const projectFilter = event.target.closest('.project-filter')?.dataset.projectId;
  if (projectFilter) { switchView('projects'); return; }
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'toggle-task') return toggleTask(actionEl.dataset.taskId);
  if (action === 'edit-task') return editTask(actionEl.dataset.taskId || actionEl.closest('[data-task-id]')?.dataset.taskId);
  if (action === 'edit-event') return editEvent(actionEl.dataset.eventId);
  if (action === 'edit-project') return editProject(actionEl.dataset.projectId);
  if (action === 'new-event-type') return openEventTypeModal();
  if (action === 'edit-event-type') return editEventTypeByKey(actionEl.dataset.typeKey);
  if (action === 'toggle-event-type') return toggleEventType(actionEl.dataset.typeKey);
  if (action === 'delete-event-type') return deleteEventType(actionEl.dataset.typeKey);
  if (action === 'manage-event-types') return openModal('modal-settings');
  if (action === 'project-to-board') { event.stopPropagation(); switchView('projects'); return; }
  if (action === 'set-time') { const target = $(actionEl.dataset.timeTarget); if (target) { target.value = actionEl.dataset.time || ''; target.dispatchEvent(new Event('change')); } return; }
  if (action === 'clear-time') { const target = $(actionEl.dataset.timeTarget); if (target) { target.value = ''; target.dispatchEvent(new Event('change')); } return; }
  if (action === 'new-task-status') return openTaskModal({ status: actionEl.dataset.status, due_date: todayStr() });
  if (action === 'date-click') {
    if (event.target.closest('.cal-chip')) return;
    return openEventModal({ event_date: actionEl.dataset.date });
  }
}
function setupDragAndDrop() {
  document.addEventListener('dragstart', (e) => {
    const calChip = e.target.closest('.cal-chip[data-cal-kind]');
    if (calChip) {
      draggedCalendarItem = {
        kind: calChip.dataset.calKind,
        id: calChip.dataset.taskId || calChip.dataset.eventId
      };
      calChip.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify(draggedCalendarItem));
      return;
    }
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    draggedTaskId = card.dataset.taskId;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  document.addEventListener('dragend', (e) => {
    e.target.closest('.kanban-card')?.classList.remove('dragging');
    e.target.closest('.cal-chip')?.classList.remove('dragging');
    $$('.col-dropzone').forEach(z => z.classList.remove('drag-over'));
    $$('.cal-cell').forEach(z => z.classList.remove('cal-drop-over'));
    draggedTaskId = null;
    draggedCalendarItem = null;
  });
  document.addEventListener('dragover', (e) => {
    const calCell = e.target.closest('.cal-cell[data-date]');
    if (calCell && draggedCalendarItem) {
      e.preventDefault();
      calCell.classList.add('cal-drop-over');
      return;
    }
    const zone = e.target.closest('.col-dropzone');
    if (!zone || !draggedTaskId) return;
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  document.addEventListener('dragleave', (e) => {
    e.target.closest('.col-dropzone')?.classList.remove('drag-over');
    e.target.closest('.cal-cell')?.classList.remove('cal-drop-over');
  });
  document.addEventListener('drop', async (e) => {
    const calCell = e.target.closest('.cal-cell[data-date]');
    if (calCell && draggedCalendarItem) {
      e.preventDefault();
      calCell.classList.remove('cal-drop-over');
      await moveCalendarItem(draggedCalendarItem, calCell.dataset.date);
      draggedCalendarItem = null;
      return;
    }
    const zone = e.target.closest('.col-dropzone');
    if (!zone || !draggedTaskId) return;
    e.preventDefault();
    zone.classList.remove('drag-over');
    const task = state.tasks.find(t => t.id === draggedTaskId);
    if (!task) return;
    task.status = zone.dataset.dropStatus;
    task.completed_at = task.status === 'completado' ? new Date().toISOString() : null;
    await persist('tasks', task, 'tasks');
  });
}

async function moveCalendarItem(item, newDate) {
  if (!item?.id || !newDate) return;
  if (item.kind === 'event') {
    const event = state.events.find(e => e.id === item.id);
    if (!event) return;
    if (event.event_date === newDate) return;
    event.event_date = newDate;
    event.updated_at = new Date().toISOString();
    await persist('events', event, 'events');
    toast(`Evento movido a ${fmtDate(newDate)}`, 'success');
    return;
  }
  if (item.kind === 'task') {
    const task = state.tasks.find(t => t.id === item.id);
    if (!task) return;
    if (task.due_date === newDate) return;
    const oldStart = task.due_date;
    const spanDays = diffDays(oldStart, taskEndDate(task));
    task.due_date = newDate;
    task.end_date = shiftDate(newDate, spanDays);
    task.updated_at = new Date().toISOString();
    await persist('tasks', task, 'tasks');
    toast(`Tarea movida a ${taskRangeLabel(task)}`, 'success');
  }
}

async function clearTaskDateFromModal() {
  const id = $('task-id').value;
  if (!id) {
    $('task-due-date').value = '';
    $('task-end-date').value = '';
    toast('Fecha quitada del formulario');
    return;
  }
  const task = state.tasks.find(t => t.id === id);
  if (!task) return;
  if (!task.due_date) {
    $('task-due-date').value = '';
    $('task-end-date').value = '';
    return toast('La tarea ya no tiene fecha.');
  }
  task.due_date = null;
  task.end_date = null;
  task.start_time = null;
  task.updated_at = new Date().toISOString();
  await persist('tasks', task, 'tasks');
  $('task-due-date').value = '';
  $('task-end-date').value = '';
  closeModal('modal-task');
  toast('Tarea quitada del calendario', 'success');
}

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `umi-backup-${todayStr()}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
async function importJSON(file) {
  if (!file) return;
  try {
    const text = await file.text();
    state = normalizeState(JSON.parse(text));
    saveLocalState();
    if (dataMode === 'supabase' && currentUser) {
      await api.bulkUpsert('projects', state.projects);
      await api.bulkUpsert('tasks', state.tasks);
      await api.bulkUpsert('events', state.events);
      await api.bulkUpsert('event_types', state.event_types);
      await api.bulkUpsert('daily_notes', state.daily_notes);
      await api.bulkUpsert('board_cards', state.board_cards);
      await api.bulkUpsert('board_links', state.board_links);
    }
    renderAll();
    toast('Backup importado', 'success');
  } catch (err) {
    toast(`Importación fallida: ${err.message}`, 'error');
  }
}

function bindEvents() {
  document.addEventListener('click', handleDocumentClick);
  $$('.modal-overlay').forEach(m => m.addEventListener('click', e => { if (e.target === m) closeModal(m.id); }));
  $('btn-new-task').addEventListener('click', () => openTaskModal({ due_date: todayStr() }));
  $('btn-board-new-card').addEventListener('click', () => openBoardCardModal());
  $('btn-board-link-mode').addEventListener('click', toggleBoardLinkMode);
  $('board-link-color')?.addEventListener('change', e => { boardCurrentLinkColor = e.target.value || 'accent'; toast(`Color de línea: ${LINK_COLORS[boardCurrentLinkColor] || boardCurrentLinkColor}`); });
  $('btn-board-starter')?.addEventListener('click', createStarterBoard);
  $('btn-board-help')?.addEventListener('click', () => openModal('modal-help'));
  $('btn-open-help-settings')?.addEventListener('click', () => openModal('modal-help'));
  $('btn-board-fit').addEventListener('click', autoArrangeBoard);
  $('board-card-form').addEventListener('submit', saveBoardCardFromForm);
  $('btn-delete-board-card').addEventListener('click', deleteBoardCardFromModal);
  $('btn-quick-add').addEventListener('click', () => { switchView('today'); setTimeout(() => $('quick-title').focus(), 50); });
  $('btn-new-event').addEventListener('click', () => openEventModal({ event_date: todayStr() }));
  $('btn-calendar-event').addEventListener('click', () => openEventModal({ event_date: todayStr() }));
  $('btn-new-project').addEventListener('click', () => openProjectModal());
  $('btn-sidebar-new-project').addEventListener('click', () => openProjectModal());
  $('btn-settings').addEventListener('click', () => openModal('modal-settings'));
  $('btn-toggle-sidebar').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('task-form').addEventListener('submit', saveTaskFromForm);
  $('event-form').addEventListener('submit', saveEventFromForm);
  $('event-type-form')?.addEventListener('submit', saveEventTypeFromForm);
  $('project-form').addEventListener('submit', saveProjectFromForm);
  $('daily-note-form').addEventListener('submit', saveDailyNote);
  $('quick-add-form').addEventListener('submit', quickAdd);
  $('btn-delete-task').addEventListener('click', async () => { const id = $('task-id').value; if (id && confirm('¿Eliminar esta tarea?')) { await removeRecord('tasks', id, 'tasks'); closeModal('modal-task'); } });
  $('btn-clear-task-date')?.addEventListener('click', clearTaskDateFromModal);
  $('btn-delete-event').addEventListener('click', async () => { const id = $('event-id').value; if (id && confirm('¿Eliminar este evento?')) { await removeRecord('events', id, 'events'); closeModal('modal-event'); } });
  $('btn-delete-event-type')?.addEventListener('click', () => { const key = $('event-type-original-key').value || $('event-type-key').value; if (key) deleteEventType(key); });
  $('btn-delete-project').addEventListener('click', async () => {
    const id = $('project-id').value;
    if (!id || !confirm('¿Eliminar proyecto? Las tareas quedarán sin proyecto.')) return;
    const now = new Date().toISOString();
    const orphanTasks = state.tasks.filter(t => t.project_id === id);
    const orphanEvents = state.events.filter(e => e.project_id === id);
    orphanTasks.forEach(t => { t.project_id = null; t.updated_at = now; });
    orphanEvents.forEach(e => { e.project_id = null; e.updated_at = now; });
    if (orphanTasks.length) await api.bulkUpsert('tasks', orphanTasks);
    if (orphanEvents.length) await api.bulkUpsert('events', orphanEvents);
    await removeRecord('projects', id, 'projects');
    closeModal('modal-project');
  });
  $('search-input').addEventListener('input', e => { searchQuery = e.target.value.trim(); renderAll(); });
  $$('[data-today-filter]').forEach(btn => btn.addEventListener('click', () => { todayFilter = btn.dataset.todayFilter; $$('[data-today-filter]').forEach(b => b.classList.toggle('active', b === btn)); renderToday(); }));
  $('cal-prev').addEventListener('click', () => { calendarCursor.setMonth(calendarCursor.getMonth() - 1); renderCalendar(); });
  $('cal-next').addEventListener('click', () => { calendarCursor.setMonth(calendarCursor.getMonth() + 1); renderCalendar(); });
  $('cal-today').addEventListener('click', () => { calendarCursor = new Date(); renderCalendar(); });
  $('note-date').addEventListener('change', renderNotes);
  $('btn-export-json').addEventListener('click', exportJSON);
  $('import-json').addEventListener('change', e => importJSON(e.target.files[0]));
  $('btn-logout').addEventListener('click', () => api.logout());
  $('btn-local-mode').addEventListener('click', () => { dataMode = 'local'; bootstrapApp(); });
  $('auth-form').addEventListener('submit', authSubmit);
  $$('.auth-tab').forEach(tab => tab.addEventListener('click', () => {
    $$('.auth-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    $('auth-submit').textContent = tab.dataset.authMode === 'signup' ? 'Crear cuenta' : 'Ingresar';
  }));
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      hideBoardContextMenu();
      if (boardLinkMode) setBoardLinkMode(false, null, { toastMessage: 'Conexión cancelada' });
      $$('.modal-overlay.open').forEach(m => closeModal(m.id));
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('search-input').focus(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); openTaskModal({ due_date: todayStr() }); }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); openModal('modal-help'); }
    handleBoardKeyboardShortcuts(e);
  });
  setupDragAndDrop();
}
async function authSubmit(event) {
  event.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const mode = document.querySelector('.auth-tab.active')?.dataset.authMode || 'login';
  const submit = $('auth-submit');
  submit.disabled = true;
  submit.textContent = mode === 'signup' ? 'Creando...' : 'Ingresando...';
  try {
    const { data, error } = await api.signIn(email, password, mode);
    if (error) throw error;
    if (mode === 'signup' && !data?.session) {
      toast('Cuenta creada. Si Supabase exige confirmación, validá el email y después ingresá.', 'success');
      return;
    }
    currentUser = data?.user || data?.session?.user || currentUser;
    dataMode = 'supabase';
    if (currentUser) await bootstrapApp();
    toast('Sesión iniciada', 'success');
  } catch (err) {
    const msg = err.message || String(err);
    toast(`Login Supabase falló: ${msg}`, 'error');
    $('auth-sync-status').innerHTML = `<strong>No pude autenticar.</strong> ${escapeHTML(msg)}<br><span>Checklist: config.js con Project URL + publishable key/anon key, SQL ejecutado, Email provider activo y Site URL configurado en Supabase.</span>`;
  } finally {
    submit.disabled = false;
    submit.textContent = mode === 'signup' ? 'Crear cuenta' : 'Ingresar';
  }
}

async function init() {
  bindEvents();
  $('note-date').value = todayStr();
  if (HAS_SUPABASE) {
    $('auth-sync-status').innerHTML = '<strong>Supabase configurado.</strong> Usá login para sincronizar tu agenda y tablero.';
    try {
      await api.init();
      if (currentUser) await bootstrapApp();
      else showAuth();
    } catch (err) {
      console.error(err);
      dataMode = 'local';
      await bootstrapApp();
      toast(`Supabase no inicializó: ${err.message}. Modo local activo.`, 'error');
    }
  } else {
    dataMode = 'local';
    await bootstrapApp();
    toast(supabaseConfigMessage(), SUPABASE_CONFIG_ERROR === 'missing' ? 'info' : 'error');
  }
}

init();

// ═══════════════════════════════════════════════
//  WORK CANVAS BOARD — tarjetas libres + conexiones
// ═══════════════════════════════════════════════
function boardCategoryMeta(category) {
  return {
    idea: { label: 'Idea', icon: 'fa-lightbulb' },
    task: { label: 'Tarea', icon: 'fa-check' },
    decision: { label: 'Decisión', icon: 'fa-code-branch' },
    note: { label: 'Nota', icon: 'fa-note-sticky' },
    blocker: { label: 'Bloqueo', icon: 'fa-triangle-exclamation' },
    process: { label: 'Proceso', icon: 'fa-route' },
    resource: { label: 'Recurso', icon: 'fa-paperclip' },
  }[category] || { label: 'Tarjeta', icon: 'fa-square' };
}
function renderBoard() {
  const canvas = $('work-canvas');
  if (!canvas) return;
  const cards = state.board_cards || [];
  canvas.innerHTML = cards.length ? cards.map(boardCardHTML).join('') : `<div class="canvas-empty"><i class="fas fa-diagram-project"></i><strong>Tablero vacío</strong><span>Arrastrá una plantilla desde arriba o creá una tarjeta. Esto no es Kanban: es tu mesa de trabajo visual.</span></div>`;
  renderBoardSelectionBar();
  requestAnimationFrame(renderBoardConnections);
  updateTopbar();
}
function boardCardHTML(card) {
  const meta = boardCategoryMeta(card.category);
  const color = COLORS[card.color] || COLORS.blue;
  const bg = COLOR_BG[card.color] || COLOR_BG.blue;
  const selected = selectedBoardCardId === card.id ? ' selected' : '';
  return `<article class="work-card${selected}" data-board-card-id="${card.id}" style="left:${card.x}px;top:${card.y}px;width:${card.width || 240}px;">
    <header class="work-card-head" data-board-drag-handle>
      <span class="work-card-type" style="color:${color};background:${bg}"><i class="fas ${meta.icon}"></i>${meta.label}</span>
      <button class="icon-btn mini" data-action="delete-board-link" data-card-id="${card.id}" title="Quitar conexiones"><i class="fas fa-unlink"></i></button>
    </header>
    <h4>${escapeHTML(card.title)}</h4>
    ${card.text ? `<p>${escapeHTML(card.text)}</p>` : '<p class="muted">Sin texto todavía.</p>'}
    <footer>
      <button class="chip-btn" data-action="edit-board-card" data-board-card-id="${card.id}"><i class="fas fa-pen"></i> Editar</button>
      <button class="chip-btn" data-action="start-board-link" data-board-card-id="${card.id}"><i class="fas fa-link"></i> Conectar</button>
    </footer>
  </article>`;
}

function renderBoardSelectionBar() {
  $$('.work-card').forEach(el => el.classList.toggle('selected', Boolean(selectedBoardCardId) && el.dataset.boardCardId === selectedBoardCardId));
  const bar = $('board-selection-bar');
  if (!bar) return;
  const card = selectedBoardCardId ? state.board_cards.find(c => c.id === selectedBoardCardId) : null;
  if (!card) {
    bar.classList.add('hidden');
    bar.innerHTML = '';
    return;
  }
  const meta = boardCategoryMeta(card.category);
  const incoming = state.board_links.filter(l => l.target_id === card.id).length;
  const outgoing = state.board_links.filter(l => l.source_id === card.id).length;
  bar.classList.remove('hidden');
  bar.innerHTML = `<div class="selected-copy"><strong>${escapeHTML(card.title)}</strong><span>${meta.label} · ${incoming} entrantes · ${outgoing} salientes</span></div>
    <button class="chip-btn" data-board-selection="edit"><i class="fas fa-pen"></i> Editar</button>
    <button class="chip-btn" data-board-selection="duplicate"><i class="fas fa-copy"></i> Duplicar</button>
    <button class="chip-btn" data-board-selection="connect"><i class="fas fa-link"></i> Conectar</button>
    <button class="chip-btn" data-board-selection="taskify"><i class="fas fa-list-check"></i> Tarea hoy</button>
    <button class="chip-btn" data-board-selection="clear"><i class="fas fa-xmark"></i> Limpiar</button>`;
}
async function handleBoardSelectionAction(action) {
  const card = selectedBoardCardId ? state.board_cards.find(c => c.id === selectedBoardCardId) : null;
  if (!card && action !== 'clear') return;
  if (action === 'edit') return openBoardCardModal(card);
  if (action === 'duplicate') return duplicateBoardCard(card.id);
  if (action === 'connect') return setBoardLinkMode(true, card.id, { toastMessage: 'Origen seleccionado. Ahora tocá la tarjeta destino.' });
  if (action === 'taskify') return createTaskFromBoardCard(card.id);
  if (action === 'clear') {
    selectedBoardCardId = null;
    setBoardLinkMode(false, null);
    renderBoard();
  }
}

function renderBoardConnections() {
  const svg = $('connection-layer');
  if (!svg) return;
  const width = 4200;
  const height = 2600;
  svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const links = (state.board_links || []).map(normalizeBoardLink);
  const usedColors = [...new Set(links.map(l => l.color || 'accent'))];
  const defs = usedColors.map(key => {
    const color = COLORS[key] || COLORS.accent;
    return `<marker id="arrow-${key}" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth"><path d="M0,0 L0,6 L9,3 z" fill="${color}" /></marker>`;
  }).join('');
  svg.innerHTML = `<defs>${defs}</defs>`;
  links.forEach(link => {
    const source = state.board_cards.find(c => c.id === link.source_id);
    const target = state.board_cards.find(c => c.id === link.target_id);
    if (!source || !target) return;
    const x1 = Number(source.x) + Number(source.width || 240) / 2;
    const y1 = Number(source.y) + Number(source.height || 150) / 2;
    const x2 = Number(target.x) + Number(target.width || 240) / 2;
    const y2 = Number(target.y) + Number(target.height || 150) / 2;
    const dx = Math.max(80, Math.abs(x2 - x1) * .35);
    const color = COLORS[link.color] || COLORS.accent;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`);
    path.setAttribute('class', 'connection-path');
    path.setAttribute('stroke', color);
    path.dataset.linkId = link.id;
    path.setAttribute('marker-end', `url(#arrow-${link.color || 'accent'})`);
    svg.appendChild(path);
  });
}
function openBoardCardModal(card = null) {
  const isEdit = Boolean(card);
  $('board-card-modal-title').textContent = isEdit ? 'Editar tarjeta' : 'Nueva tarjeta';
  $('board-card-id').value = card?.id || '';
  $('board-card-title').value = card?.title || '';
  $('board-card-text').value = card?.text || '';
  $('board-card-category').value = card?.category || 'idea';
  $('board-card-color').value = card?.color || 'blue';
  $('btn-delete-board-card').classList.toggle('hidden', !isEdit);
  openModal('modal-board-card');
  setTimeout(() => $('board-card-title')?.focus(), 60);
}
async function saveBoardCardFromForm(e) {
  e.preventDefault();
  const id = $('board-card-id').value || uid('bc');
  const existing = state.board_cards.find(c => c.id === id);
  const card = normalizeBoardCard({
    ...(existing || {}), id,
    title: $('board-card-title').value.trim(), text: $('board-card-text').value.trim(),
    category: $('board-card-category').value, color: $('board-card-color').value,
    x: existing?.x ?? 140, y: existing?.y ?? 120,
    created_at: existing?.created_at || new Date().toISOString(), updated_at: new Date().toISOString()
  });
  if (!card.title) return toast('La tarjeta necesita título', 'error');
  const idx = state.board_cards.findIndex(c => c.id === id);
  if (idx >= 0) state.board_cards[idx] = card; else state.board_cards.push(card);
  await persist('board_cards', card, 'board_cards');
  closeModal('modal-board-card');
}
async function deleteBoardCardFromModal() {
  const id = $('board-card-id').value;
  if (!id) return;
  await deleteBoardCard(id, { confirmDelete: true });
  closeModal('modal-board-card');
}
function setBoardLinkMode(active, sourceId = null, options = {}) {
  boardLinkMode = Boolean(active);
  boardLinkSourceId = boardLinkMode ? sourceId : null;
  const btn = $('btn-board-link-mode');
  const wrap = $('work-canvas-wrap');
  btn?.classList.toggle('active', boardLinkMode);
  if (btn) btn.innerHTML = boardLinkMode ? '<i class="fas fa-xmark"></i> Cancelar conexión' : '<i class="fas fa-link"></i> Conectar';
  wrap?.classList.toggle('link-mode', boardLinkMode);
  $$('.work-card').forEach(c => c.classList.toggle('link-source', boardLinkMode && sourceId && c.dataset.boardCardId === sourceId));
  const help = $('canvas-help');
  if (help) {
    help.innerHTML = boardLinkMode
      ? (sourceId ? 'Modo conexión activo: ahora tocá la tarjeta destino. <strong>Esc</strong> o click en el fondo para cancelar.' : 'Modo conexión activo: tocá una tarjeta origen y luego una destino. <strong>Esc</strong> o click en el fondo para cancelar.')
      : 'Arrastrá una plantilla al tablero. Mové las tarjetas libremente. Para conectar: elegí color, activá <strong>Conectar</strong>, tocá origen y destino.';
  }
  if (options.toastMessage) toast(options.toastMessage, options.toastType || 'info');
}
function toggleBoardLinkMode(force = null) {
  const next = force === null ? !boardLinkMode : Boolean(force);
  setBoardLinkMode(next, null, { toastMessage: next ? 'Modo conexión activo: tocá origen y destino.' : 'Modo conexión desactivado' });
}
async function createBoardLink(sourceId, targetId) {
  if (!sourceId || !targetId) return;
  if (sourceId === targetId) {
    setBoardLinkMode(false, null, { toastMessage: 'Conexión cancelada: origen y destino eran la misma tarjeta.' });
    return;
  }
  const exists = state.board_links.some(l => l.source_id === sourceId && l.target_id === targetId);
  if (exists) {
    setBoardLinkMode(false, null, { toastMessage: 'Esa conexión ya existe', toastType: 'error' });
    return;
  }
  const source = state.board_cards.find(c => c.id === sourceId);
  const linkColor = boardCurrentLinkColor || source?.color || 'accent';
  const link = normalizeBoardLink({ id: uid('bl'), source_id: sourceId, target_id: targetId, color: linkColor });
  state.board_links.push(link);
  await persist('board_links', link, 'board_links');
  setBoardLinkMode(false, null, { toastMessage: 'Conexión creada', toastType: 'success' });
}
async function removeBoardLinksForCard(cardId, { skipConfirm = false } = {}) {
  const links = state.board_links.filter(l => l.source_id === cardId || l.target_id === cardId);
  if (!links.length) return toast('La tarjeta no tiene conexiones');
  if (!skipConfirm && !confirm('¿Quitar todas las conexiones de esta tarjeta?')) return;
  for (const link of links) await api.remove('board_links', link.id);
  state.board_links = state.board_links.filter(l => l.source_id !== cardId && l.target_id !== cardId);
  saveLocalState();
  renderBoard();
}
function autoArrangeBoard() {
  const cards = state.board_cards || [];
  cards.forEach((card, i) => {
    card.x = 80 + (i % 4) * 290;
    card.y = 80 + Math.floor(i / 4) * 210;
    card.updated_at = new Date().toISOString();
  });
  api.bulkUpsert('board_cards', cards).catch(err => toast(`No pude sincronizar orden: ${err.message}`, 'error'));
  saveLocalState();
  renderBoard();
}
async function createCardFromTemplate(template, x = 140, y = 120, overrides = {}) {
  const meta = {
    idea: ['Nueva idea', 'Hipótesis, oportunidad o concepto para desarrollar.', 'amber'],
    task: ['Nueva tarea', 'Acción concreta, responsable y siguiente paso.', 'blue'],
    decision: ['Decisión pendiente', 'Opciones, criterio de decisión y trade-offs.', 'purple'],
    note: ['Nota de trabajo', 'Contexto, observaciones o documentación rápida.', 'teal'],
    blocker: ['Bloqueo', 'Qué frena el avance y cómo se desbloquea.', 'red'],
    process: ['Proceso', 'Paso 1 → Paso 2 → Resultado esperado.', 'green'],
    resource: ['Recurso', 'Link, documento, referencia o material útil.', 'pink'],
  }[template] || ['Nueva tarjeta', '', 'blue'];
  const card = normalizeBoardCard({
    id: uid('bc'),
    title: overrides.title || meta[0],
    text: overrides.text ?? meta[1],
    category: overrides.category || template,
    color: overrides.color || meta[2],
    x: snapBoardValue(x),
    y: snapBoardValue(y),
    width: overrides.width || 240,
  });
  state.board_cards.push(card);
  selectedBoardCardId = card.id;
  await persist('board_cards', card, 'board_cards');
  return card;
}


async function createStarterBoard() {
  const wrap = $('work-canvas-wrap');
  const baseX = (wrap?.scrollLeft || 0) + 120;
  const baseY = (wrap?.scrollTop || 0) + 120;
  const specs = [
    { template:'idea', title:'Objetivo / norte', text:'Resultado concreto que querés lograr. Sin esto, el tablero es decoración.', x:baseX, y:baseY },
    { template:'decision', title:'Decisión clave', text:'Qué hay que decidir, con qué criterio y qué trade-off aceptás.', x:baseX + 310, y:baseY },
    { template:'task', title:'Próxima acción', text:'Acción ejecutable. Verbo + objeto + deadline.', x:baseX + 620, y:baseY },
    { template:'blocker', title:'Bloqueo / riesgo', text:'Qué puede trabar esto y cómo se neutraliza antes de que escale.', x:baseX + 310, y:baseY + 230 },
    { template:'resource', title:'Recursos', text:'Links, documentos, contactos o referencias útiles.', x:baseX, y:baseY + 230 },
  ];
  const created = [];
  for (const spec of specs) created.push(await createCardFromTemplate(spec.template, spec.x, spec.y, spec));
  const links = [
    [created[0], created[1], 'accent'],
    [created[1], created[2], 'blue'],
    [created[3], created[1], 'red'],
    [created[4], created[2], 'pink'],
  ].map(([source, target, color]) => normalizeBoardLink({ id: uid('bl'), source_id: source.id, target_id: target.id, color }));
  state.board_links.push(...links);
  await api.bulkUpsert('board_links', links).catch(err => toast(`No pude sincronizar conexiones del flujo: ${err.message}`, 'error'));
  saveLocalState();
  selectedBoardCardId = created[0]?.id || null;
  renderBoard();
  toast('Flujo base creado', 'success');
}

async function sanitizeBoardLinks() {
  const ids = new Set(state.board_cards.map(c => c.id));
  const orphans = state.board_links.filter(l => !ids.has(l.source_id) || !ids.has(l.target_id));
  if (!orphans.length) return toast('Conexiones limpias. Nada para sanear.', 'success');
  for (const link of orphans) {
    try { await api.remove('board_links', link.id); } catch (err) { console.warn(err); }
  }
  state.board_links = state.board_links.filter(l => ids.has(l.source_id) && ids.has(l.target_id));
  saveLocalState();
  renderBoard();
  toast(`${orphans.length} conexión(es) huérfana(s) eliminada(s)`, 'success');
}

function snapBoardValue(value) {
  if (!boardSnapToGrid) return Math.round(Number(value) || 0);
  return Math.round((Number(value) || 0) / 14) * 14;
}
function getBoardPointFromEvent(event) {
  const wrap = $('work-canvas-wrap');
  if (!wrap) return { x: 140, y: 120, clientX: event.clientX || 0, clientY: event.clientY || 0 };
  const rect = wrap.getBoundingClientRect();
  return {
    x: clamp((event.clientX - rect.left) + wrap.scrollLeft, 16, 4000),
    y: clamp((event.clientY - rect.top) + wrap.scrollTop, 16, 2500),
    clientX: event.clientX,
    clientY: event.clientY,
  };
}
function showBoardContextMenu(event) {
  const wrap = event.target.closest('#work-canvas-wrap');
  if (!wrap) return;
  event.preventDefault();
  if (boardLinkMode) setBoardLinkMode(false, null, { toastMessage: 'Conexión cancelada' });
  const point = getBoardPointFromEvent(event);
  const cardEl = event.target.closest('.work-card');
  const cardId = cardEl?.dataset.boardCardId || null;
  if (cardId) selectedBoardCardId = cardId;
  boardContext = { ...point, cardId };
  renderBoardContextMenu(cardId);
  const menu = $('board-context-menu');
  if (!menu) return;
  menu.classList.remove('hidden');
  const mw = menu.offsetWidth || 220;
  const mh = menu.offsetHeight || 320;
  menu.style.left = `${Math.min(event.clientX, window.innerWidth - mw - 10)}px`;
  menu.style.top = `${Math.min(event.clientY, window.innerHeight - mh - 10)}px`;
  renderBoard();
}
function renderBoardContextMenu(cardId = null) {
  const menu = $('board-context-menu');
  if (!menu) return;
  const card = cardId ? state.board_cards.find(c => c.id === cardId) : null;
  const cardOptions = card ? `
    <button data-board-menu="edit"><i class="fas fa-pen"></i><span>Editar tarjeta</span></button>
    <button data-board-menu="duplicate"><i class="fas fa-copy"></i><span>Duplicar</span><kbd>Ctrl D</kbd></button>
    <button data-board-menu="connect"><i class="fas fa-link"></i><span>Conectar desde acá</span></button>
    <button data-board-menu="taskify"><i class="fas fa-list-check"></i><span>Mandar a tareas de hoy</span></button>
    <button data-board-menu="unlink"><i class="fas fa-unlink"></i><span>Quitar conexiones</span></button>
    <button data-board-menu="delete" class="danger"><i class="fas fa-trash"></i><span>Eliminar</span><kbd>Del</kbd></button>
    <div class="context-separator"></div>` : '';
  menu.innerHTML = `
    ${card ? `<div class="context-title">${escapeHTML(card.title)}</div>` : '<div class="context-title">Crear en este punto</div>'}
    ${cardOptions}
    <button data-board-menu="new-note"><i class="fas fa-note-sticky"></i><span>Nueva nota</span><kbd>N</kbd></button>
    <button data-board-menu="new-task"><i class="fas fa-check"></i><span>Nueva tarea visual</span><kbd>T</kbd></button>
    <button data-board-menu="new-idea"><i class="fas fa-lightbulb"></i><span>Nueva idea</span><kbd>I</kbd></button>
    <button data-board-menu="new-decision"><i class="fas fa-code-branch"></i><span>Nueva decisión</span><kbd>D</kbd></button>
    <button data-board-menu="new-blocker"><i class="fas fa-triangle-exclamation"></i><span>Nuevo bloqueo</span><kbd>B</kbd></button>
    <button data-board-menu="new-process"><i class="fas fa-route"></i><span>Nuevo proceso</span><kbd>P</kbd></button>
    <button data-board-menu="new-resource"><i class="fas fa-paperclip"></i><span>Nuevo recurso</span><kbd>R</kbd></button>
    <div class="context-separator"></div>
    <button data-board-menu="starter"><i class="fas fa-wand-magic-sparkles"></i><span>Crear flujo base</span></button>
    <button data-board-menu="sanitize"><i class="fas fa-broom"></i><span>Sanear conexiones</span></button>
    <button data-board-menu="snap"><i class="fas fa-border-all"></i><span>${boardSnapToGrid ? 'Desactivar grilla' : 'Activar grilla'}</span></button>
    <button data-board-menu="arrange"><i class="fas fa-wand-magic-sparkles"></i><span>Ordenar vista</span></button>
  `;
}
function hideBoardContextMenu() {
  $('board-context-menu')?.classList.add('hidden');
}
async function handleBoardContextAction(action) {
  if (!boardContext) return;
  const { x, y, cardId } = boardContext;
  const card = cardId ? state.board_cards.find(c => c.id === cardId) : null;
  const createMap = { 'new-note':'note', 'new-task':'task', 'new-idea':'idea', 'new-decision':'decision', 'new-blocker':'blocker', 'new-process':'process', 'new-resource':'resource' };
  if (createMap[action]) await createCardFromTemplate(createMap[action], x, y);
  if (action === 'edit' && card) openBoardCardModal(card);
  if (action === 'duplicate' && card) await duplicateBoardCard(card.id);
  if (action === 'connect' && card) {
    setBoardLinkMode(true, card.id, { toastMessage: 'Origen seleccionado. Ahora tocá la tarjeta destino.' });
  }
  if (action === 'unlink' && card) await removeBoardLinksForCard(card.id, { skipConfirm: false });
  if (action === 'delete' && card) await deleteBoardCard(card.id, { confirmDelete: true });
  if (action === 'taskify' && card) await createTaskFromBoardCard(card.id);
  if (action === 'starter') await createStarterBoard();
  if (action === 'sanitize') await sanitizeBoardLinks();
  if (action === 'snap') { boardSnapToGrid = !boardSnapToGrid; toast(boardSnapToGrid ? 'Grilla activada' : 'Grilla desactivada'); }
  if (action === 'arrange') autoArrangeBoard();
  hideBoardContextMenu();
}
async function duplicateBoardCard(cardId, delta = 28) {
  const source = state.board_cards.find(c => c.id === cardId);
  if (!source) return;
  const copy = normalizeBoardCard({
    ...source,
    id: uid('bc'),
    title: `${source.title} copia`,
    x: source.x + delta,
    y: source.y + delta,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
  state.board_cards.push(copy);
  selectedBoardCardId = copy.id;
  await persist('board_cards', copy, 'board_cards');
}
async function deleteBoardCard(cardId, { confirmDelete = true } = {}) {
  if (!cardId) return;
  if (confirmDelete && !confirm('¿Eliminar esta tarjeta y sus conexiones?')) return;
  const links = state.board_links.filter(l => l.source_id === cardId || l.target_id === cardId);
  for (const link of links) {
    try { await api.remove('board_links', link.id); } catch (err) { console.warn(err); }
  }
  state.board_links = state.board_links.filter(l => l.source_id !== cardId && l.target_id !== cardId);
  selectedBoardCardId = selectedBoardCardId === cardId ? null : selectedBoardCardId;
  await removeRecord('board_cards', cardId, 'board_cards');
}
async function createTaskFromBoardCard(cardId) {
  const card = state.board_cards.find(c => c.id === cardId);
  if (!card) return;
  const task = normalizeTask({
    id: uid('t'),
    title: card.title,
    description: card.text,
    status: 'pendiente',
    priority: card.category === 'blocker' ? 'alta' : 'media',
    due_date: todayStr(),
    tag: card.color || 'blue',
    context: 'pc',
    energy: 'media',
  });
  state.tasks.push(task);
  await persist('tasks', task, 'tasks');
  toast('Tarjeta enviada a tareas de hoy', 'success');
}
function handleBoardKeyboardShortcuts(event) {
  if (currentView !== 'board' || event.target.matches('input, textarea, select')) return;
  const key = event.key.toLowerCase();
  const wrap = $('work-canvas-wrap');
  if (!wrap) return;
  const x = wrap.scrollLeft + 160;
  const y = wrap.scrollTop + 120;
  if (key === 'n' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); createCardFromTemplate('note', x, y); }
  if (key === 't' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); createCardFromTemplate('task', x, y); }
  if (key === 'i' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); createCardFromTemplate('idea', x, y); }
  if (key === 'd' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); createCardFromTemplate('decision', x, y); }
  if (key === 'b' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); createCardFromTemplate('blocker', x, y); }
  if (key === 'p' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); createCardFromTemplate('process', x, y); }
  if (key === 'r' && !event.ctrlKey && !event.metaKey) { event.preventDefault(); createCardFromTemplate('resource', x, y); }
  if ((event.ctrlKey || event.metaKey) && key === 'd' && selectedBoardCardId) { event.preventDefault(); duplicateBoardCard(selectedBoardCardId); }
  if ((event.ctrlKey || event.metaKey) && key === 'c' && selectedBoardCardId) { event.preventDefault(); boardClipboard = state.board_cards.find(c => c.id === selectedBoardCardId) || null; toast('Tarjeta copiada'); }
  if ((event.ctrlKey || event.metaKey) && key === 'v' && boardClipboard) { event.preventDefault(); duplicateBoardCard(boardClipboard.id, 42); }
  if ((event.key === 'Delete' || event.key === 'Backspace') && selectedBoardCardId) { event.preventDefault(); deleteBoardCard(selectedBoardCardId, { confirmDelete: true }); }
}

// Captura eventos específicos del canvas sin tocar el resto de la app.
document.addEventListener('click', (event) => {
  const selectionAction = event.target.closest('[data-board-selection]');
  if (selectionAction) { event.stopPropagation(); return handleBoardSelectionAction(selectionAction.dataset.boardSelection); }
  const menuAction = event.target.closest('[data-board-menu]');
  if (menuAction) { event.stopPropagation(); return handleBoardContextAction(menuAction.dataset.boardMenu); }
  if (!event.target.closest('#board-context-menu')) hideBoardContextMenu();
  const edit = event.target.closest('[data-action="edit-board-card"]');
  if (edit) { event.stopPropagation(); return openBoardCardModal(state.board_cards.find(c => c.id === edit.dataset.boardCardId)); }
  const startLink = event.target.closest('[data-action="start-board-link"]');
  if (startLink) {
    event.stopPropagation();
    const sourceId = startLink.dataset.boardCardId;
    if (boardLinkMode && boardLinkSourceId === sourceId) return setBoardLinkMode(false, null, { toastMessage: 'Conexión cancelada' });
    return setBoardLinkMode(true, sourceId, { toastMessage: 'Origen seleccionado. Ahora tocá la tarjeta destino.' });
  }
  const unlink = event.target.closest('[data-action="delete-board-link"]');
  if (unlink) { event.stopPropagation(); return removeBoardLinksForCard(unlink.dataset.cardId); }
  const card = event.target.closest('.work-card');
  if (card) { selectedBoardCardId = card.dataset.boardCardId; renderBoardSelectionBar(); }
  if (boardLinkMode) {
    const insideCanvas = event.target.closest('#work-canvas-wrap');
    if (!card && insideCanvas) { event.stopPropagation(); return setBoardLinkMode(false, null, { toastMessage: 'Conexión cancelada' }); }
    if (card) {
      event.stopPropagation();
      const id = card.dataset.boardCardId;
      if (!boardLinkSourceId) return setBoardLinkMode(true, id, { toastMessage: 'Origen seleccionado. Ahora tocá la tarjeta destino.' });
      return createBoardLink(boardLinkSourceId, id);
    }
  }
});

document.addEventListener('pointerdown', (event) => {
  const cardPick = event.target.closest('.work-card');
  if (cardPick) { selectedBoardCardId = cardPick.dataset.boardCardId; renderBoardSelectionBar(); }
  const handle = event.target.closest('[data-board-drag-handle]');
  if (!handle || boardLinkMode || event.button === 2) return;
  const cardEl = handle.closest('.work-card');
  if (!cardEl) return;
  const card = state.board_cards.find(c => c.id === cardEl.dataset.boardCardId);
  if (!card) return;
  hideBoardContextMenu();
  const wrap = $('work-canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  boardDragState = { id: card.id, offsetX: event.clientX - rect.left + wrap.scrollLeft - card.x, offsetY: event.clientY - rect.top + wrap.scrollTop - card.y };
  cardEl.setPointerCapture?.(event.pointerId);
  cardEl.classList.add('moving');
});
document.addEventListener('pointermove', (event) => {
  if (!boardDragState) return;
  const wrap = $('work-canvas-wrap');
  const rect = wrap.getBoundingClientRect();
  const card = state.board_cards.find(c => c.id === boardDragState.id);
  if (!card) return;
  card.x = clamp(snapBoardValue(event.clientX - rect.left + wrap.scrollLeft - boardDragState.offsetX), 16, 4000);
  card.y = clamp(snapBoardValue(event.clientY - rect.top + wrap.scrollTop - boardDragState.offsetY), 16, 2500);
  const el = document.querySelector(`[data-board-card-id="${card.id}"]`);
  if (el) { el.style.left = `${card.x}px`; el.style.top = `${card.y}px`; }
  renderBoardConnections();
});
document.addEventListener('pointerup', async () => {
  if (!boardDragState) return;
  const card = state.board_cards.find(c => c.id === boardDragState.id);
  $$('.work-card').forEach(c => c.classList.remove('moving'));
  boardDragState = null;
  if (card) {
    card.updated_at = new Date().toISOString();
    saveLocalState();
    try { await api.upsert('board_cards', card); } catch (err) { toast(`No pude guardar posición: ${err.message}`, 'error'); }
  }
});
document.addEventListener('dragstart', (event) => {
  const template = event.target.closest('[data-template]');
  if (!template) return;
  event.dataTransfer.setData('text/plain', template.dataset.template);
});
document.addEventListener('dragover', (event) => {
  if (event.target.closest('#work-canvas-wrap')) event.preventDefault();
});
document.addEventListener('drop', (event) => {
  const wrap = event.target.closest('#work-canvas-wrap');
  if (!wrap) return;
  const template = event.dataTransfer.getData('text/plain');
  if (!template) return;
  event.preventDefault();
  const rect = wrap.getBoundingClientRect();
  createCardFromTemplate(template, event.clientX - rect.left + wrap.scrollLeft, event.clientY - rect.top + wrap.scrollTop);
});
document.addEventListener('contextmenu', showBoardContextMenu);
document.addEventListener('dblclick', (event) => {
  const wrap = event.target.closest('#work-canvas-wrap');
  if (!wrap || event.target.closest('.work-card')) return;
  const point = getBoardPointFromEvent(event);
  createCardFromTemplate('note', point.x, point.y);
});
window.addEventListener('resize', renderBoardConnections);
$('work-canvas-wrap')?.addEventListener('scroll', renderBoardConnections);
