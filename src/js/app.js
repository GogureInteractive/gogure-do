// Gogure Do — Main application (UI wiring)
// Uses ES modules natively in the browser. All rendering is done against a
// single store; every mutation goes through store.update() and re-renders.

import { createStore } from "./store.js";
import { createTimer } from "./timer.js";
import {
  makeEntity, editEntity, toggleComplete, todayStats, sortEntities,
  parseMentions, validEmail, uid, todayISO, weekStats, totalFocusMinutes,
  countOpen, mentionedNotInvited, normalizeName, allInvolved,
} from "./domain.js";

const store = createStore(localStorage);
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

// ---------------------------------------------------------------- navigation
let currentView = "focus";

function showView(view) {
  currentView = view;
  $$(".nav-item").forEach((b) => b.classList.toggle("active", b.dataset.view === view));
  $$(".view").forEach((v) => v.classList.toggle("hidden", v.id !== "view-" + view));
  render();
}

// ---------------------------------------------------------------- timer UI
const timer = createTimer({
  durations: durationsFromSettings(),
  onTick: paintTimer,
  onComplete: (s) => {
    // The timer already assigns a unique id to each finished session.
    store.update((st) => st.sessions.push(s));
    notify(s.mode);
    renderStats();
  },
});

function durationsFromSettings() {
  const s = store.getState().settings;
  return { focus: s.focusMin, short: s.shortBreakMin, long: s.longBreakMin };
}

function fmt(sec) {
  const m = Math.floor(sec / 60), r = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

function paintTimer(t) {
  $("#time-display").textContent = fmt(t.remaining);
  const ring = $("#progress-ring circle");
  if (ring) {
    const c = 2 * Math.PI * 88;
    ring.style.strokeDashoffset = c * (1 - (t.totalSec - t.remaining) / t.totalSec);
  }
  $$(".mode-chip").forEach((ch) => ch.classList.toggle("active", ch.dataset.mode === t.mode));
  $("#btn-start").textContent = t.running ? "Pause" : "Start";
  document.title = `${fmt(t.remaining)} · ${t.mode} — Do`;
}

function notify(mode) {
  const label = mode === "focus" ? "Fokus abgeschlossen — mach eine Pause!" : "Pause vorbei — zurück zum Fokus!";
  const el = $("#toast");
  el.textContent = label;
  el.classList.remove("hidden");
  setTimeout(() => el.classList.add("hidden"), 4000);
  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("Gogure Do", { body: label });
  }
}

$("#btn-start").addEventListener("click", () => (timer.isRunning() ? timer.pause() : timer.start()));
$("#btn-reset").addEventListener("click", () => timer.reset());
$$(".mode-chip").forEach((ch) => ch.addEventListener("click", () => timer.setMode(ch.dataset.mode)));

// Custom duration input
$("#custom-min").addEventListener("change", (e) => {
  const min = parseInt(e.target.value, 10);
  if (!min || min < 1 || min > 600) return;
  const mode = timer.getMode();
  store.update((st) => { st.settings[modeKey(mode)] = min; });
  timer.setDurations(durationsFromSettings());
  timer.reset();
});
const modeKey = (m) => ({ focus: "focusMin", short: "shortBreakMin", long: "longBreakMin" })[m];

$("#log-custom").addEventListener("click", () => {
  const min = parseInt($("#custom-min").value, 10);
  if (!min || min < 1) return;
  timer.logCustom(min * 60);
  renderStats();
  $("#custom-min").value = "";
});

if ("Notification" in window && Notification.permission === "default") {
  $("#btn-start").addEventListener("click", () => Notification.requestPermission(), { once: true });
}

