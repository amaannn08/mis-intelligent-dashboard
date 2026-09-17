import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import {
  validateFileSize,
  validateFileBytesAndExtension,
  computeChecksum,
} from '../apps/web/src/lib/documents.js';
import { isUuid, generateSlug } from '../apps/web/src/lib/companies.js';

// Schemas mirroring the API route definitions
const loginSchema = z.object({
  username: z.string().min(1, 'Username is required'),
  password: z.string().min(1, 'Password is required'),
});

const createCompanySchema = z.object({
  name: z.string().min(1, 'Company name is required'),
  industry: z.string().optional(),
  description: z.string().optional(),
});

const listQuerySchema = z.object({
  search: z.string().optional(),
  industry: z.string().optional(),
  sort: z.enum(['name', 'revenue', 'period', 'updated']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

const querySchema = z.object({
  question: z.string().min(1, 'Question cannot be empty'),
  companyId: z.string().uuid().nullable().optional(),
  sessionId: z.string().uuid().optional(),
  scope: z.string().optional(),
});

describe('API Validation: Zod Schemas', () => {
  it('validates and rejects invalid login payloads', () => {
    expect(loginSchema.safeParse({ username: 'wehcrm', password: 'secret' }).success).toBe(true);

    // Missing password
    const noPass = loginSchema.safeParse({ username: 'wehcrm' });
    expect(noPass.success).toBe(false);

    // Empty username
    const emptyUser = loginSchema.safeParse({ username: '', password: 'foo' });
    expect(emptyUser.success).toBe(false);

    // Malformed types
    const badTypes = loginSchema.safeParse({ username: 123, password: true });
    expect(badTypes.success).toBe(false);
  });

  it('validates and rejects invalid company creation payloads', () => {
    expect(createCompanySchema.safeParse({ name: 'Acme Corp' }).success).toBe(true);
    expect(createCompanySchema.safeParse({ name: 'Acme Corp', industry: 'SaaS' }).success).toBe(true);

    // Empty or missing name
    expect(createCompanySchema.safeParse({ name: '' }).success).toBe(false);
    expect(createCompanySchema.safeParse({}).success).toBe(false);
  });

  it('validates query params and rejects out-of-range pagination or unknown sort enums', () => {
    const valid = listQuerySchema.safeParse({ sort: 'revenue', page: '2', limit: '50' });
    expect(valid.success).toBe(true);
    if (valid.success) {
      expect(valid.data.page).toBe(2);
      expect(valid.data.limit).toBe(50);
    }

    // Invalid sort enum
    expect(listQuerySchema.safeParse({ sort: 'invalid_sort' }).success).toBe(false);

    // Page < 1
    expect(listQuerySchema.safeParse({ page: '0' }).success).toBe(false);
    expect(listQuerySchema.safeParse({ page: '-5' }).success).toBe(false);

    // Limit > 100
    expect(listQuerySchema.safeParse({ limit: '500' }).success).toBe(false);
  });

  it('validates RAG query body and requires valid UUIDs for companyId and sessionId', () => {
    expect(querySchema.safeParse({ question: 'What was the revenue?' }).success).toBe(true);

    const validUuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';
    expect(querySchema.safeParse({ question: 'Revenue?', companyId: validUuid }).success).toBe(true);
    expect(querySchema.safeParse({ question: 'Revenue?', companyId: null, sessionId: validUuid, scope: 'portfolio' }).success).toBe(true);

    // Empty question
    expect(querySchema.safeParse({ question: '' }).success).toBe(false);
    expect(querySchema.safeParse({}).success).toBe(false);

    // Non-UUID companyId
    expect(querySchema.safeParse({ question: 'Revenue?', companyId: 'not-a-uuid' }).success).toBe(false);
  });

  it('validates chat session creation and patch schemas', () => {
    const validUuid = '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d';

    const createSchema = z.object({
      companyId: z.string().uuid().nullable().optional(),
      title: z.string().optional(),
    });

    const patchSchema = z.object({
      title: z.string().optional(),
      companyId: z.string().uuid().nullable().optional(),
    });

    // Valid create bodies
    expect(createSchema.safeParse({}).success).toBe(true);
    expect(createSchema.safeParse({ title: 'New chat' }).success).toBe(true);
    expect(createSchema.safeParse({ companyId: validUuid }).success).toBe(true);
    expect(createSchema.safeParse({ companyId: null }).success).toBe(true);

    // Invalid create
    expect(createSchema.safeParse({ companyId: 'not-a-uuid' }).success).toBe(false);

    // Valid patch bodies
    expect(patchSchema.safeParse({ title: 'Renamed Chat' }).success).toBe(true);
    expect(patchSchema.safeParse({ companyId: null }).success).toBe(true); // companyId: null = All portfolio
    expect(patchSchema.safeParse({ companyId: validUuid }).success).toBe(true);

    // Invalid patch
    expect(patchSchema.safeParse({ companyId: 'invalid-id' }).success).toBe(false);
  });
});

describe('API Validation: File Upload & Size Ceilings', () => {
  it('enforces file size ceilings', () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      // Test dev ceiling (15 MB)
      process.env.NODE_ENV = 'development';
      expect(validateFileSize(4.5 * 1024 * 1024).valid).toBe(true);
      expect(validateFileSize(14 * 1024 * 1024).valid).toBe(true);
      expect(validateFileSize(16 * 1024 * 1024).valid).toBe(false);

      // Test prod ceiling (4.5 MB)
      process.env.NODE_ENV = 'production';
      expect(validateFileSize(4 * 1024 * 1024).valid).toBe(true);
      expect(validateFileSize(5 * 1024 * 1024).valid).toBe(false);
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  it('validates file extensions and rejects unsupported extensions', () => {
    const dummyBuffer = Buffer.from('test');

    const exeResult = validateFileBytesAndExtension('malicious.exe', 'application/octet-stream', dummyBuffer);
    expect(exeResult.valid).toBe(false);
    expect(exeResult.errorCode).toBe('INVALID_EXTENSION');

    const zipResult = validateFileBytesAndExtension('archive.zip', 'application/zip', dummyBuffer);
    expect(zipResult.valid).toBe(false);
    expect(zipResult.errorCode).toBe('INVALID_EXTENSION');
  });

  it('validates magic bytes for PDF and XLSX files and rejects disguised files', () => {
    // Valid PDF buffer (%PDF-1.4)
    const validPdfBuffer = Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj');
    const pdfResult = validateFileBytesAndExtension('report.pdf', 'application/pdf', validPdfBuffer);
    expect(pdfResult.valid).toBe(true);
    expect(pdfResult.detectedType).toBe('pdf');

    // Valid XLSX buffer (PK ZIP archive header: 50 4B 03 04)
    const validXlsxBuffer = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const xlsxResult = validateFileBytesAndExtension('report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', validXlsxBuffer);
    expect(xlsxResult.valid).toBe(true);
    expect(xlsxResult.detectedType).toBe('xlsx');

    // Disguised file: .xlsx extension but plain text content
    const fakeBuffer = Buffer.from('Just plain text pretending to be excel');
    const disguisedResult = validateFileBytesAndExtension('report.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', fakeBuffer);
    expect(disguisedResult.valid).toBe(false);
    expect(disguisedResult.errorCode).toBe('INVALID_FILE_CONTENT');
  });

  it('computes deterministic SHA-256 checksum for deduplication', () => {
    const b1 = Buffer.from('Monthly MIS Data');
    const b2 = Buffer.from('Monthly MIS Data');
    const b3 = Buffer.from('Different MIS Data');

    expect(computeChecksum(b1)).toBe(computeChecksum(b2));
    expect(computeChecksum(b1)).not.toBe(computeChecksum(b3));
  });

  it('validates company slug generation and UUID helpers', () => {
    expect(generateSlug('Noto Ice Creams Pvt. Ltd.')).toBe('noto-ice-creams-pvt-ltd');
    expect(generateSlug('   Company   &   Co.  ')).toBe('company-co');
    expect(isUuid('9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d')).toBe(true);
    expect(isUuid('not-a-uuid')).toBe(false);
  });
});
