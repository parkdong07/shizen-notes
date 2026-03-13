// app.js — Shizen Notes Main Application Module
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import { getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, query, where, orderBy, onSnapshot, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
import { getFirebaseConfig } from './firebase-config.js';

// ─────────────────────────── INIT ────────────────────────────
const config = getFirebaseConfig();
const firebaseApp = initializeApp(config);
const db   = getFirestore(firebaseApp);
const auth = getAuth(firebaseApp);

let messaging = null;
let currentUser = null;
let notifyEnabled = false;
let deferredInstallPrompt = null;

// ─────────────────────────── STATE ───────────────────────────
let notes = [];
let todos = [];
let currentTab = 'notes';
let selectedMood = null;
let editingNoteId = null;
let editingTodoId = null;
let currentFilter = 'all';
let noteSearchQuery = '';

// ─────────────────────────── DOM REFS ────────────────────────
const $ = id => document.getElementById(id);
const syncStatus   = $('syncStatus');
const notifyToggle = $('notifyToggle');
const authBtn      = $('authBtn');
const fabBtn       = $('fabBtn');
const noteSearch   = $('noteSearch');

// Notes
const notesGrid  = $('notesGrid');
const notesEmpty = $('notesEmpty');
const noteModal  = $('noteModal');
const noteId     = $('noteId');
const noteTitle  = $('noteTitle');
const noteContent= $('noteContent');
const noteTags   = $('noteTags');
const saveNoteBtn   = $('saveNoteBtn');
const cancelNoteBtn = $('cancelNoteBtn');
const deleteNoteBtn = $('deleteNoteBtn');
const closeNoteModal= $('closeNoteModal');

// Todos
const todosList  = $('todosList');
const todosEmpty = $('todosEmpty');
const todoModal  = $('todoModal');
const todoId     = $('todoId');
const todoTitle  = $('todoTitle');
const todoNote   = $('todoNote');
const todoDue    = $('todoDue');
const todoPriority = $('todoPriority');
const todoRemind = $('todoRemind');
const saveTodoBtn   = $('saveTodoBtn');
const cancelTodoBtn = $('cancelTodoBtn');
const deleteTodoBtn = $('deleteTodoBtn');
const closeTodoModal= $('closeTodoModal');

// ─────────────────────────── AUTH ────────────────────────────
function setSyncStatus(state) {
  syncStatus.className = `sync-status ${state}`;
  const titles = { synced:'ซิงค์แล้ว', syncing:'กำลังซิงค์...', offline:'ออฟไลน์', error:'เกิดข้อผิดพลาด' };
  syncStatus.title = titles[state] || '';
}

onAuthStateChanged(auth, async user => {
  if (user) {
    currentUser = user;
    setSyncStatus('synced');
    authBtn.title = user.isAnonymous ? 'ผู้ใช้ไม่ระบุตัวตน' : user.displayName || 'บัญชีผู้ใช้';
    subscribeNotes();
    subscribeTodos();
    tryInitMessaging();
  } else {
    setSyncStatus('syncing');
    try {
      await signInAnonymously(auth);
    } catch(e) {
      setSyncStatus('offline');
      console.error('[Shizen Auth]', e);
      toast('ไม่สามารถเชื่อมต่อได้ — ใช้งานแบบออฟไลน์', 'error');
      loadOfflineData();
    }
  }
});

// ─────────────────────────── FIRESTORE ───────────────────────
function notesRef() {
  return query(
    collection(db, 'notes'),
    where('userId', '==', currentUser.uid),
    orderBy('updatedAt', 'desc')
  );
}

function todosRef() {
  return query(
    collection(db, 'todos'),
    where('userId', '==', currentUser.uid),
    orderBy('createdAt', 'desc')
  );
}

function subscribeNotes() {
  onSnapshot(notesRef(), snap => {
    notes = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    saveOffline('notes', notes);
    renderNotes();
    setSyncStatus('synced');
  }, err => {
    setSyncStatus('error');
    console.error('[Shizen Notes]', err);
  });
}

function subscribeTodos() {
  onSnapshot(todosRef(), snap => {
    todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    saveOffline('todos', todos);
    renderTodos();
    scheduleLocalReminders(todos);
  }, err => console.error('[Shizen Todos]', err));
}

// ─────────────────────────── NOTES CRUD ──────────────────────
async function saveNote() {
  const title   = noteTitle.value.trim();
  const content = noteContent.value.trim();
  const tags    = noteTags.value.split(',').map(t => t.trim()).filter(Boolean);

  if (!content && !title) { toast('กรุณาเขียนบางอย่าง', 'error'); return; }

  setSyncStatus('syncing');
  const data = {
    title, content, tags,
    mood: selectedMood || null,
    userId: currentUser.uid,
    updatedAt: serverTimestamp(),
  };

  try {
    if (editingNoteId) {
      await updateDoc(doc(db, 'notes', editingNoteId), data);
      toast('แก้ไขบันทึกแล้ว ✓');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'notes'), data);
      toast('บันทึกแล้ว ✓');
    }
    closeModal(noteModal);
  } catch(e) {
    setSyncStatus('error');
    toast('บันทึกไม่สำเร็จ', 'error');
    console.error(e);
  }
}

