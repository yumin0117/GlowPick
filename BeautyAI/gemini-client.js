import { SCHEMAS, CLAIMS, EXTRACT_PROMPT, EXPLAIN_PROMPT, MOCK_EXTRACTION } from "./ai-assets.js";
import { BackendError, validate, generationSchema, normalizeIngredient, validateExtraction } from "./ai-core.js";

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_PIXELS = 24_000_000;
const MODEL = "gemini-3.5-flash-lite";
const PROMPT_VERSION = "v2-2026-11-04";
export const GEMINI_URL = "https://generativelanguage.googleapis.com/v1beta/interactions";
const NOTICE = "일반 성분 기능에 대한 참고 설명입니다. 전체 성분·완제품 효능·개인 적합성·혼합 허용을 검증한 결과가 아닙니다. 근거ID 연결 검사와 별도로 문헌 해석·한영 표기의 독립 사람 교차검토가 필요합니다.";

async function browserDecode(file) {
  if (globalThis.createImageBitmap) return createImageBitmap(file);
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    return { width: image.naturalWidth, height: image.naturalHeight, close() {} };
  } finally { URL.revokeObjectURL(url); }
}

function browserEncode(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new BackendError("INVALID_IMAGE", "사진을 읽을 수 없습니다."));
    reader.onload = () => resolve(reader.result.slice(reader.result.indexOf(",") + 1));
    reader.readAsDataURL(file);
  });
}

export async function validateImage(file, decodeImage = browserDecode) {
  if (!(file instanceof Blob) || !file.size) throw new BackendError("IMAGE_REQUIRED", "전성분이 보이는 사진을 올려주세요.");
  if (file.size > MAX_IMAGE_BYTES) throw new BackendError("IMAGE_TOO_LARGE", "사진은 10MiB 이하로 올려주세요.");
  const extension = (file.name || "").toLowerCase();
  const mimeByExtension = extension.endsWith(".png") ? "image/png"
    : /\.jpe?g$/u.test(extension) ? "image/jpeg" : extension.endsWith(".webp") ? "image/webp" : null;
  if (!mimeByExtension || file.type !== mimeByExtension) throw new BackendError("UNSUPPORTED_IMAGE", "파일 이름·형식이 일치하는 JPG·PNG·WEBP 사진을 올려주세요.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer);
  const ascii = (start, length) => String.fromCharCode(...bytes.subarray(start, start + length));
  const invalid = () => { throw new BackendError("INVALID_IMAGE", "사진 파일을 읽을 수 없습니다. 다시 저장해 올려주세요."); };
  let mime;
  if (bytes.length >= 33 && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, i) => bytes[i] === byte)) {
    mime = "image/png";
    if (view.getUint32(8) !== 13 || ascii(12, 4) !== "IHDR") invalid();
    let position = 8, end = false;
    while (position + 12 <= bytes.length) {
      const size = view.getUint32(position), type = ascii(position + 4, 4);
      if (position + size + 12 > bytes.length) invalid();
      if (["acTL", "fcTL", "fdAT"].includes(type)) throw new BackendError("UNSUPPORTED_IMAGE", "움직이는 사진 대신 정지 이미지 한 장을 올려주세요.");
      position += size + 12;
      if (type === "IEND") { end = size === 0 && position === bytes.length; break; }
    }
    if (!end) invalid();
    if (view.getUint32(16) * view.getUint32(20) > MAX_PIXELS) throw new BackendError("IMAGE_TOO_LARGE", "사진은 2,400만 픽셀 이하로 올려주세요.");
  } else if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes.at(-2) === 0xff && bytes.at(-1) === 0xd9) {
    mime = "image/jpeg";
  } else if (bytes.length >= 30 && ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP") {
    mime = "image/webp";
    if (view.getUint32(4, true) + 8 !== bytes.length) invalid();
    let position = 12;
    while (position + 8 <= bytes.length) {
      const size = view.getUint32(position + 4, true), type = ascii(position, 4);
      if (position + size + 8 > bytes.length) invalid();
      if (["ANIM", "ANMF"].includes(type) || (type === "VP8X" && (bytes[position + 8] & 2)))
        throw new BackendError("UNSUPPORTED_IMAGE", "움직이는 사진 대신 정지 이미지 한 장을 올려주세요.");
      position += size + 8 + size % 2;
    }
    if (position !== bytes.length) invalid();
  } else invalid();
  if (mime !== mimeByExtension) throw new BackendError("UNSUPPORTED_IMAGE", "사진의 확장자와 실제 내용이 일치하지 않습니다.");
  let decoded;
  try {
    decoded = await decodeImage(file);
    if (!decoded.width || !decoded.height) invalid();
    if (decoded.width * decoded.height > MAX_PIXELS) throw new BackendError("IMAGE_TOO_LARGE", "사진은 2,400만 픽셀 이하로 올려주세요.");
  } catch (error) {
    if (error instanceof BackendError) throw error;
    invalid();
  } finally { decoded?.close?.(); }
  return mime;
}

