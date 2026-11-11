import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { prepareReport } from "../BeautyAI/report-model.js";
import { CLAIMS } from "../BeautyAI/ai-assets.js";

const input = { productName: null, skinType: "잘 모르겠음", concerns: ["건조함"], extraConcern: "" };
function response() {
  const sources = CLAIMS.filter(claim => ["YSW_G001_KO", "YSW_A001_KO"].includes(claim.evidenceId));
  return { ok: true, extraction: { status: "complete", productName: null, rawText: "글리세린, 알란토인, NEW",
    ingredients: ["글리세린", "알란토인", "NEW"], uncertainSpans: [], warnings: [], nextAction: "" },
    analysis: { status: "reference_only", summary: "일반 기능 참고", sources,
      ingredientNotes: sources.map(claim => ({ ingredient: claim.ingredient, explanation: claim.statement, evidenceIds: [claim.evidenceId] })),
      warnings: [], notice: "독립 사람 교차검토가 필요합니다." },
    mixing: { status: "unknown", reason: "검토 완료 조합 근거 없음" }, meta: { isMock: false, promptStatus: "draft" } };
}

test("new GUI preserves response states, general notes, order and evidence", () => {
  const result = response(), report = prepareReport("cosmetic", input, result);
  assert.equal(report.complete, true);
  assert.equal(report.analysisStatus, "reference_only");
  assert.deepEqual(report.ingredients, result.extraction.ingredients);
  assert.equal(report.notes.length, 2);
  assert.deepEqual(report.sources, result.analysis.sources);
  assert.match(report.banner, /실제 Gemini 응답/u);
  assert.match(report.banner, /임시 프롬프트/u);
  assert.ok(report.warnings.includes(result.analysis.notice));
});

test("dryness card uses a reviewed moisturizing ID and gives no personal efficacy verdict", () => {
  const report = prepareReport("cosmetic", input, response());
  assert.deepEqual(report.helpful.map(note => note.ingredient), ["글리세린"]);
  assert.match(report.helpful[0].reason, /개인별 효과와 제품 적합성을 판단한 결과는 아니/u);
  assert.deepEqual(report.unknown, ["NEW"]);
});

test("general conditioning is not automatically a dryness or risk classification", () => {
  const report = prepareReport("cosmetic", { ...input, concerns: ["홍조"] }, response());
  assert.equal(report.helpful.length, 0);
  assert.deepEqual(report.unknown, ["NEW"]);
  assert.match(report.copyText, /모든 성분이 안전하다는 뜻은 아닙니다/u);
});

test("unselected, wrong-name and unreviewed evidence cannot drive the helpful card", () => {
  for (const change of [
    result => { result.analysis.sources = []; },
    result => { result.analysis.sources[0].reviewStatus = "unreviewed"; },
    result => { result.analysis.sources[0].ingredient = "OTHER"; },
    result => { result.analysis.ingredientNotes[0].evidenceIds = ["FAKE_ID"]; }
  ]) {
    const result = structuredClone(response()); change(result);
    assert.equal(prepareReport("cosmetic", input, result).helpful.length, 0);
  }
});

test("every incomplete extraction keeps next action, warning and raw text in the report/copy", () => {
  for (const status of ["partial", "unreadable", "no_ingredients", "multiple_products"]) {
    const result = response();
    result.extraction = { status, productName: null, rawText: "부분 원문", ingredients: status === "partial" ? ["글리세린"] : [],
      uncertainSpans: ["흐린 구간"], warnings: ["전성분 미확인"], nextAction: "한 제품을 다시 촬영해주세요." };
    result.analysis = { status: "not_run", summary: "판독 후 설명", ingredientNotes: [], warnings: [] };
    const report = prepareReport("pack", input, result);
    assert.equal(report.helpful.length, 0);
    assert.equal(report.complete, false);
    for (const text of ["한 제품을 다시 촬영해주세요.", "부분 원문", "판독 불확실: 흐린 구간", "전성분 미확인"])
      assert.ok(report.copyText.includes(text));
  }
});

test("no evidence and an empty note list remain visibly distinct from completed explanation", () => {
  const result = response();
  result.analysis = { status: "needs_evidence", summary: "근거가 없습니다.", ingredientNotes: [], warnings: [] };
  const report = prepareReport("cosmetic", input, result);
  assert.equal(report.analysisStatus, "needs_evidence");
  assert.equal(report.helpful.length, 0);
  assert.equal(report.notes.length, 0);
  assert.match(report.copyText, /설명 상태: needs_evidence/u);
});

test("mixing choice never changes the API's unknown status into permission", () => {
  for (const mixStatus of ["allowed", "unknown", "prohibited"]) {
    const report = prepareReport("pack", { ...input, mixStatus }, response());
    assert.match(report.mixingText, /혼합 가능 여부 미확인/u);
    assert.ok(report.copyText.includes(report.mixingText));
    if (mixStatus === "prohibited") assert.match(report.mixingText, /사용자는 제조사 혼합 금지 안내/u);
  }
  assert.equal(prepareReport("cosmetic", input, response()).mixingText, "");
});

test("API failure with a preserved extraction is never displayed as successful analysis", () => {
  const result = response(); result.ok = false; result.error = { code: "EVIDENCE_VALIDATION_FAILED" };
  assert.throws(() => prepareReport("cosmetic", input, result), /완료되지 않은 요청/u);
});

test("mock output retains its warning and cannot populate personalized cards", () => {
  const result = response(); result.meta.isMock = true; result.meta.notice = "사진을 AI로 판독하지 않았습니다.";
  const report = prepareReport("cosmetic", input, result);
  assert.match(report.banner, /모의 연동 시험/u);
  assert.equal(report.helpful.length, 0);
  assert.ok(report.copyText.includes(result.meta.notice));
});

test("copy preserves scope and exact ingredients without source links or API-key fields", () => {
  const result = response(), secret = "never-copy-a-private-key";
  result.meta.apiKey = secret;
  result.extraction.ingredients.push("1,2-Hexanediol", "티트리(1,500ppm)");
  const report = prepareReport("pack", { ...input, apiKey: secret }, result);
  for (const text of ["YSW_G001_KO", "독립 사람", "1,2-Hexanediol", "티트리(1,500ppm)"])
    assert.ok(report.copyText.includes(text));
  assert.doesNotMatch(report.copyText, /https?:\/\/|\[제공된 일반 기능 근거\]/u);
  assert.ok(!report.copyText.includes(secret));
});

test("GUI uses shared API modules and safe text rendering rather than duplicating prompts or fetch", async () => {
  const script = await readFile(new URL("../BeautyAI/script.js", import.meta.url), "utf8");
  assert.match(script, /from "\.\/api-client\.js"/u);
  assert.match(script, /from "\.\/report-model\.js"/u);
  assert.doesNotMatch(script, /fetch\(|const EXTRACT_PROMPT|const claims|\.innerHTML/u);
});
