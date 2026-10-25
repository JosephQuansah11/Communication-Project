/**
 * Import fidelity check.
 *
 * Re-reads a PowerPoint file straight from its OOXML and compares it with what
 * the importer produced: geometry per shape, and the text details that decide how
 * a slide actually looks (paragraph count, font size, weight, colour, highlight,
 * paragraph spacing, line spacing, body insets).
 *
 *   node scripts/check-import.mjs <file.pptx> [--slide 3] [--all]
 *
 * Every difference is printed with the file's value first and ours second, so a
 * report of "highlight 0/2" means the file has two highlighted runs and we
 * imported none. Exit code is 1 when something is off, so it can gate a release.
 */

import fs from 'node:fs';
import path from 'node:path';
import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import { importPptx } from '../server/pptx.js';
import { parseOnlineVideo } from '../shared/video.js';

const EMU_PER_PX = 9525;

/** Same parser settings as the importer, so both sides see the same tree. */
const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
});

const asArray = (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);
const px = (emu) => Math.round(((Number(emu) || 0) / EMU_PER_PX) * 100) / 100;
/** OOXML hundredths of a point → the point value the app stores. */
const pt = (value) => Math.round((Number(value) || 0)) / 100;
/** EMU → px, the unit the app uses for padding and indents. */
const emuPx = (value) => Math.round(((Number(value) || 0) / EMU_PER_PX) * 10) / 10;

const nameOf = (node) =>
  node?.nvSpPr?.cNvPr?.['@_name'] ||
  node?.nvPicPr?.cNvPr?.['@_name'] ||
  node?.nvGraphicFramePr?.cNvPr?.['@_name'] ||
  node?.nvGrpSpPr?.cNvPr?.['@_name'] ||
  node?.nvCxnSpPr?.cNvPr?.['@_name'] ||
  '';

const colorOf = (node) =>
  node?.srgbClr?.['@_val'] ? `#${String(node.srgbClr['@_val']).toLowerCase()}` : node?.schemeClr ? `theme:${node.schemeClr['@_val']}` : null;

/** The text details of one shape, straight from the file. */
function textInfo(node) {
  const txBody = node?.txBody;
  if (!txBody?.p) return null;
  const paragraphs = asArray(txBody.p);
  const info = {
    paragraphs: paragraphs.length,
    lines: paragraphs.length + paragraphs.reduce((total, paragraph) => total + asArray(paragraph.br).length, 0),
    hasText: paragraphs.some((paragraph) => asArray(paragraph.r).some((run) => String(run.t ?? '').trim())),
    sizes: [],
    bold: 0,
    italic: 0,
    colors: [],
    highlights: [],
    bullets: 0,
    spcBef: 0,
    spcAft: 0,
    lineSpacing: 0,
    anchor: txBody.bodyPr?.['@_anchor'] === 'ctr' ? 'middle' : txBody.bodyPr?.['@_anchor'] === 'b' ? 'bottom' : 'top',
    insets: {
      l: emuPx(txBody.bodyPr?.['@_lIns'] ?? 91440),
      t: emuPx(txBody.bodyPr?.['@_tIns'] ?? 45720),
      r: emuPx(txBody.bodyPr?.['@_rIns'] ?? 91440),
      b: emuPx(txBody.bodyPr?.['@_bIns'] ?? 45720),
    },
    autofit: txBody.bodyPr?.normAutofit ? 'norm' : txBody.bodyPr?.spAutoFit ? 'sp' : null,
    fontScale: txBody.bodyPr?.normAutofit?.['@_fontScale']
      ? Number(txBody.bodyPr.normAutofit['@_fontScale']) / 1000
      : 100,
  };
  for (const paragraph of paragraphs) {
    const pPr = paragraph.pPr || {};
    const positive = (node) => (Number(node?.['@_val']) || 0) > 0;
    if (pPr.buChar || pPr.buAutoNum) info.bullets += 1;
    if (positive(pPr.spcBef?.spcPts)) info.spcBef += 1;
    if (positive(pPr.spcAft?.spcPts)) info.spcAft += 1;
    if (pPr.lnSpc) info.lineSpacing += 1;
    for (const run of asArray(paragraph.r)) {
      const rPr = run.rPr || pPr.defRPr || {};
      if (rPr['@_sz']) info.sizes.push(pt(rPr['@_sz']) * (info.fontScale / 100));
      if (rPr['@_b'] === '1') info.bold += 1;
      if (rPr['@_i'] === '1') info.italic += 1;
      const color = colorOf(rPr.solidFill);
      if (color) info.colors.push(color);
      const highlight = colorOf(rPr.highlight);
      if (highlight) info.highlights.push(highlight);
    }
  }
  return info;
}