async function deleteNote(id) {
  if (!confirm('ลบบันทึกนี้?')) return;
  try {
    await deleteDoc(doc(db, 'notes', id));
    closeModal(noteModal);
    toast('ลบแล้ว');
  } catch(e) { toast('ลบไม่สำเร็จ', 'error'); }
}

// ─────────────────────────── TODOS CRUD ──────────────────────
async function saveTodo() {
  const title = todoTitle.value.trim();
  if (!title) { toast('กรุณาใส่ชื่องาน', 'error'); return; }

  const dueVal    = todoDue.value    ? new Date(todoDue.value).getTime()    : null;
  const remindVal = todoRemind.value ? new Date(todoRemind.value).getTime() : null;

  const data = {
    title,
    note: todoNote.value.trim() || null,
    priority: todoPriority.value,
    dueDate: dueVal,
    remindAt: remindVal,
    isCompleted: false,
    userId: currentUser.uid,
    updatedAt: serverTimestamp(),
  };

  setSyncStatus('syncing');
  try {
    if (editingTodoId) {
      const existing = todos.find(t => t.id === editingTodoId);
      data.isCompleted = existing?.isCompleted || false;
      await updateDoc(doc(db, 'todos', editingTodoId), data);
      toast('แก้ไขงานแล้ว ✓');
    } else {
      data.createdAt = serverTimestamp();
      await addDoc(collection(db, 'todos'), data);
      toast('เพิ่มงานแล้ว ✓');
    }
    closeModal(todoModal);

    // Schedule reminder
    if (remindVal && notifyEnabled) scheduleReminder(data.title, remindVal);

  } catch(e) {
    setSyncStatus('error');
    toast('บันทึกไม่สำเร็จ', 'error');
    console.error(e);
  }
}

async function toggleTodo(id) {
  const todo = todos.find(t => t.id === id);
  if (!todo) return;
  await updateDoc(doc(db, 'todos', id), { isCompleted: !todo.isCompleted, updatedAt: serverTimestamp() });
}

async function deleteTodo(id) {
  if (!confirm('ลบงานนี้?')) return;
  try {
    await deleteDoc(doc(db, 'todos', id));
    closeModal(todoModal);
    toast('ลบแล้ว');
  } catch(e) { toast('ลบไม่สำเร็จ', 'error'); }
}

