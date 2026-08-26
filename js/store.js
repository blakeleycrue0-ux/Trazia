/**
 * Estado de la aplicacion y acceso a datos.
 *
 * Los datos de un estudiante caben de sobra en memoria, asi que al entrar se
 * cargan todas sus colecciones una sola vez y las vistas se dibujan a partir de
 * ese estado. Cada mutacion espera la confirmacion del servidor (nunca damos por
 * guardado algo que no lo esta) y despues actualiza el estado local y avisa a
 * las vistas suscritas.
 */
import { getSupabase, translateDbError, isSessionError } from './supabase.js';
import { addDays, toISODate } from './format.js';

export const state = {
  session: null,
  user: null,
  profile: null,
  subjects: [],
  schedule: [],
  grades: [],
  habits: [],
  completions: [],
  journal: [],
  books: [],
  focusSessions: [],
  countdowns: [],
  ready: false,
};

const listeners = new Set();

/** Suscribe una vista a los cambios de estado. Devuelve la funcion de baja. */
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function notify() {
  for (const listener of listeners) listener(state);
}

/** Error de datos con mensaje ya traducido. */
export class DataError extends Error {
  constructor(error) {
    super(translateDbError(error));
    this.name = 'DataError';
    this.cause = error;
    this.isSession = isSessionError(error);
  }
}

async function client() {
  return getSupabase();
}

function unwrap({ data, error }) {
  if (error) throw new DataError(error);
  return data;
}

/* -------------------------------------------------------------------------- */
/* Carga inicial                                                               */
/* -------------------------------------------------------------------------- */

const COMPLETIONS_WINDOW_DAYS = 200;

export async function loadAll(session) {
  const supabase = await client();
  state.session = session;
  state.user = session.user;

  const since = toISODate(addDays(new Date(), -COMPLETIONS_WINDOW_DAYS));

  const [
    profile, subjects, schedule, grades, habits, completions, journal, books, focusSessions, countdowns,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle().then(unwrap),
    supabase.from('subjects').select('*').order('position').order('created_at').then(unwrap),
    supabase.from('schedule_items').select('*').then(unwrap),
    supabase.from('grades').select('*').order('graded_on', { ascending: false, nullsFirst: false }).then(unwrap),
    supabase.from('habits').select('*').order('created_at').then(unwrap),
    supabase.from('habit_completions').select('*').gte('completed_on', since).then(unwrap),
    supabase.from('journal_entries').select('*').order('entry_date', { ascending: false }).order('created_at', { ascending: false }).then(unwrap),
    supabase.from('books').select('*').order('created_at', { ascending: false }).then(unwrap),
    supabase.from('focus_sessions').select('*').order('started_at', { ascending: false }).limit(200).then(unwrap),
    supabase.from('countdowns').select('*').order('target_at').then(unwrap),
  ]);

  state.profile = profile || await createProfileFallback(session.user);
  state.subjects = subjects || [];
  state.schedule = schedule || [];
  state.grades = grades || [];
  state.habits = habits || [];
  state.completions = completions || [];
  state.journal = journal || [];
  state.books = books || [];
  state.focusSessions = focusSessions || [];
  state.countdowns = countdowns || [];
  state.ready = true;
  notify();
  return state;
}

/**
 * El disparador on_auth_user_created crea el perfil automaticamente. Si por lo
 * que sea no existe (por ejemplo, usuarios creados antes de instalar el SQL),
 * lo creamos aqui para que la aplicacion pueda continuar.
 */
async function createProfileFallback(user) {
  const supabase = await client();
  const displayName = user.user_metadata?.display_name || user.user_metadata?.full_name || null;
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, display_name: displayName }, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw new DataError(error);
  return data;
}

export function reset() {
  state.session = null;
  state.user = null;
  state.profile = null;
  state.subjects = [];
  state.schedule = [];
  state.grades = [];
  state.habits = [];
  state.completions = [];
  state.journal = [];
  state.books = [];
  state.focusSessions = [];
  state.countdowns = [];
  state.ready = false;
}

