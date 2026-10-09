export interface RawCellData {
  r: number; // 1-based row index
  c: number; // 1-based col index
  coord: string; // e.g. "A1", "B12"
  v: unknown; // Typed raw value (number, string, boolean, Date)
  w: string; // Verbatim formatted text
  f?: string; // Formula without "="
  t: string; // Type: 'n' | 's' | 'b' | 'e' | 'd' | 'z'
  err?: string; // Error code if type is 'e'
  numFormat?: string; // Number format e.g. "0.00%"
}

export interface RawSheetData {
  sheetIndex: number;
  sheetName: string;
  dimensions: string;
  rowCount: number;
  colCount: number;
  nonEmptyRows: number;
  nonEmptyCells: number;
  totalCells: number;
  numericCells: number;
  textCells: number;
  formulaCells: number;
  errorCells: number;
  merges: string[];
  headers?: string[];
  detectedLayout: string;
  semanticParsed: boolean;
  semanticMetricCount: number;
  cells: RawCellData[];
}

export interface RawWorkbookExtraction {
  filename: string;
  totalSheets: number;
  nonEmptySheets: number;
  totalCellsCount: number;
  nonEmptyCellsCount: number;
  sheets: RawSheetData[];
  countsReconciled: boolean;
}

export interface QueryRawSheetCellsParams {
  documentId?: string;
  companyId?: string;
  sheetName?: string;
  sheetIndex?: number;
  range?: string; // e.g. "A1:D20"
  coord?: string; // e.g. "B5"
  minRow?: number;
  maxRow?: number;
  minCol?: number;
  maxCol?: number;
  searchQuery?: string;
  limit?: number; // default 100, max 500
  offset?: number; // default 0
}

export interface QueryRawSheetCellsResult {
  documentId: string;
  sheetName: string;
  sheetIndex: number;
  dimensions: string;
  totalCellsInSheet: number;
  isUntrustedData: true;
  securityNotice: string;
  boundedContainerXml?: string;
  coverage: {
    totalMatchingCells: number;
    returnedCellsCount: number;
    offset: number;
    limit: number;
    hasMore: boolean;
  };
  sheetMetadata: {
    rowCount: number;
    colCount: number;
    nonEmptyCells: number;
    merges: string[];
    detectedLayout: string;
    semanticParsed: boolean;
    semanticMetricCount: number;
  };
  cells: Array<{
    coord: string;
    row: number;
    col: number;
    rawValue: unknown;
    formattedText: string;
    formula?: string;
    type: string;
    error?: string;
  }>;
}
