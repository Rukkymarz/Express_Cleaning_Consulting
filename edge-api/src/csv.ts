export type CsvValue = string | number | boolean | null | undefined;

function safeSpreadsheetText(value: CsvValue): string {
  const text = value === null || value === undefined ? '' : String(value).replaceAll('\u0000', '');
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function csvCell(value: CsvValue): string {
  return `"${safeSpreadsheetText(value).replaceAll('"', '""')}"`;
}

export function renderCsv(headers: string[], rows: CsvValue[][]): string {
  const lines = [headers.map(csvCell).join(','), ...rows.map((row) => row.map(csvCell).join(','))];
  return `\uFEFF${lines.join('\r\n')}\r\n`;
}
