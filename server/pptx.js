import JSZip from 'jszip';
import { XMLParser } from 'fast-xml-parser';
import path from 'node:path';
import crypto from 'node:crypto';

/**
 * Native PPTX importer.
 *
 * Parses the OOXML presentation package without any external office runtime:
 * slide order, theme colours, shape trees (including nested groups), text runs,
 * tables, pictures, audio and video. Coordinates are converted from EMU to
 * CSS pixels (96 dpi).
 */

const EMU_PER_PX = 9525;

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_',
  removeNSPrefix: true,
  trimValues: true,
  parseTagValue: false,
  parseAttributeValue: false,
  allowBooleanAttributes: true,
});

export class ImportError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

const asArray = (value) => (value === undefined || value === null ? [] : Array.isArray(value) ? value : [value]);
const px = (emu) => Math.round(((Number(emu) || 0) / EMU_PER_PX) * 100) / 100;
const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const SHAPE_MAP = {
  rect: 'rect',
  roundRect: 'roundRect',
  ellipse: 'ellipse',
  triangle: 'triangle',
  rtTriangle: 'triangle',
  diamond: 'diamond',
  star5: 'star5',
  star4: 'star4',
  hexagon: 'hexagon',
  pentagon: 'pentagon',
  chevron: 'chevron',
  rightArrow: 'rightArrow',
  leftArrow: 'leftArrow',
  upArrow: 'upArrow',
  downArrow: 'downArrow',
  parallelogram: 'parallelogram',
  trapezoid: 'trapezoid',
  plus: 'plus',
  homePlate: 'pentagon',
  donut: 'ellipse',
  flowChartProcess: 'rect',
  flowChartDecision: 'diamond',
  flowChartTerminator: 'roundRect',
};

function readColor(node, theme, fallback = null) {
  if (!node) return fallback;
  const srgb = node.srgbClr;
  if (srgb?.['@_val']) return normalizeHex(srgb['@_val']);
  const scheme = node.schemeClr;
  if (scheme?.['@_val']) {
    const mapped = theme.colors?.[scheme['@_val']];
    return mapped || fallback;
  }
  const sys = node.sysClr;
  if (sys?.['@_lastClr']) return normalizeHex(sys['@_lastClr']);
  const scrgb = node.scrGbClr;
  if (scrgb) {
    const r = Math.round((Number(scrgb['@_r']) || 0) / 100000 * 255);
    const g = Math.round((Number(scrgb['@_g']) || 0) / 100000 * 255);
    const b = Math.round((Number(scrgb['@_b']) || 0) / 100000 * 255);
    return rgbToHex(r, g, b);
  }
  if (node.gradFill) {
    const stops = asArray(node.gradFill.gsLst?.gs);
    const first = stops[0];
    if (first) return readColor(first, theme, fallback);
  }
  if (node.prstClr) return presetColor(node.prstClr['@_val']) || fallback;
  return fallback;
}

