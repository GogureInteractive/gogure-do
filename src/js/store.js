// Gogure Do — Data Store
// Persists all entities (tasks, projects, ideas, memos, events, invites,
// focus sessions) in localStorage. All data stays on the user's device (GDPR
// data-minimisation: no personal data leaves the browser unless the user
// explicitly uses the optional sync backend).

export const STORAGE_KEY = "gogure-do-store-v1";

export function defaultState() {
  return {
    tasks: [],      // {id,title,notes,type,priority,dueDate,projectId,assignee,mentions[],createdAt,completedAt}
    projects: [],   // {id,name,color,createdAt}
    events: [],     // {id,title,date,time,durationMin,description,createdAt}
    invites: [],    // {id,email,role,status,createdAt}
    sessions: [],   // {id,mode,start,end,seconds,custom} completed focus/break sessions
    settings: {
      focusMin: 25,
      shortBreakMin: 5,
      longBreakMin: 15,
      dailyGoalMin: 100,
      theme: "light",
    },
  };
}

export function createStore(storage) {
  let state = load();

  function load() {
    try {
      const raw = storage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      return { ...defaultState(), ...parsed, settings: { ...defaultState().settings, ...(parsed.settings || {}) } };
    } catch (e) {
      console.warn("Store: corrupt data, resetting.", e);
      return defaultState();
    }
  }

  function save() {
    storage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function getState() {
    return state;
  }

  function setState(next) {
    state = next;
    save();
  }

  function update(fn) {
    fn(state);
    save();
  }

  function reset() {
    state = defaultState();
    save();
  }

  /** Replace the whole state after validating its shape (used by "Import").
   *  Throws on invalid input so callers can surface a friendly error. */
  function replaceState(next) {
    if (!next || typeof next !== "object") throw new Error("Ungültiges Dateiformat");
    const d = defaultState();
    const arr = (v, fallback) => (Array.isArray(v) ? v : fallback);
    setState({
      tasks: arr(next.tasks, d.tasks),
      projects: arr(next.projects, d.projects),
      events: arr(next.events, d.events),
      invites: arr(next.invites, d.invites),
      sessions: arr(next.sessions, d.sessions),
      settings: { ...d.settings, ...(next.settings && typeof next.settings === "object" ? next.settings : {}) },
    });
  }

  return { getState, setState, update, reset, save, replaceState };
}