// ─────────────────────────── RENDER NOTES ────────────────────
function renderNotes() {
  const filtered = notes.filter(n => {
    if (!noteSearchQuery) return true;
    const q = noteSearchQuery.toLowerCase();
    return (n.title||'').toLowerCase().includes(q) ||
           (n.content||'').toLowerCase().includes(q) ||
           (n.tags||[]).some(t => t.toLowerCase().includes(q));
  });

  // Clear non-empty-state children
  Array.from(notesGrid.children).forEach(c => { if (!c.id) c.remove(); });

  if (filtered.length === 0) {
    notesEmpty.hidden = false;
    return;
  }
  notesEmpty.hidden = true;

  const frag = document.createDocumentFragment();
  filtered.forEach(n => {
    const card = document.createElement('article');
    card.className = 'note-card';
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', n.title || 'บันทึก');

    const date = n.updatedAt?.toDate ? n.updatedAt.toDate() : new Date(n.updatedAt || Date.now());
    const tags = (n.tags||[]).slice(0,3).map(t => `<span class="tag">${escHtml(t)}</span>`).join('');

    card.innerHTML = `
      ${n.mood ? `<span class="note-card-mood">${n.mood}</span>` : ''}
      ${n.title ? `<h3 class="note-card-title">${escHtml(n.title)}</h3>` : ''}
      <p class="note-card-preview">${escHtml((n.content||'').replace(/\n/g, ' '))}</p>
      <div class="note-card-meta">
        <time class="note-card-date" datetime="${date.toISOString()}">${fmtDate(date)}</time>
        <div class="note-card-tags">${tags}</div>
      </div>
    `;
    card.addEventListener('click', () => openEditNote(n));
    card.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' ') openEditNote(n); });
    frag.appendChild(card);
  });
  notesGrid.appendChild(frag);
}

// ─────────────────────────── RENDER TODOS ────────────────────
function renderTodos() {
  const now = Date.now();
  let filtered = todos;

  if (currentFilter === 'pending') filtered = todos.filter(t => !t.isCompleted);
  else if (currentFilter === 'done') filtered = todos.filter(t => t.isCompleted);
  else if (currentFilter === 'today') {
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd   = new Date(); todayEnd.setHours(23,59,59,999);
    filtered = todos.filter(t => t.dueDate && t.dueDate >= todayStart.getTime() && t.dueDate <= todayEnd.getTime());
  }

  Array.from(todosList.children).forEach(c => { if (!c.id) c.remove(); });

  if (filtered.length === 0) {
    todosEmpty.hidden = false;
    return;
  }
  todosEmpty.hidden = true;

  const frag = document.createDocumentFragment();
  filtered.forEach(t => {
    const item = document.createElement('div');
    item.className = `todo-item${t.isCompleted?' completed':''}`;
    item.dataset.priority = t.priority || 'medium';

    let dueHtml = '';
    if (t.dueDate) {
      const d = new Date(t.dueDate);
      let cls = '';
      if (!t.isCompleted) {
        if (t.dueDate < now)            cls = 'overdue';
        else if (t.dueDate - now < 8.64e7) cls = 'due-soon';
      }
      dueHtml = `<span class="todo-due ${cls}">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        ${fmtDate(d)}
      </span>`;
    }
    const remindHtml = (t.remindAt && !t.isCompleted)
      ? `<span class="todo-remind-badge">🔔 ${fmtDate(new Date(t.remindAt))}</span>` : '';

    item.innerHTML = `
      <div class="todo-checkbox ${t.isCompleted?'checked':''}" role="checkbox" aria-checked="${t.isCompleted}" tabindex="0">
        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="todo-body">
        <p class="todo-title">${escHtml(t.title)}</p>
        ${t.note ? `<p class="todo-note">${escHtml(t.note)}</p>` : ''}
        <div class="todo-meta">${dueHtml}${remindHtml}</div>
      </div>
    `;

    const cb = item.querySelector('.todo-checkbox');
    cb.addEventListener('click', e => { e.stopPropagation(); toggleTodo(t.id); });
    cb.addEventListener('keydown', e => { if(e.key==='Enter'||e.key===' '){ e.stopPropagation(); toggleTodo(t.id); } });
    item.addEventListener('click', () => openEditTodo(t));
    frag.appendChild(item);
  });
  todosList.appendChild(frag);
}

// ─────────────────────────── MODALS ──────────────────────────
function openNewNote() {
  editingNoteId = null;
  selectedMood = null;
  noteId.value = '';
  noteTitle.value = '';
  noteContent.value = '';
  noteTags.value = '';
  $('noteModalTitle').textContent = 'บันทึกใหม่';
  deleteNoteBtn.style.display = 'none';
  document.querySelectorAll('.mood-btn').forEach(b => b.classList.remove('selected'));
  openModal(noteModal);
  setTimeout(() => noteContent.focus(), 100);
}

