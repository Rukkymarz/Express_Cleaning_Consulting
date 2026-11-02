import { describe, expect, it } from 'vitest';
import { csvCell, renderCsv } from '../src/csv';

describe('lead CSV safety', () => {
  it('quotes commas, quotes, and line breaks', () => {
    expect(csvCell('Doe, "Jane"\nFollow up')).toBe('"Doe, ""Jane""\nFollow up"');
  });

  it('neutralizes spreadsheet formulas, including phone numbers beginning with plus', () => {
    expect(csvCell('=HYPERLINK("https://example.test")')).toBe('"\'=HYPERLINK(""https://example.test"")"');
    expect(csvCell('+12819727712')).toBe('"\'+12819727712"');
  });

  it('renders a UTF-8 BOM and CRLF-delimited document', () => {
    expect(renderCsv(['Name', 'Email'], [['Jane', null]])).toBe('\uFEFF"Name","Email"\r\n"Jane",""\r\n');
  });
});
