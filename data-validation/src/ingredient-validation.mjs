/** Product-independent comparison. No network, database lookup or AI inference. */
export function normalizeIngredient(value) {
  if (typeof value !== 'string') throw new TypeError('성분은 문자열이어야 합니다.');
  return value.normalize('NFKC').replace(/\s+/gu, ' ').trim().replace(/\.$/u, '').trim().toLowerCase();
}

/** Prefer a model-produced array. This helper only splits explicit delimiters.
 * Keeps commas in 1,2-Hexanediol and parenthesized 1,500ppm. Does not split
 * line-wraps, '/', '&' or hyphens. Does not guess synonyms or repair OCR typos.
 */
export function splitIngredients(raw) {
  if (typeof raw !== 'string') throw new TypeError('원문은 문자열이어야 합니다.');
  const text = raw.normalize('NFKC');
  let depth = 0, token = '', result = [];
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if ('([{'.includes(ch)) depth++;
    if (')]}'.includes(ch)) depth--;
    if (depth < 0) throw new Error('닫는 괄호가 맞지 않습니다. 수동 확인이 필요합니다.');
    const numericComma = ch === ',' && /\d/.test(text[i - 1] || '') && /\d/.test(text[i + 1] || '');
    if (depth === 0 && (ch === ';' || (ch === ',' && !numericComma))) {
      if (token.trim()) result.push(token.replace(/\s+/gu, ' ').trim());
      token = '';
    } else token += ch;
  }
  if (depth !== 0) throw new Error('괄호가 닫히지 않았습니다. 수동 확인이 필요합니다.');
  if (token.trim()) result.push(token.replace(/\s+/gu, ' ').trim().replace(/\.$/u, ''));
  return result;
}
function counts(values) {
  const map = new Map();
  for (const v of values) map.set(v, (map.get(v) || 0) + 1);
  return map;
}
function lcsLength(a, b) {
  let previous = Array(b.length + 1).fill(0);
  for (const item of a) {
    const row = Array(b.length + 1).fill(0);
    for (let j = 1; j <= b.length; j++) row[j] = item === b[j - 1] ? previous[j - 1] + 1 : Math.max(previous[j], row[j - 1]);
    previous = row;
  }
  return previous[b.length];
}
export function compareIngredients(expected, actual) {
  if (!Array.isArray(expected) || !Array.isArray(actual)) throw new TypeError('정답과 출력은 문자열 배열이어야 합니다.');
  const gold = expected.map(normalizeIngredient), output = actual.map(normalizeIngredient);
  if (!gold.length || gold.some(x => !x) || output.some(x => !x)) throw new Error('정답이 없거나 빈 성분 항목이 있습니다.');
  const gc = counts(gold), oc = counts(output);
  const missing = [], extra = [], duplicates = [];
  let matched = 0;
  for (const [name, count] of gc) {
    const found = oc.get(name) || 0;
    matched += Math.min(count, found);
    for (let i = found; i < count; i++) missing.push(name);
  }
  for (const [name, count] of oc) {
    const allowed = gc.get(name) || 0;
    for (let i = allowed; i < count; i++) extra.push(name);
    if (allowed > 0 && count > allowed) duplicates.push({ name, excess: count - allowed });
  }
  const orderError = lcsLength(gold, output) < matched;
  return {
    expectedCount: gold.length, actualCount: output.length, matched,
    missing, extra, duplicates, orderError,
    recall: matched / gold.length,
    precision: output.length ? matched / output.length : null,
    pass: missing.length === 0 && extra.length === 0 && !orderError
  };
}

/** A shape/consistency check, not proof that an image was read correctly. */
export function validateExtraction(response) {
  const errors = [];
  if (!response || typeof response !== 'object' || Array.isArray(response)) return { valid: false, errors: ['응답 객체가 필요합니다.'] };
  const statuses = ['complete', 'partial', 'unreadable', 'no_ingredients', 'multiple_products'];
  if (!statuses.includes(response.status)) errors.push('알 수 없는 추출 상태');
  if (typeof response.rawText !== 'string') errors.push('rawText 문자열 필요');
  if (!Array.isArray(response.ingredients) || response.ingredients.some(v => typeof v !== 'string' || !v.trim())) errors.push('ingredients는 비어 있지 않은 문자열의 배열이어야 함');
  if (!Array.isArray(response.uncertainSpans) || response.uncertainSpans.some(v => typeof v !== 'string')) errors.push('uncertainSpans 문자열 배열 필요');
  if (!Array.isArray(response.warnings) || response.warnings.some(v => typeof v !== 'string')) errors.push('warnings 문자열 배열 필요');
  if (response.status === 'complete' && (typeof response.rawText !== 'string' || !response.rawText.trim() || !response.ingredients?.length || response.uncertainSpans?.length)) errors.push('완료에는 원문·성분·불확실 구간 없음이 필요');
  if (['no_ingredients','unreadable','multiple_products'].includes(response.status) && response.ingredients?.length) errors.push('목록 없음·판독 불가·다중 제품 상태에서 단일 전성분 확정 금지');
  if (response.status !== 'complete' && typeof response.nextAction !== 'string') errors.push('미완료 상태의 nextAction 필요');
  return { valid: errors.length === 0, errors };
}

/** Trusted evidence must be curated OUTSIDE the model response.
 * No evidence in this starter pack meets the exact-pair verified condition.
 */
export function validateMixingDecision(decision, trustedEvidence = []) {
  if (!decision || !['allowed','prohibited','unknown'].includes(decision.status)) return { valid: false, errors: ['혼합 상태 필요'] };
  if (decision.status === 'unknown') return { valid: true, errors: [] };
  const found = trustedEvidence.find(e => e.evidence_id === decision.evidenceId && e.kind === 'mixing_instruction' && e.review_status === 'verified_exact_pair' && e.packId === decision.packId && e.ampouleId === decision.ampouleId && e.packVersion === decision.packVersion && e.ampouleVersion === decision.ampouleVersion && e.decision === decision.status && typeof e.source_url === 'string' && /^https?:\/\//.test(e.source_url) && e.packId && e.ampouleId && e.packVersion && e.ampouleVersion && (decision.status !== 'allowed' || (typeof e.conditions === 'string' && e.conditions.trim())));
  return { valid: !!found, errors: found ? [] : ['해당 제품·버전 조합에 대한 검토 완료 제조사 근거가 없음'] };
}