function openEditNote(n) {
  editingNoteId = n.id;
  selectedMood = n.mood || null;
  noteId.value = n.id;
  noteTitle.value = n.title || '';
  noteContent.value = n.content || '';
  noteTags.value = (n.tags||[]).join(', ');
  $('noteModalTitle').textContent = 'แก้ไขบันทึก';
  deleteNoteBtn.style.display = '';

  document.querySelectorAll('.mood-btn').forEach(b => {
    b.classList.toggle('selected', b.dataset.mood === n.mood);
  });
  openModal(noteModal);
}

function openNewTodo() {
  editingTodoId = null;
  todoId.value = '';
  todoTitle.value = '';
  todoNote.value = '';
  todoDue.value = '';
  todoRemind.value = '';
  todoPriority.value = 'medium';
  $('todoModalTitle').textContent = 'งานใหม่';
  deleteTodoBtn.style.display = 'none';
  openModal(todoModal);
  setTimeout(() => todoTitle.focus(), 100);
}

function openEditTodo(t) {
  editingTodoId = t.id;
  todoId.value = t.id;
  todoTitle.value = t.title || '';
  todoNote.value = t.note || '';
  todoPriority.value = t.priority || 'medium';
  todoDue.value   = t.dueDate   ? toDatetimeLocal(new Date(t.dueDate))   : '';
  todoRemind.value= t.remindAt  ? toDatetimeLocal(new Date(t.remindAt))  : '';
  $('todoModalTitle').textContent = 'แก้ไขงาน';
  deleteTodoBtn.style.display = '';
  openModal(todoModal);
}

function openModal(modal) {
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
  modal.addEventListener('click', e => { if(e.target===modal) closeModal(modal); }, { once: true });
}

function closeModal(modal) {
  modal.hidden = true;
  document.body.style.overflow = '';
}

// ─────────────────────────── NOTIFICATIONS ───────────────────
async function tryInitMessaging() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    await enableNotifications();
  }
}

async function enableNotifications() {
  if (!('Notification' in window)) { toast('เบราว์เซอร์ไม่รองรับการแจ้งเตือน', 'error'); return; }
  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') { toast('ไม่ได้รับอนุญาตแจ้งเตือน'); return; }
    notifyEnabled = true;
    notifyToggle.style.color = 'var(--matcha)';
    toast('เปิดการแจ้งเตือนแล้ว 🔔');
    await initFCM();
  } catch(e) { console.error('[Shizen Notify]', e); }
}

async function initFCM() {
  try {
    messaging = getMessaging(firebaseApp);
    const swReg = await navigator.serviceWorker.ready;
    const token = await getToken(messaging, {
      vapidKey: config.vapidKey,
      serviceWorkerRegistration: swReg,
    });
    if (token) {
      console.log('[Shizen FCM] Token:', token);
      // In production: save token to Firestore under user doc for server-side push
      await updateDoc(doc(db, 'users', currentUser.uid), { fcmToken: token, updatedAt: serverTimestamp() })
        .catch(() => {}); // users collection optional
    }

    onMessage(messaging, payload => {
      const { title, body } = payload.notification || {};
      toast(`🔔 ${title}: ${body}`);
    });
  } catch(e) {
    console.warn('[Shizen FCM] Not available (might be localhost or config missing):', e.message);
  }
}

// Schedule local SW reminder (via Service Worker postMessage)
function scheduleReminder(title, remindAtMs) {
  if (!navigator.serviceWorker.controller) return;
  const delay = remindAtMs - Date.now();
  if (delay <= 0) return;
  navigator.serviceWorker.controller.postMessage({
    type: 'SCHEDULE_REMINDER',
    title,
    remindAtMs,
    delay,
  });
}

function scheduleLocalReminders(todos) {
  todos
    .filter(t => !t.isCompleted && t.remindAt && t.remindAt > Date.now())
    .forEach(t => scheduleReminder(t.title, t.remindAt));
}

// ─────────────────────────── OFFLINE FALLBACK ────────────────
function saveOffline(key, data) {
  try { localStorage.setItem(`shizen_${key}`, JSON.stringify(data)); } catch(e) {}
}

