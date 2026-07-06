import { supabase } from '/js/core/supabase.js';
import { state, showToast, fmt2, fmtPesos, fmtDate, horasEntreTiempos, getDiasLaboralesSet,
         redondear, getLunesDeSemana, fechaKeyLocal, fmtDateCorta,
         DIAS_CORTO, MESES_NOMBRES, getTrabajadorById } from './utils.js';

let trabajadorActual = null;
let diasData = [];
let registroId = null;
let mesActual = 0;
let anioActual = new Date().getFullYear();

// ── Selector ─────────────────────────────────────────────────────
export function onTrabajadorChangeAsis() {
  document.getElementById('a-planilla-wrap').style.display = 'none';
  document.getElementById('a-status').textContent = '';
  const id = document.getElementById('a-trabajador').value;
  if (id) cargarHistAsis(id);
  else document.getElementById('a-hist-card').style.display = 'none';
}

// ── Generar días del mes ─────────────────────────────────────────
function generarDiasMes(t, anio, mes) {
  const dias = [];
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const working = new Set(getDiasLaboralesSet(t.dias_laborales));
  for (let day = 1; day <= diasEnMes; day++) {
    const fechaObj = new Date(anio, mes, day);
    const diaSemana = fechaObj.getDay();
    const esLaboral = working.has(diaSemana);
    const esperado = esLaboral && t.horario_semana && t.horario_semana[diaSemana] ? t.horario_semana[diaSemana] : null;
    dias.push({
      fecha: `${anio}-${String(mes + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      diaSemana, esperado,
      tipo: esLaboral ? 'normal' : 'libre',
      entradaReal: esperado ? esperado.entrada : '',
      salidaReal: esperado ? esperado.salida : '',
    });
  }
  return dias;
}

// ── Cargar ───────────────────────────────────────────────────────
export async function cargarAsistencia() {
  const trabajadorId = document.getElementById('a-trabajador').value;
  if (!trabajadorId) { showToast('Selecciona un trabajador', 'error'); return; }
  const t = getTrabajadorById(trabajadorId);
  if (!t) { showToast('Trabajador no encontrado', 'error'); return; }

  trabajadorActual = t;
  mesActual  = Number(document.getElementById('a-mes').value);
  anioActual = Number(document.getElementById('a-anio').value);

  const { data, error } = await supabase.from('asistencia_mensual').select('*')
    .eq('trabajador_id', trabajadorId).eq('anio', anioActual).eq('mes', mesActual).maybeSingle();

  if (error) { showToast('Error al cargar: ' + error.message, 'error'); return; }

  if (data) {
    diasData    = data.dias_data;
    registroId  = data.id;
    document.getElementById('a-status').textContent = `Cargado — guardado el ${new Date(data.updated_at).toLocaleString('es-CL')}.`;
  } else {
    diasData   = generarDiasMes(t, anioActual, mesActual);
    registroId = null;
    document.getElementById('a-status').textContent = 'Planilla nueva generada según el horario del trabajador — aún no guardada.';
  }

  document.getElementById('a-titulo-registro').textContent =
    `${t.nombre} — ${MESES_NOMBRES[mesActual]} ${anioActual}`;
  document.getElementById('a-planilla-wrap').style.display = 'block';
  renderTablaAsis();
  cargarHistAsis(trabajadorId);
}

// ── Motor de cálculo diario ──────────────────────────────────────
function calcularDiaTrabajo(horaEntrada, horaSalida, horasTeoricasMeta) {
  const permanenciaTotal = horasEntreTiempos(horaEntrada, horaSalida);
  const colacionADescuentar = permanenciaTotal <= 5.0 ? 0.0 : 1.0;
  const horasVerdes = Math.max(0, permanenciaTotal - colacionADescuentar);
  let horasRojas = (horasTeoricasMeta || 0) - horasVerdes;
  if (horasRojas < 0) horasRojas = 0;
  return { permanenciaTotal, colacionADescuentar, horasVerdes, horasRojas };
}

function computarDia(d) {
  if (d.tipo === 'ausente') {
    if (!d.esperado) return { hrsNormales: 0, hrsExtra: 0, hrsExtraDirecta: 0, hrsDesc: 0 };
    const c = calcularDiaTrabajo(d.esperado.entrada, d.esperado.salida, 0);
    return { hrsNormales: 0, hrsExtra: 0, hrsExtraDirecta: 0, hrsDesc: c.horasVerdes };
  }
  if (d.tipo === 'libre' || d.tipo === 'feriado') {
    return { hrsNormales: 0, hrsExtra: 0, hrsExtraDirecta: 0, hrsDesc: 0 };
  }
  const horasTeoricasMeta = d.esperado
    ? Math.max(0, horasEntreTiempos(d.esperado.entrada, d.esperado.salida) - (d.esperado.colacion || 0) / 60)
    : 0;
  const calc = calcularDiaTrabajo(d.entradaReal, d.salidaReal, horasTeoricasMeta);
  const horasReales = calc.horasVerdes;

  if (!d.esperado) return { hrsNormales: 0, hrsExtra: 0, hrsExtraDirecta: horasReales, hrsDesc: 0 };
  if (d.tipo === 'extra') return { hrsNormales: 0, hrsExtra: horasReales, hrsExtraDirecta: 0, hrsDesc: 0 };
  if (d.tipo === 'normferiado') return { hrsNormales: 0, hrsExtra: horasReales, hrsExtraDirecta: 0, hrsDesc: calc.horasRojas };

  if (horasReales >= horasTeoricasMeta)
    return { hrsNormales: horasTeoricasMeta, hrsExtra: horasReales - horasTeoricasMeta, hrsExtraDirecta: 0, hrsDesc: 0 };
  return { hrsNormales: horasReales, hrsExtra: 0, hrsExtraDirecta: 0, hrsDesc: calc.horasRojas };
}

function consolidarSemana(D, E) {
  D = D || 0; E = E || 0;
  if (D <= 0) return { horasExtraFinales: redondear(E), horasDescuentoFinal: 0 };
  if (E >= D) return { horasExtraFinales: redondear(E - D), horasDescuentoFinal: 0 };
  return { horasExtraFinales: 0, horasDescuentoFinal: redondear(D - E) };
}

export function consolidarResumenMensual(diasDataArr, trabajador) {
  const diasCalculados = diasDataArr.map(dia => ({ dia, calculo: computarDia(dia) }));
  const diasContratoSemana = trabajador ? getDiasLaboralesSet(trabajador.dias_laborales).length : 0;

  const semanasPorClave = diasCalculados.reduce((acc, { dia, calculo }) => {
    const lunes = getLunesDeSemana(dia.fecha);
    const key = fechaKeyLocal(lunes);
    if (!acc[key]) {
      const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
      acc[key] = { key, lunes, domingo, normales: 0, extra: 0, extraDirecta: 0, desc: 0, diasContractualesPresentes: 0 };
    }
    acc[key].normales += calculo.hrsNormales;
    acc[key].extra    += calculo.hrsExtra;
    acc[key].extraDirecta += calculo.hrsExtraDirecta;
    acc[key].desc     += calculo.hrsDesc;
    if (dia.esperado) acc[key].diasContractualesPresentes += 1;
    return acc;
  }, {});

  const semanas = Object.values(semanasPorClave)
    .sort((a, b) => a.lunes - b.lunes)
    .map(s => {
      const normales = redondear(s.normales), extra = redondear(s.extra),
            extraDirecta = redondear(s.extraDirecta), desc = redondear(s.desc);
      const esParcial = diasContratoSemana > 0 && s.diasContractualesPresentes < diasContratoSemana;
      const { horasExtraFinales, horasDescuentoFinal } = consolidarSemana(desc, extra);
      return {
        lunes: fechaKeyLocal(s.lunes), domingo: fechaKeyLocal(s.domingo),
        normales, extra, extraDirecta, desc,
        diasContractualesPresentes: s.diasContractualesPresentes, diasContratoSemana, esParcial,
        horasExtraFinales, horasDescuentoFinal,
        extraFinal: redondear(horasExtraFinales + extraDirecta),
        descFinal: horasDescuentoFinal,
      };
    });

  const hrsNorm = redondear(diasCalculados.reduce((acc, { calculo }) => acc + calculo.hrsNormales, 0));
  const hrsExt  = redondear(semanas.reduce((acc, s) => acc + s.extraFinal, 0));
  const hrsDescTotal = redondear(semanas.reduce((acc, s) => acc + s.descFinal, 0));

  let diasTrab = 0, hrsAusCompletas = 0, hrsNoRealizadas = 0, diasAusentes = 0;
  diasCalculados.forEach(({ dia, calculo }) => {
    if (dia.tipo === 'ausente') { hrsAusCompletas += calculo.hrsDesc; diasAusentes += 1; }
    else if (calculo.hrsDesc > 0) hrsNoRealizadas += calculo.hrsDesc;
    if ((dia.tipo === 'normal' || dia.tipo === 'extra' || dia.tipo === 'normferiado') &&
        (calculo.hrsNormales + calculo.hrsExtra + calculo.hrsExtraDirecta) > 0) diasTrab += 1;
  });

  const valHora = (trabajador && trabajador.hrs_semana)
    ? ((trabajador.sueldo_base / 30) * 28) / (trabajador.hrs_semana * 4) : 0;

  return { diasCalculados, diasTrab, hrsNorm, hrsExt,
    hrsAusCompletas: redondear(hrsAusCompletas), hrsNoRealizadas: redondear(hrsNoRealizadas),
    hrsDescTotal, diasAusentes, valHora, semanas };
}

// ── Render tabla ─────────────────────────────────────────────────
const TIPO_LABELS = { normal:'Normal', extra:'Extra', normferiado:'Norm/Feriado', ausente:'Ausente', libre:'Libre', feriado:'Feriado' };
const TIPO_TAG_CLS = { normal:'tag-normal', extra:'tag-extra', normferiado:'tag-normferiado', ausente:'tag-ausente', libre:'tag-libre', feriado:'tag-feriado' };

export function renderTablaAsis() {
  const tbody = document.getElementById('a-tabla-dias');
  if (!tbody) return;
  const r = consolidarResumenMensual(diasData, trabajadorActual);

  let semanaKey = null, html = '';
  diasData.forEach((d, i) => {
    const lunes = getLunesDeSemana(d.fecha);
    const key   = fechaKeyLocal(lunes);
    if (key !== semanaKey) {
      semanaKey = key;
      const domingo = new Date(lunes); domingo.setDate(lunes.getDate() + 6);
      html += `<tr class="wc-semana-div"><td colspan="10">Semana del ${fmtDateCorta(lunes)} al ${fmtDateCorta(domingo)}</td></tr>`;
    }
    const c = r.diasCalculados[i].calculo;
    const hrsExtraDia = c.hrsExtra + c.hrsExtraDirecta;
    const disabled = (d.tipo === 'ausente' || d.tipo === 'libre' || d.tipo === 'feriado');
    const esperadoTxt = d.esperado ? `${d.esperado.entrada}–${d.esperado.salida}` : '—';
    const rowCls = d.tipo === 'ausente' ? 'wc-fila-ausente' : (d.tipo === 'libre' || d.tipo === 'feriado' ? 'wc-fila-libre' : '');
    html += `<tr class="${rowCls}">
      <td>${fmtDate(d.fecha)}</td>
      <td>${DIAS_CORTO[d.diaSemana]}</td>
      <td><select class="wc-tipo-select" onchange="wcCambiarTipo(${i},this.value)">
        ${Object.keys(TIPO_LABELS).map(k=>`<option value="${k}" ${d.tipo===k?'selected':''}>${TIPO_LABELS[k]}</option>`).join('')}
      </select></td>
      <td><input type="time" class="wc-time-input" value="${d.entradaReal||''}" ${disabled?'disabled':''} onchange="wcCambiarHora(${i},'entradaReal',this.value)" /></td>
      <td><input type="time" class="wc-time-input" value="${d.salidaReal||''}"  ${disabled?'disabled':''} onchange="wcCambiarHora(${i},'salidaReal',this.value)" /></td>
      <td class="wc-horario-ref">${esperadoTxt}</td>
      <td>${c.hrsNormales>0?`<span class="wc-hrs-badge" style="background:var(--green-light);color:var(--green)">${fmt2(c.hrsNormales)}</span>`:'—'}</td>
      <td>${hrsExtraDia>0?`<span class="wc-hrs-badge" style="background:#fff3cd;color:#856404">${fmt2(hrsExtraDia)}</span>`:'—'}</td>
      <td>${c.hrsDesc>0?`<span class="wc-hrs-badge" style="background:var(--danger-light);color:var(--danger)">${fmt2(c.hrsDesc)}</span>`:'—'}</td>
      <td><span class="wc-tag-dia ${TIPO_TAG_CLS[d.tipo]}">${TIPO_LABELS[d.tipo]}</span></td>
    </tr>`;
  });
  tbody.innerHTML = html;

  document.getElementById('ar-dias').textContent  = r.diasTrab;
  document.getElementById('ar-hnorm').textContent = fmt2(r.hrsNorm);
  document.getElementById('ar-hext').textContent  = fmt2(r.hrsExt);
  document.getElementById('ar-hdesc').textContent = fmt2(r.hrsDescTotal);

  document.getElementById('a-liq-dias').textContent   = r.diasTrab + ' días';
  document.getElementById('a-liq-hrs-desc').textContent = fmt2(r.hrsDescTotal) + ' hrs';
  document.getElementById('a-liq-val-hora').textContent = fmtPesos(r.valHora);
  document.getElementById('a-liq-hrs-ext').textContent  = fmt2(r.hrsExt) + ' hrs';
  document.getElementById('a-liq-ausencias').textContent = r.diasAusentes + ' días';

  renderResumenSemanal(r.semanas);
}

function renderResumenSemanal(semanas) {
  const tbody = document.getElementById('a-tabla-semanas');
  if (!tbody) return;
  if (!semanas.length) {
    tbody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--hint)">Sin datos</td></tr>';
    return;
  }
  tbody.innerHTML = semanas.map(s => {
    const lD = new Date(s.lunes + 'T00:00:00'), dD = new Date(s.domingo + 'T00:00:00');
    const diasTxt = s.esParcial
      ? `<span title="Semana a caballo entre dos meses">${s.diasContractualesPresentes}/${s.diasContratoSemana} ⚠️</span>`
      : `${s.diasContractualesPresentes}/${s.diasContratoSemana}`;
    return `<tr>
      <td>${fmtDateCorta(lD)} – ${fmtDateCorta(dD)}</td>
      <td>${diasTxt}</td>
      <td>${fmt2(s.normales)}</td>
      <td>${fmt2(s.extra)}</td>
      <td>${s.extraDirecta>0?`<span class="wc-hrs-badge" style="background:#fff3cd;color:#856404">${fmt2(s.extraDirecta)}</span>`:'—'}</td>
      <td>${fmt2(s.desc)}</td>
      <td>${s.horasExtraFinales>0?`<span class="wc-hrs-badge" style="background:var(--green-light);color:var(--green)">${fmt2(s.horasExtraFinales)}</span>`:'—'}</td>
      <td>${s.horasDescuentoFinal>0?`<span class="wc-hrs-badge" style="background:var(--danger-light);color:var(--danger)">${fmt2(s.horasDescuentoFinal)}</span>`:'—'}</td>
    </tr>`;
  }).join('');
}

export function cambiarTipo(i, val) {
  diasData[i].tipo = val;
  if (val === 'ausente' || val === 'libre' || val === 'feriado') {
    diasData[i].entradaReal = ''; diasData[i].salidaReal = '';
  } else if (!diasData[i].entradaReal && diasData[i].esperado) {
    diasData[i].entradaReal = diasData[i].esperado.entrada;
    diasData[i].salidaReal  = diasData[i].esperado.salida;
  }
  renderTablaAsis();
}

export function cambiarHora(i, campo, val) {
  diasData[i][campo] = val;
  renderTablaAsis();
}

export async function guardarAsistencia() {
  if (!trabajadorActual) { showToast('Carga un trabajador primero', 'error'); return; }
  const resumen = consolidarResumenMensual(diasData, trabajadorActual);
  const payload = {
    trabajador_id: trabajadorActual.id,
    anio: anioActual, mes: mesActual,
    dias_data: diasData, resumen,
    updated_at: new Date().toISOString(),
  };
  const { data, error } = await supabase.from('asistencia_mensual')
    .upsert(payload, { onConflict: 'trabajador_id,anio,mes' })
    .select().single();
  if (error) { showToast('Error al guardar: ' + error.message, 'error'); return; }
  registroId = data.id;
  document.getElementById('a-status').textContent = `Guardado correctamente (${new Date().toLocaleString('es-CL')}).`;
  showToast('Asistencia guardada ✓');
  cargarHistAsis(trabajadorActual.id);
}

async function cargarHistAsis(trabajadorId) {
  const { data, error } = await supabase.from('asistencia_mensual').select('anio,mes,updated_at')
    .eq('trabajador_id', trabajadorId).order('anio', { ascending: false }).order('mes', { ascending: false });
  const card = document.getElementById('a-hist-card');
  const list = document.getElementById('a-hist-list');
  if (!card || !list) return;
  if (error || !data || !data.length) { card.style.display = 'none'; return; }
  card.style.display = 'block';
  list.innerHTML = data.map(r => `
    <div class="wc-hist-item" onclick="document.getElementById('a-mes').value='${r.mes}';document.getElementById('a-anio').value='${r.anio}';wcCargarAsistencia()">
      <span>${MESES_NOMBRES[r.mes]} ${r.anio}</span>
      <span style="font-size:11px;color:var(--hint)">${new Date(r.updated_at).toLocaleDateString('es-CL')}</span>
    </div>`).join('');
}