// ---------------------------------------------------------------- stats
function renderStats() {
  const st = store.getState();
  const s = todayStats(st.sessions, st.settings);
  $("#stat-sessions").textContent = s.sessions;
  $("#stat-minutes").textContent = s.minutes;
  $("#stat-goal").textContent = s.goal;
  $("#goal-bar").style.width = s.percent + "%";
  $("#goal-label").textContent = `${s.minutes} / ${s.goal} Min heute (${s.percent}%)`;

  // Weekly overview (last 7 days) — small bars, no axis noise.
  const week = weekStats(st.sessions, 7);
  const max = Math.max(30, ...week.map((d) => d.minutes));
  $("#week-chart").innerHTML = week.map((d) => `
    <div class="bar-wrap" title="${d.day}: ${d.minutes} Min in ${d.sessions} Einheiten">
      <div class="bar" style="height:${Math.round((d.minutes / max) * 100)}%"></div>
      <span class="bar-label">${new Date(d.day + "T12:00").toLocaleDateString("de-DE", { weekday: "short" })}</span>
    </div>`).join("");
  $("#total-minutes").textContent = totalFocusMinutes(st.sessions);
  const open = countOpen(st.tasks);
  $("#open-counts").textContent =
    `${open.task + open["project-task"]} To-dos · ${open.idea} Ideen · ${open.memo} Memos offen`;
}

// ---------------------------------------------------------------- dialogs
function openDialog(id) { $(id).showModal(); }
function closeDialog(id) { $(id).close(); }

// ---- entity dialog (tasks / ideas / memos / project tasks)
let editingId = null;
function openEntityDialog(type, presetProject = null, existing = null) {
  editingId = existing ? existing.id : null;
  const st = store.getState();
  $("#entity-title").value = existing?.title || "";
  $("#entity-notes").value = existing?.notes || "";
  $("#entity-type").value = existing?.type || type;
  $("#entity-priority").value = existing?.priority || "medium";
  $("#entity-due").value = existing?.dueDate || "";
  $("#entity-assignee").value = existing?.assignee || "";
  const sel = $("#entity-project");
  sel.innerHTML = `<option value="">— ohne Projekt —</option>` +
    st.projects.map((p) => `<option value="${p.id}" ${existing?.projectId === p.id ? "selected" : ""}>${esc(p.name)}</option>`).join("");
  if (presetProject) sel.value = presetProject;
  $("#entity-dialog").querySelector("h2").textContent = existing ? "Bearbeiten" : "Neu";
  openDialog("#entity-dialog");
}

$("#entity-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    title: $("#entity-title").value,
    notes: $("#entity-notes").value,
    type: $("#entity-type").value,
    priority: $("#entity-priority").value,
    dueDate: $("#entity-due").value,
    projectId: $("#entity-project").value || null,
    assignee: $("#entity-assignee").value.trim() || null,
  };
  try {
    store.update((st) => {
      if (editingId) {
        const i = st.tasks.findIndex((t) => t.id === editingId);
        if (i >= 0) st.tasks[i] = editEntity(st.tasks[i], data);
      } else {
        st.tasks.push(makeEntity(data));
      }
    });
    closeDialog("#entity-dialog");
    render();
  } catch (err) { alert(err.message); }
});

// ---- project dialog
let editingProjectId = null;
$("#project-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const name = $("#project-name").value.trim();
  const color = $("#project-color").value;
  if (!name) return;
  store.update((st) => {
    if (editingProjectId) {
      const p = st.projects.find((x) => x.id === editingProjectId);
      if (p) Object.assign(p, { name, color });
    } else {
      st.projects.push({ id: uid(), name, color, createdAt: new Date().toISOString() });
    }
  });
  editingProjectId = null;
  $("#project-name").value = "";
  closeDialog("#project-dialog");
  render();
});

// ---- event dialog (calendar)
let editingEventId = null;
$("#event-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const data = {
    title: $("#event-title").value.trim(),
    date: $("#event-date").value,
    time: $("#event-time").value || "",
    durationMin: parseInt($("#event-duration").value, 10) || 30,
    description: $("#event-desc").value,
  };
  if (!data.title || !data.date) return;
  store.update((st) => {
    if (editingEventId) {
      const ev = st.events.find((x) => x.id === editingEventId);
      if (ev) Object.assign(ev, data);
    } else {
      st.events.push({ id: uid(), ...data, createdAt: new Date().toISOString() });
    }
  });
  editingEventId = null;
  closeDialog("#event-dialog");
  render();
});

