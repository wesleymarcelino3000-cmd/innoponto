
import { SUPABASE_URL, SUPABASE_KEY } from './config.js'
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm'

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

function showMsg(id, text, hidden=false){
  const el = document.getElementById(id)
  if(!el) return
  el.textContent = text
  el.classList.toggle('hidden', hidden)
}

function getUser(){
  try { return JSON.parse(localStorage.getItem('ponto_user') || 'null') } catch { return null }
}

function requireLogin(){
  const u = getUser()
  if(!u) location.href = 'index.html'
  return u
}

function requireAdmin(){
  const u = requireLogin()
  if(u?.role !== 'admin') location.href = 'painel.html'
  return u
}

function formatDateTime(iso){ return new Date(iso).toLocaleString('pt-BR') }
function formatDateBR(iso){ return new Date(iso).toLocaleDateString('pt-BR') }
function formatTimeBR(iso){ return new Date(iso).toLocaleTimeString('pt-BR') }

function horasToHM(hours){
  if(hours == null || isNaN(hours)) return '-'
  const totalMin = Math.round(hours * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`
}

function animacaoPremiumPonto(tipo = "Ponto", texto = "Registrado com sucesso"){
  const existente = document.querySelector('.ponto-overlay')
  if(existente) existente.remove()
  const overlay = document.createElement('div')
  overlay.className = 'ponto-overlay'
  overlay.innerHTML = `
    <div class="ponto-modal">
      <div class="ponto-check-wrap">
        <div class="ponto-check">✔</div>
      </div>
      <div class="ponto-titulo">${tipo}</div>
      <div class="ponto-texto">${texto}</div>
    </div>
  `
  document.body.appendChild(overlay)
  if (navigator.vibrate) navigator.vibrate([120, 60, 120])
  setTimeout(() => {
    overlay.classList.add('saindo')
    setTimeout(() => overlay.remove(), 260)
  }, 2200)
}

async function getConfiguracoes(){
  const { data } = await supabase.from('configuracoes').select('*').limit(1).maybeSingle()
  return data || { jornada_horas: 8, tolerancia_min: 10 }
}

async function mesFechado(anoMes){
  const { data } = await supabase.from('fechamentos').select('*').eq('mes_ref', anoMes).maybeSingle()
  return !!data
}

async function carregarHoraAtual(){
  const el = document.getElementById('agora')
  if(!el) return
  const render = ()=> el.textContent = 'Agora: ' + new Date().toLocaleString('pt-BR')
  render()
  setInterval(render, 1000)
}

window.login = async function(){
  const usuario = document.getElementById('user').value.trim()
  const senha = document.getElementById('pass').value.trim()

  const { data, error } = await supabase
    .from('usuarios')
    .select('*')
    .eq('usuario', usuario)
    .eq('senha', senha)
    .maybeSingle()

  if(error || !data){
    showMsg('msg', 'Usuário ou senha inválidos.')
    return
  }

  localStorage.setItem('ponto_user', JSON.stringify(data))
  location.href = data.role === 'admin' ? 'admin.html' : 'painel.html'
}

window.logout = function(){
  localStorage.removeItem('ponto_user')
  location.href = 'index.html'
}

window.irAdmin = function(){
  const u = getUser()
  if(u?.role === 'admin') location.href = 'admin.html'
  else alert('Somente admin pode acessar.')
}

window.voltarPainel = function(){ location.href = 'painel.html' }

window.registrarPonto = async function(tipo){
  const user = requireLogin()
  const obs = (document.getElementById('obs')?.value || '').trim()
  const hojeMes = new Date().toISOString().slice(0,7)

  if(await mesFechado(hojeMes)){
    showMsg('status', 'Este mês está fechado e não aceita novos registros.')
    return
  }

  navigator.geolocation.getCurrentPosition(async pos=>{
    const payload = {
      usuario: user.usuario,
      tipo,
      data: new Date().toISOString(),
      latitude: String(pos.coords.latitude),
      longitude: String(pos.coords.longitude),
      observacao: obs
    }

    const { error } = await supabase.from('registros').insert(payload)
    if(error){
      showMsg('status', 'Erro ao registrar ponto.')
      return
    }

    const obsEl = document.getElementById('obs')
    if(obsEl) obsEl.value = ''
    showMsg('status', 'Ponto registrado com sucesso.')
    animacaoPremiumPonto(tipo, `${tipo} registrada com sucesso.`)
    await carregarMeusRegistros()
    await carregarResumoHoje()
  }, ()=>{
    showMsg('status', 'Permita a localização para registrar o ponto.')
  })
}

async function buscarMeusRegistrosHoje(){
  const user = requireLogin()
  const hoje = new Date().toISOString().slice(0,10)
  const { data } = await supabase.from('registros').select('*').eq('usuario', user.usuario).order('data', { ascending: true })
  return (data || []).filter(r => String(r.data).startsWith(hoje))
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
  const cfg = await getConfiguracoes()
  const regs = await buscarMeusRegistrosHoje()
  const resumo = calcularResumoDia(regs, Number(cfg.jornada_horas || 8))
  document.getElementById('horasHoje').textContent = horasToHM(resumo.workedHours)
  document.getElementById('extrasHoje').textContent = horasToHM(resumo.extras)
  document.getElementById('faltantesHoje').textContent = horasToHM(resumo.faltantes)
}

async function carregarMeusRegistros(){
  const tbody = document.getElementById('tabelaRegistros')
  if(!tbody) return
  const user = requireLogin()
  const { data } = await supabase.from('registros').select('*').eq('usuario', user.usuario).order('data', { ascending: false }).limit(50)
  const regs = data || []
  tbody.innerHTML = regs.length ? regs.map(r => `
    <tr>
      <td>${formatDateTime(r.data)}</td>
      <td>${r.tipo}</td>
      <td>${r.observacao || '-'}</td>
      <td>${r.latitude || '-'}</td>
      <td>${r.longitude || '-'}</td>
    </tr>
  `).join('') : '<tr><td colspan="5">Nenhum registro.</td></tr>'
}

window.salvarConfiguracoes = async function(){
  requireAdmin()
  const jornada = Number(document.getElementById('jornadaHoras').value || 8)
  const tolerancia = Number(document.getElementById('toleranciaMin').value || 10)
  const { data: existing } = await supabase.from('configuracoes').select('*').limit(1).maybeSingle()
  let result
  if(existing){
    result = await supabase.from('configuracoes').update({
      jornada_horas: jornada, tolerancia_min: tolerancia
    }).eq('id', existing.id)
  } else {
    result = await supabase.from('configuracoes').insert({
      jornada_horas: jornada, tolerancia_min: tolerancia
    })
  }
  showMsg('cfgMsg', result.error ? 'Erro ao salvar configurações.' : 'Configurações salvas.')
}

window.fecharMes = async function(){
  const user = requireAdmin()
  const mes = document.getElementById('mesFechamento').value
  if(!mes){
    showMsg('fechMsg', 'Selecione um mês.')
    return
  }
  const { error } = await supabase.from('fechamentos').insert({
    mes_ref: mes,
    fechado_por: user.usuario,
    fechado_em: new Date().toISOString()
  })
  showMsg('fechMsg', error ? 'Erro ao fechar mês. Talvez ele já esteja fechado.' : 'Mês fechado com sucesso.')
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

window.criarUsuario = async function(){
  requireAdmin()
  const usuario = document.getElementById('novoUsuario').value.trim()
  const senha = document.getElementById('novaSenha').value.trim()
  const role = document.getElementById('novoPerfil').value

  if(!usuario || !senha){
    showMsg('userMsg', 'Preencha usuário e senha.')
    return
  }

  const { error } = await supabase.from('usuarios').insert({ usuario, senha, role })
  showMsg('userMsg', error ? 'Erro ao criar usuário. Verifique se ele já existe.' : 'Usuário criado com sucesso.')
  if(!error){
    document.getElementById('novoUsuario').value = ''
    document.getElementById('novaSenha').value = ''
    document.getElementById('novoPerfil').value = 'funcionario'
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
      <td><input id="usuario_${u.id}" value="${u.usuario ?? ''}"></td>
      <td><input id="senha_${u.id}" value="${u.senha ?? ''}"></td>
      <td>
        <select id="role_${u.id}">
          <option value="funcionario" ${u.role === 'funcionario' ? 'selected' : ''}>Funcionário</option>
          <option value="admin" ${u.role === 'admin' ? 'selected' : ''}>Admin</option>
        </select>
      </td>
      <td>
        <div class="user-actions">
          <button onclick="salvarUsuario('${u.id}')" style="width:auto">Salvar</button>
          <button class="danger" onclick="excluirUsuario('${u.id}')" style="width:auto">Excluir</button>
        </div>
      </td>
    </tr>
  `).join('') : '<tr><td colspan="4">Nenhum usuário.</td></tr>'
}

