import { strandsFor } from "@/lib/curriculum";
import { designFor, subStrandTitle, type KicdDesign } from "@/lib/kicd";
import { subjectsForPathway } from "@/lib/secondary-quality";

type Row = { strand: string; number: string; title: string; note: string };

function rowsFor(subject: string, grade: string): { title: string; note: string; rows: Row[] } {
  const design = designFor(subject, grade);
  if (design) {
    return {
      title: design.designTitle && design.designTitle !== subject ? `${design.designTitle} · ${subject}` : subject,
      note: design.note ?? "Strand list from the curriculum browser on this site.",
      rows: flattenDesign(design, grade),
    };
  }
  const starter = strandsFor(subject, grade);
  return {
    title: subject,
    note: "Editable starter strands. A full design is not transcribed for this learning area yet.",
    rows: starter.flatMap((strand) => strand.substrands.map((item) => {
      const match = item.match(/^(\S+)\s+(.+)$/);
      return { strand: strand.strand, number: match?.[1] ?? "", title: match?.[2] ?? item, note: "" };
    })),
  };
}

function flattenDesign(design: KicdDesign, grade: string): Row[] {
  return design.strands.flatMap((strand) => strand.subStrands.map((sub) => ({
    strand: strand.id ? `${strand.id} ${strand.strand}` : strand.strand,
    number: sub.id ?? "",
    title: subStrandTitle(sub, grade),
    note: sub.gradeNotes ?? "",
  })));
}

async function pdfFor(grade: string, blocks: { subject: string; title: string; note: string; rows: Row[] }[]) {
  const { jsPDF } = await import("jspdf");
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const width = pdf.internal.pageSize.getWidth();
  let y = 16;
  const write = (text: string, bold = false, size = 11) => {
    pdf.setFont("helvetica", bold ? "bold" : "normal");
    pdf.setFontSize(size);
    const lines = pdf.splitTextToSize(text, width - 20);
    const height = lines.length * (size * 0.45);
    if (y + height > 280) {
      pdf.addPage();
      y = 16;
    }
    pdf.text(lines, 10, y);
    y += height + 2;
  };
  write(`IAN TECH Schemes · ${grade} curriculum pack`, true, 16);
  write("Planning outline saved from this website. It is not an official KICD file and it is not a copy of a published design PDF. Check the printed KICD design before you teach.");
  write(`Saved ${new Date().toLocaleDateString("en-KE", { dateStyle: "long" })}.`);
  for (const block of blocks) {
    y += 2;
    write(block.title, true, 14);
    write(block.note, false, 10);
    if (!block.rows.length) {
      write("No strands are listed for this learning area yet.");
      continue;
    }
    let strand = "";
    for (const row of block.rows) {
      if (row.strand !== strand) {
        strand = row.strand;
        write(strand, true, 12);
      }
      write(`${row.number ? `${row.number} ` : ""}${row.title}${row.note ? ` — ${row.note}` : ""}`, false, 11);
    }
  }
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) {
    pdf.setPage(page);
    pdf.setFontSize(8);
    pdf.text("IAN TECH Schemes · curriculum planning outline · not an official KICD file", 10, 290);
  }
  return pdf;
}

function save(pdf: import("jspdf").jsPDF, filename: string) {
  pdf.save(filename);
}

export async function downloadSubjectCurriculum(grade: string, subject: string) {
  const block = rowsFor(subject, grade);
  const pdf = await pdfFor(grade, [{ subject, ...block }]);
  const slug = `${grade}-${subject}`.replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "").toLowerCase();
  save(pdf, `${slug}-curriculum.pdf`);
}

export async function downloadGradeCurriculum(level: string, grade: string, pathway = "") {
  const subjects = subjectsForPathway(level, grade, pathway);
  const blocks = subjects.map((subject) => ({ subject, ...rowsFor(subject, grade) }));
  const pdf = await pdfFor(grade, blocks);
  const slug = grade.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  save(pdf, `${slug}-all-learning-areas.pdf`);
}