// ---- invite dialog
let editingInviteId = null;
$("#invite-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = $("#invite-email").value.trim();
  const role = $("#invite-role").value;
  if (!validEmail(email)) { toast("Bitte gültige E-Mail-Adresse eingeben.", true); return; }

  const backendUrl = localStorage.getItem("gogure-do-backend") || "";
  const invite = editingInviteId
    ? { ...store.getState().invites.find((i) => i.id === editingInviteId), email, role }
    : { id: uid(), email, role, status: "pending", createdAt: new Date().toISOString() };

  store.update((st) => {
    if (editingInviteId) {
      const i = st.invites.findIndex((x) => x.id === editingInviteId);
      if (i >= 0) st.invites[i] = { ...st.invites[i], email, role };
    } else {
      st.invites.push(invite);
    }
  });
  editingInviteId = null;

  // Optional backend sync — silently skipped when offline / not configured.
  if (backendUrl) {
    try {
      await fetch(backendUrl + "/api/invites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(invite),
      });
    } catch (_) { /* offline is fine — data stays local */ }
  }
  $("#invite-email").value = "";
  closeDialog("#invite-dialog");
  render();
});

// ---------------------------------------------------------------- CRUD ops
/** Show a brief toast message. `isError` styles it as an error. */
function toast(text, isError = false) {
  const el = $("#toast");
  el.textContent = text;
  el.classList.remove("hidden");
  el.classList.toggle("error", isError);
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.add("hidden"), 4000);
}

function deleteEntity(id) {
  if (!confirm("Wirklich löschen?")) return;
  store.update((st) => { st.tasks = st.tasks.filter((t) => t.id !== id); });
  render();
}
function completeEntity(id) {
  store.update((st) => {
    const i = st.tasks.findIndex((t) => t.id === id);
    if (i >= 0) st.tasks[i] = toggleComplete(st.tasks[i]);
  });
  render();
}
/** Delegation via dialog with datalist of known people (invites + mentions). */
let delegateTargetId = null;
function openDelegateDialog(id) {
  delegateTargetId = id;
  const st = store.getState();
  const t = st.tasks.find((x) => x.id === id);
  if (!t) return;
  const known = new Set([
    ...st.invites.map((i) => normalizeName(String(i.email).split("@")[0])),
    ...st.tasks.flatMap((x) => x.mentions || []),
    ...(t.assignee ? [normalizeName(t.assignee)] : []),
  ].filter(Boolean));
  $("#delegate-datalist").innerHTML = [...known].map((n) => `<option value="${esc(n)}">`).join("");
  $("#delegate-name").value = t.assignee || "";
  $("#delegate-dialog").querySelector("h2").textContent = `Delegieren: ${t.title}`;
  openDialog("#delegate-dialog");
}
function applyDelegate(name) {
  const clean = normalizeName(name);
  if (!clean) return;
  store.update((st) => {
    const t = st.tasks.find((x) => x.id === delegateTargetId);
    if (t) {
      t.assignee = clean;
      t.mentions = parseMentions(`${t.title} ${t.notes} @${clean}`);
    }
  });
  delegateTargetId = null;
  render();
}
function startTaskTimer(id) {
  showView("focus");
  const t = store.getState().tasks.find((x) => x.id === id);
  if (t) $("#active-task").textContent = "Aktiv: " + t.title;
  if (!timer.isRunning()) timer.start();
}

// ---------------------------------------------------------------- rendering
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
/** Render text and highlight @mentions in a slightly bolder primary colour. */
function mentionChips(list) {
  return (list || []).map((m) => `<span class="chip mention">@${esc(m)}</span>`).join("");
}

function entityCard(t, projects) {
  const proj = projects.find((p) => p.id === t.projectId);
  const done = !!t.completedAt;
  return `
  <div class="card entity ${done ? "done" : ""}">
    <label class="check"><input type="checkbox" ${done ? "checked" : ""} data-complete="${t.id}"></label>
    <div class="entity-body">
      <div class="entity-title">${esc(t.title)}</div>
      ${t.notes ? `<div class="entity-notes">${esc(t.notes)}</div>` : ""}
      <div class="entity-meta">
        <span class="chip prio-${t.priority}">${{ low: "Niedrig", medium: "Mittel", high: "Hoch" }[t.priority] || t.priority}</span>
        ${proj ? `<span class="chip" style="--c:${proj.color}">@${esc(proj.name)}</span>` : ""}
        ${t.dueDate ? `<span class="chip ${t.dueDate < todayISO() && !done ? "overdue" : ""}">📅 ${t.dueDate}</span>` : ""}
        ${t.assignee ? `<span class="chip assignee">→ ${esc(t.assignee)}</span>` : ""}
        ${mentionChips(t.mentions)}
      </div>
    </div>
    <div class="entity-actions">
      ${t.type === "task" || t.type === "project-task" ? `<button title="Fokussieren" data-focus="${t.id}">▶</button>` : ""}
      <button title="Delegieren" data-delegate="${t.id}">→</button>
      <button title="Bearbeiten" data-edit="${t.id}">✎</button>
      <button title="Löschen" data-del="${t.id}">🗑</button>
    </div>
  </div>`;
}

