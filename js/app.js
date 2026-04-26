/* ===================================================
   EduCRM — Complete Application Logic
   Web CRM (Student Management System)
   Role-Based Access Control (RBAC)
   Connected to Node.js + MySQL Backend via REST API
   =================================================== */

'use strict';

// ─── API Configuration ────────────────────────────────────────────────────────
const API_BASE = window.location.origin + '/api';

// ─── State ────────────────────────────────────────────────────────────────────
let currentUser = null;
let currentView = 'dashboard';
let authToken = null;
let pendingDeleteCallback = null;
let currentReportData = null;
let currentReportTitle = '';

// ─── Token Storage ────────────────────────────────────────────────────────────
function saveSession(token, user) {
  localStorage.setItem('educrm_token', token);
  localStorage.setItem('educrm_user', JSON.stringify(user));
  authToken = token;
  currentUser = user;
}

function loadSession() {
  authToken = localStorage.getItem('educrm_token');
  const raw = localStorage.getItem('educrm_user');
  currentUser = raw ? JSON.parse(raw) : null;
  return !!(authToken && currentUser);
}

function clearSession() {
  localStorage.removeItem('educrm_token');
  localStorage.removeItem('educrm_user');
  authToken = null;
  currentUser = null;
}

// ─── API Helper ───────────────────────────────────────────────────────────────
async function api(method, path, body = null) {
  const isFormData = body instanceof FormData;
  const opts = {
    method,
    headers: {},
  };
  if (!isFormData) {
    opts.headers['Content-Type'] = 'application/json';
    if (body) opts.body = JSON.stringify(body);
  } else {
    opts.body = body;
  }

  if (authToken) opts.headers['Authorization'] = `Bearer ${authToken}`;

  const res = await fetch(`${API_BASE}${path}`, opts);
  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || 'Request failed');
  }
  return data;
}

// ─── Utility Functions ────────────────────────────────────────────────────────
function formatDate(isoOrDate) {
  if (!isoOrDate) return '—';
  const d = new Date(isoOrDate);
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function formatCurrency(amount) {
  return '₹' + Number(amount || 0).toLocaleString('en-IN');
}

function getInitials(name) {
  return String(name || '?').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
}

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Good Morning';
  if (h < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

window.calculateAge = function (dob) {
  if (!dob) return;
  const birthDate = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const m = today.getMonth() - birthDate.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  document.getElementById('s-age').value = age;
};

window.togglePwdType = function (val) {
  const gp = document.getElementById('pwd-type-group');
  if (val === 'Yes') gp.classList.remove('hidden');
  else gp.classList.add('hidden');
};

// ─── Toast Notifications ──────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast ${type}`;
  void toast.offsetWidth;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 3500);
}

// ─── Confirm Dialog ───────────────────────────────────────────────────────────
function showConfirm(title, message, onConfirm) {
  document.getElementById('confirm-title').textContent = title;
  document.getElementById('confirm-message').textContent = message;
  pendingDeleteCallback = onConfirm;
  openOverlay('confirm-overlay');
}

document.getElementById('confirm-ok').addEventListener('click', () => {
  if (pendingDeleteCallback) { pendingDeleteCallback(); pendingDeleteCallback = null; }
  closeOverlay('confirm-overlay');
});
document.getElementById('confirm-cancel').addEventListener('click', () => {
  pendingDeleteCallback = null;
  closeOverlay('confirm-overlay');
});

// ─── Modal Helpers ────────────────────────────────────────────────────────────
function openOverlay(id) {
  const el = document.getElementById(id);
  el.setAttribute('aria-hidden', 'false');
  el.classList.add('open');
}
function closeOverlay(id) {
  const el = document.getElementById(id);
  el.setAttribute('aria-hidden', 'true');
  el.classList.remove('open');
}
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
});

// ─── Auth ─────────────────────────────────────────────────────────────────────
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('loginBtn');
  const btnText = btn.querySelector('.btn-text');
  const btnLoader = btn.querySelector('.btn-loader');

  btnText.classList.add('hidden');
  btnLoader.classList.remove('hidden');
  btn.disabled = true;

  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;

  try {
    const data = await api('POST', '/auth/login', { email, password });
    saveSession(data.token, data.user);
    initApp();
  } catch (err) {
    const errEl = document.getElementById('login-error');
    document.getElementById('login-error-msg').textContent = err.message;
    errEl.classList.remove('hidden');
    setTimeout(() => errEl.classList.add('hidden'), 5000);
  } finally {
    btnText.classList.remove('hidden');
    btnLoader.classList.add('hidden');
    btn.disabled = false;
  }
});

document.getElementById('togglePwd').addEventListener('click', () => {
  const pwd = document.getElementById('login-password');
  pwd.type = pwd.type === 'password' ? 'text' : 'password';
});

window.fillDemo = function (email, password) {
  document.getElementById('login-email').value = email;
  document.getElementById('login-password').value = password;
};

function logout() {
  clearSession();
  document.getElementById('page-app').classList.remove('admin-visible');
  showPage('login');
}

