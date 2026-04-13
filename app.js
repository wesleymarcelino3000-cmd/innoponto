
import { SUPABASE_URL, SUPABASE_KEY, LOCAL_EMPRESA, LIMITE_METROS, TIMEZONE } from './config.js'
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function showMsg(id, text, hidden=false, kind=''){
  const el = document.getElementById(id)
  if(!el) return
  el.textContent = text
  el.className = 'notice' + (kind ? ' ' + kind : '')
  el.classList.toggle('hidden', hidden)
}
function getUser(){ try { return JSON.parse(localStorage.getItem('ponto_user') || 'null') } catch { return null } }
function setUser(u){ localStorage.setItem('ponto_user', JSON.stringify(u)) }
function logout(){ localStorage.removeItem('ponto_user'); location.href='index.html' }
window.logout = logout
function requireLogin(){ const u = getUser(); if(!u) location.href='index.html'; return u }
function requireAdmin(){ const u = requireLogin(); if(u?.role !== 'admin') location.href='painel.html'; return u }
window.irAdmin = function(){ const u=getUser(); if(u?.role==='admin') location.href='admin.html'; else alert('Somente admin pode acessar.') }
window.voltarPainel = function(){ location.href='painel.html' }

function formatDateTime(iso){ return new Date(iso).toLocaleString('pt-BR', { timeZone: TIMEZONE }) }
function formatDateBR(iso){ return new Date(iso).toLocaleDateString('pt-BR', { timeZone: TIMEZONE }) }
function formatTimeBR(iso){ return new Date(iso).toLocaleTimeString('pt-BR', { timeZone: TIMEZONE }) }
function horasToHM(hours){
  if(hours == null || isNaN(hours)) return '-'
  const totalMin = Math.round(hours * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}
function calcularDistancia(lat1, lon1, lat2, lon2){
  const R = 6371000
  const toRad = v => v * Math.PI / 180
  const dLat = toRad(lat2 - lat1)
  const dLon = toRad(lon2 - lon1)
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a))
  return R * c
}
function animacaoPremiumPonto(tipo='Ponto', texto='Registrado com sucesso'){
  const old = document.querySelector('.ponto-overlay')
  if(old) old.remove()
  const overlay = document.createElement('div')
  overlay.className = 'ponto-overlay'
  overlay.innerHTML = `<div class="ponto-modal"><div class="ponto-check-wrap"><div class="ponto-check">✔</div></div><h3>${tipo}</h3><p>${texto}</p></div>`
  document.body.appendChild(overlay)
  if(navigator.vibrate) navigator.vibrate([120,60,120])
  setTimeout(()=>overlay.remove(),2200)
}
function startBrasiliaClock(){
  const el = document.getElementById('clockBrasilia')
  if(!el) return
  const render = () => {
    const txt = new Intl.DateTimeFormat('pt-BR', {
      timeZone: TIMEZONE,
      year:'numeric', month:'2-digit', day:'2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).format(new Date())
    el.textContent = `Brasília ${txt}`
  }
  render()
  setInterval(render, 1000)
}
function brasiliaNowISO(){
  const now = new Date()
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year:'numeric', month:'2-digit', day:'2-digit',
    hour:'2-digit', minute:'2-digit', second:'2-digit',
    hour12:false
  }).formatToParts(now)
  const map = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value
  return `${map.year}-${map.month}-${map.day}T${map.hour}:${map.minute}:${map.second}-03:00`
}
function brasiliaTodayKey(){
  const parts = new Intl.DateTimeFormat('sv-SE', {
    timeZone: TIMEZONE,
    year:'numeric', month:'2-digit', day:'2-digit'
  }).formatToParts(new Date())
  const map = {}
  for (const p of parts) if (p.type !== 'literal') map[p.type] = p.value
  return `${map.year}-${map.month}-${map.day}`
}
function atualizarStatusArea(distancia){
  const pill = document.getElementById('areaPill')
  const info = document.getElementById('distanciaInfo')
  if(!pill || !info) return
  if(distancia == null){
    pill.className = 'status-pill wait'
    pill.textContent = 'Verificando localização...'
    info.textContent = ''
    return
  }
  if(distancia <= LIMITE_METROS){ pill.className = 'status-pill ok'; pill.textContent = 'Dentro da área permitida' }
  else { pill.className = 'status-pill no'; pill.textContent = 'Fora da área permitida' }
  info.textContent = `Distância atual: ${Math.round(distancia)} metros | Limite: ${LIMITE_METROS}m`
}

