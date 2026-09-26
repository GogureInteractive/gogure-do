// Gogure Do — Domain logic helpers (pure functions, unit-testable)
// Entity CRUD, stats aggregation, mention parsing, date helpers.

/** Generate a unique id. Uses crypto.randomUUID when available and falls back
 *  to a timestamp+random string in older/insecure contexts. */
export function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

export const ENTITY_TYPES = ["task", "project-task", "idea", "memo"];
export const PRIORITIES = ["low", "medium", "high"];

/** Parse @mentions out of free text (e.g. "@anna @bob"). Returns unique names. */
export function parseMentions(text) {
  if (!text) return [];
  const matches = text.match(/(^|\s)@([\w.\-äöüß]+)/g) || [];
  return [...new Set(matches.map((m) => m.trim().slice(1)))];
}

/** Create a new entity with sane defaults. */
export function makeEntity({ title, notes = "", type = "task", priority = "medium", dueDate = "", projectId = null, assignee = "" }) {
  if (!title || !title.trim()) throw new Error("Title is required");
  if (!ENTITY_TYPES.includes(type)) throw new Error("Unknown type: " + type);
  if (!PRIORITIES.includes(priority)) throw new Error("Unknown priority: " + priority);
  return {
    id: uid(),
    title: title.trim(),
    notes,
    type,
    priority,
    dueDate: dueDate || null,
    projectId: projectId || null,
    assignee: assignee || null,          // delegation: person the item is delegated to
    mentions: parseMentions(title + " " + notes),
    createdAt: new Date().toISOString(),
    completedAt: null,
  };
}

/** Immutably update an entity; re-parses mentions when text fields change. */
export function editEntity(entity, patch) {
  const next = { ...entity, ...patch, id: entity.id, createdAt: entity.createdAt };
  if ("title" in patch || "notes" in patch) {
    next.mentions = parseMentions((next.title || "") + " " + (next.notes || ""));
  }
  return next;
}

export function toggleComplete(entity) {
  return { ...entity, completedAt: entity.completedAt ? null : new Date().toISOString() };
}

/** Today's ISO date string (local time). */
export function todayISO(d = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Focus statistics for the current day. */
export function todayStats(sessions, settings, now = new Date()) {
  const day = todayISO(now);
  const todays = sessions.filter((s) => s.mode === "focus" && s.end && todayISO(new Date(s.end)) === day);
  const seconds = todays.reduce((a, s) => a + (s.seconds || 0), 0);
  const minutes = Math.round(seconds / 60);
  const goal = settings?.dailyGoalMin ?? 100;
  return {
    sessions: todays.length,
    minutes,
    goal,
    percent: goal > 0 ? Math.min(100, Math.round((minutes / goal) * 100)) : 0,
  };
}

/** Sort helper: open items first, then by priority and due date. */
export function sortEntities(items) {
  const rank = { high: 0, medium: 1, low: 2 };
  return [...items].sort((a, b) => {
    if (!!a.completedAt !== !!b.completedAt) return a.completedAt ? 1 : -1;
    const pa = rank[a.priority] ?? 1, pb = rank[b.priority] ?? 1;
    if (pa !== pb) return pa - pb;
    if (a.dueDate && b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
    if (a.dueDate) return -1;
    if (b.dueDate) return 1;
    return 0;
  });
}

/** Validate an email address (used for invites). */
export function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email || "");
}

/** Normalise a person name for matching: trims whitespace, strips a leading
 *  "@", lowercases. Used to link @mentions with invitees / assignees. */
export function normalizeName(name) {
  return String(name || "").trim().replace(/^@+/, "").toLowerCase();
}

/** The set of people referenced by an entity: its assignee plus every
 *  @mention found in title/notes (assignee excluded when already mentioned). */
export function involvedPeople(entity) {
  const out = [];
  const seen = new Set();
  const add = (n) => {
    const k = normalizeName(n);
    if (k && !seen.has(k)) { seen.add(k); out.push(k); }
  };
  (entity?.mentions || []).forEach(add);
  add(entity?.assignee);
  return out;
}

/** All people involved across every entity (for the team overview). */
export function allInvolved(tasks) {
  const set = new Set();
  (tasks || []).forEach((t) => involvedPeople(t).forEach((p) => set.add(p)));
  return [...set].sort();
}

/** People mentioned or delegated-to that have no matching invite yet.
 *  Matching is done on the normalised name, the full e-mail and its local part. */
export function mentionedNotInvited(entities, invites) {
  const known = new Set();
  (invites || []).forEach((i) => {
    const email = normalizeName(i.email);
    known.add(email);
    known.add(email.split("@")[0]);
  });
  return allInvolved(entities).filter((p) => !known.has(p));
}

/** Aggregate focus statistics over an explicit ISO day ("YYYY-MM-DD"). */
export function statsForDay(sessions, settings, day, now = new Date()) {
  const todays = (sessions || []).filter(
    (s) => s.mode === "focus" && s.end && todayISO(new Date(s.end)) === day
  );
  const seconds = todays.reduce((a, s) => a + (s.seconds || 0), 0);
  const minutes = Math.round(seconds / 60);
  const goal = settings?.dailyGoalMin ?? 100;
  return {
    day,
    sessions: todays.length,
    minutes,
    goal,
    percent: goal > 0 ? Math.min(100, Math.round((minutes / goal) * 100)) : 0,
  };
}

/** Focus minutes per day for the last `days` calendar days (oldest first).
 *  Used by the weekly overview chart on the focus page. */
export function weekStats(sessions, days = 7, now = new Date()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const s = statsForDay(sessions, null, todayISO(d), now);
    out.push({ day: s.day, minutes: s.minutes, sessions: s.sessions });
  }
  return out;
}

/** Total completed focus minutes across all stored sessions. */
export function totalFocusMinutes(sessions) {
  return Math.round(
    (sessions || [])
      .filter((s) => s.mode === "focus")
      .reduce((a, s) => a + (s.seconds || 0), 0) / 60
  );
}

/** Count open (not completed) entities per type. */
export function countOpen(tasks) {
  const c = { task: 0, "project-task": 0, idea: 0, memo: 0 };
  (tasks || []).forEach((t) => {
    if (!t.completedAt && c[t.type] !== undefined) c[t.type]++;
  });
  return c;
}