// ─── Page / View Navigation ───────────────────────────────────────────────────
function showPage(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${page}`).classList.add('active');
}

window.showView = function (viewName) {
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const view = document.getElementById(`view-${viewName}`);
  if (view) view.classList.add('active');

  const nav = document.getElementById(`nav-${viewName}`);
  if (nav) nav.classList.add('active');

  currentView = viewName;
  document.getElementById('page-title').textContent = {
    dashboard: 'Dashboard', students: 'Students',
    users: 'User Management', reports: 'Reports & Analytics',
    attendance: 'Batch Attendance'
  }[viewName] || viewName;

  if (viewName === 'dashboard') renderDashboard();
  if (viewName === 'students') renderStudentsTable();
  if (viewName === 'users') renderUsersTable();
  if (viewName === 'reports') resetReportOutput();
  if (viewName === 'attendance') initAttendanceView();

  closeMobileSidebar();
};

document.querySelectorAll('.nav-item[data-view]').forEach(item => {
  item.addEventListener('click', e => { e.preventDefault(); showView(item.dataset.view); });
});

// ─── Init App ─────────────────────────────────────────────────────────────────
function initApp() {
  if (!currentUser) return;
  const isAdmin = currentUser.role === 'admin';
  const isManager = isAdmin || currentUser.role === 'partner';

  if (isAdmin) {
    document.getElementById('page-app').classList.add('admin-visible');
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = '');
  } else {
    document.getElementById('page-app').classList.remove('admin-visible');
    document.querySelectorAll('.admin-only').forEach(el => el.style.display = 'none');
  }

  if (isManager) {
    document.querySelectorAll('.manager-only').forEach(el => el.style.display = '');
    if (!isAdmin) {
      // Hide admin-specific badges within manager accessible items
      document.querySelectorAll('.manager-only .admin-badge').forEach(el => el.style.display = 'none');
    }
  } else {
    document.querySelectorAll('.manager-only').forEach(el => el.style.display = 'none');
  }

  const initials = getInitials(currentUser.name);
  const roleName = isAdmin ? 'Super Admin' : 'Staff';

  document.getElementById('sidebar-avatar').textContent = initials;
  document.getElementById('sidebar-name').textContent = currentUser.name;
  document.getElementById('sidebar-role').textContent = roleName;
  document.getElementById('topbar-avatar').textContent = initials;
  document.getElementById('topbar-name').textContent = currentUser.name;

  showPage('app');
  showView('dashboard');
  startClock();
}

function startClock() {
  function tick() {
    const now = new Date();
    const el = document.getElementById('topbarTime');
    if (el) el.textContent = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
  }
  tick();
  setInterval(tick, 60000);
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
async function renderDashboard() {
  document.getElementById('dashboard-greeting').textContent =
    `${getGreeting()}, ${currentUser.name.split(' ')[0]} 👋`;

  try {
    const { total, totalFees, newThisMonth, staffCount, courses } = await api('GET', '/students/stats');

    document.getElementById('stat-total').textContent = total;
    document.getElementById('stat-fees').textContent = formatCurrency(totalFees);
    document.getElementById('stat-total-change').textContent = `+${newThisMonth} this month`;
    document.getElementById('stat-total-change').className = 'stat-change' + (newThisMonth > 0 ? ' positive' : '');
    document.getElementById('stat-users').textContent = staffCount;

    const uniqueCourses = new Set(courses.map(c => c.course));
    document.getElementById('stat-courses').textContent = uniqueCourses.size || courses.length;

    // Course chart
    const courseChart = document.getElementById('course-chart');
    if (courses.length === 0) {
      courseChart.innerHTML = '<div class="empty-state" style="padding:30px 0"><p>No data yet</p></div>';
    } else {
      const maxCount = courses[0].count;
      courseChart.innerHTML = courses.map(({ course, count }) => {
        const pct = Math.round((count / maxCount) * 100);
        return `<div class="chart-row">
          <div class="chart-label"><span>${escHtml(course)}</span><span>${count}</span></div>
          <div class="chart-bar-track"><div class="chart-bar-fill" style="width:${pct}%"></div></div>
        </div>`;
      }).join('');
    }

    // Recent students
    const { students } = await api('GET', '/students?');
    const recent = students.slice(0, 6);
    const recentList = document.getElementById('recent-students-list');
    if (recent.length === 0) {
      recentList.innerHTML = '<div class="empty-state"><p>No students added yet</p></div>';
    } else {
      recentList.innerHTML = recent.map(s => `
        <div class="recent-item">
          <div class="recent-avatar">${getInitials(s.student_name)}</div>
          <div class="recent-info">
            <div class="recent-name">${escHtml(s.student_name)}</div>
            <div class="recent-meta">${escHtml(s.course)} • ${escHtml(s.added_by_name || '—')}</div>
          </div>
          <div class="recent-fees">${formatCurrency(s.fees)}</div>
        </div>`).join('');
    }

  } catch (err) {
    console.error('Dashboard error:', err);
    showToast('Could not load dashboard data.', 'error');
  }
}

// ─── Students Table ───────────────────────────────────────────────────────────
window.renderStudentsTable = async function () {
  const search = document.getElementById('student-search').value;
  const course = document.getElementById('student-course-filter').value;

  const isAdmin = currentUser.role === 'admin';
  document.getElementById('students-subtitle').textContent = isAdmin
    ? 'Viewing all students in the system'
    : 'Showing students you\'ve added';

  try {
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (course) params.set('course', course);

    const [{ students }, { courses }] = await Promise.all([
      api('GET', `/students?${params}`),
      api('GET', '/students/courses'),
    ]);

    // Populate course filter
    const courseFilter = document.getElementById('student-course-filter');
    const saved = courseFilter.value;
    courseFilter.innerHTML = '<option value="">All Courses</option>' +
      courses.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');
    if (saved) courseFilter.value = saved;

    const tbody = document.getElementById('students-tbody');
    if (students.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8"><div class="empty-state">
        <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>
        <p>No students found</p></div></td></tr>`;
    } else {
      tbody.innerHTML = students.map((s, i) => {
        // Students can be edited by Admin, or by the creator if they have perm_edit
        const canEdit = isAdmin || (s.created_by === currentUser.id && currentUser.perm_edit);
        const canDelete = isAdmin || (s.created_by === currentUser.id && currentUser.perm_delete);
        
        return `<tr>
          <td><input type="checkbox" class="student-checkbox" value="${s.id}" onchange="updateBulkActionToolbar()"></td>
          <td>${i + 1}</td>
          <td class="name-cell">${escHtml(s.student_name)}</td>
          <td>${escHtml(s.mobile)}</td>
          <td><span class="status-badge status-admin">${escHtml(s.course)}</span></td>
          <td>${escHtml(s.batch_name || '—')}</td>
          <td><strong>${formatCurrency(s.fees)}</strong></td>
          <td>${escHtml(s.added_by_name || '—')}</td>
          <td>${formatDate(s.created_at)}</td>
          <td><div class="action-btns">
            ${canEdit ? `<button class="action-btn edit" title="Edit" onclick="editStudent(${s.id})">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            </button>` : ''}
            ${canDelete ? `<button class="action-btn delete" title="Delete" onclick="deleteStudent(${s.id}, '${escHtml(s.student_name)}')">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            </button>` : ''}
            ${(!canEdit && !canDelete) ? '<span style="color:var(--text-muted);font-size:12px">—</span>' : ''}
          </div></td>
        </tr>`;
      }).join('');
    }
    document.getElementById('students-count').textContent =
      `Showing ${students.length} student${students.length !== 1 ? 's' : ''}`;

  } catch (err) {
    showToast(err.message || 'Failed to load students.', 'error');
  }
};

