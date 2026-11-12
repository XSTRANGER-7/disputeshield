'use strict';
/**
 * Minimal PDF writer (no dependencies): Letter pages, Helvetica, word wrap, multiple pages.
 * Used to attach an evidence summary file to provide-evidence.
 */

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 56;

// Approximate Helvetica widths (per 1000 em) for wrapping; good enough for Latin text.
const NARROW = new Set('il.,:;\'|!()[]tfjrI1 '.split(''));
const WIDE = new Set('mwMW@%'.split(''));
function textWidth(str, size, bold) {
  let w = 0;
  for (const ch of str) w += NARROW.has(ch) ? 300 : WIDE.has(ch) ? 850 : ch >= 'A' && ch <= 'Z' ? 680 : 540;
  return (w * size * (bold ? 1.06 : 1)) / 1000;
}

function toLatin1(s) {
  return String(s == null ? '' : s)
    .replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/…/g, '...').replace(/ /g, ' ')
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '?');
}

const escapePdf = (s) => s.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

function wrap(text, size, bold, maxWidth) {
  const out = [];
  for (const para of toLatin1(text).split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { out.push(''); continue; }
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (textWidth(next, size, bold) <= maxWidth) { line = next; continue; }
      if (line) out.push(line);
      // Hard-break words longer than a line (ids, URLs).
      let w = word;
      while (textWidth(w, size, bold) > maxWidth) {
        let cut = w.length;
        while (cut > 1 && textWidth(w.slice(0, cut), size, bold) > maxWidth) cut -= 1;
        out.push(w.slice(0, cut));
        w = w.slice(cut);
      }
      line = w;
    }
    if (line) out.push(line);
  }
  return out;
}

/**
 * blocks: [{ type: 'title'|'meta'|'heading'|'text'|'kv'|'rule', text, key, value }]
 * returns Buffer
 */
function render(blocks) {
  const pages = [];
  let ops = [];
  let y = PAGE_H - MARGIN;
  const newPage = () => { if (ops.length) pages.push(ops); ops = []; y = PAGE_H - MARGIN; };
  const ensure = (h) => { if (y - h < MARGIN) newPage(); };
  const draw = (x, size, bold, str, gray = 0) => {
    ops.push(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${gray ? `${gray} g ` : '0 g '}1 0 0 1 ${x.toFixed(2)} ${y.toFixed(2)} Tm (${escapePdf(str)}) Tj ET`);
  };
  const width = PAGE_W - MARGIN * 2;

  for (const b of blocks) {
    if (b.type === 'title') { ensure(30); y -= 20; draw(MARGIN, 18, true, toLatin1(b.text)); y -= 8; continue; }
    if (b.type === 'meta') { for (const l of wrap(b.text, 9, false, width)) { ensure(13); y -= 12; draw(MARGIN, 9, false, l, 0.35); } continue; }
    if (b.type === 'rule') { ensure(14); y -= 8; ops.push(`0.8 G 0.6 w ${MARGIN} ${y.toFixed(2)} m ${PAGE_W - MARGIN} ${y.toFixed(2)} l S`); y -= 4; continue; }
    if (b.type === 'heading') { ensure(34); y -= 22; draw(MARGIN, 12, true, toLatin1(b.text)); y -= 4; continue; }
    if (b.type === 'text') { for (const l of wrap(b.text, 10, false, width)) { ensure(14); y -= 14; draw(MARGIN, 10, false, l); } y -= 2; continue; }
    if (b.type === 'kv') {
      const keyW = 150;
      const lines = wrap(b.value, 10, false, width - keyW);
      ensure(14 * Math.min(lines.length, 3));
      y -= 14;
      draw(MARGIN, 10, true, toLatin1(b.key), 0.25);
      lines.forEach((l, i) => { if (i) { ensure(14); y -= 14; } ops.push(`BT /F1 10 Tf 0 g 1 0 0 1 ${(MARGIN + keyW).toFixed(2)} ${y.toFixed(2)} Tm (${escapePdf(l)}) Tj ET`); });
    }
  }
  newPage();

  // Assemble objects: 1 catalog, 2 pages, 3 font, 4 bold font, then page + content pairs.
  const objects = [];
  const kids = pages.map((_, i) => `${5 + i * 2} 0 R`).join(' ');
  objects.push('<< /Type /Catalog /Pages 2 0 R >>');
  objects.push(`<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`);
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
  pages.forEach((pageOps, i) => {
    const footer = `BT /F1 8 Tf 0.45 g 1 0 0 1 ${MARGIN} 30 Tm (${escapePdf(`Page ${i + 1} of ${pages.length}`)}) Tj ET`;
    const stream = Buffer.from([...pageOps, footer].join('\n'), 'latin1');
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6 + i * 2} 0 R >>`);
    objects.push({ stream });
  });

  const chunks = [Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
  let offset = chunks[0].length;
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(offset);
    const head = Buffer.from(`${i + 1} 0 obj\n`, 'latin1');
    const body = typeof obj === 'string'
      ? Buffer.from(`${obj}\nendobj\n`, 'latin1')
      : Buffer.concat([Buffer.from(`<< /Length ${obj.stream.length} >>\nstream\n`, 'latin1'), obj.stream, Buffer.from('\nendstream\nendobj\n', 'latin1')]);
    chunks.push(head, body);
    offset += head.length + body.length;
  });
  const xref = [`xref\n0 ${objects.length + 1}\n`, '0000000000 65535 f \n', ...offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`)].join('');
  chunks.push(Buffer.from(`${xref}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${offset}\n%%EOF\n`, 'latin1'));
  return Buffer.concat(chunks);
}

module.exports = { render, wrap };
