import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { ParsedBlock } from '../types.js';

export function parseDocx(bytes: Buffer | Uint8Array): ParsedBlock[] {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  const tmpFile = path.join(
    os.tmpdir(),
    `mis_docx_${Date.now()}_${Math.random().toString(36).slice(2)}.docx`
  );
  fs.writeFileSync(tmpFile, buf);
  try {
    const xml = execFileSync('unzip', ['-p', tmpFile, 'word/document.xml'], {
      encoding: 'utf-8',
      maxBuffer: 50 * 1024 * 1024,
    });

    const paragraphs: string[] = [];
    const pRegex = /<w:p(?:\s+[^>]*)?>([\s\S]*?)<\/w:p>/g;
    let pMatch: RegExpExecArray | null;
    while ((pMatch = pRegex.exec(xml)) !== null) {
      const pContent = pMatch[1] ?? '';
      const textMatches = pContent.match(/<w:t(?:\s+[^>]*)?>([^<]*)<\/w:t>/g);
      if (textMatches) {
        const pText = textMatches
          .map((m) => m.replace(/<[^>]+>/g, ''))
          .join('')
          .trim();
        if (pText) paragraphs.push(pText);
      }
    }
    const fullText =
      paragraphs.length > 0
        ? paragraphs.join('\n\n')
        : xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();

    return [
      {
        text: fullText,
        page: 1,
      },
    ];
  } catch (err) {
    console.warn('Failed to parse docx via unzip:', err);
    return [];
  } finally {
    try {
      if (fs.existsSync(tmpFile)) fs.unlinkSync(tmpFile);
    } catch {
      // ignore
    }
  }
}