/**
 * Every shape of a slide as the file defines it: absolute position and size, with
 * group transforms applied exactly as the format specifies.
 */
function expectedShapes(spTree, rels = {}) {
  const out = [];
  const walk = (container, transform) => {
    const children = [];
    for (const key of ['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp']) {
      for (const node of asArray(container[key])) children.push({ kind: key, node });
    }
    for (const { kind, node } of children) {
      if (kind === 'grpSp') {
        const xfrm = node.grpSpPr?.xfrm;
        let next = transform;
        if (xfrm?.off && xfrm?.ext && xfrm.chOff && xfrm.chExt) {
          const childW = px(xfrm.chExt['@_cx']) || 1;
          const childH = px(xfrm.chExt['@_cy']) || 1;
          next = {
            ox: transform.ox + px(xfrm.off['@_x']),
            oy: transform.oy + px(xfrm.off['@_y']),
            sx: transform.sx * (px(xfrm.ext['@_cx']) / childW),
            sy: transform.sy * (px(xfrm.ext['@_cy']) / childH),
            cx: px(xfrm.chOff['@_x']),
            cy: px(xfrm.chOff['@_y']),
          };
        }
        walk(node, next);
        continue;
      }
      const xfrm = node.spPr?.xfrm || node.graphicFrame?.xfrm || node.xfrm;
      const text = textInfo(node);
      const base = { kind, name: nameOf(node), text };
      // A SmartArt frame draws nothing itself: its shapes live in the diagram
      // drawing, which the importer walks into this same box.
      if (kind === 'graphicFrame' && node.graphic?.graphicData?.relIds) base.diagram = true;
      if (kind === 'sp' && invisibleShape(node, text)) base.invisible = true;
      if (kind === 'pic') {
        // A picture that links to a video on the web (a YouTube or Vimeo insert).
        const nvPr = node.nvPicPr?.nvPr || {};
        const mediaNode =
          nvPr.videoFile || nvPr.audioFile || nvPr.media || asArray(nvPr.extLst?.ext).map((ext) => ext.media).find(Boolean);
        const relId =
          mediaNode?.['@_r:link'] || mediaNode?.['@_link'] || mediaNode?.['@_r:embed'] || mediaNode?.['@_embed'];
        const rel = relId ? rels[relId] : null;
        if (rel?.external) base.onlineVideo = rel.target;
      }
      if (!xfrm?.off || !xfrm?.ext) {
        // No geometry of its own: PowerPoint falls back to the layout placeholder.
        out.push({ ...base, inherited: true });
        continue;
      }
      out.push({
        ...base,
        x: transform.ox + (px(xfrm.off['@_x']) - transform.cx) * transform.sx,
        y: transform.oy + (px(xfrm.off['@_y']) - transform.cy) * transform.sy,
        w: px(xfrm.ext['@_cx']) * transform.sx,
        h: px(xfrm.ext['@_cy']) * transform.sy,
        rotation: (Number(xfrm['@_rot']) || 0) / 60000,
      });
    }
  };
  walk(spTree, { ox: 0, oy: 0, sx: 1, sy: 1, cx: 0, cy: 0 });
  return out;
}

const round1 = (value) => Math.round((Number(value) || 0) * 10) / 10;

/** The theme's default shape look, which shapes with no formatting inherit. */
let themeShapeStyle = null;

/**
 * True when PowerPoint itself would draw nothing: no text, no fill and no line.
 * Such shapes are legitimately absent from the import, so they are not reported.
 */
