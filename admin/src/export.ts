// Export du classement en Excel (.xlsx) et en Word (.docx), en lecture de droite à gauche en arabe (D8).
// Les bibliothèques sont chargées à la demande : elles n'alourdissent pas l'ouverture du BO.
import type { RankRow } from './types';
import { isRtl, t } from './i18n';

const header = () => [t('Rang'), t('Élève'), t('Père'), t('Âge'), t('Classes'), t('Ahzab entiers (حفظ إجمالي)'), t('Sourates entières (حفظ إجمالي)'), t('Ahzab : suite (حفظ مسترسل)'), t('Sourates : suite (حفظ مسترسل)'), t('Pages entières (حفظ إجمالي)'), t('Pages : suite (حفظ مسترسل)'), t('Étiquette النخبة'),
  t('Ayat'), t('Gain (période)'), t('Ayat / semaine'), t('Dernière validation')];

const cells = (r: RankRow): (string | number)[] => [r.rank, r.fullName, r.fatherName, r.age ?? '', r.classes.join(' / '), r.ahzab.complete, r.surahs.complete, r.ahzab.longestRun, r.surahs.longestRun, r.pages.complete, r.pages.longestRun, r.eliteTag ? '★' : '', r.ayat, r.gain, r.perWeek, r.lastValidationAt ? r.lastValidationAt.slice(0, 10) : ''];

export const fileStem = (org: string, period: string) =>
  `${t('classement')}-${org}-${period}-${new Date().toISOString().slice(0, 10)}`.replace(/[^\p{L}\p{N}_-]+/gu, '_');

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function exportExcel(rows: RankRow[], title: string, stem: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(title.replace(/[\\/?*[\]:]/g, ' ').slice(0, 31) || 'Classement', { views: [{ rightToLeft: isRtl }] });
  ws.addRow(header()).font = { bold: true };
  for (const r of rows) ws.addRow(cells(r));
  ws.columns.forEach((c, i) => { c.width = i === 1 ? 28 : i === 4 ? 22 : 14; });
  download(new Blob([await wb.xlsx.writeBuffer()], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${stem}.xlsx`);
}

export async function exportWord(rows: RankRow[], title: string, subtitle: string, stem: string) {
  const d = await import('docx');
  const para = (text: string, o: { bold?: boolean; size?: number } = {}) =>
    new d.Paragraph({ bidirectional: isRtl, children: [new d.TextRun({ text, bold: o.bold, size: o.size, rightToLeft: isRtl })] });
  const row = (vals: (string | number)[], bold = false) =>
    new d.TableRow({ tableHeader: bold, children: vals.map((v) => new d.TableCell({ children: [para(String(v), { bold, size: 18 })] })) });
  const doc = new d.Document({
    sections: [{
      properties: { page: { size: { orientation: d.PageOrientation.LANDSCAPE } } },
      children: [
        para(title, { bold: true, size: 32 }),
        para(subtitle),
        new d.Table({ visuallyRightToLeft: isRtl, width: { size: 100, type: d.WidthType.PERCENTAGE }, rows: [row(header(), true), ...rows.map((r) => row(cells(r)))] }),
      ],
    }],
  });
  download(await d.Packer.toBlob(doc), `${stem}.docx`);
}