function normalizeHex(value) {
  const raw = String(value || '').replace(/^#/, '').toUpperCase();
  if (/^[0-9A-F]{6}$/.test(raw)) return `#${raw}`;
  if (/^[0-9A-F]{8}$/.test(raw)) return `#${raw.slice(2)}`;
  if (/^[0-9A-F]{3}$/.test(raw)) return `#${raw.split('').map((c) => c + c).join('')}`;
  return null;
}

function rgbToHex(r, g, b) {
  return `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, '0')).join('')}`;
}

function presetColor(val) {
  const map = {
    black: '#000000', white: '#FFFFFF', red: '#FF0000', green: '#00B050', blue: '#0070C0',
    yellow: '#FFFF00', orange: '#FFA500', gray: '#808080', grey: '#808080', darkGray: '#404040',
  };
  return map[val] || null;
}

function parseTheme(xmlText) {
  const theme = { colors: {}, majorFont: 'system-ui', minorFont: 'system-ui' };
  if (!xmlText) return theme;
  const xml = parser.parse(xmlText);
  const scheme = xml?.theme?.themeElements?.clrScheme;
  if (scheme) {
    for (const key of ['dk1', 'lt1', 'dk2', 'lt2', 'accent1', 'accent2', 'accent3', 'accent4', 'accent5', 'accent6', 'hlink', 'folHlink']) {
      const value = readColor(scheme[key], { colors: {} }, null);
      if (value) theme.colors[key] = value;
    }
  }
  const fontScheme = xml?.theme?.themeElements?.fontScheme;
  if (fontScheme) {
    theme.majorFont = fontScheme.majorFont?.latin?.['@_typeface'] || 'system-ui';
    theme.minorFont = fontScheme.minorFont?.latin?.['@_typeface'] || 'system-ui';
  }
  return theme;
}

function readXfrm(node) {
  const xfrm = node?.xfrm;
  if (!xfrm) return null;
  const off = xfrm.off;
  const ext = xfrm.ext;
  if (!off || !ext) return null;
  return {
    x: px(off['@_x']),
    y: px(off['@_y']),
    w: px(ext['@_cx']),
    h: px(ext['@_cy']),
    rot: (Number(xfrm['@_rot']) || 0) / 60000,
    flipH: xfrm['@_flipH'] === '1' || xfrm['@_flipH'] === 'true',
    flipV: xfrm['@_flipV'] === '1' || xfrm['@_flipV'] === 'true',
  };
}

function parseRunStyle(rPr, theme) {
  const style = {};
  if (!rPr) return style;
  if (rPr['@_sz']) style.fontSize = Number(String(rPr['@_sz']).replace(/[^\d]/g, '')) / 100;
  if (rPr['@_b'] === '1') style.bold = true;
  if (rPr['@_i'] === '1') style.italic = true;
  if (rPr['@_u'] && rPr['@_u'] !== 'none') style.underline = true;
  if (rPr['@_strike'] && rPr['@_strike'] !== 'noStrike') style.strike = true;
  const color = readColor(rPr.solidFill, theme);
  if (color) style.color = color;
  const latin = rPr.latin?.['@_typeface'];
  if (latin) style.fontFamily = latin;
  return style;
}

function mapAlign(algn) {
  switch (algn) {
    case 'ctr': return 'center';
    case 'r': return 'right';
    case 'just': return 'justify';
    default: return 'left';
  }
}

function paragraphsFromTextBody(txBody, theme) {
  const paragraphs = asArray(txBody?.p);
  const lines = [];
  const runs = [];
  let firstStyle = {};
  let alignment = null;

  for (const paragraph of paragraphs) {
    const pPr = paragraph.pPr || {};
    if (pPr['@_algn'] && !alignment) alignment = pPr['@_algn'];
    const bullet = Boolean(pPr.buChar || pPr.buAutoNum);
    const parts = [];
    for (const node of asArray(paragraph.r || paragraph.fld)) {
      const rPr = node.rPr || node.fldPr;
      const style = parseRunStyle(rPr, theme);
      if (!Object.keys(firstStyle).length && Object.keys(style).length) firstStyle = style;
      const text = node.t ?? node.fld?.['#text'] ?? '';
      parts.push({ text: String(text), style });
    }
    const breakCount = asArray(paragraph.br).length;
    let line;
    if (breakCount > 0 && parts.length > 1) {
      line = parts.map((part) => part.text).join('\n'.repeat(breakCount));
    } else {
      line = parts.map((part) => part.text).join('') + '\n'.repeat(breakCount);
    }
    for (let index = 0; index < parts.length; index++) {
      runs.push({ text: parts[index].text, ...parts[index].style });
      if (index < parts.length - 1) {
        for (let b = 0; b < breakCount; b++) runs.push({ text: '\n' });
      }
    }
    if (paragraph.endParaRPr) {
      const style = parseRunStyle(paragraph.endParaRPr, theme);
      if (!Object.keys(firstStyle).length && Object.keys(style).length) firstStyle = style;
      if (paragraph.endParaRPr['@_sz'] && !firstStyle.fontSize) {
        firstStyle.fontSize = Number(paragraph.endParaRPr['@_sz']) / 100;
      }
    }
    lines.push((bullet ? '\u2022 ' : '') + line);
  }

  return {
    text: lines.join('\n').replace(/\u000B/g, '\n'),
    style: firstStyle,
    alignment: mapAlign(alignment),
    runs,
  };
}

function readFill(spPr, theme) {
  if (!spPr) return null;
  if (spPr.noFill) return 'transparent';
  const solid = readColor(spPr.solidFill, theme);
  if (solid) return solid;
  if (spPr.gradFill) {
    const stops = asArray(spPr.gradFill.gsLst?.gs);
    if (stops.length >= 2) {
      const colors = stops.map((stop) => readColor(stop, theme)).filter(Boolean);
      if (colors.length >= 2) return `linear-gradient(135deg, ${colors[0]}, ${colors[colors.length - 1]})`;
    }
  }
  if (spPr.pattFill) return readColor(spPr.pattFill.fgClr, theme) || null;
  return null;
}

function readStroke(spPr, theme) {
  const ln = spPr?.ln;
  if (!ln || ln.noFill) return { stroke: null, strokeWidth: 0 };
  return {
    stroke: readColor(ln.solidFill, theme),
    strokeWidth: ln['@_w'] ? px(ln['@_w']) : 1,
    dash: ln.prstDash?.['@_val'] || null,
  };
}

function parseTable(graphicFrame, theme) {
  const tbl = graphicFrame?.graphic?.graphicData?.tbl;
  if (!tbl) return null;
  const gridCols = asArray(tbl.tblGrid?.gridCol);
  const colWidths = gridCols.map((c) => px(c['@_w']));
  const trs = asArray(tbl.tr);
  const rowHeights = trs.map((tr) => px(tr['@_h']));
  const cells = {};
  const tableStyle = tbl.tblPr?.tableStyleId?.['#text'] || tbl.tblPr?.tableStyleId || null;

  trs.forEach((tr, r) => {
    asArray(tr.tc).forEach((tc, c) => {
      const { text, style, alignment } = paragraphsFromTextBody(tc.txBody, theme);
      const tcPr = tc.tcPr;
      const fill = tcPr ? readColor(tcPr.solidFill, theme) : null;
      cells[`${r},${c}`] = {
        value: text,
        style: {
          ...(style.bold ? { bold: true } : {}),
          ...(style.italic ? { italic: true } : {}),
          ...(style.underline ? { underline: true } : {}),
          ...(style.color ? { color: style.color } : {}),
          ...(fill ? { bg: fill } : {}),
          ...(alignment ? { align: alignment } : {}),
          ...(tcPr?.['@_anchor'] === 'ctr' ? { valign: 'middle' } : {}),
          ...(style.fontSize ? { fontSize: Math.round(style.fontSize * 0.9) } : {}),
        },
      };
    });
  });

  return {
    rows: trs.length,
    cols: Math.max(gridCols.length, ...trs.map((tr) => asArray(tr.tc).length), 1),
    colWidths: colWidths.length ? colWidths : undefined,
    rowHeights: rowHeights.length ? rowHeights : undefined,
    cells,
    headerRow: true,
    tableStyle,
  };
}

function relsPathFor(partPath) {
  const dir = path.posix.dirname(partPath);
  const base = path.posix.basename(partPath);
  return path.posix.join(dir, '_rels', `${base}.rels`);
}

async function loadRels(zip, partPath) {
  const xmlText = await readXml(zip, relsPathFor(partPath));
  if (!xmlText) return {};
  const xml = parser.parse(xmlText);
  const rels = {};
  for (const rel of asArray(xml?.Relationships?.Relationship)) {
    const target = String(rel['@_Target'] || '');
    const type = String(rel['@_Type'] || '');
    const mode = rel['@_TargetMode'];
    let resolved = target;
    if (mode !== 'External' && !target.startsWith('/')) {
      resolved = path.posix.normalize(path.posix.join(path.posix.dirname(partPath), target));
    }
    rels[rel['@_Id']] = { target: resolved, rawTarget: target, type, external: mode === 'External' };
  }
  return rels;
}

async function readXml(zip, name) {
  const file = zip.file(name);
  if (!file) return null;
  return file.async('text');
}

function safeName(name) {
  return String(name).replace(/[^A-Za-z0-9._-]/g, '_').slice(-80);
}

/**
 * @param {Buffer} buffer pptx package
 * @param {(ext: string, data: Buffer, baseName: string) => Promise<string>} saveMedia
 */
export async function importPptx(buffer, saveMedia) {
  let zip;
  try {
    zip = await JSZip.loadAsync(buffer);
  } catch {
    throw new ImportError('That file is not a PPTX package (it could not be opened as a ZIP archive).');
  }
  if (!zip.file('ppt/presentation.xml')) {
    throw new ImportError('The file does not contain a PowerPoint presentation (ppt/presentation.xml missing).');
  }

  const presentationXml = await readXml(zip, 'ppt/presentation.xml');
  const presentation = parser.parse(presentationXml);
  const sldSz = presentation?.presentation?.sldSz || {};
  const width = clamp(px(sldSz['@_cx']) || 1280, 320, 3840);
  const height = clamp(px(sldSz['@_cy']) || 720, 200, 2160);

  const themeXml = (await readXml(zip, 'ppt/theme/theme1.xml')) || (await readXml(zip, 'ppt/theme/theme2.xml'));
  const theme = parseTheme(themeXml);

  const presentationRels = await loadRels(zip, 'ppt/presentation.xml');
  const slideIds = asArray(presentation?.presentation?.sldIdLst?.sldId);
  const slidePaths = slideIds
    .map((entry) => presentationRels[entry['@_r:id'] || entry['@_id']]?.target)
    .filter((target) => target && target.startsWith('ppt/slides/'));

  if (!slidePaths.length) {
    for (const name of Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))) {
      slidePaths.push(name);
    }
    slidePaths.sort((a, b) => Number(a.match(/(\d+)/)?.[1] || 0) - Number(b.match(/(\d+)/)?.[1] || 0));
  }

  const mediaCache = new Map();
  const fontNames = new Set();

  async function mediaUrlFor(rels, relId) {
    if (!relId) return null;
    const rel = rels[relId];
    if (!rel) return null;
    if (rel.external) return rel.rawTarget;
    if (mediaCache.has(rel.target)) return mediaCache.get(rel.target);
    const file = zip.file(rel.target);
    if (!file) return null;
    const data = await file.async('nodebuffer');
    const ext = path.posix.extname(rel.target).toLowerCase() || '.bin';
    const base = `${crypto.randomBytes(5).toString('hex')}-${safeName(path.posix.basename(rel.target, ext))}`;
    const url = await saveMedia(ext, data, base);
    mediaCache.set(rel.target, url);
    return url;
  }

  const slides = [];
  for (let index = 0; index < slidePaths.length; index++) {
    const slidePath = slidePaths[index];
    const slideXml = await readXml(zip, slidePath);
    if (!slideXml) continue;
    const slide = parser.parse(slideXml);
    const rels = await loadRels(zip, slidePath);
    const sld = slide?.sld;
    const spTree = sld?.cSld?.spTree;
    const elements = [];

    let background = await parseBackground(sld?.cSld?.bg, rels, theme, mediaUrlFor);
    if (!background) {
      const layoutRel = Object.values(rels).find((rel) => /slideLayout$/.test(rel.type));
      if (layoutRel) {
        const layoutXml = await readXml(zip, layoutRel.target);
        if (layoutXml) {
          const layout = parser.parse(layoutXml);
          const layoutRels = await loadRels(zip, layoutRel.target);
          const layoutBg = await parseBackground(layout?.sldLayout?.cSld?.bg, layoutRels, theme, mediaUrlFor);
          if (layoutBg) background = layoutBg;
        }
      }
    }

    async function walk(container, transform) {
      const children = [];
      for (const key of ['sp', 'pic', 'graphicFrame', 'grpSp', 'cxnSp']) {
        for (const child of asArray(container?.[key])) children.push({ kind: key, node: child });
      }

      for (const { kind, node } of children) {
        if (kind === 'grpSp') {
          const grpXfrm = readXfrm(node.grpSpPr);
          const chOff = node.grpSpPr?.xfrm?.chOff;
          const chExt = node.grpSpPr?.xfrm?.chExt;
          let next = transform;
          if (grpXfrm && chOff && chExt) {
            const chx = px(chOff['@_x']);
            const chy = px(chOff['@_y']);
            const chw = px(chExt['@_cx']) || 1;
            const chh = px(chExt['@_cy']) || 1;
            next = {
              ox: transform.ox + grpXfrm.x,
              oy: transform.oy + grpXfrm.y,
              sx: transform.sx * (grpXfrm.w / chw),
              sy: transform.sy * (grpXfrm.h / chh),
              cx: chx,
              cy: chy,
            };
          }
          await walk(node, next);
          continue;
        }

        const xfrm = readXfrm(node.spPr || node.graphicFrame || node);
        if (!xfrm) continue;
        const geo = transform;
        const x = geo.ox + (xfrm.x - geo.cx) * geo.sx;
        const y = geo.oy + (xfrm.y - geo.cy) * geo.sy;
        const w = xfrm.w * geo.sx;
        const h = xfrm.h * geo.sy;
        if (w < 1 || h < 1) continue;

        if (kind === 'pic') {
          const blip = node.blipFill?.blip;
          const embedId = blip?.['@_r:embed'] || blip?.['@_embed'];
          const linkId = blip?.['@_r:link'] || blip?.['@_link'];
          const nvPr = node.nvPicPr?.nvPr || {};
          const videoFile = nvPr.videoFile;
          const audioFile = nvPr.audioFile;
          const mediaRelId =
            videoFile?.['@_r:link'] || videoFile?.['@_link'] ||
            audioFile?.['@_r:link'] || audioFile?.['@_link'] ||
            nvPr.media?.['@_r:link'] || nvPr.media?.['@_link'];
          let src = null;
          let mediaType = 'image';
          if (videoFile && mediaRelId) {
            src = await mediaUrlFor(rels, mediaRelId);
            mediaType = 'video';
          } else if (audioFile && mediaRelId) {
            src = await mediaUrlFor(rels, mediaRelId);
            mediaType = 'audio';
          }
          if (!src) src = (await mediaUrlFor(rels, embedId)) || (linkId ? await mediaUrlFor(rels, linkId) : null);
          if (!src) continue;
          if (mediaType === 'image' && /\.(mp4|m4v|mov|webm|ogv|avi)$/i.test(src)) mediaType = 'video';
          if (mediaType === 'image' && /\.(mp3|wav|m4a|ogg|aac|flac)$/i.test(src)) mediaType = 'audio';
          const prstGeom = node.spPr?.prstGeom?.['@_prst'];
          const stroke = readStroke(node.spPr, theme);
          elements.push({
            id: `el-${index}-${elements.length}-${crypto.randomBytes(3).toString('hex')}`,
            type: mediaType,
            x, y, w, h,
            rotation: xfrm.rot,
            src,
            name: path.posix.basename(String(rels[mediaRelId]?.target || src)),
            fit: 'cover',
            clipShape: prstGeom && prstGeom !== 'rect' ? SHAPE_MAP[prstGeom] || 'rect' : 'none',
            expandable: mediaType === 'image',
            stroke: stroke.stroke,
            strokeWidth: stroke.strokeWidth,
            opacity: 1,
          });
          continue;
        }

        if (kind === 'graphicFrame') {
          const table = parseTable(node, theme);
          if (table) {
            elements.push({
              id: `el-${index}-${elements.length}-${crypto.randomBytes(3).toString('hex')}`,
              type: 'table',
              x, y, w, h,
              rotation: xfrm.rot,
              table: {
                ...table,
                colWidths: scaleArray(table.colWidths, w),
                rowHeights: scaleArray(table.rowHeights, h),
              },
            });
          }
          continue;
        }

        const txBody = node.txBody;
        const geom = node.spPr?.prstGeom?.['@_prst'] || 'rect';
        const fill = readFill(node.spPr, theme);
        const stroke = readStroke(node.spPr, theme);
        const shapeKind = SHAPE_MAP[geom] || 'rect';

        if (txBody?.p) {
          const { text, style, alignment, runs } = paragraphsFromTextBody(txBody, theme);
          if (style.fontFamily) fontNames.add(style.fontFamily);
          const bodyPr = txBody.bodyPr || {};
          const placeholder = node.nvSpPr?.nvPr?.ph;
          const isTitle = placeholder?.['@_type'] === 'title' || placeholder?.['@_type'] === 'ctrTitle';
          if (!text.trim() && (!fill || fill === 'transparent')) continue;
          elements.push({
            id: `el-${index}-${elements.length}-${crypto.randomBytes(3).toString('hex')}`,
            type: 'text',
            x, y, w, h,
            rotation: xfrm.rot,
            text,
            runs,
            style: {
              fontFamily: style.fontFamily || theme.minorFont,
              fontSize: Number(style.fontSize || (isTitle ? 40 : 18)),
              color: style.color || '#111827',
              bold: Boolean(style.bold),
              italic: Boolean(style.italic),
              underline: Boolean(style.underline),
              align: alignment,
              valign: bodyPr['@_anchor'] === 'ctr' ? 'middle' : bodyPr['@_anchor'] === 'b' ? 'bottom' : 'top',
              lineHeight: 1.2,
              letterSpacing: 0,
            },
            fill: fill && fill !== 'transparent' ? fill : 'transparent',
            stroke: stroke.stroke,
            strokeWidth: stroke.strokeWidth,
            padding: 6,
            radius: shapeKind === 'roundRect' ? 16 : 0,
            opacity: 1,
          });
        } else {
          const isConnector = kind === 'cxnSp';
          if (!fill && !stroke.stroke && !isConnector) continue;
          elements.push({
            id: `el-${index}-${elements.length}-${crypto.randomBytes(3).toString('hex')}`,
            type: 'shape',
            x, y, w, h,
            rotation: xfrm.rot,
            shape: isConnector ? 'rect' : shapeKind,
            fill: fill || 'transparent',
            stroke: stroke.stroke || (isConnector ? '#64748b' : null),
            strokeWidth: stroke.strokeWidth || (isConnector ? 2 : 0),
            opacity: 1,
            text: '',
          });
        }
      }
    }

    await walk(spTree, { ox: 0, oy: 0, sx: 1, sy: 1, cx: 0, cy: 0 });
    const order = { shape: 0, image: 1, video: 1, audio: 1, text: 1, table: 2 };
    elements.sort((a, b) => (order[a.type] ?? 1) - (order[b.type] ?? 1));

    slides.push({
      id: `slide-${crypto.randomUUID()}`,
      elements,
      background: background || { color: '#ffffff', image: null, fit: 'cover', opacity: 1 },
      notes: '',
      transition: 'fade',
    });
  }

  if (!slides.length) throw new ImportError('No slides could be found in this presentation.');

  return { width, height, slides, fonts: Array.from(fontNames) };
}

function scaleArray(values, target) {
  if (!values || !values.length) return undefined;
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return values;
  const scaled = values.map((v) => (v / total) * target);
  scaled[scaled.length - 1] += target - scaled.reduce((a, b) => a + b, 0);
  return scaled;
}

async function parseBackground(bg, rels, theme, mediaUrlFor) {
  if (!bg?.bgPr) return null;
  const bgPr = bg.bgPr;
  const color = readColor(bgPr.solidFill, theme, null) || '#ffffff';
  let image = null;
  if (bgPr.blipFill?.blip) {
    const blip = bgPr.blipFill.blip;
    image = await mediaUrlFor(rels, blip['@_r:embed'] || blip['@_embed'] || blip['@_r:link'] || blip['@_link']);
  }
  return { color, image, fit: 'cover', opacity: 1 };
}

export function isLegacyOfficeBuffer(buffer) {
  if (!buffer || buffer.length < 4) return false;
  return buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0;
}

export function isZipBuffer(buffer) {
  return buffer && buffer.length > 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
}