function userId() {
  if (!state.user) throw new DataError({ code: 'PGRST301', message: 'Sesión no disponible' });
  return state.user.id;
}

/* -------------------------------------------------------------------------- */
/* Perfil                                                                      */
/* -------------------------------------------------------------------------- */

export async function updateProfile(patch) {
  const supabase = await client();
  const data = unwrap(await supabase
    .from('profiles')
    .update(patch)
    .eq('id', userId())
    .select()
    .single());
  state.profile = data;
  notify();
  return data;
}

/* -------------------------------------------------------------------------- */
/* Asignaturas                                                                 */
/* -------------------------------------------------------------------------- */

export async function createSubject({ name, color, position }) {
  const supabase = await client();
  const data = unwrap(await supabase
    .from('subjects')
    .insert({
      user_id: userId(),
      name: name.trim(),
      color,
      position: position ?? state.subjects.length,
    })
    .select()
    .single());
  state.subjects = [...state.subjects, data].sort(bySubjectOrder);
  notify();
  return data;
}

export async function createSubjects(list) {
  if (!list.length) return [];
  const supabase = await client();
  const rows = list.map((item, index) => ({
    user_id: userId(),
    name: item.name.trim(),
    color: item.color,
    position: item.position ?? state.subjects.length + index,
  }));
  const data = unwrap(await supabase.from('subjects').insert(rows).select());
  state.subjects = [...state.subjects, ...data].sort(bySubjectOrder);
  notify();
  return data;
}

export async function updateSubject(id, patch) {
  const supabase = await client();
  const data = unwrap(await supabase.from('subjects').update(patch).eq('id', id).select().single());
  state.subjects = state.subjects.map((s) => (s.id === id ? data : s)).sort(bySubjectOrder);
  notify();
  return data;
}

export async function deleteSubject(id) {
  const supabase = await client();
  unwrap(await supabase.from('subjects').delete().eq('id', id));
  state.subjects = state.subjects.filter((s) => s.id !== id);
  // Las notas se eliminan en cascada; el horario conserva la clase sin asignatura.
  state.grades = state.grades.filter((g) => g.subject_id !== id);
  state.schedule = state.schedule.map((item) => (
    item.subject_id === id ? { ...item, subject_id: null } : item
  ));
  notify();
}

function bySubjectOrder(a, b) {
  if (a.position !== b.position) return a.position - b.position;
  return String(a.created_at).localeCompare(String(b.created_at));
}

export function subjectById(id) {
  return state.subjects.find((s) => s.id === id) || null;
}

/* -------------------------------------------------------------------------- */
/* Horario, examenes y entregas                                                */
/* -------------------------------------------------------------------------- */

export async function createScheduleItem(payload) {
  const supabase = await client();
  const data = unwrap(await supabase
    .from('schedule_items')
    .insert({ ...payload, user_id: userId() })
    .select()
    .single());
  state.schedule = [...state.schedule, data];
  notify();
  return data;
}

export async function createScheduleItems(payloads) {
  if (!payloads.length) return [];
  const supabase = await client();
  const rows = payloads.map((payload) => ({ ...payload, user_id: userId() }));
  const data = unwrap(await supabase.from('schedule_items').insert(rows).select());
  state.schedule = [...state.schedule, ...data];
  notify();
  return data;
}

export async function updateScheduleItem(id, patch) {
  const supabase = await client();
  const data = unwrap(await supabase.from('schedule_items').update(patch).eq('id', id).select().single());
  state.schedule = state.schedule.map((item) => (item.id === id ? data : item));
  notify();
  return data;
}

export async function deleteScheduleItem(id) {
  const supabase = await client();
  unwrap(await supabase.from('schedule_items').delete().eq('id', id));
  state.schedule = state.schedule.filter((item) => item.id !== id);
  notify();
}

/* -------------------------------------------------------------------------- */
/* Notas                                                                       */
/* -------------------------------------------------------------------------- */