function renderLists() {
  const st = store.getState();
  const projects = st.projects;
  const byType = (types) => sortEntities(st.tasks.filter((t) => types.includes(t.type)));

  $("#todos-list").innerHTML = byType(["task"]).map((t) => entityCard(t, projects)).join("") || emptyMsg("Noch keine To-dos. Lege oben ein Element an.");
  $("#ideas-list").innerHTML = byType(["idea"]).map((t) => entityCard(t, projects)).join("") || emptyMsg("Noch keine Ideen 💡");
  $("#memos-list").innerHTML = byType(["memo"]).map((t) => entityCard(t, projects)).join("") || emptyMsg("Noch keine Memos 📝");

  $("#projects-list").innerHTML = projects.map((p) => {
    const items = st.tasks.filter((t) => t.projectId === p.id);
    const done = items.filter((t) => t.completedAt).length;
    return `
    <div class="card project-card">
      <div class="project-head">
        <span class="dot" style="background:${p.color}"></span>
        <strong>${esc(p.name)}</strong>
        <span class="grow"></span>
        <button data-edit-project="${p.id}" title="Bearbeiten">✎</button>
        <button data-del-project="${p.id}" title="Löschen">🗑</button>
      </div>
      <div class="project-progress"><div style="width:${items.length ? (done / items.length) * 100 : 0}%"></div></div>
      <small>${done}/${items.length} Aufgaben erledigt</small>
      <div class="project-items">${items.slice(0, 5).map((t) => entityCard(t, projects)).join("")}</div>
      <button class="text-btn" data-add-to-project="${p.id}">+ Aufgabe zu “${esc(p.name)}”</button>
    </div>`;
  }).join("") || emptyMsg("Noch keine Projekte.");
}

function renderCalendar() {
  const st = store.getState();
  const now = new Date();
  const y = calCursor.y ?? now.getFullYear(), m = calCursor.m ?? now.getMonth();
  calCursor.y = y; calCursor.m = m;
  const first = new Date(y, m, 1);
  const days = new Date(y, m + 1, 0).getDate();
  const offset = (first.getDay() + 6) % 7; // Monday-first
  const monthName = first.toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  $("#cal-title").textContent = monthName.charAt(0).toUpperCase() + monthName.slice(1);

  let html = "";
  for (let i = 0; i < offset; i++) html += `<div class="cal-cell empty"></div>`;
  for (let d = 1; d <= days; d++) {
    const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const evs = st.events.filter((e) => e.date === iso);
    const tks = st.tasks.filter((t) => t.dueDate === iso && !t.completedAt);
    const isToday = iso === todayISO();
    html += `<div class="cal-cell ${isToday ? "today" : ""}" data-day="${iso}">
      <span class="cal-day">${d}</span>
      ${evs.map((e) => `<span class="cal-ev" data-edit-event="${e.id}">${esc(e.time || "")} ${esc(e.title)}</span>`).join("")}
      ${tks.slice(0, 3).map((t) => `<span class="cal-task">• ${esc(t.title)}</span>`).join("")}
      ${tks.length > 3 ? `<span class="cal-task">+${tks.length - 3} weitere</span>` : ""}
    </div>`;
  }
  $("#cal-grid").innerHTML = html;

  const upcoming = [...st.events].filter((e) => e.date >= todayISO()).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)).slice(0, 6);
  $("#upcoming").innerHTML = upcoming.map((e) => `
    <div class="card row">
      <div><strong>${esc(e.title)}</strong><div class="muted">${e.date} ${esc(e.time || "")} · ${e.durationMin} Min</div>
      ${e.description ? `<div class="muted small">${esc(e.description)}</div>` : ""}</div>
      <span class="grow"></span>
      <button data-edit-event="${e.id}">✎</button><button data-del-event="${e.id}">🗑</button>
    </div>`).join("") || emptyMsg("Keine anstehenden Termine.");
}
const calCursor = {};