async function readJson(response, maxBytes = 2_000_000) {
  const reader = response.body?.getReader();
  if (!reader) throw new BackendError("MODEL_RESPONSE_INVALID", "Gemini 응답이 비어 있습니다.");
  let size = 0;
  const chunks = [], decoder = new TextDecoder();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new BackendError("MODEL_RESPONSE_INVALID", "모델 응답이 허용 크기를 넘었습니다.");
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
    return JSON.parse(chunks.join(""));
  } finally { reader.releaseLock(); }
}

// Keep categorical diagnostics only. Upstream messages may echo credentials,
// user text or request data and must never enter our response, UI or logs.
const PROVIDER_CODES = new Set([
  "invalid_request", "failed_precondition", "out_of_range", "parameter_unknown", "authentication",
  "payment_required", "permission_denied", "not_found", "model_not_found", "already_exists", "aborted",
  "rate_limit_exceeded", "quota_exceeded", "too_many_requests", "cancelled", "api_error", "unimplemented",
  "service_unavailable", "deadline_exceeded", "safety", "recitation", "language", "prohibited_content",
  "spii", "blocklist", "image_safety", "image_prohibited_content", "image_recitation", "image_other",
  "content_blocked", "malformed_function_call", "malformed_tool_call", "unexpected_tool_call",
  "no_image", "too_many_tool_calls", "missing_thought_signature"
]);

async function upstreamDiagnostics(response) {
  let body;
  try { body = await readJson(response, 64_000); } catch { /* HTTP status remains authoritative. */ }
  const error = body?.error;
  const providerCode = PROVIDER_CODES.has(error?.code) ? error.code : null;
  const message = typeof error?.message === "string" ? error.message.toLowerCase() : "";
  const categories = [
    ["schema_complexity", /too many states|schema.{0,80}(?:too complex|complexity)|(?:too complex|complexity).{0,80}schema/u],
    ["unsupported_parameter", /unknown (?:name|field|parameter)|unrecognized (?:field|parameter)|unsupported parameter/u],
    ["invalid_schema", /invalid.{0,40}schema|schema.{0,40}invalid/u],
    ["token_limit", /token.{0,40}(?:limit|exceed)|(?:limit|exceed).{0,40}token/u],
    ["billing_precondition", /billing/u],
    ["overloaded", /overloaded|high demand|capacity/u]
  ];
  const reason = categories.find(([, pattern]) => pattern.test(message))?.[0] || null;
  const retryAfter = response.headers.get("retry-after");
  const retryAfterSeconds = /^\d{1,5}$/u.test(retryAfter || "") ? Number(retryAfter) : null;
  return { httpStatus: response.status, providerCode, reason, retryAfterSeconds };
}

