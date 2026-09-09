import { firebaseApp } from './firebase-config.js';
import {
  getAuth, onAuthStateChanged, signInAnonymously,
  signInWithEmailAndPassword, signOut
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-auth.js';
import {
  getFirestore, collection, doc, getDocs, addDoc, updateDoc,
  query, where, onSnapshot, runTransaction, serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/12.18.0/firebase-firestore.js';

const auth = getAuth(firebaseApp);
const db = getFirestore(firebaseApp);
const $ = (selector, scope = document) => scope.querySelector(selector);
const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];
const state = { user: null, isAdmin: false, books: [], unsubscribers: [], installPrompt: null };
const statusLabels = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada', completed: 'Concluida', active: 'Activo', returned: 'Devuelto', overdue: 'Vencido' };

function escapeHtml(value = '') {
  const element = document.createElement('div');
  element.textContent = String(value);
  return element.innerHTML;
}

function safeImageUrl(value = '') {
  const url = String(value).trim();
  if (!url) return '';
  if (/^(https?:\/\/|\.\.\/|\.\/|assets\/)/i.test(url)) return escapeHtml(url);
  return '';
}

function toast(message, type = 'success') {
  const item = document.createElement('div');
  item.className = `toast ${type}`;
  item.textContent = message;
  $('#toastRegion').append(item);
  setTimeout(() => item.remove(), 4200);
}

function setBusy(button, busy, label) {
  if (!button) return;
  if (busy) button.dataset.originalText = button.textContent;
  button.disabled = busy;
  button.textContent = busy ? label : (button.dataset.originalText || button.textContent);
}

function identity() {
  try { return JSON.parse(localStorage.getItem('libraryIdentity') || '{}'); }
  catch { return {}; }
}

function formatDate(value) {
  const date = value?.toDate ? value.toDate() : value ? new Date(value) : null;
  return date && !Number.isNaN(date.valueOf()) ? new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium' }).format(date) : '—';
}

function setConnectionState() {
  const online = navigator.onLine;
  $('#connectionState').textContent = online ? 'En línea' : 'Sin conexión';
  $('#connectionState').className = `connection ${online ? 'online' : 'offline'}`;
}

function clearSubscriptions() {
  state.unsubscribers.forEach(unsubscribe => unsubscribe());
  state.unsubscribers = [];
}

function hasAdminAccess(user) {
  return Boolean(user && !user.isAnonymous && user.providerData.some(provider => provider.providerId === 'password'));
}

function showAccess() {
  clearSubscriptions();
  state.user = null;
  state.isAdmin = false;
  $('#accessView').hidden = false;
  $('#appView').hidden = true;
}

function showApp(user, isAdmin) {
  state.user = user;
  state.isAdmin = isAdmin;
  const person = identity();
  const name = isAdmin ? (user.displayName || user.email || 'Administrador') : (person.employeeName || 'Usuario');
  $('#profileName').textContent = name;
  $('#profileRole').textContent = isAdmin ? 'Administrador' : `Empleado ${person.employeeNumber || ''}`;
  $('#profileAvatar').textContent = name.trim().charAt(0).toUpperCase() || 'U';
  $('#loansLabel').textContent = isAdmin ? 'Préstamos activos' : 'Mis préstamos';
  $('#loansTitle').textContent = isAdmin ? 'Préstamos activos' : 'Mis préstamos';
  $$('[data-admin]').forEach(element => { element.hidden = !isAdmin; });
  $('#accessView').hidden = true;
  $('#appView').hidden = false;
  subscribeBooks();
  subscribeRequests();
  subscribeLoans();
  route();
}

function bookCover(book, className = 'cover') {
  const source = safeImageUrl(book.coverUrl);
  return `<div class="${className}">${source ? `<img src="${source}" alt="Portada de ${escapeHtml(book.title)}" loading="lazy" onerror="this.parentElement.textContent='📖'">` : '📖'}</div>`;
}

function renderBooks() {
  const term = $('#bookSearch').value.trim().toLocaleLowerCase('es');
  const category = $('#categoryFilter').value;
  const visible = state.books.filter(book => book.active !== false)
    .filter(book => !category || book.category === category)
    .filter(book => !term || [book.title, book.author, book.category].some(value => String(value || '').toLocaleLowerCase('es').includes(term)));

  $('#bookGrid').innerHTML = visible.length ? visible.map(book => {
    const available = Number(book.availableCopies || 0);
    return `<article class="book-card">
      ${bookCover(book)}
      <div class="book-body">
        <p class="eyebrow">${escapeHtml(book.category || 'General')}</p>
        <h3>${escapeHtml(book.title || 'Sin título')}</h3>
        <div class="book-author">${escapeHtml(book.author || 'Autor no registrado')}</div>
        <p class="book-review">${escapeHtml(book.review || 'Sin reseña disponible.')}</p>
        <div class="book-footer">
          <span class="availability ${available < 1 ? 'none' : ''}">${available} disponibles</span>
          ${state.isAdmin ? '' : `<button class="button primary compact" data-request-book="${book.id}" ${available < 1 ? 'disabled' : ''}>Solicitar</button>`}
        </div>
      </div>
    </article>`;
  }).join('') : '<div class="empty-state">No encontramos libros con esos filtros.</div>';

  const categories = [...new Set(state.books.filter(book => book.active !== false).map(book => book.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'es'));
  const selected = $('#categoryFilter').value;
  $('#categoryFilter').innerHTML = '<option value="">Todas las categorías</option>' + categories.map(item => `<option value="${escapeHtml(item)}">${escapeHtml(item)}</option>`).join('');
  $('#categoryFilter').value = categories.includes(selected) ? selected : '';
}

function renderManageBooks() {
  if (!state.isAdmin) return;
  $('#manageBooksList').innerHTML = state.books.length ? state.books.map(book => `<article class="admin-book">
    ${bookCover(book, 'admin-thumb')}
    <div><h3>${escapeHtml(book.title)}</h3><p>${escapeHtml(book.author)} · ${Number(book.availableCopies || 0)} de ${Number(book.totalCopies || 0)} disponibles</p>
      <div class="admin-actions"><button class="button secondary compact" data-edit-book="${book.id}">Editar</button><button class="button ${book.active === false ? 'secondary' : 'danger'} compact" data-toggle-book="${book.id}">${book.active === false ? 'Activar' : 'Ocultar'}</button></div>
    </div>
  </article>`).join('') : '<div class="empty-state">Aún no hay libros. Agrega el primero.</div>';
}

function subscribeBooks() {
  const unsubscribe = onSnapshot(collection(db, 'books'), snapshot => {
    state.books = snapshot.docs.map(item => ({ id: item.id, ...item.data() })).sort((a, b) => String(a.title).localeCompare(String(b.title), 'es'));
    renderBooks();
    renderManageBooks();
  }, error => toast(`No se pudo cargar el catálogo: ${error.message}`, 'error'));
  state.unsubscribers.push(unsubscribe);
}

function requestCard(item, adminView = false) {
  const data = item.data;
  return `<article class="list-card">
    <div><h3>${escapeHtml(data.bookTitle || 'Libro')}</h3><p>${escapeHtml(adminView ? `${data.employeeName || ''} · ${data.employeeNumber || ''}` : data.bookAuthor || '')}</p></div>
    <div><small>Solicitud</small><p>${formatDate(data.createdAt)}</p></div>
    <div><span class="status ${escapeHtml(data.status)}">${statusLabels[data.status] || data.status}</span></div>
    ${adminView && data.status === 'pending' ? `<div class="list-actions"><button class="button primary compact" data-approve-request="${item.id}">Aprobar</button><button class="button danger compact" data-reject-request="${item.id}">Rechazar</button></div>` : '<div></div>'}
  </article>`;
}

function subscribeRequests() {
  const requestQuery = state.isAdmin ? collection(db, 'requests') : query(collection(db, 'requests'), where('userId', '==', state.user.uid));
  const unsubscribe = onSnapshot(requestQuery, snapshot => {
    const items = snapshot.docs.map(item => ({ id: item.id, data: item.data() })).sort((a, b) => (b.data.createdAt?.seconds || 0) - (a.data.createdAt?.seconds || 0));
    $('#myRequestsList').innerHTML = !state.isAdmin && items.length ? items.map(item => requestCard(item)).join('') : (!state.isAdmin ? '<div class="empty-state">Todavía no has solicitado libros.</div>' : '');
    if (state.isAdmin) {
      const pending = items.filter(item => item.data.status === 'pending');
      $('#adminRequestsList').innerHTML = pending.length ? pending.map(item => requestCard(item, true)).join('') : '<div class="empty-state">No hay solicitudes pendientes.</div>';
    }
  }, error => toast(`No se pudieron cargar las solicitudes: ${error.message}`, 'error'));
  state.unsubscribers.push(unsubscribe);
}

function loanCard(item, history = false) {
  const data = item.data;
  const due = data.dueAt?.toDate ? data.dueAt.toDate() : null;
  const overdue = data.status === 'active' && due && due < new Date();
  const status = overdue ? 'overdue' : data.status;
  return `<article class="list-card">
    <div><h3>${escapeHtml(data.bookTitle || 'Libro')}</h3><p>${escapeHtml(state.isAdmin ? `${data.employeeName || ''} · ${data.employeeNumber || ''}` : data.bookAuthor || '')}</p></div>
    <div><small>${history ? 'Devolución' : 'Fecha límite'}</small><p>${formatDate(history ? data.returnedAt : data.dueAt)}</p></div>
    <div><span class="status ${status}">${statusLabels[status] || status}</span></div>
    ${state.isAdmin && data.status === 'active' ? `<div class="list-actions"><button class="button primary compact" data-return-loan="${item.id}">Registrar devolución</button></div>` : '<div></div>'}
  </article>`;
}

function subscribeLoans() {
  const loanQuery = state.isAdmin ? collection(db, 'loans') : query(collection(db, 'loans'), where('userId', '==', state.user.uid));
  const unsubscribe = onSnapshot(loanQuery, snapshot => {
    const items = snapshot.docs.map(item => ({ id: item.id, data: item.data() })).sort((a, b) => (b.data.createdAt?.seconds || 0) - (a.data.createdAt?.seconds || 0));
    const active = items.filter(item => item.data.status === 'active');
    const returned = items.filter(item => item.data.status === 'returned');
    $('#loansList').innerHTML = active.length ? active.map(item => loanCard(item)).join('') : '<div class="empty-state">No hay préstamos activos.</div>';
    if (state.isAdmin) $('#historyList').innerHTML = returned.length ? returned.map(item => loanCard(item, true)).join('') : '<div class="empty-state">Aún no hay préstamos concluidos.</div>';
  }, error => toast(`No se pudieron cargar los préstamos: ${error.message}`, 'error'));
  state.unsubscribers.push(unsubscribe);
}

async function requestBook(bookId, button) {
  const book = state.books.find(item => item.id === bookId);
  const person = identity();
  if (!book || Number(book.availableCopies || 0) < 1) return toast('Este libro ya no tiene ejemplares disponibles.', 'error');
  if (!person.employeeName || !person.employeeNumber) return $('#identityDialog').showModal();
  setBusy(button, true, 'Enviando…');
  try {
    const existing = await getDocs(query(collection(db, 'requests'), where('userId', '==', state.user.uid)));
    const duplicate = existing.docs.some(item => item.data().bookId === bookId && ['pending', 'approved'].includes(item.data().status));
    if (duplicate) throw new Error('Ya tienes una solicitud activa para este libro.');
    await addDoc(collection(db, 'requests'), {
      bookId, bookTitle: book.title, bookAuthor: book.author || '', userId: state.user.uid,
      employeeName: person.employeeName, employeeNumber: person.employeeNumber,
      status: 'pending', createdAt: serverTimestamp()
    });
    toast('Solicitud enviada. La biblioteca te avisará cuando sea aprobada.');
    location.hash = '#my-requests';
  } catch (error) { toast(error.message, 'error'); }
  finally { setBusy(button, false); }
}

function openBookDialog(book = null) {
  const form = $('#bookForm');
  form.reset();
  form.bookId.value = book?.id || '';
  form.title.value = book?.title || '';
  form.author.value = book?.author || '';
  form.category.value = book?.category || '';
  form.isbn.value = book?.isbn || '';
  form.totalCopies.value = Number(book?.totalCopies || 1);
  form.coverUrl.value = book?.coverUrl || '';
  form.review.value = book?.review || '';
  form.active.checked = book?.active !== false;
  $('#bookDialogTitle').textContent = book ? 'Editar libro' : 'Agregar libro';
  $('#bookDialog').showModal();
}

async function saveBook(form, button) {
  const id = form.bookId.value;
  const totalCopies = Number(form.totalCopies.value);
  const payload = {
    title: form.title.value.trim(), author: form.author.value.trim(), category: form.category.value.trim(),
    isbn: form.isbn.value.trim(), coverUrl: form.coverUrl.value.trim(), review: form.review.value.trim(),
    totalCopies, active: form.active.checked, updatedAt: serverTimestamp()
  };
  setBusy(button, true, 'Guardando…');
  try {
    if (!id) {
      await addDoc(collection(db, 'books'), { ...payload, availableCopies: totalCopies, createdAt: serverTimestamp() });
    } else {
      await runTransaction(db, async transaction => {
        const reference = doc(db, 'books', id);
        const snapshot = await transaction.get(reference);
        if (!snapshot.exists()) throw new Error('El libro ya no existe.');
        const current = snapshot.data();
        const borrowed = Math.max(0, Number(current.totalCopies || 0) - Number(current.availableCopies || 0));
        if (totalCopies < borrowed) throw new Error(`Hay ${borrowed} ejemplares prestados; el total no puede ser menor.`);
        transaction.update(reference, { ...payload, availableCopies: totalCopies - borrowed });
      });
    }
    $('#bookDialog').close();
    toast('Libro guardado correctamente.');
  } catch (error) { toast(error.message, 'error'); }
  finally { setBusy(button, false); }
}

async function approveRequest(requestId, button) {
  setBusy(button, true, 'Aprobando…');
  try {
    await runTransaction(db, async transaction => {
      const requestRef = doc(db, 'requests', requestId);
      const requestSnap = await transaction.get(requestRef);
      if (!requestSnap.exists() || requestSnap.data().status !== 'pending') throw new Error('La solicitud ya fue atendida.');
      const requestData = requestSnap.data();
      const bookRef = doc(db, 'books', requestData.bookId);
      const bookSnap = await transaction.get(bookRef);
      if (!bookSnap.exists() || Number(bookSnap.data().availableCopies || 0) < 1) throw new Error('No hay ejemplares disponibles.');
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 14);
      const loanRef = doc(collection(db, 'loans'));
      transaction.update(bookRef, { availableCopies: Number(bookSnap.data().availableCopies) - 1, updatedAt: serverTimestamp() });
      transaction.update(requestRef, { status: 'approved', approvedAt: serverTimestamp(), loanId: loanRef.id });
      transaction.set(loanRef, {
        requestId, bookId: requestData.bookId, bookTitle: requestData.bookTitle, bookAuthor: requestData.bookAuthor || '',
        userId: requestData.userId, employeeName: requestData.employeeName, employeeNumber: requestData.employeeNumber,
        status: 'active', createdAt: serverTimestamp(), dueAt: Timestamp.fromDate(dueDate)
      });
    });
    toast('Solicitud aprobada y préstamo registrado.');
  } catch (error) { toast(error.message, 'error'); }
  finally { setBusy(button, false); }
}

async function rejectRequest(requestId, button) {
  setBusy(button, true, 'Rechazando…');
  try { await updateDoc(doc(db, 'requests', requestId), { status: 'rejected', rejectedAt: serverTimestamp() }); toast('Solicitud rechazada.'); }
  catch (error) { toast(error.message, 'error'); }
  finally { setBusy(button, false); }
}

async function returnLoan(loanId, button) {
  setBusy(button, true, 'Registrando…');
  try {
    await runTransaction(db, async transaction => {
      const loanRef = doc(db, 'loans', loanId);
      const loanSnap = await transaction.get(loanRef);
      if (!loanSnap.exists() || loanSnap.data().status !== 'active') throw new Error('El préstamo ya fue cerrado.');
      const loan = loanSnap.data();
      const bookRef = doc(db, 'books', loan.bookId);
      const bookSnap = await transaction.get(bookRef);
      transaction.update(loanRef, { status: 'returned', returnedAt: serverTimestamp() });
      if (bookSnap.exists()) transaction.update(bookRef, { availableCopies: Math.min(Number(bookSnap.data().totalCopies || 0), Number(bookSnap.data().availableCopies || 0) + 1), updatedAt: serverTimestamp() });
      if (loan.requestId) transaction.update(doc(db, 'requests', loan.requestId), { status: 'completed', completedAt: serverTimestamp() });
    });
    toast('Devolución registrada.');
  } catch (error) { toast(error.message, 'error'); }
  finally { setBusy(button, false); }
}

function route() {
  if (!state.user) return;
  let page = location.hash.replace('#', '') || 'catalog';
  const adminOnly = ['manage', 'requests', 'history'];
  if (!state.isAdmin && adminOnly.includes(page)) page = 'catalog';
  $$('[data-page-content]').forEach(section => { section.hidden = section.dataset.pageContent !== page; });
  $$('[data-page]').forEach(link => link.classList.toggle('active', link.dataset.page === page));
  $('#sidebar').classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function registerEvents() {
  $$('[data-app-version]').forEach(element => { element.textContent = window.APP_VERSION; });
  $('#userAccess').addEventListener('click', async () => {
    const person = identity();
    if (!person.employeeName || !person.employeeNumber) return $('#identityDialog').showModal();
    try {
      localStorage.setItem('libraryMode', 'user');
      if (!auth.currentUser?.isAnonymous) { if (auth.currentUser) await signOut(auth); await signInAnonymously(auth); }
      else showApp(auth.currentUser, false);
    } catch (error) { toast(`Activa el acceso anónimo en Firebase: ${error.message}`, 'error'); }
  });
  $('#adminAccess').addEventListener('click', () => $('#loginDialog').showModal());
  $$('[data-close]').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
  $('#identityForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    localStorage.setItem('libraryIdentity', JSON.stringify({ employeeNumber: form.employeeNumber.value.trim(), employeeName: form.employeeName.value.trim() }));
    localStorage.setItem('libraryMode', 'user');
    try { if (auth.currentUser && !auth.currentUser.isAnonymous) await signOut(auth); if (!auth.currentUser) await signInAnonymously(auth); form.closest('dialog').close(); showApp(auth.currentUser, false); }
    catch (error) { toast(error.message, 'error'); }
  });
  $('#loginForm').addEventListener('submit', async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const button = $('button[type="submit"]', form);
    setBusy(button, true, 'Validando…');
    try {
      if (auth.currentUser) await signOut(auth);
      const credential = await signInWithEmailAndPassword(auth, form.email.value.trim(), form.password.value);
      if (!hasAdminAccess(credential.user)) { await signOut(auth); throw new Error('Esta cuenta no utiliza acceso por correo y contraseña.'); }
      localStorage.setItem('libraryMode', 'admin');
      form.closest('dialog').close();
      showApp(credential.user, true);
    } catch (error) { toast(error.message, 'error'); }
    finally { setBusy(button, false); }
  });
  $('#logoutButton').addEventListener('click', async () => { localStorage.removeItem('libraryMode'); await signOut(auth); showAccess(); });
  $('#menuButton').addEventListener('click', () => $('#sidebar').classList.add('open'));
  $('#sidebarBackdrop').addEventListener('click', () => $('#sidebar').classList.remove('open'));
  window.addEventListener('hashchange', route);
  window.addEventListener('online', setConnectionState);
  window.addEventListener('offline', setConnectionState);
  $('#bookSearch').addEventListener('input', renderBooks);
  $('#categoryFilter').addEventListener('change', renderBooks);
  $('#newBookButton').addEventListener('click', () => openBookDialog());
  $('#bookForm').addEventListener('submit', event => { event.preventDefault(); saveBook(event.currentTarget, $('button[type="submit"]', event.currentTarget)); });
  document.addEventListener('click', async event => {
    const request = event.target.closest('[data-request-book]');
    const edit = event.target.closest('[data-edit-book]');
    const toggle = event.target.closest('[data-toggle-book]');
    const approve = event.target.closest('[data-approve-request]');
    const reject = event.target.closest('[data-reject-request]');
    const returned = event.target.closest('[data-return-loan]');
    if (request) await requestBook(request.dataset.requestBook, request);
    if (edit) openBookDialog(state.books.find(book => book.id === edit.dataset.editBook));
    if (toggle) { const book = state.books.find(item => item.id === toggle.dataset.toggleBook); if (book) await updateDoc(doc(db, 'books', book.id), { active: book.active === false, updatedAt: serverTimestamp() }); }
    if (approve) await approveRequest(approve.dataset.approveRequest, approve);
    if (reject) await rejectRequest(reject.dataset.rejectRequest, reject);
    if (returned) await returnLoan(returned.dataset.returnLoan, returned);
  });
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); state.installPrompt = event; $('#installButton').hidden = false; });
  $('#installButton').addEventListener('click', async () => { if (!state.installPrompt) return; await state.installPrompt.prompt(); state.installPrompt = null; $('#installButton').hidden = true; });
}

async function initialize() {
  registerEvents();
  setConnectionState();
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js').catch(error => console.warn('Service worker:', error));
  onAuthStateChanged(auth, async user => {
    const mode = localStorage.getItem('libraryMode');
    if (!user || !mode) return showAccess();
    try {
      if (mode === 'admin') {
        const allowed = hasAdminAccess(user);
        if (!allowed) { await signOut(auth); return showAccess(); }
        showApp(user, true);
      } else if (mode === 'user' && user.isAnonymous) showApp(user, false);
      else showAccess();
    } catch (error) { toast(error.message, 'error'); showAccess(); }
  });
}

initialize();
