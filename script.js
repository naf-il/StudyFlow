// StudyFlow: tasks, custom habits, focus timer and theme preferences.
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const STORAGE = { tasks: "studyflow_tasks_v1", habits: "studyflow_habits_v1", theme: "studyflow_theme_v1", sessions: "studyflow_sessions_v1" };

function load(key, fallback) {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) : fallback; }
  catch { return fallback; }
}
function save(key, value) { localStorage.setItem(key, JSON.stringify(value)); }

let tasks = load(STORAGE.tasks, []);
let habits = load(STORAGE.habits, []);
let sessions = load(STORAGE.sessions, {});
let currentFilter = "all";
let toastTimer;

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
}
function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, char => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[char]));
}
function notify(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove("show"), 2200);
}
function formatDate(date) {
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { month:"short", day:"numeric" });
}

// Theme preference
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme;
  $("#themeIcon").textContent = theme === "dark" ? "☀" : "☾";
  $("#themeToggle").setAttribute("aria-label", theme === "dark" ? "Switch to light theme" : "Switch to dark theme");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = theme === "dark" ? "#141625" : "#f6f7fb";
}
let theme = localStorage.getItem(STORAGE.theme) || "light";
applyTheme(theme);
$("#themeToggle").addEventListener("click", () => {
  theme = theme === "light" ? "dark" : "light";
  localStorage.setItem(STORAGE.theme, theme);
  applyTheme(theme);
});

// Navigation
function showView(name) {
  $$(".view").forEach(view => view.classList.toggle("active", view.id === `view-${name}`));
  $$(".nav-link").forEach(link => link.classList.toggle("active", link.dataset.view === name));
  $("#breadcrumbTitle").textContent = ({ overview:"Overview", tasks:"My Tasks", focus:"Focus Room", habits:"Daily Habits" })[name] || "Overview";
  $("#sidebar").classList.remove("open");
  window.scrollTo({ top:0, behavior:"smooth" });
}
$$(".nav-link").forEach(link => link.addEventListener("click", () => showView(link.dataset.view)));
$$("[data-go]").forEach(button => button.addEventListener("click", () => showView(button.dataset.go)));
$("#menuBtn").addEventListener("click", () => $("#sidebar").classList.toggle("open"));

// Tasks
function renderTasks() {
  const visible = tasks.filter(task => currentFilter === "all" || (currentFilter === "active" ? !task.done : task.done));
  $("#taskList").innerHTML = visible.map(task => `
    <div class="task-row" data-id="${task.id}">
      <button class="check-button ${task.done ? "checked" : ""}" data-task-action="toggle" aria-label="${task.done ? "Mark incomplete" : "Complete task"}">${task.done ? "✓" : ""}</button>
      <div class="task-main"><span class="task-name ${task.done ? "is-done" : ""}">${escapeHTML(task.title)}</span><div class="task-meta">${task.due ? `Due ${formatDate(task.due)}` : "No due date"}</div></div>
      <span class="priority-label ${task.priority}">${task.priority}</span>
      <button class="delete-button" data-task-action="delete" aria-label="Delete task">×</button>
    </div>`).join("");
  $("#taskEmpty").hidden = visible.length > 0;
  $("#taskCountLabel").textContent = `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`;
  $("#navTaskCount").textContent = tasks.filter(t => !t.done).length;
  const pending = tasks.filter(t => !t.done);
  $("#overviewTaskList").innerHTML = pending.slice(0,4).map(task => `
    <div class="compact-task"><button class="check-button" data-overview-toggle="${task.id}" aria-label="Complete task"></button><span class="compact-task-name">${escapeHTML(task.title)}</span><span class="priority-dot priority-${task.priority}" title="${task.priority} priority"></span></div>`).join("");
  $("#overviewTaskEmpty").hidden = pending.length > 0;
  $("#statPending").textContent = pending.length;
  $("#statCompleted").textContent = tasks.filter(t => t.done && t.completedOn === todayKey()).length;
}
$("#taskForm").addEventListener("submit", event => {
  event.preventDefault();
  const title = $("#taskInput").value.trim();
  if (!title) return;
  tasks.unshift({ id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), title, priority:$("#taskPriority").value, due:$("#taskDue").value, done:false, createdOn:todayKey() });
  save(STORAGE.tasks, tasks);
  $("#taskForm").reset();
  renderAll();
  notify("Task added to your list.");
});
$("#taskList").addEventListener("click", event => {
  const button = event.target.closest("[data-task-action]");
  if (!button) return;
  const row = button.closest("[data-id]");
  const task = tasks.find(item => item.id === row.dataset.id);
  if (!task) return;
  if (button.dataset.taskAction === "toggle") {
    task.done = !task.done;
    task.completedOn = task.done ? todayKey() : null;
    notify(task.done ? "Nice work — task completed!" : "Task moved back to to-do.");
  } else {
    tasks = tasks.filter(item => item.id !== task.id);
    notify("Task deleted.");
  }
  save(STORAGE.tasks, tasks); renderAll();
});
$("#overviewTaskList").addEventListener("click", event => {
  const button = event.target.closest("[data-overview-toggle]");
  if (!button) return;
  const task = tasks.find(item => item.id === button.dataset.overviewToggle);
  if (task) { task.done = true; task.completedOn = todayKey(); save(STORAGE.tasks,tasks); renderAll(); notify("Nice work — task completed!"); }
});
$$(".filter-tab").forEach(button => button.addEventListener("click", () => {
  currentFilter = button.dataset.filter;
  $$(".filter-tab").forEach(tab => tab.classList.toggle("active", tab === button));
  renderTasks();
}));