window.login = async function(){
  const usuario = document.getElementById('user').value.trim()
  const senha = document.getElementById('pass').value.trim()
  const { data, error } = await supabase.from('usuarios').select('*').eq('usuario', usuario).eq('senha', senha).maybeSingle()
  if(error || !data){ showMsg('msg','Usuário ou senha inválidos.', false, 'danger'); return }
  setUser(data)
  location.href = 'painel.html'
}

window.registrarPonto = async function(tipo){
  const user = requireLogin()
  const obs = (document.getElementById('obs')?.value || '').trim()
  const hojeMes = brasiliaTodayKey().slice(0,7)
  const fechamento = await supabase.from('fechamentos').select('*').eq('mes_ref', hojeMes).maybeSingle()
  if(fechamento.data){ showMsg('status', 'Este mês está fechado e não aceita novos registros.', false, 'danger'); return }

  navigator.geolocation.getCurrentPosition(async pos=>{
    const latUser = pos.coords.latitude
    const lngUser = pos.coords.longitude
    const distancia = calcularDistancia(latUser, lngUser, LOCAL_EMPRESA.lat, LOCAL_EMPRESA.lng)
    atualizarStatusArea(distancia)
    if(distancia > LIMITE_METROS){
      showMsg('status', `Fora da área permitida. Distância atual: ${Math.round(distancia)} metros.`, false, 'danger')
      return
    }
    const payload = {
      usuario: user.usuario,
      tipo,
      data: brasiliaNowISO(),
      latitude: String(latUser),
      longitude: String(lngUser),
      observacao: obs
    }
    const { error } = await supabase.from('registros').insert(payload)
    if(error){ showMsg('status','Erro ao registrar ponto.', false, 'danger'); return }
    const obsEl = document.getElementById('obs'); if(obsEl) obsEl.value = ''
    showMsg('status', `Ponto registrado com horário de Brasília. Distância: ${Math.round(distancia)}m.`, false, 'success')
    animacaoPremiumPonto(tipo, `${tipo} registrada com sucesso.`)
    await carregarRegistrosDoDia()
    await carregarResumoHoje()
  }, ()=> showMsg('status','Permita a localização para registrar o ponto.', false, 'warning'))
}

async function verificarAreaAtual(){
  const pill = document.getElementById('areaPill')
  if(!pill) return
  atualizarStatusArea(null)
  navigator.geolocation.getCurrentPosition(pos=>{
    const distancia = calcularDistancia(pos.coords.latitude, pos.coords.longitude, LOCAL_EMPRESA.lat, LOCAL_EMPRESA.lng)
    atualizarStatusArea(distancia)
  }, ()=>{
    pill.className = 'status-pill no'
    pill.textContent = 'Localização indisponível'
    const info = document.getElementById('distanciaInfo')
    if(info) info.textContent = 'Permita a localização para verificar a área.'
  })
}

async function buscarMeusRegistrosHoje(){
  const user = requireLogin()
  const hoje = brasiliaTodayKey()
  const { data } = await supabase.from('registros').select('*').eq('usuario', user.usuario).order('data', { ascending: true })
  return (data || []).filter(r => String(r.data).slice(0,10) === hoje)
}
function calcularResumoDia(regs, jornadaHoras=8){
  const entrada = regs.find(r => r.tipo === 'Entrada')
  const saida = [...regs].reverse().find(r => r.tipo === 'Saída')
  const saidaAlmoco = regs.find(r => r.tipo === 'Saída Almoço')
  const voltaAlmoco = regs.find(r => r.tipo === 'Volta Almoço')
  let totalMs = 0
  if(entrada && saida) totalMs = new Date(saida.data) - new Date(entrada.data)
  if(saidaAlmoco && voltaAlmoco) totalMs -= (new Date(voltaAlmoco.data) - new Date(saidaAlmoco.data))
  const workedHours = Math.max(0, totalMs / 1000 / 60 / 60)
  const extras = Math.max(0, workedHours - jornadaHoras)
  const faltantes = Math.max(0, jornadaHoras - workedHours)
  return { workedHours, extras, faltantes }
}
async function carregarResumoHoje(){
  const horasEl = document.getElementById('horasHoje')
  if(!horasEl) return
  const { data: cfg } = await supabase.from('configuracoes').select('*').limit(1).maybeSingle()
  const jornada = Number(cfg?.jornada_horas || 8)
  const regs = await buscarMeusRegistrosHoje()
  const resumo = calcularResumoDia(regs, jornada)
  document.getElementById('horasHoje').textContent = horasToHM(resumo.workedHours)
  document.getElementById('extrasHoje').textContent = horasToHM(resumo.extras)
  document.getElementById('faltantesHoje').textContent = horasToHM(resumo.faltantes)
}
async function carregarRegistrosDoDia(){
  const tbody = document.getElementById('tabelaRegistros')
  if(!tbody) return
  const regs = await buscarMeusRegistrosHoje()
  tbody.innerHTML = regs.length ? regs.sort((a,b)=>new Date(b.data)-new Date(a.data)).map(r => `<tr><td>${formatDateTime(r.data)}</td><td>${r.tipo}</td><td>${r.observacao || '-'}</td><td>${r.latitude || '-'}</td><td>${r.longitude || '-'}</td></tr>`).join('') : '<tr><td colspan="5">Nenhum ponto registrado hoje.</td></tr>'
}

