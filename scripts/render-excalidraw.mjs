import { readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import path from 'node:path';

const sourcePath = '/Users/fagundes/Desktop/vagas.excalidraw';
const projectRoot = '/Users/fagundes/Desktop/FoodPilot/condominio-planta';
const assetsDir = path.join(projectRoot, 'assets');

const document = JSON.parse(await readFile(sourcePath, 'utf8'));
const elements = document.elements.filter((element) => !element.isDeleted);

const scenarios = [
  { id: 'atual', label: 'Situação atual', minX: -46.07925571502119, maxX: 3423.4735030106613 },
  { id: 'proposta-1', label: 'Proposta 1', minX: 4252.662349621356, maxX: 7722.215108347039 },
  { id: 'proposta-2', label: 'Proposta 2', minX: 8551.403954957734, maxX: 12020.956713683416 },
];

const minY = Math.min(...elements.map((element) => element.y));
const maxY = Math.max(...elements.map((element) => element.y + element.height));
const width = scenarios[0].maxX - scenarios[0].minX;
const height = maxY - minY;
const padding = 42;

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function color(value, fallback = 'none') {
  return !value || value === 'transparent' ? fallback : value;
}

function opacity(element) {
  return Math.max(0, Math.min(1, (element.opacity ?? 100) / 100));
}

function radius(element) {
  if (!element.roundness) return 0;
  return Math.min(26, Math.max(6, Math.min(element.width, element.height) * 0.11));
}

function transform(element, offsetX) {
  if (!element.angle) return '';
  const degrees = (element.angle * 180) / Math.PI;
  const centerX = element.x - offsetX + element.width / 2;
  const centerY = element.y - minY + element.height / 2;
  return ` transform="rotate(${degrees} ${centerX} ${centerY})"`;
}

function renderRectangle(element, offsetX) {
  const x = element.x - offsetX;
  const y = element.y - minY;
  const fill = color(element.backgroundColor, 'none');
  const stroke = color(element.strokeColor, 'none');
  const strokeWidth = element.strokeWidth ?? 2;
  const rx = radius(element);
  return `<rect x="${x}" y="${y}" width="${element.width}" height="${element.height}" rx="${rx}" fill="${fill}" stroke="${stroke}" stroke-width="${strokeWidth}" opacity="${opacity(element)}"${transform(element, offsetX)} />`;
}

function renderDiamond(element, offsetX) {
  const x = element.x - offsetX;
  const y = element.y - minY;
  const cx = x + element.width / 2;
  const cy = y + element.height / 2;
  const points = `${cx},${y} ${x + element.width},${cy} ${cx},${y + element.height} ${x},${cy}`;
  const fill = color(element.backgroundColor, 'none');
  const stroke = color(element.strokeColor, 'none');
  return `<polygon points="${points}" fill="${fill}" stroke="${stroke}" stroke-width="${element.strokeWidth ?? 2}" opacity="${opacity(element)}"${transform(element, offsetX)} />`;
}

function renderText(element, offsetX) {
  const x = element.x - offsetX;
  const y = element.y - minY;
  const fontSize = element.fontSize ?? 36;
  const lineHeight = fontSize * (element.lineHeight ?? 1.25);
  const align = element.textAlign ?? 'left';
  const anchor = align === 'center' ? 'middle' : align === 'right' ? 'end' : 'start';
  const textX = align === 'center' ? x + element.width / 2 : align === 'right' ? x + element.width : x;
  const lines = String(element.text ?? '').split('\n');
  const tspans = lines
    .map((line, index) => `<tspan x="${textX}" dy="${index === 0 ? fontSize : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('');
  return `<text x="${textX}" y="${y}" text-anchor="${anchor}" font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="${element.fontFamily === 8 ? 700 : 500}" fill="${color(element.strokeColor, '#1e1e1e')}" opacity="${opacity(element)}"${transform(element, offsetX)}>${tspans}</text>`;
}

function renderElement(element, offsetX) {
  if (element.type === 'rectangle') return renderRectangle(element, offsetX);
  if (element.type === 'diamond') return renderDiamond(element, offsetX);
  if (element.type === 'text') return renderText(element, offsetX);
  return '';
}

function scenarioElements(scenario, index) {
  const nextMin = scenarios[index + 1]?.minX ?? Number.POSITIVE_INFINITY;
  return elements.filter((element) => element.x >= scenario.minX && element.x < nextMin);
}

await mkdir(assetsDir, { recursive: true });
await copyFile(sourcePath, path.join(assetsDir, 'vagas.excalidraw'));

const manifest = [];
for (const [index, scenario] of scenarios.entries()) {
  const items = scenarioElements(scenario, index);
  const shapes = items.map((element) => renderElement(element, scenario.minX)).join('\n');
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-padding} ${-padding} ${width + padding * 2} ${height + padding * 2}" role="img" aria-label="${escapeXml(scenario.label)}">
  <rect x="${-padding}" y="${-padding}" width="${width + padding * 2}" height="${height + padding * 2}" fill="#ffffff" />
  ${shapes}
</svg>`;
  const fileName = `${scenario.id}.svg`;
  await writeFile(path.join(assetsDir, fileName), svg);
  manifest.push({ ...scenario, file: `assets/${fileName}`, elementCount: items.length });
}

await writeFile(
  path.join(assetsDir, 'scenarios.json'),
  JSON.stringify({ width, height, minY, scenarios: manifest }, null, 2),
);

console.log(JSON.stringify({ width, height, scenarios: manifest }, null, 2));