// Custom daily habits. Completion is stored per date, so a new day starts unchecked.
function renderHabits() {
  const today = todayKey();
  const completed = habits.filter(habit => habit.completedOn === today).length;
  const percent = habits.length ? Math.round(completed / habits.length * 100) : 0;
  $("#habitPercent").textContent = `${percent}%`;
  $("#habitCircleText").textContent = `${percent}%`;
  $("#habitCircle").style.background = `conic-gradient(var(--green) ${percent*3.6}deg, var(--surface-2) 0deg)`;
  $("#habitProgressText").textContent = habits.length ? `${completed} of ${habits.length} habits completed today.` : "No habits added yet.";
  $("#habitCountLabel").textContent = `${habits.length} ${habits.length === 1 ? "habit" : "habits"}`;
  $("#habitEmpty").hidden = habits.length > 0;
  $("#habitList").innerHTML = habits.map(habit => {
    const done = habit.completedOn === today;
    return `<div class="habit-row" data-habit-id="${habit.id}">
      <button class="habit-check ${done ? "done" : ""}" data-habit-action="toggle" aria-label="${done ? "Mark habit incomplete" : "Complete habit"}">${done ? "✓" : ""}</button>
      <span class="habit-row-name ${done ? "done" : ""}">${escapeHTML(habit.name)}</span>
      <button class="delete-button" data-habit-action="edit" aria-label="Edit habit" title="Edit habit">✎</button>
      <button class="delete-button" data-habit-action="delete" aria-label="Delete habit" title="Delete habit">×</button>
    </div>`;
  }).join("");
  $("#overviewHabitList").innerHTML = habits.slice(0,4).map(habit => `<div class="habit-preview-row"><span class="habit-name">${escapeHTML(habit.name)}</span><span class="tiny-check">${habit.completedOn === today ? "✓" : "○"}</span></div>`).join("");
  $("#overviewHabitEmpty").hidden = habits.length > 0;
  $("#statHabits").textContent = `${percent}%`;
  $("#habitStatNote").textContent = `${completed} of ${habits.length} completed`;
}
$("#habitForm").addEventListener("submit", event => {
  event.preventDefault();
  const name = $("#habitInput").value.trim();
  if (!name) return;
  habits.push({ id:crypto.randomUUID ? crypto.randomUUID() : String(Date.now()), name, completedOn:null });
  save(STORAGE.habits, habits);
  $("#habitForm").reset(); renderAll(); notify("New habit added.");
});
$("#habitList").addEventListener("click", event => {
  const button = event.target.closest("[data-habit-action]");
  if (!button) return;
  const row = button.closest("[data-habit-id]");
  const habit = habits.find(item => item.id === row.dataset.habitId);
  if (!habit) return;
  if (button.dataset.habitAction === "toggle") {
    habit.completedOn = habit.completedOn === todayKey() ? null : todayKey();
    notify(habit.completedOn ? "Habit completed. Keep it up!" : "Habit unchecked.");
  } else if (button.dataset.habitAction === "edit") {
    const changed = prompt("Edit your habit:", habit.name);
    if (changed === null) return;
    if (!changed.trim()) { notify("Habit name cannot be empty."); return; }
    habit.name = changed.trim().slice(0,70);
  } else {
    if (!confirm(`Delete "${habit.name}"?`)) return;
    habits = habits.filter(item => item.id !== habit.id);
    notify("Habit deleted.");
  }
  save(STORAGE.habits, habits); renderAll();
});

// Focus timer
const TIMER_SETTINGS_KEY = "studyflow_timer_settings_v1";

const defaultTimerSettings = {
  focus: 25,
  short: 5,
  long: 15
};

let timerSettings = {
  ...defaultTimerSettings,
  ...load(TIMER_SETTINGS_KEY, {})
};

let selectedMinutes = timerSettings.focus;
let remainingSeconds = selectedMinutes * 60;
let timerInterval = null;
let isRunning = false;
let timerMode = "focus";