window.salvarUsuario = async function(id){
  requireAdmin()
  const usuario = document.getElementById(`usuario_${id}`).value.trim()
  const senha = document.getElementById(`senha_${id}`).value.trim()
  const role = document.getElementById(`role_${id}`).value

  if(!usuario || !senha){
    showMsg('userMsg', 'Usuário e senha são obrigatórios.')
    return
  }

  const { error } = await supabase.from('usuarios').update({ usuario, senha, role }).eq('id', id)
  showMsg('userMsg', error ? 'Erro ao salvar usuário.' : 'Usuário atualizado com sucesso.')
  if(!error){
    const atual = getUser()
    const { data: updated } = await supabase.from('usuarios').select('*').eq('id', id).maybeSingle()
    if(atual && updated && atual.id === updated.id){
      localStorage.setItem('ponto_user', JSON.stringify(updated))
    }
    await carregarUsuarios()
    await carregarResumoGeral()
  }
}

window.excluirUsuario = async function(id){
  const atual = requireAdmin()
  if(!confirm('Deseja realmente excluir este usuário?')) return

  const { data: target } = await supabase.from('usuarios').select('*').eq('id', id).maybeSingle()
  if(target && target.id === atual.id){
    showMsg('userMsg', 'Você não pode excluir o próprio usuário logado.')
    return
  }

  const { error } = await supabase.from('usuarios').delete().eq('id', id)
  showMsg('userMsg', error ? 'Erro ao excluir usuário.' : 'Usuário excluído com sucesso.')
  if(!error){
    await carregarUsuarios()
    await carregarResumoGeral()
  }
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

    if (!agrupado[chave]) {
      agrupado[chave] = {
        usuario: r.usuario,
        data: dataBr,
        entrada: '', saidaAlmoco: '', voltaAlmoco: '', saida: '',
        entradaISO: null, saidaAlmocoISO: null, voltaAlmocoISO: null, saidaISO: null
      }
    }

    const hora = formatTimeBR(r.data)
    if (r.tipo === 'Entrada' && !agrupado[chave].entrada) {
      agrupado[chave].entrada = hora
      agrupado[chave].entradaISO = r.data
    }
    if (r.tipo === 'Saída Almoço' && !agrupado[chave].saidaAlmoco) {
      agrupado[chave].saidaAlmoco = hora
      agrupado[chave].saidaAlmocoISO = r.data
    }
    if (r.tipo === 'Volta Almoço' && !agrupado[chave].voltaAlmoco) {
      agrupado[chave].voltaAlmoco = hora
      agrupado[chave].voltaAlmocoISO = r.data
    }
    if (r.tipo === 'Saída') {
      agrupado[chave].saida = hora
      agrupado[chave].saidaISO = r.data
    }
  }

  const cfg = await getConfiguracoes()
  const jornadaPadrao = Number(cfg.jornada_horas || 8)

  const resumoDiario = Object.values(agrupado).map(item => {
    let workedHours = 0
    if (item.entradaISO && item.saidaISO) {
      workedHours = (new Date(item.saidaISO) - new Date(item.entradaISO)) / 1000 / 60 / 60
    }
    if (item.saidaAlmocoISO && item.voltaAlmocoISO) {
      workedHours -= (new Date(item.voltaAlmocoISO) - new Date(item.saidaAlmocoISO)) / 1000 / 60 / 60
    }
    workedHours = Math.max(0, workedHours)
    const extras = Math.max(0, workedHours - jornadaPadrao)
    const faltantes = Math.max(0, jornadaPadrao - workedHours)

    return {
      'Usuário': item.usuario,
      'Data': item.data,
      'Primeira Entrada': item.entrada,
      'Saída Almoço': item.saidaAlmoco,
      'Volta Almoço': item.voltaAlmoco,
      'Saída Final': item.saida,
      'Horas Trabalhadas': horasToHM(workedHours),
      'Horas Extras': horasToHM(extras),
      'Horas Faltantes': horasToHM(faltantes)
    }
  })

  const mensalMap = {}
  for (const linha of resumoDiario) {
    const [dia, mes, ano] = linha['Data'].split('/')
    const chave = `${linha['Usuário']}__${mes}/${ano}`
    if (!mensalMap[chave]) {
      mensalMap[chave] = { usuario: linha['Usuário'], mes: `${mes}/${ano}`, dias: 0, worked: 0, extras: 0, faltantes: 0 }
    }

    const parseHM = (txt) => {
      const [h, m] = (txt || '00:00').split(':').map(Number)
      return (h || 0) + ((m || 0) / 60)
    }

    mensalMap[chave].dias += 1
    mensalMap[chave].worked += parseHM(linha['Horas Trabalhadas'])
    mensalMap[chave].extras += parseHM(linha['Horas Extras'])
    mensalMap[chave].faltantes += parseHM(linha['Horas Faltantes'])
  }

  const resumoMensal = Object.values(mensalMap).map(item => ({
    'Usuário': item.usuario,
    'Mês': item.mes,
    'Dias Trabalhados': item.dias,
    'Total Horas': horasToHM(item.worked),
    'Total Extras': horasToHM(item.extras),
    'Total Faltantes': horasToHM(item.faltantes)
  }))

  const wb = XLSX.utils.book_new()
  const ws1 = XLSX.utils.json_to_sheet(abaRegistros)
  const ws2 = XLSX.utils.json_to_sheet(resumoDiario)
  const ws3 = XLSX.utils.json_to_sheet(resumoMensal)

  ws1['!autofilter'] = { ref: 'A1:G1' }
  ws2['!autofilter'] = { ref: 'A1:I1' }
  ws3['!autofilter'] = { ref: 'A1:F1' }

  ws1['!cols'] = [{wch:18},{wch:18},{wch:12},{wch:12},{wch:14},{wch:14},{wch:28}]
  ws2['!cols'] = [{wch:18},{wch:12},{wch:16},{wch:16},{wch:16},{wch:14},{wch:18},{wch:16},{wch:18}]
  ws3['!cols'] = [{wch:18},{wch:10},{wch:18},{wch:14},{wch:14},{wch:16}]

  XLSX.utils.book_append_sheet(wb, ws1, 'Registros')
  XLSX.utils.book_append_sheet(wb, ws2, 'Resumo Diário')
  XLSX.utils.book_append_sheet(wb, ws3, 'Resumo Mensal')

  const agora = new Date()
  const nome = `Ponto_InnoLife_${String(agora.getMonth()+1).padStart(2,'0')}_${agora.getFullYear()}.xlsx`
  XLSX.writeFile(wb, nome)
}

async function boot(){
  const path = location.pathname.split('/').pop()

  if(path === 'painel.html'){
    const user = requireLogin()
    document.getElementById('usuarioAtual').textContent = user.usuario
    document.getElementById('perfilAtual').textContent = user.role
    await carregarHoraAtual()
    await carregarMeusRegistros()
    await carregarResumoHoje()
  }

  if(path === 'admin.html'){
    requireAdmin()
    const cfg = await getConfiguracoes()
    document.getElementById('jornadaHoras').value = cfg.jornada_horas ?? 8
    document.getElementById('toleranciaMin').value = cfg.tolerancia_min ?? 10
    await carregarResumoGeral()
    await carregarUsuarios()
  }
}
boot()
