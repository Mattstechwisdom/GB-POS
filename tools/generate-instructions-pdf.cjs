const fs = require('fs');
const path = require('path');
const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');

const root = path.resolve(__dirname, '..');
const version = String(require(path.join(root, 'package.json')).version);
const sourcePath = path.join(root, 'docs', 'GadgetBoy-POS-Instructions.md');
const logoPath = path.join(root, 'public', 'logo.png');
const buildPath = path.join(root, 'build', 'GadgetBoy-POS-Instructions.pdf');
const outputPath = path.join(root, 'output', 'pdf', 'GadgetBoy-POS-Instructions.pdf');
const releasePath = path.join(root, 'release', `GadgetBoy-POS-Instructions-${version}.pdf`);

const PAGE = { width: 612, height: 792, left: 54, right: 54, top: 58, bottom: 48 };
const COLORS = {
  ink: rgb(0.11, 0.11, 0.13),
  muted: rgb(0.34, 0.35, 0.39),
  purple: rgb(0.62, 0.07, 0.86),
  purpleDark: rgb(0.26, 0.05, 0.34),
  green: rgb(0.08, 0.68, 0.24),
  blue: rgb(0.04, 0.42, 0.78),
  red: rgb(0.75, 0.12, 0.18),
  line: rgb(0.84, 0.84, 0.87),
  note: rgb(0.96, 0.96, 0.98),
  paper: rgb(0.985, 0.985, 0.99),
  white: rgb(1, 1, 1),
};

function normalizeInline(text) {
  return String(text || '')
    .replace(/\*\*(.*?)\*\*/g, '$1')
    .replace(/`(.*?)`/g, '$1')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .trim();
}