async function generate(apiKey, fetcher, timeoutMs, system, text, schema, image) {
  const input = [{ type: "text", text }];
  if (image) input.push({ type: "image", mime_type: image.mime, data: image.base64 });
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  let diagnostics = { httpStatus: null, providerCode: null, reason: null, retryAfterSeconds: null };
  try {
    const response = await fetcher(GEMINI_URL, {
      method: "POST", signal: controller.signal, credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
      body: JSON.stringify({ model: MODEL, input, system_instruction: system, store: false,
        response_format: { type: "text", mime_type: "application/json", schema: generationSchema(schema) },
        generation_config: { max_output_tokens: 6000 } })
    });
    diagnostics.httpStatus = response.status;
    if (!response.ok) {
      diagnostics = await upstreamDiagnostics(response);
      const errors = {
        400: ["GEMINI_REQUEST_REJECTED", "Gemini 요청 형식 또는 모델 설정을 확인해주세요."],
        401: ["GEMINI_AUTH_ERROR", "입력한 API 키를 확인해주세요."],
        402: ["BILLING_CONFIGURATION_ERROR", "결제 미연결 무료 프로젝트의 키인지 확인해주세요."],
        403: ["GEMINI_AUTH_ERROR", "키 권한 또는 무료 API 사용 자격을 확인해주세요."],
        404: ["MODEL_NOT_FOUND", "무료 모델 사용 가능 여부를 확인해주세요."],
        429: ["RATE_LIMITED", "Gemini 무료 한도에 도달했어요. 잠시 후 다시 시도해주세요."]
      };
      const [code, message] = errors[response.status] || ["GEMINI_UNAVAILABLE", "Gemini 요청에 실패했습니다. 잠시 후 확인해주세요."];
      throw new BackendError(code, message, response.status === 429 || response.status >= 500);
    }
    const body = await readJson(response);
    if (body?.status !== "completed") throw new BackendError("MODEL_INCOMPLETE", "모델 응답이 완료되지 않았습니다.", true);
    const output = typeof body.output_text === "string" ? body.output_text
      : (body.steps || []).filter(step => step.type === "model_output").flatMap(step => step.content || [])
        .filter(part => part.type === "text").map(part => part.text || "").join("");
    return JSON.parse(output);
  } catch (error) {
    let safe = error;
    if (!(error instanceof BackendError)) {
      if (error instanceof SyntaxError) safe = new BackendError("MODEL_RESPONSE_INVALID", "모델이 약속한 JSON 객체를 반환하지 않았습니다.");
      else if (controller.signal.aborted) safe = new BackendError("UPSTREAM_TIMEOUT", "Gemini 응답 시간이 초과되었습니다.", true);
      else safe = new BackendError("NETWORK_ERROR", "Gemini에 연결하지 못했습니다. 네트워크와 브라우저 연결 허용을 확인해주세요.", true);
    }
    safe.diagnostics = diagnostics;
    throw safe;
  } finally { clearTimeout(timer); }
}