window.salvarConfiguracoes = async function(){
  requireAdmin()
  const jornada = Number(document.getElementById('jornadaHoras').value || 8)
  const tolerancia = Number(document.getElementById('toleranciaMin').value || 10)
  const { data: existing } = await supabase.from('configuracoes').select('*').limit(1).maybeSingle()
  let result
  if(existing){ result = await supabase.from('configuracoes').update({ jornada_horas: jornada, tolerancia_min: tolerancia }).eq('id', existing.id) }
  else { result = await supabase.from('configuracoes').insert({ jornada_horas: jornada, tolerancia_min: tolerancia }) }
  showMsg('cfgMsg', result.error ? 'Erro ao salvar configurações.' : 'Configurações salvas.', false, result.error ? 'danger' : 'success')
}
window.fecharMes = async function(){
  const user = requireAdmin()
  const mes = document.getElementById('mesFechamento').value
  if(!mes){ showMsg('fechMsg','Selecione um mês.', false, 'warning'); return }
  const { error } = await supabase.from('fechamentos').insert({ mes_ref: mes, fechado_por: user.usuario, fechado_em: brasiliaNowISO() })
  showMsg('fechMsg', error ? 'Erro ao fechar mês. Talvez ele já esteja fechado.' : 'Mês fechado com sucesso.', false, error ? 'danger' : 'success')
  await carregarResumoGeral()
}
window.carregarResumoGeral = async function(){
  requireAdmin()
  const [{ data: registros }, { data: usuarios }, { data: fechamentos }] = await Promise.all([
    supabase.from('registros').select('*'),
    supabase.from('usuarios').select('*'),
    supabase.from('fechamentos').select('*')
  ])
  const set = (id, value) => { const el = document.getElementById(id); if(el) el.textContent = value }
  set('kpiRegistros', (registros || []).length)
  set('kpiUsuarios', (usuarios || []).length)
  set('kpiFechados', (fechamentos || []).length)
}
function gerarIdFuncionario(){ return 'FUNC-' + Date.now().toString().slice(-6) + Math.floor(Math.random()*90 + 10) }