document.getElementById('student-search').addEventListener('input', () => renderStudentsTable());
document.getElementById('student-course-filter').addEventListener('change', () => renderStudentsTable());

// ─── Student Modal ────────────────────────────────────────────────────────────
window.openStudentModal = function (student = null) {
  const form = document.getElementById('studentForm');
  form.reset();
  document.getElementById('student-id').value = '';
  document.getElementById('student-modal-title').textContent = student ? 'Edit Student Details' : 'New Student Registration';
  document.getElementById('saveStudentBtn').textContent = student ? 'Update Record' : 'Submit Registration';
  
  // Reset previews
  document.getElementById('document-preview').classList.add('hidden');
  document.getElementById('pwd-type-group').classList.add('hidden');
  document.getElementById('s-document').required = !student; // Required for new

  // UI Lock for non-admins on edit
  const isAdmin = currentUser.role === 'admin';
  const isEdit = !!student;
  const isLocked = isEdit && !isAdmin;

  if (isLocked) {
    form.classList.add('form-locked');
    document.getElementById('saveStudentBtn').classList.add('hidden');
    document.getElementById('lock-msg').classList.remove('hidden');
  } else {
    form.classList.remove('form-locked');
    document.getElementById('saveStudentBtn').classList.remove('hidden');
    document.getElementById('lock-msg').classList.add('hidden');
  }

  if (isAdmin) {
    document.getElementById('s-partner-group').classList.remove('hidden');
    fetchPartners().then(partners => {
      const select = document.getElementById('s-partner');
      select.innerHTML = '<option value="">No Partner (Independent)</option>' +
        partners.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
      if (student && student.partner_id) select.value = student.partner_id;
    });
  } else {
    document.getElementById('s-partner-group').classList.add('hidden');
  }

  fetchBatches().then(batches => {
    const select = document.getElementById('s-batch');
    select.innerHTML = '<option value="">No Batch Assigned</option>' +
      batches.map(b => `<option value="${b.id}">${escHtml(b.name)}</option>`).join('');
    if (student && student.batch_id) select.value = student.batch_id;
  });

  if (student) {
    document.getElementById('student-id').value = student.id;
    document.getElementById('s-candidate-id').value = student.candidate_id || '';
    document.getElementById('s-name').value = student.student_name || '';
    document.getElementById('s-father').value = student.father_husband_name || '';
    document.getElementById('s-mother').value = student.mother_name || '';
    document.getElementById('s-address').value = student.address || '';
    document.getElementById('s-district').value = student.district || '';
    document.getElementById('s-state').value = student.state || '';
    
    if (student.dob) {
      const d = new Date(student.dob).toISOString().split('T')[0];
      document.getElementById('s-dob').value = d;
      calculateAge(d);
    }
    
    document.getElementById('s-age').value = student.age || '';
    document.getElementById('s-gender').value = student.gender || '';
    document.getElementById('s-marital').value = student.marital_status || '';
    document.getElementById('s-blood').value = student.blood_group || '';
    document.getElementById('s-pwd').value = student.pwd || 'No';
    togglePwdType(student.pwd);
    document.getElementById('s-pwd-type').value = student.pwd_type || '';
    document.getElementById('s-qualification').value = student.qualification || '';
    document.getElementById('s-course').value = student.course || '';
    document.getElementById('s-mode').value = student.mode_of_training || 'Offline';
    document.getElementById('s-yop').value = student.year_of_passing || '';
    document.getElementById('s-category').value = student.category || 'General';
    document.getElementById('s-minority').value = student.minority || 'No';
    document.getElementById('s-aadhaar').value = student.aadhaar_no || '';
    document.getElementById('s-mobile').value = student.mobile || '';
    document.getElementById('s-parent-mobile').value = student.parents_mobile || '';
    document.getElementById('s-email').value = student.email_id || '';
    document.getElementById('s-bank').value = student.bank_name || '';
    document.getElementById('s-acc-no').value = student.bank_account_no || '';
    document.getElementById('s-ifsc').value = student.bank_ifsc_code || '';
    document.getElementById('s-fees').value = student.fees || 0;
    document.getElementById('s-notes').value = student.notes || '';

    if (student.document_path) {
      document.getElementById('document-preview').classList.remove('hidden');
      document.getElementById('doc-link').href = `${API_BASE.replace('/api', '')}${student.document_path}`;
    }
  }
  openOverlay('student-modal');
  setTimeout(() => document.getElementById('s-name').focus(), 100);
};