export async function createGrade(payload) {
  const supabase = await client();
  const data = unwrap(await supabase
    .from('grades')
    .insert({ ...payload, user_id: userId() })
    .select()
    .single());
  state.grades = [data, ...state.grades];
  notify();
  return data;
}

export async function updateGrade(id, patch) {
  const supabase = await client();
  const data = unwrap(await supabase.from('grades').update(patch).eq('id', id).select().single());
  state.grades = state.grades.map((g) => (g.id === id ? data : g));
  notify();
  return data;
}

export async function deleteGrade(id) {
  const supabase = await client();
  unwrap(await supabase.from('grades').delete().eq('id', id));
  state.grades = state.grades.filter((g) => g.id !== id);
  notify();
}

/* -------------------------------------------------------------------------- */
/* Habitos                                                                     */
/* -------------------------------------------------------------------------- */

export async function createHabit(payload) {
  const supabase = await client();
  const data = unwrap(await supabase
    .from('habits')
    .insert({ ...payload, user_id: userId() })
    .select()
    .single());
  state.habits = [...state.habits, data];
  notify();
  return data;
}

export async function updateHabit(id, patch) {
  const supabase = await client();
  const data = unwrap(await supabase.from('habits').update(patch).eq('id', id).select().single());
  state.habits = state.habits.map((h) => (h.id === id ? data : h));
  notify();
  return data;
}

export async function deleteHabit(id) {
  const supabase = await client();
  unwrap(await supabase.from('habits').delete().eq('id', id));
  state.habits = state.habits.filter((h) => h.id !== id);
  state.completions = state.completions.filter((c) => c.habit_id !== id);
  notify();
}

export async function setHabitCompletion(habitId, dateIso, done) {
  const supabase = await client();
  if (done) {
    const data = unwrap(await supabase
      .from('habit_completions')
      .upsert({ user_id: userId(), habit_id: habitId, completed_on: dateIso }, { onConflict: 'habit_id,completed_on' })
      .select()
      .single());
    const exists = state.completions.some((c) => c.habit_id === habitId && c.completed_on === dateIso);
    if (!exists) state.completions = [...state.completions, data];
  } else {
    unwrap(await supabase
      .from('habit_completions')
      .delete()
      .eq('habit_id', habitId)
      .eq('completed_on', dateIso));
    state.completions = state.completions.filter(
      (c) => !(c.habit_id === habitId && String(c.completed_on).slice(0, 10) === dateIso),
    );
  }
  notify();
}

/* -------------------------------------------------------------------------- */
/* Diario                                                                      */
/* -------------------------------------------------------------------------- */

export async function createJournalEntry(payload) {
  const supabase = await client();
  const data = unwrap(await supabase
    .from('journal_entries')
    .insert({ ...payload, user_id: userId() })
    .select()
    .single());
  state.journal = [data, ...state.journal].sort(byEntryDate);
  notify();
  return data;
}

export async function updateJournalEntry(id, patch) {
  const supabase = await client();
  const data = unwrap(await supabase.from('journal_entries').update(patch).eq('id', id).select().single());
  state.journal = state.journal.map((e) => (e.id === id ? data : e)).sort(byEntryDate);
  notify();
  return data;
}

export async function deleteJournalEntry(id) {
  const supabase = await client();
  unwrap(await supabase.from('journal_entries').delete().eq('id', id));
  state.journal = state.journal.filter((e) => e.id !== id);
  notify();
}

function byEntryDate(a, b) {
  const dateCompare = String(b.entry_date).localeCompare(String(a.entry_date));
  if (dateCompare !== 0) return dateCompare;
  return String(b.created_at).localeCompare(String(a.created_at));
}

/* -------------------------------------------------------------------------- */
/* Libros                                                                      */
/* -------------------------------------------------------------------------- */

export async function createBook(payload) {
  const supabase = await client();
  const data = unwrap(await supabase
    .from('books')
    .insert({ ...payload, user_id: userId() })
    .select()
    .single());
  state.books = [data, ...state.books];
  notify();
  return data;
}

