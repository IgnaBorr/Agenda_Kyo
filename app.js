'use strict';

const CONFIG = window.AGENDA_CONFIG || {};
const HAS_SUPABASE = Boolean(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY && window.supabase);
const LOCAL_KEY = 'axis_agenda_v2_state';
const LEGACY_KEY = 'axis_state';

const COLORS = {
  accent: '#c9a96e', blue: '#6b9bd2', green: '#7ab87a', purple: '#9b87c4',
  red: '#d27b7b', teal: '#6ab8b0', pink: '#c47aaa', amber: '#c9a96e'
};
const COLOR_BG = {
  accent: 'rgba(201,169,110,.12)', blue: 'rgba(107,155,210,.12)', green: 'rgba(122,184,122,.12)',
  purple: 'rgba(155,135,196,.12)', red: 'rgba(210,123,123,.12)', teal: 'rgba(106,184,176,.12)',
  pink: 'rgba(196,122,170,.12)', amber: 'rgba(201,169,110,.12)'
};
const STATUS_COLUMNS = [
  { id: 'backlog', name: 'Backlog', color: '#716d75' },
  { id: 'pendiente', name: 'Pendiente', color: COLORS.accent },
  { id: 'en-progreso', name: 'En progreso', color: COLORS.blue },
  { id: 'revision', name: 'Revisión', color: COLORS.purple },
  { id: 'completado', name: 'Completado', color: COLORS.green },
];
const STATUS_LABEL = Object.fromEntries(STATUS_COLUMNS.map(c => [c.id, c.name]));
const EVENT_TYPES = {
  reunion: { label: 'Reunión', color: COLORS.blue, icon: 'fa-users' },
  llamada: { label: 'Llamada', color: COLORS.green, icon: 'fa-phone' },
  personal: { label: 'Personal', color: COLORS.purple, icon: 'fa-user' },
  deadline: { label: 'Deadline', color: COLORS.red, icon: 'fa-flag' },
  bloque: { label: 'Bloque de foco', color: COLORS.accent, icon: 'fa-bullseye' },
  otro: { label: 'Otro', color: COLORS.teal, icon: 'fa-circle' },
};

let sb = null;
let currentUser = null;
let dataMode = HAS_SUPABASE ? 'supabase' : 'local';
let currentView = 'today';
let todayFilter = 'open';
let searchQuery = '';
let draggedTaskId = null;
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
function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }
function isOpenTask(t) { return t.status !== 'completado'; }
function isOverdue(t) { return t.due_date && t.due_date < todayStr() && isOpenTask(t); }
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