window.closeStudentModal = function () { closeOverlay('student-modal'); };

// Store current students for edit lookup
let _studentsCache = [];

window.editStudent = async function (id) {
  try {
    const { students } = await api('GET', '/students');
    const student = students.find(s => s.id === id);
    if (student) openStudentModal(student);
  } catch (err) {
    showToast('Could not load student data.', 'error');
  }
};

window.deleteStudent = function (id, name) {
  showConfirm('Delete Student',
    `Are you sure you want to delete "${name}"? This action cannot be undone.`,
    async () => {
      try {
        await api('DELETE', `/students/${id}`);
        showToast('Student deleted successfully.', 'info');
        renderStudentsTable();
      } catch (err) {
        showToast(err.message, 'error');
      }
    }
  );
};

document.getElementById('studentForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const form = e.target;
  if (!form.checkValidity()) {
    showToast('Please fill in all required fields.', 'error'); return;
  }

  const formData = new FormData();
  formData.append('candidate_id', document.getElementById('s-candidate-id').value);
  formData.append('student_name', document.getElementById('s-name').value);
  formData.append('father_husband_name', document.getElementById('s-father').value);
  formData.append('mother_name', document.getElementById('s-mother').value);
  formData.append('address', document.getElementById('s-address').value);
  formData.append('district', document.getElementById('s-district').value);
  formData.append('state', document.getElementById('s-state').value);
  formData.append('dob', document.getElementById('s-dob').value);
  formData.append('age', document.getElementById('s-age').value);
  formData.append('gender', document.getElementById('s-gender').value);
  formData.append('marital_status', document.getElementById('s-marital').value);
  formData.append('blood_group', document.getElementById('s-blood').value);
  formData.append('pwd', document.getElementById('s-pwd').value);
  formData.append('pwd_type', document.getElementById('s-pwd-type').value);
  formData.append('qualification', document.getElementById('s-qualification').value);
  formData.append('course', document.getElementById('s-course').value);
  formData.append('mode_of_training', document.getElementById('s-mode').value);
  formData.append('year_of_passing', document.getElementById('s-yop').value);
  formData.append('category', document.getElementById('s-category').value);
  formData.append('minority', document.getElementById('s-minority').value);
  formData.append('aadhaar_no', document.getElementById('s-aadhaar').value);
  formData.append('mobile', document.getElementById('s-mobile').value);
  formData.append('parents_mobile', document.getElementById('s-parent-mobile').value);
  formData.append('email_id', document.getElementById('s-email').value);
  formData.append('bank_name', document.getElementById('s-bank').value);
  formData.append('bank_account_no', document.getElementById('s-acc-no').value);
  formData.append('bank_ifsc_code', document.getElementById('s-ifsc').value);
  formData.append('fees', document.getElementById('s-fees').value);
  formData.append('notes', document.getElementById('s-notes').value);
  formData.append('batch_id', document.getElementById('s-batch').value);

  const isAdmin = currentUser.role === 'admin';
  if (isAdmin) {
    formData.append('partner_id', document.getElementById('s-partner').value);
  }

  const fileInput = document.getElementById('s-document');
  if (fileInput.files[0]) {
    formData.append('document', fileInput.files[0]);
  }

  const existingId = document.getElementById('student-id').value;
  const btn = document.getElementById('saveStudentBtn');
  btn.disabled = true; btn.textContent = 'Processing...';

  try {
    if (existingId) {
      const { message } = await api('PUT', `/students/${existingId}`, formData);
      showToast(message, 'success');
    } else {
      const { message } = await api('POST', '/students', formData);
      showToast(message, 'success');
    }
    closeStudentModal();
    renderStudentsTable();
    if (currentView === 'dashboard') renderDashboard();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Submit Registration';
  }
});

