import { normalizeIngredient } from "./ai-core.js";

const STATUS_LABELS = { complete: "전성분 판독 완료", partial: "일부 성분만 판독",
  unreadable: "이미지 판독 어려움", no_ingredients: "전성분 영역을 찾지 못함", multiple_products: "여러 제품이 함께 확인됨" };
const MOISTURE_IDS = new Set(["YSW_G001_EN", "YSW_G001_KO", "YSW_P001_EN", "YSW_P001_KO"]);
const SCOPE_NOTICE = "일반 성분 기능에 대한 참고 설명입니다. 전체 성분·완제품 효능·개인 적합성·혼합 허용을 검증한 결과가 아닙니다. 근거ID 연결 검사와 별도로 문헌 해석·한영 표기의 독립 사람 교차검토가 필요합니다.";

// Presentation only: personal efficacy and risk classifications are not inferred.
export function prepareReport(kind, input, response) {
  if (!["cosmetic", "pack"].includes(kind) || !response?.ok || !response.extraction || !response.analysis)
    throw new Error("완료되지 않은 요청을 리포트로 표시할 수 없습니다.");
  const extraction = response.extraction, analysis = response.analysis;
  const complete = extraction.status === "complete", isMock = response.meta?.isMock === true;
  const sources = analysis.sources || [], notes = analysis.ingredientNotes || [];
  const names = new Set(extraction.ingredients.map(normalizeIngredient));
  const evidence = new Map(sources.map(source => [source.evidenceId, source]));
  const helpful = complete && !isMock && analysis.status === "reference_only" && input.concerns.some(c => ["건조함", "속건조"].includes(c))
    ? notes.filter(note => names.has(normalizeIngredient(note.ingredient)) && note.evidenceIds.some(id => {
      const source = evidence.get(id);
      return MOISTURE_IDS.has(id) && source?.reviewStatus === "reviewed_general_ingredient_function"
        && normalizeIngredient(source.ingredient) === normalizeIngredient(note.ingredient);
    })).map(note => ({ ingredient: note.ingredient,
      reason: "보습에 관한 일반 기능 참고입니다. 선택한 건조 고민과 관련해 살펴볼 수 있지만 개인별 효과와 제품 적합성을 판단한 결과는 아니에요." })) : [];
  const classified = new Set(helpful.map(note => normalizeIngredient(note.ingredient)));
  const statusLabel = STATUS_LABELS[extraction.status] || "판독 상태 확인";
  const banner = (isMock ? "모의 연동 시험 · 실제 사진 판독이 아니에요." : `실제 Gemini 응답 · ${statusLabel}`)
    + (response.meta?.promptStatus === "draft" ? " · 임시 프롬프트" : "");
  const warnings = [...new Set([response.meta?.notice, extraction.nextAction, ...(extraction.warnings || []),
    ...(extraction.uncertainSpans || []).map(text => "판독 불확실: " + text), ...(analysis.warnings || []),
    analysis.notice, SCOPE_NOTICE].filter(Boolean))];
  let mixingText = "";
  if (kind === "pack") {
    // The checkbox is a user statement and cannot change the API decision.
    mixingText = "혼합 가능 여부 미확인. " + (response.mixing?.reason || "정확한 제품·버전·조건의 검토 완료 근거가 아직 없습니다.");
    if (input.mixStatus === "prohibited") mixingText += " 사용자는 제조사 혼합 금지 안내를 확인했다고 선택했어요. 해당 제품 안내를 따라 주세요.";
  }
  const model = { kind, input, complete, isMock, statusLabel, banner,
    productName: extraction.productName || input.productName || input.packName || "업로드한 제품",
    summary: analysis.summary || "분석한 성분 정보를 확인해 주세요.",
    analysisStatus: analysis.status, extractionStatus: extraction.status,
    ingredients: extraction.ingredients, rawText: extraction.rawText || "읽은 원문이 없습니다.",
    helpful, unknown: extraction.ingredients.filter(name => !classified.has(normalizeIngredient(name))),
    notes, sources, warnings, mixingText };
  model.copyText = [kind === "pack" ? "GlowPick 모델링팩 리포트" : "GlowPick 화장품 리포트",
    `제품: ${model.productName}`, `피부 타입: ${input.skinType}`, `피부 고민: ${input.concerns.join(", ")}`,
    banner, `설명 상태: ${analysis.status}`, "", "[도움과 관련된 일반 기능]",
    ...(helpful.length ? helpful.map(note => `${note.ingredient}: ${note.reason}`) : ["연결할 일반 기능 근거가 부족합니다."]),
    "", "[일반 성분 기능]", ...notes.map(note => `${note.ingredient}: ${note.explanation} (${note.evidenceIds.join(", ")})`),
    "", "[개인별 주의 판단]", "현재 자료로는 판단할 수 없습니다. 모든 성분이 안전하다는 뜻은 아닙니다.",
    "", `[전성분 ${extraction.ingredients.length}개]`, ...extraction.ingredients, "", "[사진 원문]", model.rawText,
    "", "[다음 단계·검토 한계]", ...warnings,
    ...(mixingText ? ["", "[혼합 안내]", mixingText] : [])
  ].join("\n");
  return model;
}
