export type DocumentFormatPreset = {
  label: string;
  description: string;
  pageSize: 'letter' | 'a4';
  margins: { top: number; right: number; bottom: number; left: number }; // in points
  columns: 1 | 2;
  columnGap: string; // CSS value e.g. "0.33in"
  fontFamily: string;
  fontSize: string; // e.g. "10pt"
  lineSpacing: number; // e.g. 2.0
};

export const DOCUMENT_FORMATS: Record<string, DocumentFormatPreset> = {
  default: {
    label: 'Default',
    description: 'Standard document format',
    pageSize: 'letter',
    margins: { top: 72, right: 72, bottom: 72, left: 72 }, // 1" all sides
    columns: 1,
    columnGap: '0in',
    fontFamily: 'Times New Roman',
    fontSize: '12pt',
    lineSpacing: 1.4,
  },
  ieee: {
    label: 'IEEE',
    description: 'IEEE conference/journal format',
    pageSize: 'letter',
    margins: { top: 54, right: 45, bottom: 54, left: 45 }, // 0.75" top/bottom, 0.625" sides
    columns: 2,
    columnGap: '0.33in',
    fontFamily: 'Times New Roman',
    fontSize: '10pt',
    lineSpacing: 1.0,
  },
  apa7: {
    label: 'APA 7th',
    description: 'American Psychological Association 7th edition',
    pageSize: 'letter',
    margins: { top: 72, right: 72, bottom: 72, left: 72 }, // 1" all sides
    columns: 1,
    columnGap: '0in',
    fontFamily: 'Times New Roman',
    fontSize: '12pt',
    lineSpacing: 2.0,
  },
  mla9: {
    label: 'MLA 9th',
    description: 'Modern Language Association 9th edition',
    pageSize: 'letter',
    margins: { top: 72, right: 72, bottom: 72, left: 72 }, // 1" all sides
    columns: 1,
    columnGap: '0in',
    fontFamily: 'Times New Roman',
    fontSize: '12pt',
    lineSpacing: 2.0,
  },
  chicago: {
    label: 'Chicago',
    description: 'Chicago Manual of Style',
    pageSize: 'letter',
    margins: { top: 72, right: 72, bottom: 72, left: 72 }, // 1" all sides
    columns: 1,
    columnGap: '0in',
    fontFamily: 'Times New Roman',
    fontSize: '12pt',
    lineSpacing: 2.0,
  },
  acm: {
    label: 'ACM',
    description: 'ACM conference/journal format',
    pageSize: 'letter',
    margins: { top: 54, right: 45, bottom: 54, left: 45 }, // 0.75" top/bottom, 0.625" sides
    columns: 2,
    columnGap: '0.33in',
    fontFamily: 'Times New Roman',
    fontSize: '9pt',
    lineSpacing: 1.0,
  },
};

export const DEFAULT_FORMAT_KEY = 'default';
