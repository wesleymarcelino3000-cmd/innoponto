
const state = {
  token: localStorage.getItem('token') || '',
  user: JSON.parse(localStorage.getItem('user') || 'null'),
  settings: null
};

function setAuth(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('token', token);
  localStorage.setItem('user', JSON.stringify(user));
}

function clearAuth() {
  state.token = '';
  state.user = null;
  localStorage.removeItem('token');
  localStorage.removeItem('user');
}

function authHeaders() {
  return state.token ? { Authorization: `Bearer ${state.token}` } : {};
}

async function api(url, options = {}) {
  const resp = await fetch(url, {
    headers: { 'Content-Type': 'application/json', ...authHeaders(), ...(options.headers || {}) },
    ...options
  });
  const contentType = resp.headers.get('content-type') || '';
  if (!resp.ok) {
    const payload = contentType.includes('application/json') ? await resp.json() : { error: 'Erro' };
    throw new Error(payload.error || 'Erro');
  }
  return contentType.includes('application/json') ? resp.json() : resp;
}

function msg(elId, text, cls='') {
  const el = document.getElementById(elId);
  if (!el) return;
  el.className = 'notice ' + cls;
  el.textContent = text;
}

function fmtDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR');
}

function toHM(hours) {
  const totalMin = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
}

function calcDistanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (v) => (v * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function premiumSuccess(title, text) {
  const old = document.querySelector('.ponto-overlay');
  if (old) old.remove();
  const overlay = document.createElement('div');
  overlay.className = 'ponto-overlay';
  overlay.innerHTML = `
    <div class="ponto-modal">
      <div class="ponto-check-wrap"><div class="ponto-check">✔</div></div>
      <h3>${title}</h3>
      <p>${text}</p>
    </div>
  `;
  document.body.appendChild(overlay);
  if (navigator.vibrate) navigator.vibrate([120, 60, 120]);
  setTimeout(() => overlay.remove(), 2200);
}

async function login() {
  try {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const data = await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({ username, password })
    });
    setAuth(data.token, data.user);
    location.href = data.user.role === 'admin' ? '/admin.html' : '/painel.html';
  } catch (e) {
    msg('loginMsg', e.message, 'danger');
  }
}

function logout() {
  clearAuth();
  location.href = '/';
}

async function loadMe() {
  const data = await api('/api/me');
  state.settings = data.settings;
  return data;
}

function ensureAuth() {
  if (!state.token || !state.user) {
    location.href = '/';
    throw new Error('Sem sessão');
  }
}

function ensureAdmin() {
  ensureAuth();
  if (state.user.role !== 'admin') {
    location.href = '/painel.html';
    throw new Error('Sem acesso');
  }
}

