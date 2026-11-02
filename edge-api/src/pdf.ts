import type { AccountInvoice, AccountInvoiceItem } from './db';

type PdfLine = { text: string; size: number; bold: boolean; gapBefore: number };
type PositionedLine = PdfLine & { y: number };

const encoder = new TextEncoder();

function ascii(value: unknown): string {
  return String(value ?? '')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\x20-\x7E]/g, '?')
    .replace(/\s+/g, ' ')
    .trim();
}

function pdfLiteral(value: string): string {
  return ascii(value).replace(/[\\()]/g, '\\$&');
}

function cents(value: number | string, currency: string): string {
  let amount: bigint;
  try { amount = BigInt(value); } catch { throw new Error('Invoice contains an invalid monetary amount.'); }
  const negative = amount < 0n;
  if (negative) amount = -amount;
  const whole = amount / 100n;
  const fraction = String(amount % 100n).padStart(2, '0');
  const formatted = `${whole.toLocaleString('en-US')}.${fraction}`;
  const prefix = ascii(currency).toUpperCase() === 'USD' ? '$' : `${ascii(currency).toUpperCase()} `;
  return `${negative ? '-' : ''}${prefix}${formatted}`;
}

function date(value: string | null): string {
  if (!value) return 'Not specified';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return 'Not specified';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(parsed);
}

function serviceDate(value: string, timeZone: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.valueOf())) return 'Not specified';
  try {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium', timeStyle: 'short', timeZone,
    }).format(parsed);
  } catch {
    return new Intl.DateTimeFormat('en-US', {
      dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC',
    }).format(parsed);
  }
}

function wrap(value: string, maximum = 82): string[] {
  const source = ascii(value);
  if (!source) return [''];
  const result: string[] = [];
  let line = '';
  for (const word of source.split(' ')) {
    if (word.length > maximum) {
      if (line) result.push(line);
      for (let offset = 0; offset < word.length; offset += maximum) result.push(word.slice(offset, offset + maximum));
      line = '';
      continue;
    }
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length <= maximum) line = candidate;
    else {
      result.push(line);
      line = word;
    }
  }
  if (line) result.push(line);
  return result;
}

function buildLines(invoice: AccountInvoice, items: AccountInvoiceItem[]): PdfLine[] {
  const lines: PdfLine[] = [];
  const add = (text: string, size = 10, bold = false, gapBefore = 0) => {
    for (const [index, part] of wrap(text, size >= 16 ? 60 : 82).entries()) {
      lines.push({ text: part, size, bold, gapBefore: index === 0 ? gapBefore : 0 });
    }
  };
  add('Express Cleaning Consult', 19, true);
  add(`Invoice ${invoice.invoice_number}`, 15, true, 5);
  add(`Issued: ${date(invoice.issued_at)}    Due: ${date(invoice.due_at)}`, 10, false, 6);
  add(`Customer: ${invoice.customer_name} <${invoice.customer_email}>`, 10);
  const address = [invoice.street, invoice.unit, invoice.city, invoice.region, invoice.postal_code]
    .filter((part) => Boolean(part && String(part).trim())).join(', ');
  add(`Service address: ${address || 'Not specified'}`, 10);
  add(`Scheduled service: ${serviceDate(invoice.service_at, invoice.time_zone)} (${invoice.time_zone})`, 10);

  add('Approved services', 13, true, 10);
  if (!items.length) add('Service scope as approved in the written quote.');
  for (const item of items) {
    add(item.description, 10, true, 4);
    add(`${item.quantity} x ${cents(item.unit_cents, invoice.currency)} = ${cents(item.total_cents, invoice.currency)}`);
  }

  add(`Subtotal: ${cents(invoice.subtotal_cents, invoice.currency)}`, 10, false, 10);
  add(`Tax: ${cents(invoice.tax_cents, invoice.currency)}`);
  add(`Total: ${cents(invoice.total_cents, invoice.currency)}`, 11, true);
  add(`Verified live payments: ${cents(invoice.paid_cents, invoice.currency)}`);
  add(`Balance due: ${cents(invoice.balance_due_cents, invoice.currency)}`, 12, true);
  add('Test-mode Stripe activity is never counted as a live payment.', 9, false, 9);
  add('A free quote request does not charge you. Payment is due only under the approved quote and invoice terms.', 9);
  add('Questions: support@expresscleaningconsult.com | (281) 972-7712', 9, true, 8);
  return lines;
}

function paginate(lines: PdfLine[]): PositionedLine[][] {
  const pages: PositionedLine[][] = [[]];
  let y = 742;
  for (const line of lines) {
    const height = Math.max(14, line.size + 4);
    if (y - line.gapBefore - height < 58 && pages[pages.length - 1]?.length) {
      pages.push([]);
      y = 742;
    }
    y -= line.gapBefore;
    pages[pages.length - 1]?.push({ ...line, y });
    y -= height;
  }
  return pages;
}

function pageStream(lines: PositionedLine[], pageNumber: number, totalPages: number): string {
  const commands = ['BT'];
  for (const line of lines) {
    commands.push(`/${line.bold ? 'F2' : 'F1'} ${line.size} Tf`);
    commands.push(`1 0 0 1 54 ${line.y} Tm`);
    commands.push(`(${pdfLiteral(line.text)}) Tj`);
  }
  commands.push('/F1 8 Tf');
  commands.push('1 0 0 1 54 30 Tm');
  commands.push(`(Express Cleaning Consult - Page ${pageNumber} of ${totalPages}) Tj`);
  commands.push('ET');
  return commands.join('\n');
}

export function buildInvoicePdf(invoice: AccountInvoice, items: AccountInvoiceItem[]): Uint8Array {
  const pages = paginate(buildLines(invoice, items));
  const objects: string[] = [];
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  objects[4] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>';
  const pageReferences: string[] = [];
  for (let index = 0; index < pages.length; index += 1) {
    const pageObject = 5 + index * 2;
    const contentObject = pageObject + 1;
    pageReferences.push(`${pageObject} 0 R`);
    const stream = pageStream(pages[index] as PositionedLine[], index + 1, pages.length);
    objects[pageObject] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentObject} 0 R >>`;
    objects[contentObject] = `<< /Length ${encoder.encode(stream).byteLength} >>\nstream\n${stream}\nendstream`;
  }
  objects[2] = `<< /Type /Pages /Count ${pages.length} /Kids [${pageReferences.join(' ')}] >>`;

  const chunks: string[] = ['%PDF-1.4\n'];
  const offsets: number[] = [0];
  let length = encoder.encode(chunks[0] as string).byteLength;
  for (let id = 1; id < objects.length; id += 1) {
    const chunk = `${id} 0 obj\n${objects[id]}\nendobj\n`;
    offsets[id] = length;
    chunks.push(chunk);
    length += encoder.encode(chunk).byteLength;
  }
  const xrefOffset = length;
  chunks.push(`xref\n0 ${objects.length}\n`);
  chunks.push('0000000000 65535 f \n');
  for (let id = 1; id < objects.length; id += 1) {
    chunks.push(`${String(offsets[id]).padStart(10, '0')} 00000 n \n`);
  }
  chunks.push(`trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`);
  return encoder.encode(chunks.join(''));
}
