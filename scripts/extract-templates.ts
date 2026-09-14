/**
 * Извлекает сырые данные шаблонов контакт-репортов из
 * docs/source/ADV Contact Report Router 2026.xlsx
 * в packages/shared/templates.raw.json (для трассируемости).
 *
 * Курируемая версия шаблонов (структура разделов, ключи полей) живёт
 * в packages/shared/templates.json и правится вручную.
 *
 * Запуск: pnpm templates:extract
 */
import ExcelJS from "exceljs";
import { writeFileSync } from "node:fs";
import { resolve } from "node:path";

const SRC = resolve("docs/source/ADV Contact Report Router 2026.xlsx");
const OUT = resolve("packages/shared/templates.raw.json");

type RawTemplate = {
  sheet: string;
  title: string;
  goal: string;
  commonFields: string[];
  specificHeader: string;
  specificFields: string[];
  prompt: string;
  tips: string[];
};

function cellText(v: ExcelJS.CellValue): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object" && "richText" in v) return v.richText.map((r) => r.text).join("");
  if (typeof v === "object" && "text" in v) return String(v.text);
  if (typeof v === "object" && "result" in v) return cellText(v.result as ExcelJS.CellValue);
  return String(v);
}

async function main() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(SRC);

  const templates: RawTemplate[] = [];
  const cheatsheet: { situation: string; template: string; sendTo: string }[] = [];

  for (const ws of wb.worksheets) {
    const rows: string[][] = [];
    ws.eachRow({ includeEmpty: false }, (row) => {
      const vals: string[] = [];
      for (let c = 1; c <= row.cellCount; c++) vals.push(cellText(row.getCell(c).value).trim());
      rows.push(vals);
    });

    if (ws.name.includes("Шпаргалка")) {
      for (const r of rows) {
        if (r[0] && r[1] && r[2] && r[0] !== "Ситуация" && !r[0].startsWith("ADV") && !r[0].startsWith("💡")) {
          cheatsheet.push({ situation: r[0], template: r[1], sendTo: r[2] });
        }
      }
      continue;
    }
    if (ws.name.includes("Маршрутизатор")) continue;

    const t: RawTemplate = {
      sheet: ws.name,
      title: rows[0]?.[0] ?? "",
      goal: rows[1]?.[0] ?? "",
      commonFields: [],
      specificHeader: "",
      specificFields: [],
      prompt: "",
      tips: [],
    };
    let section: "common" | "specific" | "dictation" | "prompt" | "tips" | null = null;
    for (const r of rows.slice(2)) {
      const a = r[0] ?? "";
      if (a.startsWith("ДАННЫЕ ВСТРЕЧИ")) { section = "common"; continue; }
      if (a.startsWith("СПЕЦИФИКА ВСТРЕЧИ")) { section = "specific"; t.specificHeader = a; continue; }
      if (a.startsWith("ДИКТОВКА")) { section = "dictation"; continue; }
      if (a.startsWith("ПРОМПТ ДЛЯ AI")) { section = "prompt"; continue; }
      if (a.startsWith("💡")) { section = "tips"; continue; }
      if (section === "common" && a) t.commonFields.push(a);
      else if (section === "specific" && a) t.specificFields.push(a);
      else if (section === "prompt" && a) t.prompt = a;
      else if (section === "tips" && a) t.tips.push(a.replace(/^•\s*/, ""));
    }
    templates.push(t);
  }

  writeFileSync(OUT, JSON.stringify({ extractedFrom: "ADV Contact Report Router 2026.xlsx", templates, cheatsheet }, null, 2) + "\n");
  console.log(`✓ ${templates.length} шаблонов, ${cheatsheet.length} строк шпаргалки → ${OUT}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