window.criarUsuario = async function(){
  requireAdmin()
  const usuario = document.getElementById('novoUsuario').value.trim()
  const senha = document.getElementById('novaSenha').value.trim()
  const role = document.getElementById('novoPerfil').value
  if(!usuario || !senha){ showMsg('userMsg','Preencha usuário e senha.', false, 'warning'); return }
  const funcionario_id = gerarIdFuncionario()
  const { error } = await supabase.from('usuarios').insert({ usuario, senha, role, funcionario_id })
  showMsg('userMsg', error ? 'Erro ao criar usuário. Verifique se ele já existe.' : `Usuário criado com sucesso. ID gerado: ${funcionario_id}`, false, error ? 'danger' : 'success')
  if(!error){
    document.getElementById('novoUsuario').value=''
    document.getElementById('novaSenha').value=''
    document.getElementById('novoPerfil').value='funcionario'
    await carregarUsuarios()
    await carregarResumoGeral()
  }
}
window.carregarUsuarios = async function(){
  requireAdmin()
  const tbody = document.getElementById('tabelaUsuarios')
  if(!tbody) return
  const { data } = await supabase.from('usuarios').select('*').order('usuario', { ascending: true })
  const users = data || []
  tbody.innerHTML = users.length ? users.map(u => `
    <tr>
      <td>${u.funcionario_id || '-'}</td>
      <td><input id="usuario_${u.id}" value="${u.usuario ?? ''}"></td>
      <td><input id="senha_${u.id}" value="${u.senha ?? ''}"></td>
      <td><select id="role_${u.id}"><option value="funcionario" ${u.role === 'funcionario' ? 'selected' : ''}>Funcionário</option><option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option></select></td>
      <td><div class="toolbar"><button onclick="salvarUsuario('${u.id}')" style="width:auto">Salvar</button><button class="danger" onclick="excluirUsuario('${u.id}')" style="width:auto">Excluir</button></div></td>
    </tr>`).join('') : '<tr><td colspan="5">Nenhum usuário.</td></tr>'
}
window.salvarUsuario = async function(id){
  requireAdmin()
  const usuario = document.getElementById(`usuario_${id}`).value.trim()
  const senha = document.getElementById(`senha_${id}`).value.trim()
  const role = document.getElementById(`role_${id}`).value
  if(!usuario || !senha){ showMsg('userMsg','Usuário e senha são obrigatórios.', false, 'warning'); return }
  const { error } = await supabase.from('usuarios').update({ usuario, senha, role }).eq('id', id)
  showMsg('userMsg', error ? 'Erro ao salvar usuário.' : 'Usuário atualizado com sucesso.', false, error ? 'danger' : 'success')
  if(!error){
    const atual = getUser()
    const { data: updated } = await supabase.from('usuarios').select('*').eq('id', id).maybeSingle()
    if(atual && updated && atual.id === updated.id) setUser(updated)
    await carregarUsuarios()
    await carregarResumoGeral()
  }
}
window.excluirUsuario = async function(id){
  const atual = requireAdmin()
  if(!confirm('Deseja realmente excluir este usuário?')) return
  const { data: target } = await supabase.from('usuarios').select('*').eq('id', id).maybeSingle()
  if(target && target.id === atual.id){ showMsg('userMsg', 'Você não pode excluir o próprio usuário logado.', false, 'warning'); return }
  const { error } = await supabase.from('usuarios').delete().eq('id', id)
  showMsg('userMsg', error ? 'Erro ao excluir usuário.' : 'Usuário excluído com sucesso.', false, error ? 'danger' : 'success')
  if(!error){ await carregarUsuarios(); await carregarResumoGeral() }
}
window.carregarRegistrosAdmin = async function(){
  requireAdmin()
  const tbody = document.getElementById('tabelaRegistrosAdmin')
  if(!tbody) return
  const { data } = await supabase.from('registros').select('*').order('data', { ascending: false }).limit(120)
  const regs = data || []
  tbody.innerHTML = regs.length ? regs.map(r => `<tr><td><input id="r_usuario_${r.id}" value="${r.usuario ?? ''}"></td><td><input id="r_data_${r.id}" value="${r.data ?? ''}"></td><td>
<select id="r_tipo_${r.id}">
  <option value="Entrada" ${r.tipo === 'Entrada' ? 'selected' : ''}>Entrada</option>
  <option value="Saída Almoço" ${r.tipo === 'Saída Almoço' ? 'selected' : ''}>Saída Almoço</option>
  <option value="Volta Almoço" ${r.tipo === 'Volta Almoço' ? 'selected' : ''}>Volta Almoço</option>
  <option value="Saída" ${r.tipo === 'Saída' ? 'selected' : ''}>Saída</option>
</select>
</td><td><input id="r_obs_${r.id}" value="${r.observacao ?? ''}"></td><td><div class="toolbar"><button onclick="salvarRegistro('${r.id}')" style="width:auto">Salvar</button><button class="danger" onclick="excluirRegistro('${r.id}')" style="width:auto">Excluir</button></div></td></tr>`).join('') : '<tr><td colspan="5">Nenhum registro.</td></tr>'
}
window.salvarRegistro = async function(id){
  requireAdmin()
  const usuario = document.getElementById(`r_usuario_${id}`).value.trim()
  const data = document.getElementById(`r_data_${id}`).value.trim()
  const tipo = document.getElementById(`r_tipo_${id}`).value.trim()
  const observacao = document.getElementById(`r_obs_${id}`).value.trim()
  if(!usuario || !data || !tipo){ showMsg('recordMsg','Usuário, data e tipo são obrigatórios.', false, 'warning'); return }
  const { error } = await supabase.from('registros').update({ usuario, data, tipo, observacao }).eq('id', id)
  showMsg('recordMsg', error ? 'Erro ao salvar ponto.' : 'Ponto atualizado com sucesso.', false, error ? 'danger' : 'success')
  if(!error) await carregarRegistrosAdmin()
}
window.excluirRegistro = async function(id){
  requireAdmin()
  if(!confirm('Deseja realmente excluir este ponto?')) return
  const { error } = await supabase.from('registros').delete().eq('id', id)
  showMsg('recordMsg', error ? 'Erro ao excluir ponto.' : 'Ponto excluído com sucesso.', false, error ? 'danger' : 'success')
  if(!error) await carregarRegistrosAdmin()
}