function localYmd(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseMarkdown(raw) {
  const blocks = [];
  let paragraph = [];
  const flush = () => {
    if (!paragraph.length) return;
    blocks.push({ type: 'p', text: normalizeInline(paragraph.join(' ')) });
    paragraph = [];
  };
  for (const rawLine of raw.replace(/\r\n/g, '\n').split('\n')) {
    const line = rawLine.trim();
    if (!line) {
      flush();
      continue;
    }
    const heading = /^(#{1,3})\s+(.+)$/.exec(line);
    if (heading) {
      flush();
      blocks.push({ type: `h${heading[1].length}`, text: normalizeInline(heading[2]) });
      continue;
    }
    const quote = /^>\s*(.+)$/.exec(line);
    if (quote) {
      flush();
      blocks.push({ type: 'note', text: normalizeInline(quote[1]) });
      continue;
    }
    const bullet = /^-\s+(.+)$/.exec(line);
    if (bullet) {
      flush();
      blocks.push({ type: 'bullet', text: normalizeInline(bullet[1]) });
      continue;
    }
    const number = /^(\d+)\.\s+(.+)$/.exec(line);
    if (number) {
      flush();
      blocks.push({ type: 'number', marker: `${number[1]}.`, text: normalizeInline(number[2]) });
      continue;
    }
    paragraph.push(line);
  }
  flush();
  return blocks;
}

function wrapText(text, font, size, maxWidth) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth || !current) {
      current = candidate;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [''];
}

async function generate() {
  const raw = fs.readFileSync(sourcePath, 'utf8');
  const blocks = parseMarkdown(raw);
  const pdf = await PDFDocument.create();
  pdf.setTitle('GadgetBoy POS Instructions');
  pdf.setAuthor('GadgetBoy Repair & Retail');
  pdf.setSubject(`GadgetBoy POS ${version} operating instructions`);
  pdf.setKeywords(['GadgetBoy POS', 'instructions', 'work orders', 'sales', 'inventory']);

  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  if (!fs.existsSync(logoPath)) throw new Error(`Logo not found: ${logoPath}`);
  const logo = await pdf.embedPng(fs.readFileSync(logoPath));
  const logoAspect = logo.width / logo.height;
  let page;
  let y = 0;
  let pageNumber = 0;
  const tocEntries = [];

  const addPage = () => {
    page = pdf.addPage([PAGE.width, PAGE.height]);
    pageNumber += 1;
    page.drawRectangle({ x: 0, y: 0, width: PAGE.width, height: PAGE.height, color: COLORS.paper });
    y = PAGE.height - PAGE.top;
    if (pageNumber > 1) {
      page.drawImage(logo, { x: PAGE.left, y: PAGE.height - 35, width: 18 * logoAspect, height: 18 });
      page.drawText('GADGETBOY POS', { x: PAGE.left + 24, y: PAGE.height - 31, size: 8.5, font: bold, color: COLORS.purple });
      page.drawText(`Instructions | v${version}`, { x: PAGE.width - PAGE.right - 84, y: PAGE.height - 31, size: 8, font: regular, color: COLORS.muted });
      page.drawLine({ start: { x: PAGE.left, y: PAGE.height - 38 }, end: { x: PAGE.width - PAGE.right, y: PAGE.height - 38 }, thickness: 0.6, color: COLORS.line });
    }
  };
  const footer = () => {
    for (let index = 0; index < pdf.getPageCount(); index += 1) {
      const target = pdf.getPage(index);
      target.drawLine({ start: { x: PAGE.left, y: 35 }, end: { x: PAGE.width - PAGE.right, y: 35 }, thickness: 0.5, color: COLORS.line });
      target.drawText('GadgetBoy POS operating manual', { x: PAGE.left, y: 22, size: 7.5, font: regular, color: COLORS.muted });
      const label = `${index + 1} / ${pdf.getPageCount()}`;
      target.drawText(label, { x: PAGE.width - PAGE.right - regular.widthOfTextAtSize(label, 7.5), y: 22, size: 7.5, font: regular, color: COLORS.muted });
    }
  };
  const ensure = (height) => {
    if (!page || y - height < PAGE.bottom) addPage();
  };
  const drawWrapped = (text, options = {}) => {
    const size = options.size || 9.6;
    const lineHeight = options.lineHeight || size * 1.38;
    const font = options.font || regular;
    const x = options.x || PAGE.left;
    const width = options.width || (PAGE.width - PAGE.left - PAGE.right - (x - PAGE.left));
    const lines = wrapText(text, font, size, width);
    ensure(lines.length * lineHeight + (options.after || 0));
    for (const line of lines) {
      page.drawText(line, { x, y, size, font, color: options.color || COLORS.ink });
      y -= lineHeight;
    }
    y -= options.after || 0;
  };

  addPage();
  page.drawRectangle({ x: 0, y: PAGE.height - 244, width: PAGE.width, height: 244, color: COLORS.purpleDark });
  const coverLogoHeight = 122;
  const coverLogoWidth = coverLogoHeight * logoAspect;
  page.drawImage(logo, { x: PAGE.left + (118 - coverLogoWidth) / 2, y: PAGE.height - 188, width: coverLogoWidth, height: coverLogoHeight });
  page.drawText('GADGETBOY', { x: 190, y: 670, size: 30, font: bold, color: COLORS.purple });
  page.drawText('POS INSTRUCTIONS', { x: 190, y: 636, size: 27, font: bold, color: COLORS.white });
  page.drawText(`Version ${version}`, { x: 192, y: 605, size: 13, font: bold, color: COLORS.green });
  page.drawText(`Generated ${localYmd()}`, { x: 192, y: 584, size: 9.5, font: regular, color: COLORS.white });
  page.drawRectangle({ x: PAGE.left, y: 519, width: 80, height: 4, color: COLORS.green });
  y = 482;
  drawWrapped('Complete operating procedures for Windows and Android, including clients, work orders, parts, inventory, sales, reporting, cloud sync, updates, backups, and troubleshooting.', { size: 15, lineHeight: 21, font: bold, width: 465, color: COLORS.ink, after: 20 });
  drawWrapped('Use this guide with the app version shown above. Screens and workflows may change in later releases; always use the Instructions PDF included with the matching release.', { size: 11, lineHeight: 16, width: 465, color: COLORS.muted, after: 20 });
  page.drawRectangle({ x: PAGE.left, y: 196, width: PAGE.width - PAGE.left - PAGE.right, height: 100, color: COLORS.note, borderColor: COLORS.red, borderWidth: 1 });
  page.drawRectangle({ x: PAGE.left, y: 196, width: 6, height: 100, color: COLORS.red });
  page.drawText('DATA SAFETY', { x: PAGE.left + 18, y: 270, size: 10, font: bold, color: COLORS.red });
  const coverNote = wrapText('Never clear, overwrite, restore, merge, or import production data without a verified current backup and explicit authorization. Do not place passwords or secret API keys in this document.', regular, 10, 470);
  let coverY = 248;
  for (const line of coverNote) {
    page.drawText(line, { x: PAGE.left + 18, y: coverY, size: 10, font: regular, color: COLORS.ink });
    coverY -= 14;
  }
  page.drawText('OPERATING MANUAL', { x: PAGE.left, y: 118, size: 8, font: bold, color: COLORS.muted });
  page.drawText('Workflows | Feature Reference | Troubleshooting', { x: PAGE.left, y: 94, size: 15, font: bold, color: COLORS.purpleDark });

  addPage();
  const tocPage = page;
  addPage();
  for (const block of blocks.slice(1)) {
    if (block.type === 'h1') {
      ensure(58);
      y -= 10;
      drawWrapped(block.text, { size: 20, lineHeight: 25, font: bold, color: COLORS.purple, after: 8 });
    } else if (block.type === 'h2') {
      const titleLines = wrapText(block.text, bold, 14.5, PAGE.width - PAGE.left - PAGE.right - 34);
      const sectionHeight = Math.max(40, titleLines.length * 18 + 18);
      ensure(sectionHeight + 16);
      y -= 8;
      tocEntries.push({ title: block.text, page: pageNumber });
      page.drawRectangle({
        x: PAGE.left,
        y: y - sectionHeight + 9,
        width: PAGE.width - PAGE.left - PAGE.right,
        height: sectionHeight,
        color: COLORS.note,
        borderColor: COLORS.line,
        borderWidth: 0.7,
      });
      page.drawRectangle({ x: PAGE.left, y: y - sectionHeight + 9, width: 7, height: sectionHeight, color: COLORS.purple });
      let titleY = y - 8;
      for (const line of titleLines) {
        page.drawText(line, { x: PAGE.left + 19, y: titleY, size: 14.5, font: bold, color: COLORS.purpleDark });
        titleY -= 18;
      }
      y -= sectionHeight + 2;
    } else if (block.type === 'h3') {
      ensure(32);
      y -= 5;
      page.drawRectangle({ x: PAGE.left, y: y - 5, width: 3, height: 15, color: COLORS.green });
      drawWrapped(block.text, { x: PAGE.left + 11, width: PAGE.width - PAGE.left - PAGE.right - 11, size: 11.5, lineHeight: 15, font: bold, color: COLORS.green, after: 5 });
    } else if (block.type === 'note') {
      const lines = wrapText(block.text, regular, 9.3, PAGE.width - PAGE.left - PAGE.right - 28);
      const height = lines.length * 13 + 18;
      ensure(height + 8);
      page.drawRectangle({ x: PAGE.left, y: y - height + 6, width: PAGE.width - PAGE.left - PAGE.right, height, color: COLORS.note, borderColor: COLORS.purple, borderWidth: 0.8 });
      let noteY = y - 8;
      for (const line of lines) {
        page.drawText(line, { x: PAGE.left + 14, y: noteY, size: 9.3, font: regular, color: COLORS.ink });
        noteY -= 13;
      }
      y -= height + 8;
    } else if (block.type === 'bullet' || block.type === 'number') {
      const marker = block.type === 'bullet' ? '-' : block.marker;
      const markerWidth = block.type === 'bullet' ? 12 : 22;
      const lines = wrapText(block.text, regular, 9.4, PAGE.width - PAGE.left - PAGE.right - markerWidth - 9);
      ensure(lines.length * 13 + 4);
      page.drawText(marker, { x: PAGE.left + 3, y, size: 9.4, font: block.type === 'number' ? bold : regular, color: COLORS.purple });
      let lineY = y;
      for (const line of lines) {
        page.drawText(line, { x: PAGE.left + markerWidth + 3, y: lineY, size: 9.4, font: regular, color: COLORS.ink });
        lineY -= 13;
      }
      y = lineY - 2;
    } else {
      drawWrapped(block.text, { size: 9.6, lineHeight: 13.4, color: COLORS.ink, after: 5 });
    }
  }

  tocPage.drawText('TABLE OF CONTENTS', { x: PAGE.left, y: 702, size: 24, font: bold, color: COLORS.purpleDark });
  tocPage.drawText('Find a workflow, feature, or troubleshooting section quickly.', { x: PAGE.left, y: 678, size: 10, font: regular, color: COLORS.muted });
  tocPage.drawRectangle({ x: PAGE.left, y: 661, width: 74, height: 4, color: COLORS.green });
  const tocColumnWidth = 238;
  const tocRows = Math.ceil(tocEntries.length / 2);
  for (let index = 0; index < tocEntries.length; index += 1) {
    const column = Math.floor(index / tocRows);
    const row = index % tocRows;
    const entry = tocEntries[index];
    const x = PAGE.left + column * (tocColumnWidth + 28);
    const entryY = 628 - row * 34;
    const numberMatch = /^(\d+)\.\s*/.exec(entry.title);
    const title = entry.title.replace(/^\d+\.\s*/, '');
    const badge = numberMatch ? numberMatch[1] : String(index + 1);
    tocPage.drawRectangle({ x, y: entryY - 4, width: 22, height: 22, color: COLORS.purpleDark });
    const badgeWidth = bold.widthOfTextAtSize(badge, 8);
    tocPage.drawText(badge, { x: x + 11 - badgeWidth / 2, y: entryY + 3, size: 8, font: bold, color: COLORS.white });
    const titleLines = wrapText(title, bold, 8.7, tocColumnWidth - 48).slice(0, 2);
    let tocTitleY = entryY + 7;
    for (const line of titleLines) {
      tocPage.drawText(line, { x: x + 31, y: tocTitleY, size: 8.7, font: bold, color: COLORS.ink });
      tocTitleY -= 10;
    }
    const pageLabel = String(entry.page);
    tocPage.drawText(pageLabel, {
      x: x + tocColumnWidth - regular.widthOfTextAtSize(pageLabel, 8.5),
      y: entryY + 3,
      size: 8.5,
      font: regular,
      color: COLORS.purple,
    });
    tocPage.drawLine({
      start: { x: x + 31, y: entryY - 10 },
      end: { x: x + tocColumnWidth, y: entryY - 10 },
      thickness: 0.35,
      color: COLORS.line,
    });
  }
  tocPage.drawRectangle({ x: PAGE.left, y: 72, width: PAGE.width - PAGE.left - PAGE.right, height: 48, color: COLORS.note, borderColor: COLORS.line, borderWidth: 0.7 });
  tocPage.drawText('QUICK PATH', { x: PAGE.left + 14, y: 101, size: 8, font: bold, color: COLORS.purple });
  tocPage.drawText('New technician: 1, 5-8, 12-13, 18-19, 27 | Manager/admin: 20-26, 28-29', { x: PAGE.left + 14, y: 84, size: 8.5, font: regular, color: COLORS.ink });

  footer();
  const bytes = await pdf.save();
  for (const target of [buildPath, outputPath, releasePath]) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, bytes);
    console.log(`Created ${path.relative(root, target)}`);
  }
}

generate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
