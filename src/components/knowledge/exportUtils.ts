import { invoke } from "@tauri-apps/api/core";
import {
  Document, Packer, Paragraph, TextRun,
  HeadingLevel, ShadingType,
  BorderStyle, Table, TableRow, TableCell, WidthType,
} from "docx";

// ─── 字号常量（半磅单位，1pt = 2 half-pts） ─────────────────────────────────
const PT = (n: number) => n * 2;

// ─── 样式定义 ─────────────────────────────────────────────────────────────────
interface HeadingStyle { size: number; bold: boolean; color: string; spaceAfter: number }
const HEADING_STYLES: Record<number, HeadingStyle> = {
  1: { size: PT(28), bold: true,  color: "1a1a1a", spaceAfter: 120 },
  2: { size: PT(22), bold: true,  color: "1a1a1a", spaceAfter: 100 },
  3: { size: PT(18), bold: true,  color: "1a1a1a", spaceAfter: 80  },
  4: { size: PT(14), bold: true,  color: "333333", spaceAfter: 60  },
  5: { size: PT(12), bold: true,  color: "555555", spaceAfter: 40  },
  6: { size: PT(11), bold: true,  color: "666666", spaceAfter: 40  },
};

const HEADING_LEVEL_MAP: Record<number, typeof HeadingLevel[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

// ─── 行内格式解析 ─────────────────────────────────────────────────────────────
interface RunBase { bold?: boolean; italics?: boolean; size?: number; color?: string; strike?: boolean }

function makeRun(text: string, base: RunBase): TextRun {
  return new TextRun({ text, ...base });
}

function parseInline(text: string, base: RunBase = {}): TextRun[] {
  const runs: TextRun[] = [];
  const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|\*(.+?)\*|`([^`]+)`|~~(.+?)~~/g;
  let last = 0;
  let m: RegExpExecArray | null;

  while ((m = re.exec(text)) !== null) {
    if (m.index > last) runs.push(makeRun(text.slice(last, m.index), base));
    if (m[1])      runs.push(makeRun(m[1], { ...base, bold: true, italics: true }));
    else if (m[2]) runs.push(makeRun(m[2], { ...base, bold: true }));
    else if (m[3]) runs.push(makeRun(m[3], { ...base, italics: true }));
    else if (m[4]) runs.push(new TextRun({
      text: m[4], font: "Courier New", size: PT(10),
      shading: { type: ShadingType.CLEAR, fill: "F0F0F0", color: "auto" },
    }));
    else if (m[5]) runs.push(makeRun(m[5], { ...base, strike: true }));
    last = m.index + m[0].length;
  }
  if (last < text.length) runs.push(makeRun(text.slice(last), base));
  return runs.length > 0 ? runs : [makeRun(text, base)];
}

// ─── Markdown → docx Paragraph 数组 ──────────────────────────────────────────
function toDocxParagraphs(markdown: string): (Paragraph | Table)[] {
  const result: (Paragraph | Table)[] = [];
  const lines = markdown.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const raw = line;

    // ── 代码块 ──
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      for (const codeLine of codeLines) {
        result.push(
          new Paragraph({
            children: [new TextRun({ text: codeLine || " ", font: "Courier New", size: PT(10) })],
            shading: { type: ShadingType.CLEAR, fill: "F6F8FA", color: "auto" },
            spacing: { before: 0, after: 0, line: 240 },
            indent: { left: 360 },
            border: {
              left: { style: BorderStyle.SINGLE, size: 12, color: "CCCCCC" },
            },
          }),
        );
      }
      result.push(new Paragraph({ text: "", spacing: { before: 80, after: 80 } }));
      continue;
    }

    // ── 标题 ──
    const hMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (hMatch) {
      const level = hMatch[1].length;
      const text = hMatch[2].trim();
      const style = HEADING_STYLES[level] ?? HEADING_STYLES[3];
      result.push(
        new Paragraph({
          heading: HEADING_LEVEL_MAP[level],
          children: parseInline(text, { bold: style.bold, size: style.size, color: style.color } satisfies RunBase),
          spacing: { before: 200, after: style.spaceAfter },
          ...(level <= 2 ? {
            border: {
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "E5E7EB" },
            },
          } : {}),
        }),
      );
      continue;
    }

    // ── 水平线 ──
    if (/^[-*_]{3,}$/.test(line.trim())) {
      result.push(
        new Paragraph({
          border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "D1D5DB" } },
          spacing: { before: 200, after: 200 },
          text: "",
        }),
      );
      continue;
    }

    // ── 引用块 ──
    if (line.startsWith(">")) {
      const content = line.replace(/^>\s*/, "");
      result.push(
        new Paragraph({
          children: parseInline(content, { italics: true, color: "6B7280" }),
          indent: { left: 720 },
          spacing: { before: 60, after: 60 },
          border: {
            left: { style: BorderStyle.THICK, size: 16, color: "D1D5DB" },
          },
          shading: { type: ShadingType.CLEAR, fill: "F9FAFB", color: "auto" },
        }),
      );
      continue;
    }

    // ── 无序列表 ──
    const ulMatch = line.match(/^(\s*)[*+-]\s+(.+)/);
    if (ulMatch) {
      const depth = Math.floor(ulMatch[1].length / 2);
      const bullet = depth === 0 ? "•" : depth === 1 ? "◦" : "▪";
      result.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${bullet}  ` }),
            ...parseInline(ulMatch[2]),
          ],
          indent: { left: 360 + depth * 360, hanging: 360 },
          spacing: { before: 40, after: 40 },
        }),
      );
      continue;
    }

    // ── 有序列表 ──
    const olMatch = line.match(/^(\s*)(\d+)\.\s+(.+)/);
    if (olMatch) {
      const depth = Math.floor(olMatch[1].length / 2);
      result.push(
        new Paragraph({
          children: [
            new TextRun({ text: `${olMatch[2]}.  ` }),
            ...parseInline(olMatch[3]),
          ],
          indent: { left: 360 + depth * 360, hanging: 360 },
          spacing: { before: 40, after: 40 },
        }),
      );
      continue;
    }

    // ── GFM 表格 ──
    if (line.startsWith("|") && i + 1 < lines.length && lines[i + 1].match(/^\|[-| :]+\|/)) {
      const headers = line.split("|").slice(1, -1).map((s) => s.trim());
      i += 2; // 跳过分隔行
      const rows: string[][] = [];
      while (i < lines.length && lines[i].startsWith("|")) {
        rows.push(lines[i].split("|").slice(1, -1).map((s) => s.trim()));
        i++;
      }
      i--; // 外层 for 会 i++
      result.push(
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            new TableRow({
              tableHeader: true,
              children: headers.map(
                (h) => new TableCell({
                  children: [new Paragraph({
                    children: parseInline(h, { bold: true }),
                    spacing: { before: 60, after: 60 },
                  })],
                  shading: { type: ShadingType.CLEAR, fill: "F3F4F6", color: "auto" },
                }),
              ),
            }),
            ...rows.map(
              (cells) => new TableRow({
                children: cells.map(
                  (cell) => new TableCell({
                    children: [new Paragraph({
                      children: parseInline(cell),
                      spacing: { before: 60, after: 60 },
                    })],
                  }),
                ),
              }),
            ),
          ],
        }),
      );
      result.push(new Paragraph({ text: "", spacing: { before: 80, after: 80 } }));
      continue;
    }

    // ── 空行 ──
    if (raw.trim() === "") {
      result.push(new Paragraph({ text: "", spacing: { before: 80, after: 0 } }));
      continue;
    }

    // ── 普通段落 ──
    result.push(
      new Paragraph({
        children: parseInline(raw),
        spacing: { before: 60, after: 60, line: 360, lineRule: "auto" as any },
      }),
    );
  }

  return result;
}