export async function updateBook(id, patch) {
  const supabase = await client();
  const data = unwrap(await supabase.from('books').update(patch).eq('id', id).select().single());
  state.books = state.books.map((b) => (b.id === id ? data : b));
  notify();
  return data;
}

export async function deleteBook(id) {
  const supabase = await client();
  unwrap(await supabase.from('books').delete().eq('id', id));
  state.books = state.books.filter((b) => b.id !== id);
  notify();
}

/* -------------------------------------------------------------------------- */
/* Concentracion                                                               */
/* -------------------------------------------------------------------------- */

export async function createFocusSession(payload) {
  const supabase = await client();
  const data = unwrap(await supabase
    .from('focus_sessions')
    .insert({ ...payload, user_id: userId() })
    .select()
    .single());
  state.focusSessions = [data, ...state.focusSessions];
  notify();
  return data;
}

export async function deleteFocusSession(id) {
  const supabase = await client();
  unwrap(await supabase.from('focus_sessions').delete().eq('id', id));
  state.focusSessions = state.focusSessions.filter((s) => s.id !== id);
  notify();
}

/* -------------------------------------------------------------------------- */
/* Cuentas atras                                                               */
/* -------------------------------------------------------------------------- */

export async function createCountdown(payload) {
  const supabase = await client();
  const data = unwrap(await supabase
    .from('countdowns')
    .insert({ ...payload, user_id: userId() })
    .select()
    .single());
  state.countdowns = [...state.countdowns, data].sort(byTarget);
  notify();
  return data;
}

export async function updateCountdown(id, patch) {
  const supabase = await client();
  const data = unwrap(await supabase.from('countdowns').update(patch).eq('id', id).select().single());
  state.countdowns = state.countdowns.map((c) => (c.id === id ? data : c)).sort(byTarget);
  notify();
  return data;
}

export async function deleteCountdown(id) {
  const supabase = await client();
  unwrap(await supabase.from('countdowns').delete().eq('id', id));
  state.countdowns = state.countdowns.filter((c) => c.id !== id);
  notify();
}

function byTarget(a, b) {
  return String(a.target_at).localeCompare(String(b.target_at));
}

/* -------------------------------------------------------------------------- */
/* Copia de seguridad y cuenta                                                 */
/* -------------------------------------------------------------------------- */

const EXPORT_TABLES = [
  'subjects', 'schedule_items', 'grades', 'habits', 'habit_completions',
  'journal_entries', 'books', 'focus_sessions', 'countdowns',
];

/** Descarga todos los datos del usuario directamente desde la base de datos. */
export async function fetchAllForExport() {
  const supabase = await client();
  const profile = unwrap(await supabase.from('profiles').select('*').eq('id', userId()).single());
  const tables = {};
  for (const table of EXPORT_TABLES) {
    tables[table] = unwrap(await supabase.from(table).select('*'));
  }
  return { profile, tables };
}

/** Borra todas las filas del usuario en las tablas de datos (no el perfil). */
export async function deleteAllUserData() {
  const supabase = await client();
  const id = userId();
  // El orden importa por las claves foraneas.
  const order = [
    'habit_completions', 'habits', 'grades', 'schedule_items', 'focus_sessions',
    'journal_entries', 'books', 'countdowns', 'subjects',
  ];
  for (const table of order) {
    unwrap(await supabase.from(table).delete().eq('user_id', id));
  }
}

export async function insertRows(table, rows) {
  if (!rows.length) return [];
  const supabase = await client();
  const chunks = [];
  for (let i = 0; i < rows.length; i += 200) chunks.push(rows.slice(i, i + 200));
  const inserted = [];
  for (const chunk of chunks) {
    inserted.push(...unwrap(await supabase.from(table).insert(chunk).select()));
  }
  return inserted;
}

/** Elimina la cuenta y, en cascada, todos los datos asociados. */
export async function deleteAccount() {
  const supabase = await client();
  const { error } = await supabase.rpc('delete_account');
  if (error) throw new DataError(error);
}

/** Vuelve a cargar todo el estado desde el servidor. */
export async function reload() {
  if (!state.session) return;
  await loadAll(state.session);
}
