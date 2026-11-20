// Đọc file đề + file đáp án (markdown) thành dữ liệu bộ đề.
// Định dạng theo mẫu TracNghiem_Ch9-10_DeBai.md / TracNghiem_Ch9-10_DapAn.md.
{
/* \frac -> \dfrac ở cấp ngoài cùng; phân số lồng bên trong tử/mẫu -> a/b */
function readArg(s, i) {
  while (s[i] === ' ') i++;
  if (s[i] === '{') {
    let d = 0, j = i;
    for (; j < s.length; j++) {
      if (s[j] === '{') d++;
      else if (s[j] === '}') { d--; if (d === 0) break; }
    }
    return [s.slice(i + 1, j), j + 1];
  }
  if (s[i] === '\\') {
    const m = /^\\[a-zA-Z]+/.exec(s.slice(i));
    if (m) return [m[0], i + m[0].length];
  }
  return [s[i] || '', i + 1];
}
const isAtom = a => /^([A-Za-z0-9.]|\\[a-zA-Z]+|[0-9]+|[A-Za-z](_\{?[A-Za-z0-9,]+\}?)?)$/.test(a.trim());
function fracs(s, depth = 0) {
  let out = '', i = 0, m;
  const re = /\\[dt]?frac(?![a-zA-Z])/g;
  while ((m = re.exec(s))) {
    out += s.slice(i, m.index);
    let [a, j] = readArg(s, m.index + m[0].length);
    let [b, k] = readArg(s, j);
    a = fracs(a, depth + 1); b = fracs(b, depth + 1);
    out += depth === 0 ? `\\dfrac{${a}}{${b}}`
      : `${isAtom(a) ? a : '(' + a + ')'}/${isAtom(b) ? b : '(' + b + ')'}`;
    i = k; re.lastIndex = k;
  }
  return out + s.slice(i);
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function md(text) {
  return text.split(/(\$[^$]+\$)/g).map(p => {
    if (p.length > 1 && p[0] === '$' && p[p.length - 1] === '$')
      return `<span class="m">${esc(fracs(p.slice(1, -1)))}</span>`;
    return esc(p)
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/(^|[^*])\*([^*\s][^*]*?)\*/g, '$1<em>$2</em>');
  }).join('').trim();
}

window.TNParse = function (src, deText, daText) {
  const qs = [];
  let part = 'I', section = '', heading = '', source = '', convention = '', m;
  for (const l of deText.replace(/\r/g, '').split('\n')) {
    if ((m = /^# (.+)/.exec(l))) heading = m[1];
    else if (l.startsWith('**Căn cứ:**')) source = md(l.replace('**Căn cứ:**', ''));
    else if (l.startsWith('**Quy ước:**')) convention = md(l.replace('**Quy ước:**', ''));
    else if (/^## PHẦN II/.test(l)) part = 'II';
    else if ((m = /^### (.+)/.exec(l))) section = m[1].trim();
    else if ((m = /^\*\*Câu (\d+)\.\*\*\s*(.*)$/.exec(l)))
      qs.push({ n: +m[1], type: part === 'I' ? 'mc' : 'tf', part, section,
        chapter: +((/Chương (\d+)/.exec(section) || [])[1] || 0), stem: md(m[2]), options: [] });
    else if ((m = /^- \*\*([A-D])\.\*\*\s*(.*)$/.exec(l)) && qs.length)
      qs[qs.length - 1].options.push({ k: m[1], html: md(m[2]) });
  }
  const byN = Object.fromEntries(qs.map(q => [q.n, q]));
  let cur = null, inWrong = false;
  for (const l of daText.replace(/\r/g, '').split('\n')) {
    if ((m = /^### Câu (\d+)\. Đáp án \*\*([A-D])\*\*/.exec(l))) {
      cur = byN[+m[1]] || null; if (cur) { cur.answer = m[2]; cur.wrong = {}; } inWrong = false;
    } else if ((m = /^### Câu (\d+)\. \*\*(ĐÚNG|SAI)\*\*/.exec(l))) {
      cur = byN[+m[1]] || null; if (cur) cur.answer = m[2] === 'ĐÚNG' ? 'D' : 'S'; inWrong = false;
    } else if (!cur) continue;
    else if ((m = /^\*(Module [^*]+)\*$/.exec(l))) cur.module = m[1];
    else if (l.startsWith('**Vì sao đúng.**')) cur.why = md(l.replace('**Vì sao đúng.**', ''));
    else if (l.startsWith('**Vì sao các phương án khác sai.**')) inWrong = true;
    else if (inWrong && (m = /^- \*\*([A-D])\.\*\*\s*(.*)$/.exec(l))) cur.wrong[m[1]] = md(m[2]);
    else if (l.startsWith('**Diễn giải.**')) cur.explain = md(l.replace('**Diễn giải.**', ''));
    else if (l.startsWith('**Phát biểu đúng.**')) cur.fix = md(l.replace('**Phát biểu đúng.**', ''));
  }
  const missing = qs.filter(q => !q.answer).map(q => q.n);
  if (missing.length) console.warn(src.de + ': thiếu đáp án cho câu ' + missing.join(', '));
  return {
    id: src.id, course: src.course, meta: src.meta || '',
    title: src.de.split('/').pop().replace(/\.md$/i, ''),
    heading, source, convention, questions: qs.filter(q => q.answer),
  };
};
}