function buildWorkbookFromRows(rows){
  const abaRegistros = rows.map(r => ({
    'Usuário': r.usuario,
    'Tipo': r.tipo,
    'Data': formatDateBR(r.data),
    'Hora': formatTimeBR(r.data),
    'Latitude': r.latitude || '',
    'Longitude': r.longitude || '',
    'Observação': r.observacao || ''
  }))
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.json_to_sheet(abaRegistros)
  ws['!autofilter'] = { ref: 'A1:G1' }
  ws['!cols'] = [{wch:18},{wch:18},{wch:12},{wch:12},{wch:14},{wch:14},{wch:28}]
  XLSX.utils.book_append_sheet(wb, ws, 'Registros')
  return wb
}

window.exportarExcelDia = async function(){
  const user = requireLogin()
  if(user.role !== 'admin') return
  const rows = await buscarMeusRegistrosHoje()
  const wb = buildWorkbookFromRows(rows)
  XLSX.writeFile(wb, `Pontos_Dia_${brasiliaTodayKey()}.xlsx`)
}
window.exportarExcel = async function(){
  requireAdmin()
  const { data: registros } = await supabase.from('registros').select('*').order('data', { ascending: true })
  const rows = registros || []
  const abaRegistros = rows.map(r => ({
    'Usuário': r.usuario,
    'Tipo': r.tipo,
    'Data': formatDateBR(r.data),
    'Hora': formatTimeBR(r.data),
    'Latitude': r.latitude || '',
    'Longitude': r.longitude || '',
    'Observação': r.observacao || ''
  }))
  const agrupado = {}
  for (const r of rows) {
    const dataBr = formatDateBR(r.data)
    const chave = `${r.usuario}__${dataBr}`
    if (!agrupado[chave]) agrupado[chave] = { usuario: r.usuario, data: dataBr, entrada:'', saidaAlmoco:'', voltaAlmoco:'', saida:'', entradaISO:null, saidaAlmocoISO:null, voltaAlmocoISO:null, saidaISO:null }
    const hora = formatTimeBR(r.data)
    if (r.tipo === 'Entrada' && !agrupado[chave].entrada) { agrupado[chave].entrada = hora; agrupado[chave].entradaISO = r.data }
    if (r.tipo === 'Saída Almoço' && !agrupado[chave].saidaAlmoco) { agrupado[chave].saidaAlmoco = hora; agrupado[chave].saidaAlmocoISO = r.data }
    if (r.tipo === 'Volta Almoço' && !agrupado[chave].voltaAlmoco) { agrupado[chave].voltaAlmoco = hora; agrupado[chave].voltaAlmocoISO = r.data }
    if (r.tipo === 'Saída') { agrupado[chave].saida = hora; agrupado[chave].saidaISO = r.data }
  }
  const { data: cfg } = await supabase.from('configuracoes').select('*').limit(1).maybeSingle()
  const jornadaPadrao = Number(cfg?.jornada_horas || 8)
  const resumoDiario = Object.values(agrupado).map(item => {
    let workedHours = 0
    if(item.entradaISO && item.saidaISO) workedHours = (new Date(item.saidaISO) - new Date(item.entradaISO)) / 1000 / 60 / 60
    if(item.saidaAlmocoISO && item.voltaAlmocoISO) workedHours -= (new Date(item.voltaAlmocoISO) - new Date(item.saidaAlmocoISO)) / 1000 / 60 / 60
    workedHours = Math.max(0, workedHours)
    const extras = Math.max(0, workedHours - jornadaPadrao)
    const faltantes = Math.max(0, jornadaPadrao - workedHours)
    return { 'Usuário': item.usuario, 'Data': item.data, 'Primeira Entrada': item.entrada, 'Saída Almoço': item.saidaAlmoco, 'Volta Almoço': item.voltaAlmoco, 'Saída Final': item.saida, 'Horas Trabalhadas': horasToHM(workedHours), 'Horas Extras': horasToHM(extras), 'Horas Faltantes': horasToHM(faltantes) }
  })
  const mensalMap = {}
  for (const linha of resumoDiario) {
    const [dia, mes, ano] = linha['Data'].split('/')
    const chave = `${linha['Usuário']}__${mes}/${ano}`
    if (!mensalMap[chave]) mensalMap[chave] = { usuario: linha['Usuário'], mes: `${mes}/${ano}`, dias: 0, worked: 0, extras: 0, faltantes: 0 }
    const parseHM = (txt) => { const [h,m] = (txt || '00:00').split(':').map(Number); return (h||0) + ((m||0)/60) }
    mensalMap[chave].dias += 1
    mensalMap[chave].worked += parseHM(linha['Horas Trabalhadas'])
    mensalMap[chave].extras += parseHM(linha['Horas Extras'])
    mensalMap[chave].faltantes += parseHM(linha['Horas Faltantes'])
  }
  const resumoMensal = Object.values(mensalMap).map(item => ({ 'Usuário': item.usuario, 'Mês': item.mes, 'Dias Trabalhados': item.dias, 'Total Horas': horasToHM(item.worked), 'Total Extras': horasToHM(item.extras), 'Total Faltantes': horasToHM(item.faltantes) }))
  const wb = XLSX.utils.book_new(), ws1 = XLSX.utils.json_to_sheet(abaRegistros), ws2 = XLSX.utils.json_to_sheet(resumoDiario), ws3 = XLSX.utils.json_to_sheet(resumoMensal)
  ws1['!autofilter'] = { ref: 'A1:G1' }; ws2['!autofilter'] = { ref: 'A1:I1' }; ws3['!autofilter'] = { ref: 'A1:F1' }
  ws1['!cols'] = [{wch:18},{wch:18},{wch:12},{wch:12},{wch:14},{wch:14},{wch:28}]
  ws2['!cols'] = [{wch:18},{wch:12},{wch:16},{wch:16},{wch:16},{wch:14},{wch:18},{wch:16},{wch:18}]
  ws3['!cols'] = [{wch:18},{wch:10},{wch:18},{wch:14},{wch:14},{wch:16}]
  XLSX.utils.book_append_sheet(wb, ws1, 'Registros')
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumo Diário')
  XLSX.utils.book_append_sheet(wb, ws3, 'Resumo Mensal')
  XLSX.writeFile(wb, `Ponto_InnoLife_${brasiliaTodayKey().slice(5,7)}_${brasiliaTodayKey().slice(0,4)}.xlsx`)
}

async function boot(){
  const path = location.pathname.split('/').pop()
  if(path === 'painel.html'){
    const user = requireLogin()
    document.getElementById('usuarioAtual').textContent = user.usuario
    document.getElementById('perfilAtual').textContent = user.role
    document.getElementById('idAtual').textContent = user.funcionario_id || '-'

    const adminBtn = document.querySelector('button[onclick="irAdmin()"]')
    if(user.role !== 'admin' && adminBtn){
      adminBtn.style.display = 'none'
    }

    if(user.role === 'admin'){
      document.getElementById('btnExportarDia').classList.remove('hidden')
    }

    startBrasiliaClock()
    await carregarRegistrosDoDia()
    await carregarResumoHoje()
    await verificarAreaAtual()
    setInterval(verificarAreaAtual, 15000)
  }
  if(path === 'admin.html'){
    requireAdmin()
    const { data: cfg } = await supabase.from('configuracoes').select('*').limit(1).maybeSingle()
    document.getElementById('jornadaHoras').value = cfg?.jornada_horas ?? 8
    document.getElementById('toleranciaMin').value = cfg?.tolerancia_min ?? 10
    await carregarResumoGeral()
    await carregarUsuarios()
    await carregarRegistrosAdmin()
  }
}
boot()