function loadOfflineData() {
  try {
    const n = localStorage.getItem('shizen_notes');
    const t = localStorage.getItem('shizen_todos');
    if (n) notes = JSON.parse(n);
    if (t) todos = JSON.parse(t);
    renderNotes();
    renderTodos();
    toast('กำลังแสดงข้อมูลออฟไลน์');
  } catch(e) {}
}

// ─────────────────────────── HELPERS ─────────────────────────
function fmtDate(date) {
  const now = new Date();
  const diff = now - date;
  if (diff < 60000)       return 'เมื่อกี้';
  if (diff < 3600000)     return `${Math.floor(diff/60000)} นาทีที่แล้ว`;
  if (diff < 86400000)    return `${Math.floor(diff/3600000)} ชม. ที่แล้ว`;
  if (diff < 86400000*2)  return 'เมื่อวาน';
  return date.toLocaleDateString('th-TH', { day:'numeric', month:'short', year:'2-digit', hour:'2-digit', minute:'2-digit' });
}

function toDatetimeLocal(date) {
  const pad = n => String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function escHtml(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function toast(msg, type = 'default') {
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  $('toastContainer').appendChild(t);
  setTimeout(() => t.remove(), 3200);
}

// ─────────────────────────── EVENT LISTENERS ─────────────────
// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentTab = btn.dataset.tab;
    document.querySelectorAll('.tab-btn').forEach(b => { b.classList.remove('active'); b.setAttribute('aria-selected','false'); });
    btn.classList.add('active');
    btn.setAttribute('aria-selected','true');
    document.querySelectorAll('.tab-panel').forEach(p => { p.classList.remove('active'); p.hidden = true; });
    const panel = $(`tab-${currentTab}`);
    panel.classList.add('active');
    panel.hidden = false;
  });
});

// FAB
fabBtn.addEventListener('click', () => {
  currentTab === 'notes' ? openNewNote() : openNewTodo();
});

// Note Modal
saveNoteBtn.addEventListener('click', saveNote);
cancelNoteBtn.addEventListener('click', () => closeModal(noteModal));
closeNoteModal.addEventListener('click', () => closeModal(noteModal));
deleteNoteBtn.addEventListener('click', () => deleteNote(editingNoteId));

// Mood buttons
document.querySelectorAll('.mood-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const mood = btn.dataset.mood;
    selectedMood = (selectedMood === mood) ? null : mood;
    document.querySelectorAll('.mood-btn').forEach(b => b.classList.toggle('selected', b.dataset.mood === selectedMood));
  });
});

// Todo Modal
saveTodoBtn.addEventListener('click', saveTodo);
cancelTodoBtn.addEventListener('click', () => closeModal(todoModal));
closeTodoModal.addEventListener('click', () => closeModal(todoModal));
deleteTodoBtn.addEventListener('click', () => deleteTodo(editingTodoId));

// Filters
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    currentFilter = btn.dataset.filter;
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    renderTodos();
  });
});

// Search
noteSearch.addEventListener('input', () => {
  noteSearchQuery = noteSearch.value.trim();
  renderNotes();
});

// Notification toggle
notifyToggle.addEventListener('click', enableNotifications);

// Auth button
authBtn.addEventListener('click', () => {
  if (currentUser?.isAnonymous) {
    toast('🔑 ลงชื่อเข้าใช้กับ Google เพื่อซิงค์ข้อมูลข้ามอุปกรณ์ (เร็วๆ นี้)');
  }
});

// PWA Install
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  $('installBanner').hidden = false;
});

$('installBtn').addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') { $('installBanner').hidden = true; toast('ติดตั้งแอปแล้ว 🎉'); }
  deferredInstallPrompt = null;
});

$('dismissInstall').addEventListener('click', () => { $('installBanner').hidden = true; });

// Keyboard shortcut (Esc to close modals)
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    if (!noteModal.hidden) closeModal(noteModal);
    if (!todoModal.hidden) closeModal(todoModal);
  }
});

// ─────────────────────────── SERVICE WORKER ──────────────────
if ('serviceWorker' in navigator) {
  window.addEventListener('load', async () => {
    try {
      await navigator.serviceWorker.register('./sw.js');
      console.log('[Shizen] SW registered');
    } catch(e) {
      console.warn('[Shizen] SW failed:', e);
    }
  });
}