function invisibleShape(node, text) {
  if (text?.hasText) return false;
  const spPr = node.spPr || {};
  if (spPr.blipFill !== undefined) return false;
  const isTextBox = node.nvSpPr?.cNvSpPr?.['@_txBox'] === '1';
  const style = node.style || (isTextBox ? null : themeShapeStyle);
  const hasRef = (ref) => ref && String(ref['@_idx'] || '0') !== '0';
  const filled =
    spPr.grpFill !== undefined ||
    spPr.solidFill !== undefined ||
    spPr.gradFill !== undefined ||
    spPr.pattFill !== undefined ||
    (spPr.noFill === undefined && hasRef(style?.fillRef));
  const lined =
    (spPr.ln !== undefined && spPr.ln.noFill === undefined) || (spPr.ln === undefined && hasRef(style?.lnRef));
  return !filled && !lined;
}

/**
 * The imported element that best matches an expected shape. Position and size both
 * count, so a shape is never paired with an unrelated one that happens to sit
 * nearby; `MISSING_SCORE` marks a pairing that is too poor to be the same object.
 */
const MISSING_SCORE = 80;

function match(expected, actuals, used = new Set()) {
  let best = null;
  let bestScore = Infinity;
  for (const element of actuals) {
    if (used.has(element)) continue;
    const dx = element.x + element.w / 2 - (expected.x + expected.w / 2);
    const dy = element.y + element.h / 2 - (expected.y + expected.h / 2);
    const score = Math.hypot(dx, dy) + Math.abs(element.w - expected.w) * 0.5 + Math.abs(element.h - expected.h) * 0.5;
    if (score < bestScore) {
      bestScore = score;
      best = element;
    }
  }
  return { element: best, score: bestScore };
}

const near = (a, b, tolerance = 1.5) => Math.abs(round1(a) - round1(b)) <= tolerance;

/** Text details of an imported element, in the same shape as `textInfo`. */
function importedText(element) {
  const runs = element.runs || [];
  const html = String(element.html || '');
  const paragraphs = String(element.text || '').split('\n').length;
  const styles = runs.filter((run) => run.text && run.text.trim());
  const spacing = (html.match(/(margin|line-height):/g) || []).length;
  return {
    paragraphs,
    sizes: styles.map((run) => run.fontSize).filter((value) => value !== undefined),
    bold: styles.filter((run) => run.bold).length,
    italic: styles.filter((run) => run.italic).length,
    highlights: styles.map((run) => run.highlight).filter(Boolean),
    bullets: runs.filter((run) => run.marker).length,
    spacing,
    anchor: element.style?.valign || 'top',
    padding: element.paddingInsets ? element.paddingInsets.left : element.padding,
    autofit: element.style?.autofit || null,
    html: Boolean(element.html),
  };
}

