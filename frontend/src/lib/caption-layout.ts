import type { StampConfig } from '@/components/route-preview';
import { CANVAS_WIDTH, MARGIN_RATIO } from './route-projection';
import { estimateStampTextWidth } from './stamp-columns';

export const CAPTION_MAX_LINES = 3;
const M = 3.6;

/** 캔버스 문구의 실제 글자 크기·여백. 입력 제한과 렌더링이 공유한다. */
export function captionMetrics(config: StampConfig) {
  const layout = config.layout ?? 'row';
  const u = M * (config.scale ?? 1);
  const size = layout === 'row' ? 34 * (config.scale ?? 1)
    : (layout === 'line' ? 26 : layout === 'bar' ? 15 : 13) * u;
  const margin = CANVAS_WIDTH * MARGIN_RATIO;
  const panelWidth = CANVAS_WIDTH - 32 * M;
  const left = layout === 'glass' ? Math.max(margin, 16 * M + Math.min(20 * u, panelWidth * 0.15)) : margin;
  const right = CANVAS_WIDTH - left;
  const dateSpace = config.enabled.date && ['bar', 'corner', 'glass'].includes(layout)
    ? estimateStampTextWidth('00.00', 11 * u) + 12 * M : 0;
  return { size, lineHeight: size * 1.3, left, right, width: Math.max(size, right - left - dateSpace) };
}

// 한글 조합 문자·이모지 묶음을 중간에서 자르지 않는다.
const segmenter = typeof Intl.Segmenter === 'function'
  ? new Intl.Segmenter('ko', { granularity: 'grapheme' }) : null;
function characters(text: string): string[] {
  if (segmenter) return Array.from(segmenter.segment(text), part => part.segment);
  // Segmenter가 없는 런타임에서도 결합 문자·이모지 연결자는 함께 유지한다.
  return Array.from(text.normalize('NFC')).reduce<string[]>((parts, char) => {
    const last = parts[parts.length - 1];
    const regional = /^[\u{1F1E6}-\u{1F1FF}]$/u;
    if (last && (/^[\p{Mark}\u{1F3FB}-\u{1F3FF}]$/u.test(char) || char === '\u200D'
      || last.endsWith('\u200D') || (regional.test(char) && regional.test(last)))) {
      parts[parts.length - 1] += char;
    } else parts.push(char);
    return parts;
  }, []);
}
export const normalizeCaption = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\t/g, ' ');

/** 자동 개행을 원문에 삽입하지 않는다. 명시적 개행은 빈 줄까지 보존한다. */
export function wrapCaption(text: string, width: number, size: number): string[] {
  if (!text) return [];
  const lines: string[] = [];
  for (const paragraph of normalizeCaption(text).split('\n')) {
    let line = '';
    let space = '';
    for (const token of paragraph.match(/\s+|\S+/gu) ?? []) {
      if (/^\s+$/u.test(token)) { space += token; continue; }
      const next = line + space + token;
      if (estimateStampTextWidth(next, size) <= width) {
        line = next;
      } else {
        if (line) lines.push(line.trimEnd());
        line = '';
        // 어절 자체가 폭보다 길 때만 글자 단위로 나눈다.
        for (const char of characters(token)) {
          if (line && estimateStampTextWidth(line + char, size) > width) {
            lines.push(line);
            line = '';
          }
          line += char;
        }
      }
      space = '';
    }
    lines.push(line.trimEnd());
  }
  return lines;
}

export function captionLines(text: string, config: StampConfig) {
  const { width, size } = captionMetrics(config);
  return wrapCaption(text, width, size);
}

/** 붙여넣기는 삽입 구간만 줄이고 기존 뒷부분은 보존한다. 크기 변경 후 삭제도 허용한다. */
export function limitCaptionInput(nextText: string, previousText: string, config: StampConfig) {
  const next = normalizeCaption(nextText);
  const previous = normalizeCaption(previousText);
  const nextChars = characters(next);
  const previousChars = characters(previous);
  let matched = 0;
  for (const char of previousChars) if (char === nextChars[matched]) matched++;
  const isDeletion = nextChars.length < previousChars.length && matched === nextChars.length;
  if (captionLines(next, config).length <= CAPTION_MAX_LINES
    || (isDeletion && captionLines(previous, config).length > CAPTION_MAX_LINES)) {
    return { text: next, limited: false };
  }
  let start = 0;
  while (start < nextChars.length && start < previousChars.length && nextChars[start] === previousChars[start]) start++;
  let tail = 0;
  while (tail < nextChars.length - start && tail < previousChars.length - start
    && nextChars[nextChars.length - 1 - tail] === previousChars[previousChars.length - 1 - tail]) tail++;
  const prefix = nextChars.slice(0, start).join('');
  const suffix = tail ? nextChars.slice(-tail).join('') : '';
  let accepted = '';
  let result = previous;
  for (const char of nextChars.slice(start, nextChars.length - tail)) {
    const candidate = prefix + accepted + char + suffix;
    if (captionLines(candidate, config).length > CAPTION_MAX_LINES) break;
    accepted += char;
    result = candidate;
  }
  return { text: result, limited: true };
}