// Dependencies are injectable for offline tests. The UI always creates live mode.
export function createStaticClient({ fetcher = fetch, decodeImage = browserDecode, encodeImage = browserEncode,
  now = Date.now, timeoutMs = 45000, mode = "live", claims = CLAIMS } = {}) {
  if (!["live", "mock"].includes(mode)) throw new Error("Invalid mode");
  for (const claim of claims) {
    validate(claim, SCHEMAS.ReviewedClaim);
    if (!/^https?:\/\//u.test(claim.sourceUrl)) throw new Error("Invalid reviewed source");
  }
  let active = false, events = [];
  return {
    async health() {
      // No network request and no key access on page load.
      return { status: "ok", mode, requiresUserKey: true, transport: "browser-direct", readyForLive: mode === "live",
        schemaVersion: "1.0", promptVersion: PROMPT_VERSION, promptStatus: "final" };
    },
    async analyze(endpoint, file, request, apiKey) {
      const result = { ok: false, requestId: crypto.randomUUID().replaceAll("-", ""), extraction: null,
        analysis: null, mixing: null, error: null, meta: { schemaVersion: "1.0", mode, isMock: mode === "mock",
          model: mode === "live" ? MODEL : null, promptVersion: PROMPT_VERSION, promptStatus: "final",
          timestamp: new Date(now()).toISOString(), transport: "browser-direct" } };
      let acquired = false, stage = "validation";
      try {
        if (!["/analyze_cosmetic", "/consult_modeling_pack"].includes(endpoint)) throw new BackendError("INVALID_INPUT", "API 작업 이름을 확인해주세요.");
        validate(request, SCHEMAS.UserInput, SCHEMAS.UserInput, "INVALID_INPUT");
        const context = { productName: null, packName: null, skinType: "잘 모르겠음", concerns: [], extraConcern: "", notes: "", ...request };
        // Google issues multiple key formats. Do not hard-code a legacy prefix.
        if (mode === "live" && (typeof apiKey !== "string" || apiKey.length < 20 || apiKey.length > 512 || /[^\x21-\x7e]/u.test(apiKey)))
          throw new BackendError("KEY_REQUIRED", "분석에 사용할 Gemini API 키를 다시 입력해주세요.");
        if (active) throw new BackendError("SERVER_BUSY", "이 탭에서 다른 요청이 진행 중입니다.", true);
        events = events.filter(event => now() - event < 60000);
        if (events.length >= 6) throw new BackendError("SERVER_BUSY", "이 탭의 분당 요청 한도입니다. 잠시 후 다시 시도해주세요.", true);
        active = true; acquired = true;
        stage = "image_validation";
        const mime = await validateImage(file, decodeImage);
        events.push(now());
        if (mode === "mock") {
          result.extraction = validateExtraction(structuredClone(MOCK_EXTRACTION), SCHEMAS.Extraction);
          result.meta.notice = "모의 연동 시험입니다. 업로드한 사진을 AI로 판독하지 않았습니다.";
        } else {
          const image = { mime, base64: await encodeImage(file) };
          stage = "extraction";
          result.extraction = validateExtraction(await generate(apiKey, fetcher, timeoutMs, EXTRACT_PROMPT,
            "첨부 이미지의 전성분을 판독하세요. 제품 정답표·사용자 피부정보는 판독에 제공하지 않습니다.", SCHEMAS.Extraction, image), SCHEMAS.Extraction);
        }
        const extraction = result.extraction;
        const names = new Set(extraction.ingredients.map(normalizeIngredient));
        const selected = claims.filter(claim => names.has(normalizeIngredient(claim.ingredient)));
        if (extraction.status !== "complete") {
          result.analysis = { status: "not_run", summary: "판독을 완료한 뒤 설명을 진행합니다.", ingredientNotes: [], warnings: [] };
        } else if (!selected.length || mode === "mock") {
          result.analysis = { status: "needs_evidence", summary: "전성분 판독은 완료했습니다. 일치하는 검토 완료 기능 근거가 아직 없습니다.",
            ingredientNotes: [], warnings: ["미확인 성분 기능과 특정 제품 추천을 임의로 생성하지 않습니다."] };
        } else {
          const payload = { ingredients: extraction.ingredients, skinType: context.skinType, concerns: context.concerns,
            extraConcern: context.extraConcern, notes: context.notes, approvedClaims: selected };
          stage = "explanation";
          const analysis = validate(await generate(apiKey, fetcher, timeoutMs, EXPLAIN_PROMPT, JSON.stringify(payload), SCHEMAS.ModelAnalysis), SCHEMAS.ModelAnalysis);
          stage = "evidence_validation";
          const evidence = new Map(selected.map(claim => [claim.evidenceId, claim]));
          for (const note of analysis.ingredientNotes) {
            if (!names.has(normalizeIngredient(note.ingredient))) throw new BackendError("EVIDENCE_VALIDATION_FAILED", "설명에 판독되지 않은 성분이 포함되어 있습니다.");
            for (const id of note.evidenceIds) {
              if (!evidence.has(id) || normalizeIngredient(evidence.get(id).ingredient) !== normalizeIngredient(note.ingredient))
                throw new BackendError("EVIDENCE_VALIDATION_FAILED", "성분 설명의 근거ID가 자료와 일치하지 않습니다.");
            }
          }
          result.analysis = { status: "reference_only", ...analysis, sources: selected, notice: NOTICE };
        }
        result.mixing = endpoint === "/consult_modeling_pack"
          ? { status: "unknown", reason: "특정 모델링팩·앰플·제품 버전·사용 조건의 검토 완료 근거가 아직 없습니다.", evidenceIds: [] }
          : { status: "not_applicable", reason: "", evidenceIds: [] };
        result.ok = true;
      } catch (error) {
        const safe = error instanceof BackendError ? error : new BackendError("INTERNAL_ERROR", "처리에 실패했습니다. 요청 번호와 오류 코드를 담당자에게 알려주세요.");
        result.error = { code: safe.code, message: safe.message, retryable: safe.retryable };
        result.meta.failure = { stage, ...safe.diagnostics, extractionCompleted: result.extraction?.status === "complete" };
      } finally {
        // Best-effort reference release; JavaScript cannot promise a secure memory wipe.
        apiKey = "";
        if (acquired) active = false;
      }
      return result;
    }
  };
}