/** Slide order exactly as the package declares it. */
async function slideParts(zip) {
  const presentation = parser.parse(await zip.file('ppt/presentation.xml').async('string')).presentation || {};
  const relsXml = await zip.file('ppt/_rels/presentation.xml.rels').async('string');
  const rels = parser.parse(relsXml).Relationships?.Relationship || [];
  const targets = new Map();
  for (const rel of asArray(rels)) {
    if (rel['@_Target']) targets.set(rel['@_Id'], String(rel['@_Target']).replace(/^\/?ppt\//, '').replace(/^\.\.\//, ''));
  }
  const parts = [];
  for (const entry of asArray(presentation.sldIdLst?.sldId)) {
    const target = targets.get(entry['@_r:id'] || entry['@_id']);
    if (target) parts.push(`ppt/${target}`);
  }
  return parts;
}

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/check-import.mjs <file.pptx> [--slide N]');
  process.exit(2);
}
const slideArg = process.argv.indexOf('--slide');
const onlySlide = slideArg >= 0 ? Number(process.argv[slideArg + 1]) : null;

const buffer = fs.readFileSync(file);
const zip = await JSZip.loadAsync(buffer);
const parts = await slideParts(zip);
const themeXml = (await zip.file('ppt/theme/theme1.xml')?.async('string')) || null;
if (themeXml) {
  const spDefStyle = parser.parse(themeXml)?.theme?.objectDefaults?.spDef?.style;
  if (spDefStyle?.fillRef || spDefStyle?.lnRef) {
    themeShapeStyle = { fillRef: spDefStyle.fillRef, lnRef: spDefStyle.lnRef };
  }
}
const imported = await importPptx(buffer, async (ext, _data, baseName) => `/media/${baseName}${ext}`);

const problems = [];
const notes = [];
let totalShapes = 0;
let totalMismatches = 0;

console.log(`file: ${path.basename(file)} — ${imported.width}×${imported.height}, ${parts.length} slides`);

for (const [index, part] of parts.entries()) {
  if (onlySlide !== null && index + 1 !== onlySlide) continue;
  const slide = imported.slides[index];
  if (!slide) {
    problems.push(`slide ${index + 1}: missing from the import`);
    continue;
  }
  const document = parser.parse(await zip.file(part).async('string'));
  const relsXml = await zip.file(`ppt/slides/_rels/${path.basename(part)}.rels`)?.async('string');
  const rels = {};
  for (const rel of asArray(parser.parse(relsXml || '<Relationships/>').Relationships?.Relationship)) {
    if (rel?.['@_Id']) rels[rel['@_Id']] = { target: rel['@_Target'], external: rel['@_TargetMode'] === 'External' };
  }
  const expected = expectedShapes(document.sld?.cSld?.spTree || {}, rels);
  const actual = slide.elements || [];
  totalShapes += expected.length;
  const used = new Set();
  const lines = [];

  for (const shape of expected) {
    if (shape.inherited) {
      notes.push(`slide ${index + 1}: "${shape.name}" has no geometry of its own (inherits the layout placeholder)`);
      continue;
    }
    if (shape.diagram) {
      // The diagram's own shapes should fill the frame's box: check both that they
      // exist and that they land inside it.
      const inside = actual.filter(
        (element) =>
          !used.has(element) &&
          element.x + element.w / 2 >= shape.x - 2 &&
          element.x + element.w / 2 <= shape.x + shape.w + 2 &&
          element.y + element.h / 2 >= shape.y - 2 &&
          element.y + element.h / 2 <= shape.y + shape.h + 2
      );
      inside.forEach((element) => used.add(element));
      if (inside.length < 2) {
        totalMismatches += 1;
        lines.push(`  MISSING  graphicFrame "${shape.name}" — SmartArt with ${inside.length} shapes imported`);
        continue;
      }
      const left = Math.min(...inside.map((element) => element.x));
      const top = Math.min(...inside.map((element) => element.y));
      const right = Math.max(...inside.map((element) => element.x + element.w));
      const bottom = Math.max(...inside.map((element) => element.y + element.h));
      const spread = [
        Math.abs(left - shape.x) > 4 ? `left ${round1(shape.x)}/${round1(left)}` : null,
        Math.abs(top - shape.y) > 4 ? `top ${round1(shape.y)}/${round1(top)}` : null,
        Math.abs(right - (shape.x + shape.w)) > 8 ? `right ${round1(shape.x + shape.w)}/${round1(right)}` : null,
        Math.abs(bottom - (shape.y + shape.h)) > 8 ? `bottom ${round1(shape.y + shape.h)}/${round1(bottom)}` : null,
      ].filter(Boolean);
      if (spread.length) {
        totalMismatches += 1;
        lines.push(`  DIFF     graphicFrame "${String(shape.name).slice(0, 22)}" SmartArt extent ${spread.join(' | ')}`);
      } else {
        notes.push(`slide ${index + 1}: SmartArt "${shape.name}" imported as ${inside.length} shapes`);
      }
      continue;
    }
    if (shape.invisible) {
      notes.push(`slide ${index + 1}: "${shape.name}" has no fill, no line and no text (invisible in PowerPoint too)`);
      continue;
    }
    const { element, score } = match(shape, actual, used);
    if (!element || score > MISSING_SCORE) {
      lines.push(`  MISSING  ${shape.kind.padEnd(12)} "${shape.name}" (${round1(shape.w)}×${round1(shape.h)} at ${round1(shape.x)},${round1(shape.y)})`);
      totalMismatches += 1;
      continue;
    }
    used.add(element);
    const geometry = [
      !near(shape.x, element.x) ? `x ${round1(shape.x)}/${round1(element.x)}` : null,
      !near(shape.y, element.y) ? `y ${round1(shape.y)}/${round1(element.y)}` : null,
      !near(shape.w, element.w) ? `w ${round1(shape.w)}/${round1(element.w)}` : null,
      !near(shape.h, element.h) ? `h ${round1(shape.h)}/${round1(element.h)}` : null,
    ].filter(Boolean);
    const typeOk = shape.text ? element.type === 'text' : shape.kind === 'pic' ? ['image', 'video', 'audio'].includes(element.type) : true;
    const details = [];
    if (!typeOk) details.push(`type ${shape.text ? 'text' : shape.kind}/${element.type}`);
    if (shape.onlineVideo) {
      // The link has to survive as a playable video, not as a still picture.
      const expected = parseOnlineVideo(shape.onlineVideo)?.watchUrl || shape.onlineVideo;
      if (element.type !== 'video') details.push(`online video imported as ${element.type}`);
      else if (element.src !== expected) details.push(`online video ${expected}/${element.src}`);
      else if (!element.expandable) details.push('online video is not expandable');
    }
    if (shape.text) {
      const mine = importedText(element);
      if (shape.text.lines !== mine.paragraphs) details.push(`lines ${shape.text.lines}/${mine.paragraphs}`);
      const fileSizes = [...new Set(shape.text.sizes)];
      const mineSizes = [...new Set(mine.sizes)];
      if (fileSizes.length && mineSizes.length && (Math.min(...fileSizes) !== Math.min(...mineSizes) || Math.max(...fileSizes) !== Math.max(...mineSizes))) {
        details.push(`font ${Math.min(...fileSizes)}–${Math.max(...fileSizes)}/${Math.min(...mineSizes)}–${Math.max(...mineSizes)}`);
      }
      if (shape.text.bold !== mine.bold) details.push(`bold runs ${shape.text.bold}/${mine.bold}`);
      if (shape.text.italic !== mine.italic) details.push(`italic runs ${shape.text.italic}/${mine.italic}`);
      if (shape.text.highlights.length !== mine.highlights.length) {
        details.push(`highlighted runs ${shape.text.highlights.length}/${mine.highlights.length}`);
      }
      if (shape.text.bullets !== mine.bullets) details.push(`bullet paragraphs ${shape.text.bullets}/${mine.bullets}`);
      const fileSpacing = shape.text.spcBef + shape.text.spcAft + shape.text.lineSpacing;
      if ((fileSpacing > 0) !== (mine.spacing > 0)) {
        details.push(`paragraph spacing ${fileSpacing}/${mine.spacing}`);
      }
      if (shape.text.anchor !== mine.anchor) details.push(`anchor ${shape.text.anchor}/${mine.anchor}`);
      const insets = shape.text.insets;
      if (mine.padding !== undefined && !near(insets.l, mine.padding, 2)) {
        details.push(`inset l ${insets.l}/${mine.padding}`);
      }
    }
    if (geometry.length || details.length) {
      totalMismatches += 1;
      lines.push(
        `  DIFF     ${shape.kind.padEnd(12)} "${String(shape.name).slice(0, 22).padEnd(22)}" ${[...geometry, ...details].join(' | ')}`
      );
    }
  }

  for (const element of actual) {
    if (used.has(element)) continue;
    notes.push(`slide ${index + 1}: imported "${element.name || element.type}" at (${round1(element.x)},${round1(element.y)}) has no shape in the file (layout/master design or synthesised)`);
  }

  const header = `slide ${index + 1} (${part}): ${expected.length} shapes in the file, ${actual.length} imported`;
  if (lines.length) {
    console.log(`\n${header}`);
    console.log(lines.join('\n'));
  } else {
    console.log(`${header} — OK`);
  }
}

if (notes.length) {
  console.log('\nnotes:');
  for (const note of notes.slice(0, 40)) console.log(`  ${note}`);
  if (notes.length > 40) console.log(`  … and ${notes.length - 40} more`);
}

if (problems.length) {
  console.log('\nproblems:');
  for (const problem of problems) console.log(`  ${problem}`);
}

console.log(`\n${totalShapes} shapes checked, ${totalMismatches} with differences`);
process.exitCode = totalMismatches || problems.length ? 1 : 0;