// ─── Export Students CSV ──────────────────────────────────────────────────────
window.exportStudents = async function () {
  try {
    const { students } = await api('GET', '/students?');
    const rows = [['#', 'Name', 'Mobile', 'Course', 'Fees (INR)', 'Added By', 'Date Added']];
    students.forEach((s, i) => {
      rows.push([i + 1, s.student_name, s.mobile, s.course, s.fees, s.added_by_name || '—', formatDate(s.created_at)]);
    });
    downloadCSV(rows, 'students_export');
    showToast('CSV exported!', 'success');
  } catch (err) {
    showToast('Export failed.', 'error');
  }
};

// ─── Users Table ──────────────────────────────────────────────────────────────
async function renderUsersTable() {
  if (currentUser.role !== 'admin' && currentUser.role !== 'partner') return;
  try {
    const { users } = await api('GET', '/users');
    const tbody = document.getElementById('users-tbody');
    tbody.innerHTML = users.map((u, i) => {
      const isMe = u.id === currentUser.id;
      let roleLabel = u.role === 'admin' ? 'Super Admin' : (u.role === 'partner' ? 'Partner' : 'Staff');
      let roleBadge = u.role === 'admin' ? 'status-admin' : (u.role === 'partner' ? 'status-orange' : 'status-staff');
      
      const partnerTag = u.partner_name ? `<span class="badge badge-admin" style="display:block;margin-top:4px">${escHtml(u.partner_name)}</span>` : '';

      return `<tr>
        <td>${i + 1}</td>
        <td class="name-cell">
          ${escHtml(u.name)} ${isMe ? '<span class="status-badge status-active" style="font-size:10px">You</span>' : ''}
          ${partnerTag}
        </td>
        <td>${escHtml(u.email)}</td>
        <td><span class="status-badge ${roleBadge}">${roleLabel}</span></td>
        <td><span class="status-badge ${u.status === 'active' ? 'status-active' : 'status-inactive'}">${u.status}</span></td>
        <td>${u.student_count}</td>
        <td>${formatDate(u.created_at)}</td>
        <td><div class="action-btns">
          <button class="action-btn edit" title="Edit" onclick="editUser(${u.id})">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
          ${!isMe ? `<button class="action-btn delete" title="Delete" onclick="deleteUser(${u.id}, '${escHtml(u.name)}')">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
          </button>` : ''}
        </div></td>
      </tr>`;
    }).join('');
  } catch (err) {
    showToast('Failed to load users.', 'error');
  }
}

window.openUserModal = async function (id = null) {
  const form = document.getElementById('userForm');
  form.reset();
  await fetchPartners(); // Load partners for the dropdown
  
  document.getElementById('user-id').value = '';
  document.getElementById('perm-edit').checked = false;
  document.getElementById('perm-delete').checked = false;
  document.getElementById('perm-view-all').checked = false;
  document.getElementById('u-password').required = !id;
  document.getElementById('u-password').placeholder = id ? 'Leave blank to keep unchanged' : 'Min 8 characters';
  document.getElementById('user-modal-title').textContent = id ? 'Edit User' : 'Add User';
  document.getElementById('saveUserBtn').textContent = id ? 'Update User' : 'Save User';
  
  document.getElementById('partner-select-group').classList.add('hidden');

  const isAdmin = currentUser.role === 'admin';
  const roleSelect = document.getElementById('u-role');
  
  if (!isAdmin) {
    roleSelect.value = 'staff';
    roleSelect.disabled = true; // Partners can only create staff
    document.getElementById('u-partner').value = currentUser.partner_id || '';
  } else {
    roleSelect.disabled = false;
  }

  if (id) {
    try {
      const { users } = await api('GET', '/users');
      const user = users.find(u => u.id === id);
      if (!user) return;
      document.getElementById('user-id').value = id;
      document.getElementById('u-name').value = user.name;
      document.getElementById('u-email').value = user.email;
      document.getElementById('u-role').value = user.role;
      document.getElementById('u-status').value = user.status;
      document.getElementById('perm-edit').checked = !!user.perm_edit;
      document.getElementById('perm-delete').checked = !!user.perm_delete;
      document.getElementById('perm-view-all').checked = !!user.perm_view_all;
      
      handleRoleChange(user.role);
      document.getElementById('u-partner').value = user.partner_id || '';
    } catch (err) {
      showToast('Could not load user data.', 'error'); return;
    }
  } else if (!isAdmin) {
    // For new staff added by partner, trigger handles naturally
    handleRoleChange('staff');
  }
  openOverlay('user-modal');
};

window.handleRoleChange = function (role) {
  const pg = document.getElementById('partner-select-group');
  const perms = document.getElementById('perms-group');
  const isAdmin = currentUser.role === 'admin';

  if (role === 'partner' || role === 'staff') {
    if (isAdmin) pg.classList.remove('hidden'); // Only Super Admin needs to select the partner
    perms.classList.remove('hidden');
  } else if (role === 'admin') {
    pg.classList.add('hidden');
    perms.classList.add('hidden');
  }
};

window.fetchPartners = async function () {
  try {
    const { partners } = await api('GET', '/partners');
    const select = document.getElementById('u-partner');
    select.innerHTML = '<option value="">No Partner</option>' +
      partners.map(p => `<option value="${p.id}">${escHtml(p.name)}</option>`).join('');
    return partners;
  } catch (err) {
    console.error('Failed to fetch partners');
  }
};