async function registerPoint(type) {
  ensureAuth();
  const obs = document.getElementById('obs')?.value || '';
  navigator.geolocation.getCurrentPosition(async (pos) => {
    try {
      const payload = {
        type,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        observation: obs
      };
      const data = await api('/api/records', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      msg('statusMsg', `Ponto registrado. Distância: ${data.distance_m}m.`, 'success');
      premiumSuccess(type, 'Ponto registrado com sucesso.');
      if (document.getElementById('obs')) document.getElementById('obs').value = '';
      await loadMyRecords();
      await loadTodaySummary();
      await checkArea();
    } catch (e) {
      msg('statusMsg', e.message, 'danger');
    }
  }, () => {
    msg('statusMsg', 'Permita a localização para registrar o ponto.', 'warning');
  });
}

async function loadMyRecords() {
  ensureAuth();
  const rows = await api('/api/records/my');
  const tbody = document.getElementById('myRecords');
  if (!tbody) return;

  tbody.innerHTML = rows.length ? rows.map(r => `
    <tr>
      <td>${fmtDateTime(r.timestamp)}</td>
      <td>${r.type}</td>
      <td>${r.observation || '-'}</td>
      <td>${r.latitude ?? '-'}</td>
      <td>${r.longitude ?? '-'}</td>
      <td>${Math.round(r.distance_m || 0)}m</td>
    </tr>
  `).join('') : '<tr><td colspan="6">Nenhum registro.</td></tr>';
}

async function loadTodaySummary() {
  ensureAuth();
  const rows = await api('/api/records/my');
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = rows.filter(r => String(r.timestamp).startsWith(today)).reverse();
  const entrada = todayRows.find(r => r.type === 'Entrada');
  const saida = [...todayRows].reverse().find(r => r.type === 'Saída');
  const saidaAlmoco = todayRows.find(r => r.type === 'Saída Almoço');
  const voltaAlmoco = todayRows.find(r => r.type === 'Volta Almoço');

  let worked = 0;
  if (entrada && saida) worked = (new Date(saida.timestamp) - new Date(entrada.timestamp)) / 3600000;
  if (saidaAlmoco && voltaAlmoco) worked -= (new Date(voltaAlmoco.timestamp) - new Date(saidaAlmoco.timestamp)) / 3600000;
  worked = Math.max(0, worked);

  const jornada = Number(state.settings?.jornada_hours || 8);
  const extras = Math.max(0, worked - jornada);
  const faltantes = Math.max(0, jornada - worked);

  const workedEl = document.getElementById('workedHours');
  if (workedEl) workedEl.textContent = toHM(worked);
  const extraEl = document.getElementById('extraHours');
  if (extraEl) extraEl.textContent = toHM(extras);
  const missEl = document.getElementById('missingHours');
  if (missEl) missEl.textContent = toHM(faltantes);
}

async function checkArea() {
  ensureAuth();
  if (!document.getElementById('areaStatus')) return;

  navigator.geolocation.getCurrentPosition((pos) => {
    const dist = calcDistanceMeters(
      pos.coords.latitude,
      pos.coords.longitude,
      Number(state.settings.company_lat),
      Number(state.settings.company_lng)
    );
    const pill = document.getElementById('areaStatus');
    const txt = document.getElementById('areaText');
    if (dist <= Number(state.settings.radius_m)) {
      pill.className = 'status-pill ok';
      pill.textContent = 'Dentro da área permitida';
    } else {
      pill.className = 'status-pill no';
      pill.textContent = 'Fora da área permitida';
    }
    txt.textContent = `Distância atual: ${Math.round(dist)}m | Limite: ${state.settings.radius_m}m`;
  }, () => {
    const pill = document.getElementById('areaStatus');
    const txt = document.getElementById('areaText');
    pill.className = 'status-pill wait';
    pill.textContent = 'Localização indisponível';
    txt.textContent = 'Permita a localização para verificar a área.';
  });
}

async function loadDashboard() {
  ensureAdmin();
  const data = await api('/api/dashboard');
  document.getElementById('kpiUsers').textContent = data.users;
  document.getElementById('kpiRecords').textContent = data.records;
  document.getElementById('kpiClosings').textContent = data.closings;
}

async function loadUsers() {
  ensureAdmin();
  const users = await api('/api/users');
  const tbody = document.getElementById('usersTable');
  if (!tbody) return;
  tbody.innerHTML = users.map(u => `
    <tr>
      <td><input id="u_name_${u.id}" value="${u.username}"></td>
      <td><input id="u_pass_${u.id}" placeholder="Nova senha (opcional)"></td>
      <td>
        <select id="u_role_${u.id}">
          <option value="employee" ${u.role === 'employee' ? 'selected' : ''}>Funcionário</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
      <td>
        <select id="u_active_${u.id}">
          <option value="1" ${u.active ? 'selected' : ''}>Ativo</option>
          <option value="0" ${!u.active ? 'selected' : ''}>Inativo</option>
        </select>
      </td>
      <td>
        <div class="toolbar">
          <button onclick="saveUser(${u.id})" style="width:auto">Salvar</button>
          <button class="danger" onclick="deleteUser(${u.id})" style="width:auto">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('');
}

async function createUser() {
  ensureAdmin();
  try {
    const username = document.getElementById('newUsername').value.trim();
    const password = document.getElementById('newPassword').value.trim();
    const role = document.getElementById('newRole').value;
    await api('/api/users', {
      method: 'POST',
      body: JSON.stringify({ username, password, role })
    });
    msg('userMsg', 'Usuário criado com sucesso.', 'success');
    document.getElementById('newUsername').value = '';
    document.getElementById('newPassword').value = '';
    await loadUsers();
    await loadDashboard();
  } catch (e) {
    msg('userMsg', e.message, 'danger');
  }
}

async function saveUser(id) {
  ensureAdmin();
  try {
    const username = document.getElementById(`u_name_${id}`).value.trim();
    const password = document.getElementById(`u_pass_${id}`).value.trim();
    const role = document.getElementById(`u_role_${id}`).value;
    const active = document.getElementById(`u_active_${id}`).value === '1';
    await api(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ username, password, role, active })
    });
    msg('userMsg', 'Usuário atualizado com sucesso.', 'success');
    await loadUsers();
  } catch (e) {
    msg('userMsg', e.message, 'danger');
  }
}

async function deleteUser(id) {
  ensureAdmin();
  if (!confirm('Deseja realmente excluir este usuário?')) return;
  try {
    await api(`/api/users/${id}`, { method: 'DELETE' });
    msg('userMsg', 'Usuário excluído com sucesso.', 'success');
    await loadUsers();
    await loadDashboard();
  } catch (e) {
    msg('userMsg', e.message, 'danger');
  }
}

async function saveSettings() {
  ensureAdmin();
  try {
    const company_name = document.getElementById('companyName').value.trim();
    const company_lat = Number(document.getElementById('companyLat').value);
    const company_lng = Number(document.getElementById('companyLng').value);
    const radius_m = Number(document.getElementById('radiusM').value);
    const jornada_hours = Number(document.getElementById('jornadaHours').value);
    const tolerancia_min = Number(document.getElementById('toleranciaMin').value);
    await api('/api/settings', {
      method: 'PUT',
      body: JSON.stringify({ company_name, company_lat, company_lng, radius_m, jornada_hours, tolerancia_min })
    });
    msg('settingsMsg', 'Configurações salvas com sucesso.', 'success');
    state.settings = await api('/api/settings');
  } catch (e) {
    msg('settingsMsg', e.message, 'danger');
  }
}

async function closeMonth() {
  ensureAdmin();
  try {
    const month_ref = document.getElementById('closeMonth').value;
    await api('/api/closings', {
      method: 'POST',
      body: JSON.stringify({ month_ref })
    });
    msg('closingMsg', 'Mês fechado com sucesso.', 'success');
    await loadDashboard();
  } catch (e) {
    msg('closingMsg', e.message, 'danger');
  }
}

function exportExcel() {
  ensureAdmin();
  window.location.href = '/api/export.xlsx';
}

window.login = login;
window.logout = logout;
window.registerPoint = registerPoint;
window.createUser = createUser;
window.saveUser = saveUser;
window.deleteUser = deleteUser;
window.saveSettings = saveSettings;
window.closeMonth = closeMonth;
window.exportExcel = exportExcel;

window.addEventListener('DOMContentLoaded', async () => {
  const path = location.pathname;

  if (path === '/' || path.endsWith('/index.html')) return;

  try {
    ensureAuth();
    await loadMe();

    const userName = document.getElementById('currentUser');
    if (userName) userName.textContent = state.user.username;

    const role = document.getElementById('currentRole');
    if (role) role.textContent = state.user.role === 'admin' ? 'admin' : 'funcionário';

    if (path.endsWith('/painel.html')) {
      await loadMyRecords();
      await loadTodaySummary();
      await checkArea();
      setInterval(checkArea, 15000);
    }

    if (path.endsWith('/admin.html')) {
      ensureAdmin();
      document.getElementById('companyName').value = state.settings.company_name;
      document.getElementById('companyLat').value = state.settings.company_lat;
      document.getElementById('companyLng').value = state.settings.company_lng;
      document.getElementById('radiusM').value = state.settings.radius_m;
      document.getElementById('jornadaHours').value = state.settings.jornada_hours;
      document.getElementById('toleranciaMin').value = state.settings.tolerancia_min;
      await loadDashboard();
      await loadUsers();
    }
  } catch {}
});