function getDuration(mode) {
  return timerSettings[mode];
}
function updatePresetLabels() {
  $$(".preset").forEach(button => {
    const mode = button.dataset.mode;
    const minutes = getDuration(mode);

    const label = mode === "focus" ? "Focus" :
                  mode === "short" ? "Short break" : "Long break";

    button.textContent = `${label} · ${minutes} min`;
    button.dataset.minutes = minutes;
  });
}
function updateTimer() {
  const minutes = Math.floor(remainingSeconds / 60);
  const seconds = remainingSeconds % 60;

  $("#timerDisplay").textContent =
    `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;

  $("#miniTimer").textContent =
    `${String(minutes).padStart(2,"0")}:${String(seconds).padStart(2,"0")}`;

  const progress = 1 - remainingSeconds / (selectedMinutes * 60);

  $("#timerRing").style.background =
    `conic-gradient(var(--primary) ${progress * 360}deg, var(--surface-2) 0deg)`;

  $("#timerStart").textContent = isRunning
    ? "Pause"
    : timerMode === "focus" ? "Start focus" : "Start break";

  $("#timerCaption").textContent = isRunning
    ? "STAY IN THE FLOW"
    : timerMode === "focus" ? "TIME TO FOCUS" : "TIME TO REST";
}

function stopTimer() {
  clearInterval(timerInterval);
  timerInterval = null;
  isRunning = false;
}

function chooseTimer(minutes, mode) {
  stopTimer();

  selectedMinutes = minutes;
  remainingSeconds = minutes * 60;
  timerMode = mode;

  $("#timerMode").textContent =
    mode === "focus" ? "FOCUS SESSION" :
    mode === "short" ? "SHORT BREAK" : "LONG BREAK";

  $$(".preset").forEach(button => {
    button.classList.toggle("active", button.dataset.mode === mode);
  });

  updateTimer();
}

// Load saved settings into the input fields
$("#focusDuration").value = timerSettings.focus;
$("#shortBreakDuration").value = timerSettings.short;
$("#longBreakDuration").value = timerSettings.long;

// Save custom timer settings
$("#saveTimerSettings").addEventListener("click", () => {
  const focus = Number($("#focusDuration").value);
  const short = Number($("#shortBreakDuration").value);
  const long = Number($("#longBreakDuration").value);

  if (
    !Number.isInteger(focus) || focus < 1 || focus > 180 ||
    !Number.isInteger(short) || short < 1 || short > 60 ||
    !Number.isInteger(long) || long < 1 || long > 60
  ) {
    notify("Please enter valid timer durations.");
    return;
  }

  timerSettings = { focus, short, long };

  localStorage.setItem(
    TIMER_SETTINGS_KEY,
    JSON.stringify(timerSettings)
  );
  updatePresetLabels();

  // Apply immediately only if the timer is not running
  if (!isRunning) {
    chooseTimer(getDuration(timerMode), timerMode);
  }

  notify(
    isRunning
      ? "Settings saved. They will apply after this session."
      : "Timer settings saved successfully!"
  );
});

// Start / Pause timer
$("#timerStart").addEventListener("click", () => {
  if (isRunning) {
    stopTimer();
    updateTimer();
    return;
  }

  // Use the latest saved duration when starting a new session
  if (remainingSeconds <= 0) {
    selectedMinutes = getDuration(timerMode);
    remainingSeconds = selectedMinutes * 60;
  }

  isRunning = true;
  updateTimer();

  timerInterval = setInterval(() => {
    remainingSeconds--;

    if (remainingSeconds <= 0) {
      remainingSeconds = 0;
      stopTimer();

      if (timerMode === "focus") {
        sessions[todayKey()] = (sessions[todayKey()] || 0) + 1;
        save(STORAGE.sessions, sessions);
        notify("Focus session complete — take a short break!");
      } else {
        notify("Break complete — ready when you are!");
      }

      renderAll();
    }

    updateTimer();
  }, 1000);
});

// Reset timer
$("#timerReset").addEventListener("click", () => {
  chooseTimer(getDuration(timerMode), timerMode);
  notify("Timer reset.");
});

// Preset buttons
$$(".preset").forEach(button => {
  button.addEventListener("click", () => {
    const mode = button.dataset.mode;
    chooseTimer(getDuration(mode), mode);
  });
});

// Initialize timer
updatePresetLabels();
chooseTimer(timerSettings.focus, "focus");
// Overall dashboard
function renderProgress() {
  const taskTotal = tasks.length;
  const taskDone = tasks.filter(t => t.done).length;
  const habitDone = habits.filter(h => h.completedOn === todayKey()).length;
  const total = taskTotal + habits.length;
  const done = taskDone + habitDone;
  const percent = total ? Math.round(done/total*100) : 0;
  $("#progressNumber").textContent = `${percent}%`;
  $("#progressFill").style.width = `${percent}%`;
  $("#progressCaption").textContent = total ? `${done} of ${total} tasks and habits completed.` : "Complete a task or habit to build momentum.";
}
function renderAll() {
  renderTasks(); renderHabits(); renderProgress();
  $("#statSessions").textContent = sessions[todayKey()] || 0;
  $("#focusSessionCount").textContent = sessions[todayKey()] || 0;
}
const now = new Date();
$("#headerDate").textContent = now.toLocaleDateString(undefined,{weekday:"short",month:"short",day:"numeric"});
$("#welcomeDate").textContent = now.toLocaleDateString(undefined,{weekday:"long",month:"long",day:"numeric"}).toUpperCase();
renderAll();
updateTimer();

// Offline app shell: service worker is available when served from localhost or HTTPS.
if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost" || location.hostname === "127.0.0.1")) {
  window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(error => console.warn("Offline setup unavailable:", error)));
}
