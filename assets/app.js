{
/* ========== Cấu hình ========== */
const COURSES = [
  { id: 'vldc1', title: 'Vật lý đại cương 1' },
  { id: 'vldc2', title: 'Vật lý đại cương 2' },
];
let QUIZZES = [], READY = false, LOAD_ERR = [];
const quizById = id => QUIZZES.find(q => q.id === id);

const app = document.getElementById('app');
const modalRoot = document.getElementById('modal-root');

/* ========== Lưu trữ (localStorage, có dự phòng trong bộ nhớ) ========== */
const mem = {};
const store = {
  get(k) {
    try { const v = localStorage.getItem(k); if (v != null) return JSON.parse(v); } catch (e) {}
    return k in mem ? mem[k] : null;
  },
  set(k, v) { mem[k] = v; try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { delete mem[k]; try { localStorage.removeItem(k); } catch (e) {} },
};
const kProg = id => 'tn:progress:' + id;
const kHist = id => 'tn:history:' + id;
const history = id => store.get(kHist(id)) || [];
// Cột mốc chỉ được thêm vào, không có thao tác sửa hay xoá.
function addMilestone(id, m) {
  const h = history(id);
  h.push(Object.freeze(m));
  store.set(kHist(id), h);
}

/* ========== Tiện ích ========== */
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
function typeset(root) {
  if (!window.katex) return;
  root.querySelectorAll('.m:not([data-k])').forEach(el => {
    try { katex.render(el.textContent, el, { throwOnError: false, strict: 'ignore' }); } catch (e) {}
    el.dataset.k = '1';
  });
}
const pct = (c, n) => (n ? Math.round((c / n) * 1000) / 10 : 0);
const fmtPct = p => (Number.isInteger(p) ? p : p.toFixed(1).replace('.', ',')) + '%';
const fmtDate = t => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric' });
function fmtDur(ms) {
  const m = Math.round(ms / 60000);
  if (m < 1) return 'dưới 1 phút';
  if (m < 60) return m + ' phút';
  return Math.floor(m / 60) + ' giờ ' + (m % 60) + ' phút';
}
const ICON_OK = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="11" fill="var(--ok)"/><path d="M6.5 12.5l3.6 3.6 7.4-8" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON_BAD = '<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 5.5l13 13M18.5 5.5l-13 13" stroke="var(--bad)" stroke-width="3" stroke-linecap="round"/></svg>';
const ICON_LOCK = '<svg class="lock" viewBox="0 0 16 16" aria-hidden="true"><rect x="3" y="7" width="10" height="7.5" rx="1.3" fill="none" stroke="currentColor" stroke-width="1.3"/><path d="M5.3 7V5a2.7 2.7 0 015.4 0v2" fill="none" stroke="currentColor" stroke-width="1.3"/></svg>';
function ringSVG(p, r, w) {
  const c = 2 * Math.PI * r, s = r + w;
  return `<svg viewBox="0 0 ${2 * s} ${2 * s}" aria-hidden="true"><circle class="bg" cx="${s}" cy="${s}" r="${r}" fill="none" stroke="var(--rule)" stroke-width="${w}"/><circle class="fg" cx="${s}" cy="${s}" r="${r}" fill="none" stroke="var(--ok)" stroke-width="${w}" stroke-linecap="round" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - p / 100)}" data-c="${c}" data-p="${p}"/></svg>`;
}

/* ========== Phiên làm bài ========== */
let S = null; // { quiz, answers, cur, startedAt, elapsed, tick, finished, milestone }
function newSession(quiz) {
  S = { quiz, answers: {}, cur: 0, startedAt: Date.now(), elapsed: 0, tick: Date.now(), finished: false };
  save();
}
function loadSession(quiz) {
  const p = store.get(kProg(quiz.id));
  if (!p) return false;
  S = { quiz, answers: p.answers || {}, cur: p.cur || 0, startedAt: p.startedAt, elapsed: p.elapsed || 0, tick: Date.now(), finished: false };
  return true;
}
function save() {
  if (!S || S.finished) return;
  const now = Date.now();
  S.elapsed += now - S.tick; S.tick = now;
  store.set(kProg(S.quiz.id), { answers: S.answers, cur: S.cur, startedAt: S.startedAt, elapsed: S.elapsed });
}
function counts(quiz, answers) {
  let done = 0, ok = 0;
  for (const q of quiz.questions) if (answers[q.n]) { done++; if (answers[q.n] === q.answer) ok++; }
  return { total: quiz.questions.length, done, left: quiz.questions.length - done, ok, bad: done - ok };
}
function finalize() {
  save();
  const qz = S.quiz, c = counts(qz, S.answers);
  const grp = f => { let ok = 0, n = 0; for (const q of qz.questions) if (f(q)) { n++; if (S.answers[q.n] === q.answer) ok++; } return [ok, n]; };
  const m = {
    id: Date.now(), at: new Date().toISOString(), total: c.total, correct: c.ok, wrong: c.bad,
    pct: pct(c.ok, c.total), elapsed: S.elapsed,
    parts: { I: grp(q => q.part === 'I'), II: grp(q => q.part === 'II') },
    chapters: Object.fromEntries([...new Set(qz.questions.map(q => q.chapter))].filter(Boolean).map(ch => [ch, grp(q => q.chapter === ch)])),
  };
  addMilestone(qz.id, m);
  store.del(kProg(qz.id));
  S.finished = true; S.milestone = m.id;
}

/* ========== Điều hướng ========== */
function go(hash) {
  if (location.hash === '#' + hash) route(); else location.hash = hash;
}
function route() {
  if (!READY) return;
  closeModal();
  const h = location.hash.slice(1);
  let m;
  if ((m = /^quiz-(.+)$/.exec(h)) && quizById(m[1])) {
    const qz = quizById(m[1]);
    if (!S || S.quiz.id !== qz.id) { if (!loadSession(qz)) newSession(qz); }
    renderQuiz(true);
  } else if ((m = /^result-(.+)$/.exec(h)) && quizById(m[1])) {
    if (S && S.quiz.id === m[1] && !S.finished) save();
    renderResult(quizById(m[1]));
  } else {
    if (S && !S.finished) save();
    S = null;
    renderPreface();
  }
}
window.addEventListener('hashchange', route);
document.addEventListener('visibilitychange', () => { if (document.hidden) save(); else if (S) S.tick = Date.now(); });
window.addEventListener('pagehide', save);

/* ========== Trang Preface ========== */
function renderPreface() {
  document.title = 'Preface · Ôn tập trắc nghiệm';
  const secs = COURSES.map((c, i) => {
    const list = QUIZZES.filter(q => q.course === c.id);
    const cards = list.map(q => {
      const prog = store.get(kProg(q.id));
      const h = history(q.id);
      let st;
      if (prog) {
        const done = Object.keys(prog.answers || {}).length;
        st = `<span class="live">Đang làm dở · ${done}/${q.questions.length}</span>`;
      } else if (h.length) st = `<span>Lần gần nhất: <b>${fmtPct(h[h.length - 1].pct)}</b></span>`;
      else st = `<span class="muted">Chưa làm</span>`;
      const tries = h.length ? `<span class="muted">${h.length} lần</span>` : '';
      return `<div>
        <button class="card" data-open="${esc(q.id)}">
          <div class="t">${esc(q.title)}</div>
          <div class="s">${q.questions.length} câu · ${esc(q.meta || '')}</div>
          <div class="st">${st}${tries}</div>
        </button>
        ${h.length ? `<button class="hist-link" data-hist="${esc(q.id)}">Xem các cột mốc</button>` : ''}
      </div>`;
    }).join('');
    return `<section class="sec" aria-labelledby="c-${c.id}">
      <h2 id="c-${c.id}"><span class="no">${i + 1}</span><span>${esc(c.title)}</span></h2>
      ${list.length ? `<div class="cards">${cards}</div>` : `<p class="empty">Chưa có bộ đề nào.</p>`}
    </section>`;
  }).join('');
  const err = LOAD_ERR.length ? `<p class="empty" style="color:var(--bad)">Không tải được: ${LOAD_ERR.map(esc).join(', ')}</p>` : '';
  app.innerHTML = `<div class="wrap">${err}
    <header class="front">
      <h1>Preface</h1>
      <p>Chọn một bộ đề để bắt đầu. Tiến trình và các cột mốc được lưu trên trình duyệt này.</p>
      <div class="rule"></div>
    </header>
    ${secs}
    <footer class="foot">Căn cứ: Halliday, Resnick &amp; Walker, <em>Fundamentals of Physics</em>, Extended 11th ed.</footer>
  </div>`;
  app.querySelectorAll('[data-open]').forEach(b => b.addEventListener('click', () => openQuiz(b.dataset.open)));
  app.querySelectorAll('[data-hist]').forEach(b => b.addEventListener('click', () => go('result-' + b.dataset.hist)));
  window.scrollTo(0, 0);
}
function openQuiz(id) {
  const qz = quizById(id);
  const prog = store.get(kProg(id));
  if (!prog) { newSession(qz); go('quiz-' + id); return; }
  const done = Object.keys(prog.answers || {}).length;
  showModal(`
    <button class="x" data-act="close" aria-label="Đóng">×</button>
    <h3 id="dlg-t">Bạn đang làm dở bài trắc nghiệm</h3>
    <p>Bộ đề <b>${esc(qz.title)}</b> đã làm ${done}/${qz.questions.length} câu. Bạn có muốn tiếp tục không?</p>
    <div class="acts">
      <button class="btn" data-act="drop">Bỏ</button>
      <button class="btn primary" data-act="go">Tiếp tục</button>
    </div>`, act => {
    if (act === 'close') return closeModal();
    if (act === 'drop') { store.del(kProg(id)); newSession(qz); }
    else loadSession(qz);
    closeModal();
    go('quiz-' + id);
  }, '[data-act="go"]');
}

/* ========== Hộp thoại ========== */
let lastFocus = null;
function showModal(html, onAct, focusSel) {
  lastFocus = document.activeElement;
  modalRoot.innerHTML = `<div class="ov"><div class="dlg" role="dialog" aria-modal="true" aria-labelledby="dlg-t">${html}</div></div>`;
  const ov = modalRoot.firstElementChild;
  ov.addEventListener('click', e => {
    if (e.target === ov) return onAct('close');
    const b = e.target.closest('[data-act]');
    if (b) onAct(b.dataset.act);
  });
  (ov.querySelector(focusSel) || ov.querySelector('button')).focus();
  modalKey = onAct;
}
let modalKey = null;
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && modalRoot.firstElementChild && modalKey) { e.preventDefault(); modalKey('close'); }
});
function closeModal() {
  if (!modalRoot.firstElementChild) return;
  modalRoot.innerHTML = ''; modalKey = null;
  if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
}