// ─── 导出入口 ─────────────────────────────────────────────────────────────────
export async function exportToWord(markdown: string, fileName: string): Promise<void> {
  const stemName = fileName.replace(/\.md$/i, "");
  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: "Arial", size: PT(11), color: "1a1a1a" },
          paragraph: { spacing: { line: 360, lineRule: "auto" as any } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 },
        },
      },
      children: toDocxParagraphs(markdown) as Paragraph[],
    }],
  });

  const base64 = await Packer.toBase64String(doc);

  await invoke("knowledge_save_export_file", {
    defaultName: `${stemName}.docx`,
    filterName: "Word Document",
    filterExtensions: ["docx"],
    base64Content: base64,
  });
}

// ─── PDF 导出（html2canvas + jsPDF） ─────────────────────────────────────────

export async function exportToPdf(markdown: string, fileName: string): Promise<void> {
  const stemName = fileName.replace(/\.md$/i, "");

  // 用 marked 把 markdown 完整转成 HTML（含表格、标题、列表、代码块等）
  const { marked } = await import("marked");
  marked.setOptions({ gfm: true, breaks: false });
  const bodyHtml = await marked.parse(markdown);

  const css = `
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:"PingFang SC","Microsoft YaHei","Helvetica Neue",Arial,sans-serif;
         font-size:14px;line-height:1.8;color:#1a1a1a;background:#fff;
         padding:48px 56px;width:794px;}
    h1{font-size:26px;font-weight:700;margin:16px 0 8px;padding-bottom:6px;border-bottom:2px solid #e5e7eb;}
    h2{font-size:20px;font-weight:700;margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid #e5e7eb;}
    h3{font-size:16px;font-weight:700;margin:12px 0 5px;}
    h4,h5,h6{font-size:14px;font-weight:700;margin:10px 0 4px;}
    p{margin:6px 0;}
    pre{background:#f6f8fa;border-radius:4px;padding:10px 14px;
        font-family:"Courier New",monospace;font-size:12px;
        white-space:pre-wrap;word-break:break-all;margin:8px 0;}
    code{background:#f0f0f0;border-radius:3px;padding:1px 4px;
         font-family:"Courier New",monospace;font-size:12px;}
    blockquote{border-left:3px solid #d1d5db;padding:4px 12px;
               background:#f9fafb;color:#6b7280;margin:8px 0;font-style:italic;}
    li{margin:3px 0;list-style:none;padding-left:16px;position:relative;}
    li.ul::before{content:"•";position:absolute;left:0;}
    li.ol::before{content:attr(data-n)".";position:absolute;left:0;}
    hr{border:none;border-top:1px solid #e5e7eb;margin:12px 0;}
    .blank{height:8px;}
    table{border-collapse:collapse;width:100%;margin:8px 0;}
    th,td{border:1px solid #d1d5db;padding:5px 10px;font-size:13px;}
    th{background:#f3f4f6;font-weight:600;}
    strong{font-weight:700;}em{font-style:italic;}del{text-decoration:line-through;}
  `;

  // 用户可见的加载提示
  const spinner = document.createElement("div");
  spinner.style.cssText =
    "position:fixed;inset:0;background:rgba(0,0,0,0.4);z-index:99999;" +
    "display:flex;align-items:center;justify-content:center;";
  spinner.innerHTML =
    `<div style="background:#fff;border-radius:8px;padding:20px 32px;font-size:14px;color:#333;">
       正在导出 PDF，请稍候…
     </div>`;
  document.body.appendChild(spinner);

  // iframe 完全隔离渲染上下文，html2canvas 截 iframe body 不会合成主页背景
  const iframe = document.createElement("iframe");
  iframe.style.cssText =
    "position:fixed;top:0;left:0;width:794px;height:1px;" +
    "border:none;visibility:hidden;";
  document.body.appendChild(iframe);

  try {
    const iDoc = iframe.contentDocument!;
    iDoc.open();
    iDoc.write(
      `<!DOCTYPE html><html><head><meta charset="utf-8">` +
      `<style>${css}</style></head><body>${bodyHtml}</body></html>`
    );
    iDoc.close();

    // 等字体 + 布局稳定，再读取真实高度
    await new Promise((r) => setTimeout(r, 400));
    const bodyEl = iDoc.body;
    const contentH = bodyEl.scrollHeight;
    iframe.style.height = contentH + "px";
    await new Promise((r) => setTimeout(r, 100));

    const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
      import("jspdf"),
      import("html2canvas"),
    ]);

    const canvas = await html2canvas(bodyEl, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      width: 794,
      windowWidth: 794,
      windowHeight: contentH,
      scrollX: 0,
      scrollY: 0,
      logging: false,
    });

    const A4_W = 210; const A4_H = 297; const MARGIN = 12;
    const contentW = A4_W - MARGIN * 2;
    const pageH = A4_H - MARGIN * 2;
    const totalH = (canvas.height / canvas.width) * contentW;
    const scale = contentW / canvas.width;

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    let yMM = 0; let page = 0;

    while (yMM < totalH) {
      const sliceH = Math.min(pageH, totalH - yMM);
      const srcY = Math.round(yMM / scale);
      const srcH = Math.round(sliceH / scale);
      const slice = document.createElement("canvas");
      slice.width = canvas.width; slice.height = Math.max(1, srcH);
      slice.getContext("2d")!.drawImage(canvas, 0, srcY, canvas.width, srcH, 0, 0, canvas.width, srcH);
      if (page > 0) pdf.addPage();
      pdf.addImage(slice.toDataURL("image/png"), "PNG", MARGIN, MARGIN, contentW, sliceH);
      yMM += sliceH; page++;
    }

    const base64 = pdf.output("datauristring").split(",")[1];
    await invoke("knowledge_save_export_file", {
      defaultName: `${stemName}.pdf`,
      filterName: "PDF Document",
      filterExtensions: ["pdf"],
      base64Content: base64,
    });
  } finally {
    document.body.removeChild(iframe);
    document.body.removeChild(spinner);
  }
}