function getDefaultState() {
  return {
    projects: [
      { id: uid('p'), name: 'Personal', description: 'Gestión personal, casa y vida diaria.', color: 'accent', archived: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
      { id: uid('p'), name: 'Trabajo', description: 'Tareas laborales, seguimiento y operación.', color: 'blue', archived: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString() },
    ],
    tasks: [],
    events: [],
    daily_notes: [],
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
      priority: t.priority || 'media', due_date: t.dueDate || t.due_date || null, start_time: t.start_time || null,
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
    daily_notes: Array.isArray(s.daily_notes) ? s.daily_notes.map(normalizeDailyNote) : [],
  };
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
    status: t.status || 'pendiente', priority: t.priority || 'media', due_date: t.due_date ?? t.dueDate ?? null,
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

const api = {
  async init() {
    if (HAS_SUPABASE) {
      sb = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_ANON_KEY);
      const { data } = await sb.auth.getSession();
      currentUser = data.session?.user || null;
      sb.auth.onAuthStateChange(async (_event, session) => {
        currentUser = session?.user || null;
        if (currentUser) await bootstrapApp();
        else showAuth();
      });
    }
  },
  async signIn(email, password, mode) {
    if (!HAS_SUPABASE) throw new Error('Supabase no está configurado.');
    if (mode === 'signup') return sb.auth.signUp({ email, password });
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
    const [projects, tasks, events, notes] = await Promise.all([
      sb.from('projects').select('*').order('created_at', { ascending: true }),
      sb.from('tasks').select('*').order('sort_order', { ascending: true }).order('created_at', { ascending: true }),
      sb.from('events').select('*').order('event_date', { ascending: true }).order('start_time', { ascending: true }),
      sb.from('daily_notes').select('*').order('note_date', { ascending: false }),
    ]);
    for (const res of [projects, tasks, events, notes]) if (res.error) throw res.error;
    state = normalizeState({ projects: projects.data, tasks: tasks.data, events: events.data, daily_notes: notes.data });
    if (state.projects.length === 0) await seedDefaultProjects();
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
    toast(`Error guardando: ${err.message}`, 'error');
  }
}
function normalizeByCollection(collection, row) {
  if (collection === 'projects') return normalizeProject(row);
  if (collection === 'tasks') return normalizeTask(row);
  if (collection === 'events') return normalizeEvent(row);
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
  const dueToday = state.tasks.filter(t => t.due_date === todayStr() && isOpenTask(t));
  $('badge-today').textContent = dueToday.length;
  $('badge-board').textContent = active.length;
  $('badge-projects').textContent = state.projects.filter(p => !p.archived).length;
  $('sync-mode-label').textContent = dataMode === 'supabase' ? 'Supabase' : 'Local';
  $('settings-sync-copy').textContent = dataMode === 'supabase' ? 'Sincronización Supabase activa con RLS por usuario.' : 'Modo local activo. Los datos se guardan en este navegador.';
  $('user-display-name').textContent = currentUser?.email?.split('@')[0] || 'Mi Agenda';
  $('user-avatar').textContent = (currentUser?.email || 'Y')[0].toUpperCase();
  $('auth-setting-card').classList.toggle('hidden', dataMode !== 'supabase');
  renderProjectSelects();
  renderSidebarProjects();
  updateTopbar();
}
function updateTopbar() {
  const titles = { today: 'Hoy', board: 'Tablero', calendar: 'Calendario', projects: 'Proyectos', notes: 'Cierre diario' };
  $('topbar-title').textContent = titles[currentView] || 'Agenda';
  const subs = {
    today: fmtLong(todayStr()),
    board: `${state.tasks.filter(isOpenTask).length} tareas activas`,
    calendar: monthLabel(calendarCursor),
    projects: `${state.projects.filter(p => !p.archived).length} proyectos activos`,
    notes: 'Plan, bloqueos y cierre operativo',
  };
  $('topbar-sub').textContent = subs[currentView] || '';
}
function renderSidebarProjects() {
  const items = state.projects.filter(p => !p.archived).map(p => {
    const count = state.tasks.filter(t => t.project_id === p.id && isOpenTask(t)).length;
    return `<button class="nav-item project-filter" data-project-id="${p.id}">
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
}

function filteredTasks(tasks) {
  let list = [...tasks];
  const q = searchQuery.toLowerCase();
  if (q) list = list.filter(t => [t.title, t.description, projectName(t.project_id), t.context].join(' ').toLowerCase().includes(q));
  return list;
}
function sortTasks(a, b) {
  const prio = { alta: 0, media: 1, baja: 2 };
  if ((a.due_date || '9999') !== (b.due_date || '9999')) return (a.due_date || '9999').localeCompare(b.due_date || '9999');
  if ((a.start_time || '99:99') !== (b.start_time || '99:99')) return (a.start_time || '99:99').localeCompare(b.start_time || '99:99');
  return (prio[a.priority] ?? 9) - (prio[b.priority] ?? 9) || (a.created_at || '').localeCompare(b.created_at || '');
}
function renderToday() {
  const today = todayStr();
  const open = state.tasks.filter(isOpenTask);
  const overdue = state.tasks.filter(isOverdue).sort(sortTasks);
  const todayTasksAll = state.tasks.filter(t => t.due_date === today).sort(sortTasks);
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
  const upcoming = state.tasks.filter(t => t.due_date > today && t.due_date <= next7 && isOpenTask(t)).sort(sortTasks).slice(0, 8);
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
        ${opts.showDate && t.due_date ? `<span class="badge ${overdue ? 'red' : 'amber'}"><i class="fas fa-calendar-day"></i>${fmtDate(t.due_date)}</span>` : ''}
        ${t.start_time ? `<span><i class="fas fa-clock"></i> ${t.start_time}</span>` : ''}
        ${t.duration_min ? `<span>${t.duration_min}m</span>` : ''}
        ${p ? `<span class="badge" style="color:${projectColor(t.project_id)};background:${projectBg(t.project_id)}">${escapeHTML(p.name)}</span>` : ''}
        <span>${escapeHTML(STATUS_LABEL[t.status] || t.status)}</span>
        ${t.repeat_rule && t.repeat_rule !== 'none' ? `<span class="badge green"><i class="fas fa-rotate"></i>${repeatLabel(t.repeat_rule)}</span>` : ''}
        ${overdue ? `<span class="badge red">Vencida</span>` : ''}
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
  const type = EVENT_TYPES[e.type] || EVENT_TYPES.otro;
  return `<div class="event-row" data-action="edit-event" data-event-id="${e.id}">
    <div class="event-time">${e.start_time || '—'}</div>
    <div>
      <div class="event-card-title">${escapeHTML(e.title)}</div>
      <div class="event-card-meta"><i class="fas ${type.icon}" style="color:${type.color}"></i> ${type.label}${e.location ? ` · ${escapeHTML(e.location)}` : ''}</div>
    </div>
    <span class="dot" style="background:${type.color}"></span>
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
      ${overdue ? `<span class="badge red">Vencida</span>` : ''}
    </div>
    <div class="card-title">${escapeHTML(t.title)}</div>
    ${t.description ? `<div class="card-desc">${escapeHTML(t.description).slice(0, 120)}${t.description.length > 120 ? '…' : ''}</div>` : ''}
    <footer class="card-footer">
      <div class="priority-bars ${t.priority}"><span></span><span></span><span></span></div>
      ${t.context ? `<span class="badge">${contextIcon(t.context)} ${escapeHTML(t.context)}</span>` : ''}
      ${t.due_date ? `<span class="date" style="${overdue ? 'color:var(--red)' : ''}">${fmtDate(t.due_date)}</span>` : ''}
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
    const tasks = state.tasks.filter(t => t.due_date === date && isOpenTask(t)).sort(sortTasks);
    html += `<div class="cal-cell ${date === todayStr() ? 'today' : ''}" data-action="date-click" data-date="${date}">
      <div class="cal-date">${d}</div>
      ${events.slice(0,3).map(e => calChip(e.title, EVENT_TYPES[e.type]?.color || COLORS.teal, e.start_time)).join('')}
      ${tasks.slice(0,4).map(t => calChip(t.title, taskColor(t), null)).join('')}
      ${(events.length + tasks.length) > 5 ? `<span class="cal-chip" style="color:var(--text3);background:var(--bg4)">+${events.length + tasks.length - 5} más</span>` : ''}
    </div>`;
  }
  const cells = start + total;
  const remaining = cells % 7 ? 7 - (cells % 7) : 0;
  for (let i = 1; i <= remaining; i++) html += `<div class="cal-cell other"><div class="cal-date">${i}</div></div>`;
  $('calendar-grid').innerHTML = html;
  updateTopbar();
}
function calChip(title, color, time) {
  return `<span class="cal-chip" style="color:${color};background:${hexToBg(color)}">${time ? `${time} ` : ''}${escapeHTML(title)}</span>`;
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
    const tasks = state.tasks.filter(t => t.project_id === p.id);
    const done = tasks.filter(t => t.status === 'completado').length;
    const active = tasks.filter(isOpenTask).length;
    const pct = tasks.length ? Math.round(done * 100 / tasks.length) : 0;
    const color = COLORS[p.color] || COLORS.accent;
    return `<article class="project-card" data-action="edit-project" data-project-id="${p.id}">
      <div class="project-bar" style="background:${color}"></div>
      <div class="project-actions"><button class="icon-btn" data-action="project-to-board" data-project-id="${p.id}" title="Ver tablero"><i class="fas fa-columns"></i></button></div>
      <h4>${escapeHTML(p.name)}</h4>
      <p>${escapeHTML(p.description || 'Sin descripción')}</p>
      <div class="progress"><span style="width:${pct}%;background:${color}"></span></div>
      <div class="project-stats"><span>${active} activas</span><span>${done} hechas</span><span>${pct}% progreso</span>${p.archived ? '<span>Archivado</span>' : ''}</div>
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
  $('task-start-time').value = defaults.start_time || '';
  $('task-duration').value = defaults.duration_min || '';
  $('task-repeat').value = defaults.repeat_rule || 'none';
  $('task-context').value = defaults.context || 'pc';
  $('task-energy').value = defaults.energy || 'media';
  $('task-tag').value = defaults.tag || 'blue';
  $('btn-delete-task').classList.toggle('hidden', !defaults.id);
}
function openTaskModal(taskOrDefaults = {}) { resetTaskForm(taskOrDefaults); openModal('modal-task'); setTimeout(() => $('task-title').focus(), 50); }
function editTask(id) {
  const task = state.tasks.find(t => t.id === id);
  if (task) openTaskModal(task);
}
function resetEventForm(defaults = {}) {
  $('event-id').value = defaults.id || '';
  $('event-modal-title').textContent = defaults.id ? 'Editar evento' : 'Nuevo evento';
  $('event-title').value = defaults.title || '';
  $('event-date').value = defaults.event_date || todayStr();
  $('event-start-time').value = defaults.start_time || '';
  $('event-end-time').value = defaults.end_time || '';
  $('event-type').value = defaults.type || 'reunion';
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
  const task = normalizeTask({
    ...(existing || {}), id,
    title: $('task-title').value.trim(), description: $('task-description').value.trim(), status: $('task-status').value,
    priority: $('task-priority').value, project_id: $('task-project').value || null, due_date: $('task-due-date').value || null,
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
  const clone = normalizeTask({ ...task, id: uid('t'), status: 'pendiente', due_date: nextDate, completed_at: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  state.tasks.push(clone);
  await api.upsert('tasks', clone);
  saveLocalState();
  toast(`Tarea recurrente creada para ${fmtDate(nextDate)}`, 'success');
}

async function quickAdd(event) {
  event.preventDefault();
  const title = $('quick-title').value.trim();
  if (!title) return;
  const when = $('quick-when').value;
  const due = when === 'today' ? todayStr() : when === 'tomorrow' ? addDays(todayStr(), 1) : null;
  const task = normalizeTask({ id: uid('t'), title, status: 'pendiente', priority: $('quick-priority').value, due_date: due, tag: 'amber', created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
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
  if (projectFilter) { switchView('board'); $('filter-project').value = projectFilter; return renderBoard(); }
  const actionEl = event.target.closest('[data-action]');
  if (!actionEl) return;
  const action = actionEl.dataset.action;
  if (action === 'toggle-task') return toggleTask(actionEl.dataset.taskId);
  if (action === 'edit-task') return editTask(actionEl.dataset.taskId || actionEl.closest('[data-task-id]')?.dataset.taskId);
  if (action === 'edit-event') return editEvent(actionEl.dataset.eventId);
  if (action === 'edit-project') return editProject(actionEl.dataset.projectId);
  if (action === 'project-to-board') { event.stopPropagation(); switchView('board'); $('filter-project').value = actionEl.dataset.projectId; return renderBoard(); }
  if (action === 'new-task-status') return openTaskModal({ status: actionEl.dataset.status, due_date: todayStr() });
  if (action === 'date-click') return openEventModal({ event_date: actionEl.dataset.date });
}
function setupDragAndDrop() {
  document.addEventListener('dragstart', (e) => {
    const card = e.target.closest('.kanban-card');
    if (!card) return;
    draggedTaskId = card.dataset.taskId;
    card.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
  });
  document.addEventListener('dragend', (e) => {
    e.target.closest('.kanban-card')?.classList.remove('dragging');
    $$('.col-dropzone').forEach(z => z.classList.remove('drag-over'));
    draggedTaskId = null;
  });
  document.addEventListener('dragover', (e) => {
    const zone = e.target.closest('.col-dropzone');
    if (!zone || !draggedTaskId) return;
    e.preventDefault();
    zone.classList.add('drag-over');
  });
  document.addEventListener('dragleave', (e) => e.target.closest('.col-dropzone')?.classList.remove('drag-over'));
  document.addEventListener('drop', async (e) => {
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

function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `axis-agenda-backup-${todayStr()}.json`;
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
      await api.bulkUpsert('daily_notes', state.daily_notes);
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
  $('btn-board-new-task').addEventListener('click', () => openTaskModal({ due_date: todayStr() }));
  $('btn-quick-add').addEventListener('click', () => { switchView('today'); setTimeout(() => $('quick-title').focus(), 50); });
  $('btn-new-event').addEventListener('click', () => openEventModal({ event_date: todayStr() }));
  $('btn-calendar-event').addEventListener('click', () => openEventModal({ event_date: todayStr() }));
  $('btn-new-project').addEventListener('click', () => openProjectModal());
  $('btn-sidebar-new-project').addEventListener('click', () => openProjectModal());
  $('btn-settings').addEventListener('click', () => openModal('modal-settings'));
  $('btn-toggle-sidebar').addEventListener('click', () => $('sidebar').classList.toggle('open'));
  $('task-form').addEventListener('submit', saveTaskFromForm);
  $('event-form').addEventListener('submit', saveEventFromForm);
  $('project-form').addEventListener('submit', saveProjectFromForm);
  $('daily-note-form').addEventListener('submit', saveDailyNote);
  $('quick-add-form').addEventListener('submit', quickAdd);
  $('btn-delete-task').addEventListener('click', async () => { const id = $('task-id').value; if (id && confirm('¿Eliminar esta tarea?')) { await removeRecord('tasks', id, 'tasks'); closeModal('modal-task'); } });
  $('btn-delete-event').addEventListener('click', async () => { const id = $('event-id').value; if (id && confirm('¿Eliminar este evento?')) { await removeRecord('events', id, 'events'); closeModal('modal-event'); } });
  $('btn-delete-project').addEventListener('click', async () => {
    const id = $('project-id').value;
    if (!id || !confirm('¿Eliminar proyecto? Las tareas quedarán sin proyecto.')) return;
    state.tasks.filter(t => t.project_id === id).forEach(t => { t.project_id = null; t.updated_at = new Date().toISOString(); });
    await api.bulkUpsert('tasks', state.tasks.filter(t => t.project_id === null));
    await removeRecord('projects', id, 'projects');
    closeModal('modal-project');
  });
  $('search-input').addEventListener('input', e => { searchQuery = e.target.value.trim(); renderAll(); });
  ['filter-project', 'filter-priority', 'filter-context'].forEach(id => $(id).addEventListener('change', renderBoard));
  $('btn-clear-filters').addEventListener('click', () => { $('filter-project').value = ''; $('filter-priority').value = ''; $('filter-context').value = ''; renderBoard(); });
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
    if (e.key === 'Escape') $$('.modal-overlay.open').forEach(m => closeModal(m.id));
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); $('search-input').focus(); }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'n') { e.preventDefault(); openTaskModal({ due_date: todayStr() }); }
  });
  setupDragAndDrop();
}
async function authSubmit(event) {
  event.preventDefault();
  const email = $('auth-email').value.trim();
  const password = $('auth-password').value;
  const mode = document.querySelector('.auth-tab.active')?.dataset.authMode || 'login';
  try {
    const { error } = await api.signIn(email, password, mode);
    if (error) throw error;
    toast(mode === 'signup' ? 'Cuenta creada. Revisá si Supabase pide confirmación por email.' : 'Sesión iniciada', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
}

async function init() {
  bindEvents();
  $('note-date').value = todayStr();
  if (HAS_SUPABASE) {
    $('auth-sync-status').innerHTML = '<strong>Supabase configurado.</strong> Usá login para sincronizar tu board.';
    await api.init();
    if (currentUser) await bootstrapApp();
    else showAuth();
  } else {
    dataMode = 'local';
    await bootstrapApp();
    toast('Modo local activo. Configurá Supabase para sincronizar.', 'info');
  }
}

init();