const ROLE_LABELS = { viewer: "Kann ansehen", editor: "Kann bearbeiten", member: "Mitglied" };
const STATUS_LABELS = { pending: "Ausstehend", accepted: "Akzeptiert", revoked: "Zurückgezogen" };

function renderInvites() {
  const st = store.getState();
  $("#invite-list").innerHTML = st.invites.map((i) => `
    <div class="card row">
      <div><strong>${esc(i.email)}</strong><div class="muted">Rolle: ${ROLE_LABELS[i.role] || esc(i.role)} · Status: ${STATUS_LABELS[i.status] || esc(i.status)}</div></div>
      <span class="grow"></span>
      ${i.status === "pending" ? `<button data-invite-action="accepted" data-id="${i.id}">Akzeptieren simulieren</button>` : ""}
      ${i.status !== "revoked" ? `<button data-invite-action="revoked" data-id="${i.id}">Zurückziehen</button>` : ""}
      <button data-edit-invite="${i.id}" title="Bearbeiten">✎</button>
      <button data-del-invite="${i.id}" title="Entfernen">🗑</button>
    </div>`).join("") || emptyMsg("Keine Einladungen.");

  // Team overview: everyone mentioned or delegated to across all entities.
  const missing = mentionedNotInvited(st.tasks, st.invites);
  $("#team-list").innerHTML = `
    <div class="card row">
      <div><strong>Erwähnt / delegiert an:</strong>
        <div class="entity-meta">${allInvolved(st.tasks).map((p) => `<span class="chip mention">@${esc(p)}</span>`).join("") || '<span class="muted small">Noch niemanden erwähnt. Nutze @name in Aufgaben oder delegiere per →.</span>'}</div>
      </div>
    </div>
    ${missing.length ? `<div class="card hint-card">💡 Noch nicht eingeladen: ${missing.map((m) => `<button class="text-btn" data-invite-person="${esc(m)}">@${esc(m)}</button>`).join(" ")}</div>` : ""}`;
}

/** Pre-fill the invite dialog from a clicked @mention. */
function openInviteDialogFor(person) {
  editingInviteId = null;
  $("#invite-form").reset();
  $("#invite-email").value = person.includes("@") ? person : `${person}@example.org`;
  openDialog("#invite-dialog");
}

function emptyMsg(text) {
  return `<div class="empty-state">${esc(text)}</div>`;
}

function render() {
  renderStats();
  if (currentView === "plan") renderLists();
  if (currentView === "calendar") renderCalendar();
  if (currentView === "people") renderInvites();
}

// ---------------------------------------------------------------- delegated events
document.body.addEventListener("click", (e) => {
  const b = e.target.closest("button,[data-complete]");
  if (!b) return;
  const d = b.dataset;
  if (d.view) showView(d.view);
  else if (d.complete) completeEntity(d.complete);
  else if (d.edit) openEntityDialog("task", null, store.getState().tasks.find((t) => t.id === d.edit));
  else if (d.del) deleteEntity(d.del);
  else if (d.delegate) openDelegateDialog(d.delegate);
  else if (d.focus) startTaskTimer(d.focus);
  else if (d.invitePerson) openInviteDialogFor(d.invitePerson);
  else if (d.addToProject) openEntityDialog("project-task", d.addToProject);
  else if (d.editProject) {
    const p = store.getState().projects.find((x) => x.id === d.editProject);
    editingProjectId = p.id; $("#project-name").value = p.name; $("#project-color").value = p.color;
    openDialog("#project-dialog");
  } else if (d.delProject) {
    if (!confirm("Projekt und Zuordnung löschen? Aufgaben bleiben erhalten.")) return;
    store.update((st) => {
      st.projects = st.projects.filter((x) => x.id !== d.delProject);
      st.tasks.forEach((t) => { if (t.projectId === d.delProject) t.projectId = null; });
    });
    render();
  } else if (d.editEvent) {
    const ev = store.getState().events.find((x) => x.id === d.editEvent);
    editingEventId = ev.id;
    $("#event-title").value = ev.title; $("#event-date").value = ev.date;
    $("#event-time").value = ev.time; $("#event-duration").value = ev.durationMin; $("#event-desc").value = ev.description;
    openDialog("#event-dialog");
  } else if (d.delEvent) {
    store.update((st) => { st.events = st.events.filter((x) => x.id !== d.delEvent); });
    render();
  } else if (d.delInvite) {
    store.update((st) => { st.invites = st.invites.filter((x) => x.id !== d.delInvite); });
    render();
  } else if (d.editInvite) {
    const inv = store.getState().invites.find((x) => x.id === d.editInvite);
    editingInviteId = inv.id;
    $("#invite-form").reset();
    $("#invite-email").value = inv.email;
    $("#invite-role").value = inv.role;
    openDialog("#invite-dialog");
  } else if (d.inviteAction) {
    store.update((st) => { const i = st.invites.find((x) => x.id === d.id); if (i) i.status = d.inviteAction; });
    render();
  }
});