window.openPartnerManager = async function () {
  const partners = await fetchPartners();
  const list = document.getElementById('partners-list');
  list.innerHTML = partners.map(p => `
    <li class="item-row">
      <span>${escHtml(p.name)}</span>
      <span class="badge badge-admin">ID: ${p.id}</span>
    </li>
  `).join('');
  openOverlay('partner-modal');
};

window.closePartnerManager = function () { closeOverlay('partner-modal'); };

window.createNewPartner = async function () {
  const nameInput = document.getElementById('new-partner-name');
  const name = nameInput.value.trim();
  if (!name) return showToast('Name is required', 'error');
  
  try {
    await api('POST', '/partners', { name });
    showToast('Partner added', 'success');
    nameInput.value = '';
    const updated = await fetchPartners();
    openPartnerManager(); // Refresh list
  } catch (err) {
    showToast(err.message, 'error');
  }
};

window.closeUserModal = function () { closeOverlay('user-modal'); };

window.editUser = function (id) { openUserModal(id); };

window.deleteUser = function (id, name) {
  showConfirm('Delete User', `Delete user "${name}"? Their student records will remain.`, async () => {
    try {
      await api('DELETE', `/users/${id}`);
      showToast('User deleted.', 'info');
      renderUsersTable();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
};

document.getElementById('userForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('u-name').value.trim();
  const email = document.getElementById('u-email').value.trim();
  const password = document.getElementById('u-password').value;
  const role = document.getElementById('u-role').disabled ? 'staff' : document.getElementById('u-role').value;
  const status = document.getElementById('u-status').value;
  const partner_id = document.getElementById('u-partner').value;
  const existingId = document.getElementById('user-id').value;

  if (!name || !email) { showToast('Name and email are required.', 'error'); return; }
  if (!existingId && !password) { showToast('Password is required for new users.', 'error'); return; }

  const payload = {
    name, email, role, status,
    partner_id: partner_id ? Number(partner_id) : null,
    permissions: {
      edit: document.getElementById('perm-edit').checked,
      delete: document.getElementById('perm-delete').checked,
      viewAll: document.getElementById('perm-view-all').checked,
    },
  };
  if (password) payload.password = password;

  const btn = document.getElementById('saveUserBtn');
  btn.disabled = true; btn.textContent = 'Saving...';

  try {
    if (existingId) {
      const { message } = await api('PUT', `/users/${existingId}`, payload);
      showToast(message, 'success');
    } else {
      const { message } = await api('POST', '/users', payload);
      showToast(message, 'success');
    }
    closeUserModal();
    renderUsersTable();
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = existingId ? 'Update User' : 'Save User';
  }
});

// ─── Reports ──────────────────────────────────────────────────────────────────
window.generateReport = async function (type) {
  try {
    const { data, title } = await api('GET', `/reports/${type}`);
    renderReportTable(data, title);
  } catch (err) {
    showToast(err.message || 'Failed to generate report.', 'error');
  }
};

window.openReportFilterModal = async function (type) {
  const modal = document.getElementById('report-filter-modal');
  document.getElementById('filter-report-type').value = type;
  
  const titleMap = {
    'student-attendance': 'Student Attendance Filters'
  };
  document.getElementById('report-filter-title').textContent = titleMap[type] || 'Report Filters';

  const select = document.getElementById('filter-batch-select');
  select.innerHTML = '<option value="">Loading batches...</option>';
  
  openOverlay('report-filter-modal');

  try {
    const batches = await fetchBatches();
    select.innerHTML = '<option value="">-- Choose Batch --</option>' +
      batches.map(b => `<option value="${b.id}">${escHtml(b.name)}</option>`).join('');
  } catch (err) {
    showToast('Failed to load batches', 'error');
  }
};

window.closeReportFilterModal = function () {
  closeOverlay('report-filter-modal');
  document.getElementById('filter-batch-select').value = '';
  document.getElementById('filter-start-date').value = '';
  document.getElementById('filter-end-date').value = '';
};

window.submitCustomReport = async function () {
  const type = document.getElementById('filter-report-type').value;
  const batch_id = document.getElementById('filter-batch-select').value;
  const start_date = document.getElementById('filter-start-date').value;
  const end_date = document.getElementById('filter-end-date').value;

  if (!batch_id) return showToast('Please select a batch', 'error');

  closeReportFilterModal();

  const params = new URLSearchParams();
  if (batch_id) params.append('batch_id', batch_id);
  if (start_date) params.append('start_date', start_date);
  if (end_date) params.append('end_date', end_date);

  try {
    const { data, title } = await api('GET', `/reports/${type}?${params.toString()}`);
    renderReportTable(data, title);
    showToast(`${title} generated!`, 'info');
  } catch (err) {
    showToast(err.message, 'error');
  }
};

function renderReportTable(data, title) {
  currentReportTitle = title;
  currentReportData = data;

  const card = document.getElementById('report-output-card');
  card.style.display = '';
  document.getElementById('report-output-title').textContent = title;

  const thead = document.getElementById('report-thead');
  const tbody = document.getElementById('report-tbody');

  if (!data || data.length === 0) {
    thead.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="5"><div class="empty-state"><p>No data available for the selected filters</p></div></td></tr>';
  } else {
    const headers = Object.keys(data[0]);
    thead.innerHTML = `<tr>${headers.map(h => `<th>${h.replace(/_/g, ' ').toUpperCase()}</th>`).join('')}</tr>`;
    tbody.innerHTML = data.map(row =>
      `<tr>${headers.map((h, i) => `<td${i === 0 ? ' class="name-cell"' : ''}>${escHtml(String(row[h] ?? ''))}</td>`).join('')}</tr>`
    ).join('');
  }
  
  showToast(`${title} generated!`, 'info');
  card.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

document.getElementById('downloadReportBtn').addEventListener('click', () => {
  if (!currentReportData || currentReportData.length === 0) return;
  const headers = Object.keys(currentReportData[0]);
  const rows = [headers, ...currentReportData.map(row => headers.map(h => row[h] ?? ''))];
  downloadCSV(rows, currentReportTitle.replace(/\s+/g, '_'));
  showToast('Report downloaded!', 'success');
});

function resetReportOutput() {
  document.getElementById('report-output-card').style.display = 'none';
  currentReportData = null;
}

// ─── CSV Download ──────────────────────────────────────────────────────────────
function downloadCSV(rows, filename) {
  const csv = rows.map(row =>
    row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')
  ).join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ─── Logout ───────────────────────────────────────────────────────────────────
document.getElementById('logoutBtn').addEventListener('click', () => {
  showConfirm('Logout', 'Are you sure you want to logout?', logout);
});

// ─── Mobile Sidebar ───────────────────────────────────────────────────────────
const sidebarOverlay = document.createElement('div');
sidebarOverlay.className = 'sidebar-overlay';
document.body.appendChild(sidebarOverlay);

document.getElementById('mobileMenuBtn').addEventListener('click', () => {
  document.getElementById('sidebar').classList.add('open');
  sidebarOverlay.classList.add('open');
});
sidebarOverlay.addEventListener('click', closeMobileSidebar);
function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  sidebarOverlay.classList.remove('open');
}

// ─── Batch Management & Bulk Operations ─────────────────────────────────────────

let _allBatches = [];

async function fetchBatches() {
  try {
    const { batches } = await api('GET', '/batches');
    _allBatches = batches;
    return batches;
  } catch (err) {
    console.error(err);
    return [];
  }
}

// 1. Manage Batches Modal
window.openBatchManager = async function () {
  const list = document.getElementById('batches-list');
  list.innerHTML = '<div style="text-align:center;padding:20px;color:var(--text-muted)">Loading batches...</div>';
  openOverlay('batch-manager-modal');

  try {
    const batches = await fetchBatches();
    if (batches.length === 0) {
      list.innerHTML = '<div style="color:var(--text-muted);font-size:14px;padding:10px 0;">No batches created yet. Add one above.</div>';
    } else {
      list.innerHTML = batches.map(b => `
        <li>
          <div style="flex:1">
            <span style="font-weight:500">${escHtml(b.name)}</span>
            <span style="display:block;font-size:12px;color:var(--text-muted)">Created ${new Date(b.created_at).toLocaleDateString()}</span>
          </div>
        </li>
      `).join('');
    }
  } catch (err) {
    list.innerHTML = '<div style="color:red;font-size:14px;">Failed to load batches</div>';
  }
};

window.closeBatchManager = function () {
  closeOverlay('batch-manager-modal');
  document.getElementById('new-batch-name').value = '';
};

window.createNewBatch = async function () {
  const currentViewTemp = currentView; // Preserve state
  const nameInput = document.getElementById('new-batch-name');
  const startInput = document.getElementById('new-batch-start');
  const endInput = document.getElementById('new-batch-end');
  
  const name = nameInput.value.trim();
  const start_date = startInput.value;
  const end_date = endInput.value;

  if (!name) return showToast('Please enter a batch name.', 'error');

  try {
    const { message } = await api('POST', '/batches', { name, start_date, end_date });
    showToast(message, 'success');
    nameInput.value = '';
    startInput.value = '';
    endInput.value = '';
    
    // Refresh modal list and re-populate the openStudentModal select
    await openBatchManager();
    if (currentViewTemp === 'students') renderStudentsTable(); // Soft refresh if wanted
  } catch (err) {
    showToast(err.message, 'error');
  }
};

// 2. Bulk Selection Logic
window.updateBulkActionToolbar = function () {
  const checkboxes = document.querySelectorAll('.student-checkbox:checked');
  const bulkToolbar = document.getElementById('student-bulk-actions');
  const countLabel = document.getElementById('bulk-selection-count');
  
  if (checkboxes.length > 0) {
    bulkToolbar.style.display = 'flex';
    countLabel.textContent = `${checkboxes.length} selected`;
  } else {
    bulkToolbar.style.display = 'none';
  }
  
  // Sync map header checkbox
  const allCheckboxes = document.querySelectorAll('.student-checkbox');
  const masterCheck = document.getElementById('selectAllStudents');
  if (masterCheck) {
    masterCheck.checked = (checkboxes.length === allCheckboxes.length && allCheckboxes.length > 0);
  }
};

document.getElementById('selectAllStudents')?.addEventListener('change', function(e) {
  const checkboxes = document.querySelectorAll('.student-checkbox');
  checkboxes.forEach(cb => cb.checked = e.target.checked);
  updateBulkActionToolbar();
});

// 3. Assign Batch Modal (Bulk Action)
window.openAssignBatchModal = async function () {
  const select = document.getElementById('bulk-batch-select');
  select.innerHTML = '<option value="">Loading...</option>';
  openOverlay('assign-batch-modal');
  
  try {
    const batches = await fetchBatches();
    select.innerHTML = '<option value="">No Batch (Remove Assignment)</option>' +
      batches.map(b => `<option value="${b.id}">${escHtml(b.name)}</option>`).join('');
  } catch (err) {
    showToast('Failed to load batches for assignment.', 'error');
  }
};

window.closeAssignBatchModal = function () {
  closeOverlay('assign-batch-modal');
};

window.submitBatchAssignment = async function () {
  const batch_id = document.getElementById('bulk-batch-select').value;
  const checkboxes = document.querySelectorAll('.student-checkbox:checked');
  const studentIds = Array.from(checkboxes).map(cb => Number(cb.value));
  
  if (studentIds.length === 0) return showToast('No students selected.', 'error');

  try {
    const { message } = await api('PUT', '/students/bulk-batch', { studentIds, batch_id });
    showToast(message, 'success');
    closeAssignBatchModal();
    renderStudentsTable();
    
    // clear master checkbox 
    const masterCheck = document.getElementById('selectAllStudents');
    if (masterCheck) masterCheck.checked = false;
    updateBulkActionToolbar();
  } catch (err) {
    showToast(err.message, 'error');
  }
};


// ─── Attendance Module ────────────────────────────────────────────────────────

window.initAttendanceView = async function () {
  const dateInput = document.getElementById('attendance-date');
  if (!dateInput.value) {
    const today = new Date();
    // Format YYYY-MM-DD
    dateInput.value = today.toISOString().split('T')[0];
  }

  const batchSelect = document.getElementById('attendance-batch-select');
  try {
    const batches = await fetchBatches();
    batchSelect.innerHTML = '<option value="">-- Choose Batch --</option>' +
      batches.map(b => `<option value="${b.id}">${escHtml(b.name)}</option>`).join('');
  } catch (err) {
    console.error('Failed to load batches for attendance', err);
  }
};

window.loadAttendanceList = async function () {
  const batch_id = document.getElementById('attendance-batch-select').value;
  const date = document.getElementById('attendance-date').value;
  const tbody = document.getElementById('attendance-tbody');
  const saveBtn = document.getElementById('saveAttendanceBtn');

  if (!batch_id || !date) {
    tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><p>Select a batch and date to view students</p></div></td></tr>';
    saveBtn.style.display = 'none';
    return;
  }

  tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">Loading students...</td></tr>';

  try {
    const { attendance } = await api('GET', `/attendance?batch_id=${batch_id}&date=${date}`);
    
    if (attendance.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4"><div class="empty-state"><p>No students assigned to this batch.</p></div></td></tr>';
      saveBtn.style.display = 'none';
      return;
    }

    saveBtn.style.display = 'inline-flex';

    tbody.innerHTML = attendance.map((s, i) => {
      const isP = s.status === 'Present';
      const isA = s.status === 'Absent';
      const isL = s.status === 'Late';

      return `
        <tr data-student-id="${s.student_id}">
          <td>${i + 1}</td>
          <td>${escHtml(s.student_name)}</td>
          <td>${escHtml(s.mobile)}</td>
          <td>
            <div class="attendance-radio-group" style="display:flex;gap:15px;align-items:center;">
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                <input type="radio" name="att_${s.student_id}" value="Present" ${isP ? 'checked' : ''} style="margin:0;"> Present
              </label>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                <input type="radio" name="att_${s.student_id}" value="Absent" ${isA ? 'checked' : ''} style="margin:0;"> Absent
              </label>
              <label style="display:flex;align-items:center;gap:4px;cursor:pointer;">
                <input type="radio" name="att_${s.student_id}" value="Late" ${isL ? 'checked' : ''} style="margin:0;"> Late
              </label>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="4" style="color:red;text-align:center;">${escHtml(err.message)}</td></tr>`;
    saveBtn.style.display = 'none';
  }
};

window.submitBatchAttendance = async function () {
  const batch_id = document.getElementById('attendance-batch-select').value;
  const date = document.getElementById('attendance-date').value;
  const saveBtn = document.getElementById('saveAttendanceBtn');

  if (!batch_id || !date) return showToast('Batch and Date are required.', 'error');

  const rows = document.querySelectorAll('#attendance-tbody tr[data-student-id]');
  const records = [];

  rows.forEach(row => {
    const student_id = row.getAttribute('data-student-id');
    const checked = row.querySelector(`input[name="att_${student_id}"]:checked`);
    if (checked) {
      records.push({ student_id: Number(student_id), status: checked.value });
    }
  });

  if (records.length === 0) {
    return showToast('Please mark attendance for at least one student.', 'error');
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Saving...';

  try {
    const { message } = await api('POST', '/attendance', { batch_id, date, records });
    showToast(message, 'success');
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
      Save Attendance
    `;
  }
};

// ─── Bootstrap ────────────────────────────────────────────────────────────────
(async function bootstrap() {
  if (loadSession()) {
    // Verify token is still valid
    try {
      await api('GET', '/auth/me');
      initApp();
    } catch {
      clearSession();
      showPage('login');
    }
  } else {
    showPage('login');
  }
})();