/* ========== Trang làm bài ========== */
function nextUnanswered(from) {
  const qs = S.quiz.questions, n = qs.length;
  for (let s = 1; s <= n; s++) { const i = (from + s) % n; if (!S.answers[qs[i].n]) return i; }
  return -1;
}
function renderQuiz(scrollTop) {
  const qz = S.quiz, q = qz.questions[S.cur], c = counts(qz, S.answers);
  const ans = S.answers[q.n], answered = !!ans, isOk = ans === q.answer;
  document.title = `Câu ${q.n} · ${qz.title}`;

  let body;
  if (q.type === 'mc') {
    body = `<div class="opts" role="group" aria-label="Các phương án">` + q.options.map(o => {
      let cls = '', ic = '<span></span>';
      if (answered) {
        if (o.k === q.answer) { cls = 'right'; ic = ICON_OK; }
        else if (o.k === ans) { cls = 'wrong'; ic = ICON_BAD; }
        else cls = 'dim';
      }
      return `<button class="opt ${cls}" data-pick="${o.k}" ${answered ? 'disabled' : ''}><span class="k">${o.k}</span><span>${o.html}</span>${ic}</button>`;
    }).join('') + `</div>`;
  } else {
    body = `<div class="tf opts" role="group" aria-label="Đúng hoặc Sai">` + [['D', 'Đúng'], ['S', 'Sai']].map(([k, t]) => {
      let cls = '', ic = '<span></span>';
      if (answered) {
        if (k === q.answer) { cls = 'right'; ic = ICON_OK; }
        else if (k === ans) { cls = 'wrong'; ic = ICON_BAD; }
        else cls = 'dim';
      }
      return `<button class="opt ${cls}" data-pick="${k}" ${answered ? 'disabled' : ''}><span>${t}</span>${ic}</button>`;
    }).join('') + `</div>`;
  }

  let fb = '';
  if (answered) {
    const label = q.type === 'mc' ? q.answer : (q.answer === 'D' ? 'Đúng' : 'Sai');
    const verdict = isOk
      ? `<p class="verdict ok">Chính xác.</p>`
      : `<p class="verdict bad">Chưa đúng. Đáp án đúng là ${label}.</p>`;
    let inner;
    if (q.type === 'mc') {
      inner = `<ol class="why">` + q.options.map(o => o.k === q.answer
        ? `<li class="yes"><span class="k">${o.k}</span><div><span class="tag">Đúng.</span>${q.why}</div></li>`
        : `<li class="no"><span class="k">${o.k}</span><div><span class="tag">Sai.</span>${q.wrong[o.k] || ''}</div></li>`).join('') + `</ol>`;
    } else {
      inner = `<p><span class="h">Diễn giải.</span>${q.explain}</p>` + (q.fix ? `<p><span class="h">Phát biểu đúng.</span>${q.fix}</p>` : '');
    }
    fb = verdict + `<details class="exp" ${isOk ? '' : 'open'}><summary><span>Giải thích</span><span class="mod">${esc(q.module || '')}</span></summary><div class="body">${inner}</div></details>`;
  }

  const prevBtn = `<button class="btn" data-nav="prev" ${S.cur === 0 ? 'disabled' : ''}>← Câu trước</button>`;
  let right;
  if (S.finished) right = `<button class="btn primary" data-nav="result">Xem kết quả</button>`;
  else if (answered) right = `<button class="btn primary" data-nav="next">Câu tiếp →</button>`;
  else right = `<button class="btn" data-nav="skip" ${nextUnanswered(S.cur) === -1 ? 'disabled' : ''}>Bỏ qua →</button>`;
  if (S.finished && S.cur < qz.questions.length - 1) right = `<button class="btn" data-nav="next">Câu tiếp →</button>` + right;

  const w = n => (n / c.total * 100).toFixed(3) + '%';
  app.innerHTML = `
  <div class="bar"><div class="wrap">
    <div class="row">
      <button class="btn ghost" data-nav="exit" aria-label="Thoát về Preface">× Thoát</button>
      <div class="ttl">${esc(qz.title)}</div>
      <div class="pos">Câu ${q.n}/${c.total}</div>
    </div>
    <div class="stats" aria-label="Thống kê">
      <span>Tổng <b>${c.total}</b></span><span>Đã làm <b>${c.done}</b></span><span>Chưa làm <b>${c.left}</b></span>
      <span class="ok">Đúng <b>${c.ok}</b></span><span class="bad">Sai <b>${c.bad}</b></span>
    </div>
    <div class="track" aria-hidden="true"><i class="g" style="width:${w(c.ok)}"></i><i class="r" style="width:${w(c.bad)}"></i></div>
  </div></div>
  <div class="wrap">
    <article class="q">
      ${S.cur === 0 && qz.convention ? `<p class="conv">Quy ước: ${qz.convention}</p>` : ''}
      <div class="lab">Phần ${q.part} · ${esc(q.section)}${q.type === 'tf' ? ' · Xét Đúng hoặc Sai' : ''}</div>
      <p class="stem"><b>Câu ${q.n}.</b>${q.stem}</p>
      ${body}
      <div id="fb">${fb}</div>
    </article>
    <nav class="nav">${prevBtn}<div class="r">${right}</div></nav>
    <p class="keys">Phím tắt: ${q.type === 'mc' ? 'A, B, C, D' : 'Đ (phím D), S'} để chọn · ← → để chuyển câu</p>
  </div>`;
  typeset(app);
  app.querySelectorAll('[data-pick]').forEach(b => b.addEventListener('click', () => pick(b.dataset.pick)));
  app.querySelectorAll('[data-nav]').forEach(b => b.addEventListener('click', () => nav(b.dataset.nav)));
  if (scrollTop) window.scrollTo(0, 0);
}
function pick(k) {
  const q = S.quiz.questions[S.cur];
  if (S.answers[q.n] || S.finished) return;
  S.answers[q.n] = k;
  save();
  if (counts(S.quiz, S.answers).left === 0) finalize();
  renderQuiz(false);
  const nb = app.querySelector('.nav .btn.primary'); if (nb) nb.focus({ preventScroll: true });
  const fb = document.getElementById('fb');
  if (fb && fb.getBoundingClientRect().bottom > innerHeight) fb.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
}
function nav(a) {
  const qs = S.quiz.questions;
  if (a === 'exit') { save(); return go('preface'); }
  if (a === 'result') return go('result-' + S.quiz.id);
  if (a === 'prev' && S.cur > 0) S.cur--;
  else if (a === 'next') {
    const nu = S.finished ? -1 : nextUnanswered(S.cur);
    S.cur = nu !== -1 && S.cur === qs.length - 1 ? nu : Math.min(S.cur + 1, qs.length - 1);
  } else if (a === 'skip') { const nu = nextUnanswered(S.cur); if (nu !== -1) S.cur = nu; }
  else return;
  save();
  renderQuiz(true);
}
document.addEventListener('keydown', e => {
  if (!S || modalRoot.firstElementChild || e.ctrlKey || e.metaKey || e.altKey) return;
  if (!/^#quiz-/.test(location.hash)) return;
  if (e.target.closest && e.target.closest('input,textarea,summary')) return;
  const q = S.quiz.questions[S.cur], k = e.key.toLowerCase();
  if (q.type === 'mc' && 'abcd'.includes(k) && k.length === 1) pick(k.toUpperCase());
  else if (q.type === 'tf' && (k === 'd' || k === 'đ')) pick('D');
  else if (q.type === 'tf' && k === 's') pick('S');
  else if (e.key === 'ArrowLeft') nav('prev');
  else if (e.key === 'ArrowRight') {
    if (S.finished) { if (S.cur < S.quiz.questions.length - 1) nav('next'); }
    else nav(S.answers[q.n] ? 'next' : 'skip');
  } else return;
  e.preventDefault();
});

/* ========== Trang kết quả và cột mốc ========== */
function renderResult(qz) {
  document.title = 'Kết quả · ' + qz.title;
  const h = history(qz.id).slice().reverse(); // mới nhất ở trên cùng
  const prog = store.get(kProg(qz.id));
  if (!h.length) {
    app.innerHTML = `<div class="wrap"><section class="res"><h1>Chưa có cột mốc</h1><p class="when">Hoàn thành bộ đề để lưu kết quả đầu tiên.</p>
      <div class="acts"><button class="btn" data-a="home">Về Preface</button><button class="btn primary" data-a="again">Làm bài</button></div></section></div>`;
  } else {
    const L = h[0];
    const row = (name, [ok, n]) => `<div class="row"><span>${name}</span><span class="meter"><i style="width:${pct(ok, n)}%"></i></span><span class="v">${ok}/${n}</span></div>`;
    const list = h.map((m, i) => `
      <div class="ms ${i === 0 ? 'new' : ''}">
        <div class="mini">${ringSVG(m.pct, 26, 6)}<span>${Math.round(m.pct)}%</span></div>
        <div>
          <div class="h">Lần ${h.length - i} · ${m.correct}/${m.total} câu đúng</div>
          <div class="d">${fmtDate(m.at)} · Sai ${m.wrong} · ${fmtDur(m.elapsed)}</div>
          <div class="d">Phần I ${m.parts.I[0]}/${m.parts.I[1]} · Phần II ${m.parts.II[0]}/${m.parts.II[1]} · ${Object.entries(m.chapters).map(([ch, v]) => `Ch. ${ch} ${v[0]}/${v[1]}`).join(' · ')}</div>
        </div>
        ${i === 0 ? '<span class="badge">Mới nhất</span>' : ICON_LOCK}
      </div>`).join('');
    app.innerHTML = `<div class="wrap">
      <section class="res">
        <h1>Kết quả</h1>
        <p class="when">${esc(qz.title)} · lần ${h.length} · ${fmtDate(L.at)}</p>
        <div class="ring" role="img" aria-label="Đúng ${fmtPct(L.pct)}">
          ${ringSVG(0, 96, 14)}
          <div class="in"><div class="pct">${fmtPct(L.pct)}</div><div class="sub">${L.correct}/${L.total} câu đúng</div></div>
        </div>
        <p class="muted" style="margin:0">Sai ${L.wrong} câu · thời gian làm ${fmtDur(L.elapsed)}</p>
        <div class="brk">
          ${row('Phần I', L.parts.I)}${row('Phần II', L.parts.II)}${Object.entries(L.chapters).map(([ch, v]) => row('Chương ' + ch, v)).join('')}
        </div>
        <div class="acts">
          <button class="btn" data-a="home">Về Preface</button>
          <button class="btn primary" data-a="again">${prog ? 'Tiếp tục bài đang làm' : 'Làm lại'}</button>
        </div>
      </section>
      <section class="hist" aria-labelledby="hist-t">
        <h2 id="hist-t">Các cột mốc</h2>
        <p class="note">Mỗi lần hoàn thành được lưu thành một cột mốc cố định, không chỉnh sửa hay xoá được. Mới nhất ở trên cùng.</p>
        ${list}
      </section>
    </div>`;
    // vẽ vòng tròn từ 0 lên kết quả
    const fg = app.querySelector('.ring .fg');
    const target = fg.dataset.c * (1 - L.pct / 100);
    requestAnimationFrame(() => requestAnimationFrame(() => { fg.style.strokeDashoffset = target; }));
  }
  app.querySelector('[data-a="home"]').addEventListener('click', () => go('preface'));
  app.querySelector('[data-a="again"]').addEventListener('click', () => {
    S = null;
    if (store.get(kProg(qz.id))) loadSession(qz); else newSession(qz);
    go('quiz-' + qz.id);
  });
  window.scrollTo(0, 0);
}

/* ========== Tải bộ đề từ file markdown (danh sách ở data/quizzes.js) ========== */
app.innerHTML = '<div class="wrap"><p class="front muted">Đang tải bộ đề…</p></div>';
const getText = u => fetch(u).then(r => { if (!r.ok) throw new Error(r.status + ' ' + u); return r.text(); });
Promise.all((window.TN_SOURCES || []).map(s =>
  Promise.all([getText(s.de), getText(s.da)])
    .then(([de, da]) => window.TNParse(s, de, da))
    .catch(e => { console.error(e); LOAD_ERR.push(s.de.split('/').pop()); return null; })
)).then(list => { QUIZZES = list.filter(Boolean); READY = true; route(); });
}
