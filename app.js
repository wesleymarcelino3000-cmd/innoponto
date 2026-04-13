
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

function formatDate(iso){
  return new Date(iso).toLocaleString('pt-BR')
}

function horasToHM(hours){
  if(hours == null || isNaN(hours)) return '-'
  const totalMin = Math.round(hours * 60)
  const h = Math.floor(totalMin / 60)
  const m = totalMin % 60
  return `${h}h ${String(m).padStart(2,'0')}min`
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
    showMsg('status', error ? 'Erro ao registrar ponto.' : 'Ponto registrado com sucesso.')
    if(!error){
      const obsEl = document.getElementById('obs')
      if(obsEl) obsEl.value = ''
      await carregarMeusRegistros()
      await carregarResumoHoje()
    }
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
      <td>${formatDate(r.data)}</td>
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

window.exportarCSV = async function(){
  requireAdmin()
  const { data } = await supabase.from('registros').select('*').order('data', { ascending: false })
  const rows = data || []
  const csv = [
    'usuario;tipo;data;latitude;longitude;observacao',
    ...rows.map(r => [
      r.usuario, r.tipo, r.data, r.latitude || '', r.longitude || '', (r.observacao || '').replace(/;/g, ',')
    ].join(';'))
  ].join('\n')

  const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'registros_ponto_innolife.csv'
  a.click()
  URL.revokeObjectURL(url)
}

async function boot(){
  const path = location.pathname.split('/').pop()

  if(path === 'painel.html'){
    const user = requireLogin()
    document.getElementById('usuarioAtual').textContent = user.usuario
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
  }
}
boot()