// delegate dialog submit (form method="dialog": closes automatically)
$("#delegate-form").addEventListener("submit", () => {
  applyDelegate($("#delegate-name").value);
});

// calendar day click → new event prefilled
$("#cal-grid")?.addEventListener("click", (e) => {
  const cell = e.target.closest("[data-day]");
  if (!cell || e.target.closest("[data-edit-event]")) return;
  editingEventId = null;
  $("#event-form").reset();
  $("#event-date").value = cell.dataset.day;
  openDialog("#event-dialog");
});

// nav buttons + quick add
$$("[data-new]").forEach((btn) => btn.addEventListener("click", () => {
  editingId = null; $("#entity-form").reset();
  openEntityDialog(btn.dataset.new);
}));
$("#new-project-btn").addEventListener("click", () => { editingProjectId = null; $("#project-form").reset(); openDialog("#project-dialog"); });
$("#new-event-btn").addEventListener("click", () => {
  editingEventId = null; $("#event-form").reset(); $("#event-date").value = todayISO(); openDialog("#event-dialog");
});
$("#new-invite-btn").addEventListener("click", () => { editingInviteId = null; $("#invite-form").reset(); openDialog("#invite-dialog"); });
$("#cal-prev").addEventListener("click", () => { calCursor.m--; if (calCursor.m < 0) { calCursor.m = 11; calCursor.y--; } renderCalendar(); });
$("#cal-next").addEventListener("click", () => { calCursor.m++; if (calCursor.m > 11) { calCursor.m = 0; calCursor.y++; } renderCalendar(); });

// cancel buttons inside dialogs
$$("dialog .cancel").forEach((b) => b.addEventListener("click", () => b.closest("dialog").close()));

// ---------------------------------------------------------------- export / import / privacy
/** Art. 20 DSGVO — data portability: download the full local state as JSON. */
$("#export-data").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(store.getState(), null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "gogure-do-export.json";
  a.click();
  URL.revokeObjectURL(a.href);
});

/** Import a previously exported JSON file (replaces the current state). */
$("#import-file").addEventListener("change", async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    store.replaceState(JSON.parse(await file.text()));
    timer.setDurations(durationsFromSettings());
    timer.reset();
    render();
    toast("Daten importiert ✓");
  } catch (err) {
    toast("Import fehlgeschlagen: " + err.message, true);
  }
  e.target.value = ""; // allow re-importing the same file
});

/** Optional self-hosted sync backend (see backend/README.md). Empty = off. */
const BACKEND_KEY = "gogure-do-backend";
$("#backend-url").value = localStorage.getItem(BACKEND_KEY) || "";
$("#save-backend").addEventListener("click", () => {
  const url = $("#backend-url").value.trim().replace(/\/+$/, "");
  if (url) localStorage.setItem(BACKEND_KEY, url);
  else localStorage.removeItem(BACKEND_KEY);
  toast(url ? `Sync-Backend gespeichert: ${url}` : "Sync deaktiviert — Daten bleiben nur lokal.");
});

/** Art. 17 DSGVO — right to erasure. */
$("#delete-all").addEventListener("click", () => {
  if (confirm("Alle Daten unwiderruflich löschen?")) { store.reset(); timer.reset(); render(); }
});

// ---------------------------------------------------------------- init
paintTimer({ mode: "focus", totalSec: timer.getTotal(), remaining: timer.getRemaining(), running: false });
render();
