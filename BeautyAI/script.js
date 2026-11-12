import { analyze, MAX_IMAGE_BYTES } from "./api-client.js";
import { prepareReport } from "./report-model.js";

const $ = id => document.getElementById(id);
const uploaded = { cosmetic: null, pack: null };
const objectUrls = { cosmetic: null, pack: null };
let isBusy = false, lastReportText = "", copyTimer;
const skinHints = {
  "건성": "건조함과 당김을 자주 느끼는 피부 타입이에요.",
  "지성": "피지 분비가 비교적 많고 쉽게 번들거릴 수 있어요.",
  "복합성": "부위별로 건조함과 번들거림이 다르게 나타날 수 있어요.",
  "민감성": "외부 자극이나 제품에 민감하게 반응할 수 있어요.",
  "중성": "건조함이나 번들거림이 상대적으로 두드러지지 않는 편이에요.",
  "잘 모르겠음": "피부 타입을 몰라도 괜찮아요. 선택한 고민을 함께 살펴봐요."
};

function textNode(tag, content, className) {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = content;
  return element;
}
function clearReport() {
  $("results").classList.add("hidden");
  lastReportText = "";
  clearTimeout(copyTimer);
  $("copyReport").textContent = "결과 복사 ↗";
}
function clearMessages() {
  for (const id of ["cosmeticMessage", "packMessage"]) {
    $(id).textContent = "";
    for (const name of ["failureStage", "httpStatus", "providerCode", "failureReason", "extractionCompleted"])
      delete $(id).dataset[name];
  }
}
function maskApiKey() {
  $("geminiApiKey").type = "password";
  $("toggleKey").textContent = "보기";
  $("toggleKey").setAttribute("aria-pressed", "false");
  $("toggleKey").setAttribute("aria-label", "API 키 표시");
}
function clearApiKey() {
  $("geminiApiKey").value = "";
  maskApiKey();
}
function setupUpload(prefix) {
  const file = $(prefix + "File"), camera = $(prefix + "Camera");
  const preview = $(prefix + "Preview"), image = $(prefix + "PreviewImage");
  $(prefix + "Choose").addEventListener("click", () => file.click());
  $(prefix + "Shoot").addEventListener("click", () => camera.click());
  function clear() {
    uploaded[prefix] = null;
    file.value = ""; camera.value = "";
    if (objectUrls[prefix]) URL.revokeObjectURL(objectUrls[prefix]);
    objectUrls[prefix] = null;
    image.removeAttribute("src");
    $(prefix + "FileName").textContent = "";
    preview.classList.add("hidden");
    clearMessages(); clearReport();
  }
  function selected(input) {
    const candidate = input.files?.[0];
    if (!candidate) return;
    clear();
    if (!["image/jpeg", "image/png", "image/webp"].includes(candidate.type) || !/\.(jpe?g|png|webp)$/iu.test(candidate.name)) {
      $(prefix + "Message").textContent = "JPG, PNG, WEBP 이미지 파일만 지원해요.";
      return;
    }
    if (!candidate.size || candidate.size > MAX_IMAGE_BYTES) {
      $(prefix + "Message").textContent = "10MiB 이하의 사진을 선택해 주세요.";
      return;
    }
    uploaded[prefix] = candidate;
    objectUrls[prefix] = URL.createObjectURL(candidate);
    image.src = objectUrls[prefix];
    $(prefix + "FileName").textContent = candidate.name;
    preview.classList.remove("hidden");
  }
  file.addEventListener("change", () => selected(file));
  camera.addEventListener("change", () => selected(camera));
  $(prefix + "Remove").addEventListener("click", clear);
}
setupUpload("cosmetic"); setupUpload("pack");

function switchTab(next) {
  if (isBusy) return;
  for (const name of ["cosmetic", "pack"]) {
    const active = next === name, tab = $("tab-" + name);
    $("panel-" + name).classList.toggle("hidden", !active);
    tab.classList.toggle("active", active);
    tab.setAttribute("aria-selected", String(active));
    tab.tabIndex = active ? 0 : -1;
  }
  clearMessages(); clearReport();
}
document.querySelectorAll(".tab-button").forEach(tab => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
  tab.addEventListener("keydown", event => {
    if (isBusy || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const next = event.key === "Home" ? "cosmetic" : event.key === "End" ? "pack"
      : tab.dataset.tab === "cosmetic" ? "pack" : "cosmetic";
    switchTab(next); $("tab-" + next).focus();
  });
});
$("toggleKey").addEventListener("click", () => {
  const show = $("geminiApiKey").type === "password";
  $("geminiApiKey").type = show ? "text" : "password";
  $("toggleKey").textContent = show ? "숨기기" : "보기";
  $("toggleKey").setAttribute("aria-pressed", String(show));
  $("toggleKey").setAttribute("aria-label", show ? "API 키 숨기기" : "API 키 표시");
});
$("copyConcerns").addEventListener("click", () => {
  const selected = new Set([...document.querySelectorAll('input[name="concern"]:checked')].map(el => el.value));
  document.querySelectorAll('input[name="packConcern"]').forEach(el => { el.checked = selected.has(el.value); });
  clearReport();
  $("packMessage").textContent = selected.size ? "화장품 분석에서 선택한 고민을 가져왔어요." : "가져올 고민이 없어요. 직접 선택해 주세요.";
});
document.querySelectorAll('input:not([type="file"]), textarea').forEach(input => {
  if (input.id === "geminiApiKey") return;
  for (const event of ["input", "change"]) input.addEventListener(event, () => { clearReport(); clearMessages(); });
});
document.querySelectorAll('input[name="skinType"]').forEach(radio => radio.addEventListener("change", () => {
  $("skinHint").textContent = skinHints[radio.value];
}));
function getInput(kind) {
  const skinType = document.querySelector('input[name="skinType"]:checked')?.value || "잘 모르겠음";
  return kind === "cosmetic" ? {
    productName: $("cosmeticName").value.trim() || null, skinType,
    concerns: [...document.querySelectorAll('input[name="concern"]:checked')].map(el => el.value), extraConcern: $("extraConcern").value.trim()
  } : {
    packName: $("packName").value.trim() || null, skinType,
    concerns: [...document.querySelectorAll('input[name="packConcern"]:checked')].map(el => el.value),
    mixStatus: document.querySelector('input[name="mixStatus"]:checked')?.value || "unknown", notes: $("packNotes").value.trim()
  };
}
function appendItem(host, title, description, className = "info-item") {
  const item = textNode("div", "", className);
  if (title) item.append(textNode("strong", title));
  item.append(textNode("p", description));
  host.append(item);
}
// BEGIN SHARED RECOMMENDATION VIEW (also embedded in ym's standalone script)
function renderRecommendations(recommendations) {
  $("recommendationBox").classList.toggle("hidden", !recommendations.ready);
  $("recommendationLead").textContent = recommendations.lead;
  $("recommendationNotice").textContent = recommendations.notice;
  $("recommendationShop").textContent = recommendations.shopNotice;
  $("recommendationCoverage").textContent = recommendations.coverage;
  $("recommendationStrategy").textContent = recommendations.strategy;
  $("recommendationContext").textContent = [recommendations.contextNotice, recommendations.missingNotice].filter(Boolean).join(" ");
  $("recommendationContext").classList.toggle("hidden", !$("recommendationContext").textContent);
  $("recommendationMixing").textContent = recommendations.mixingNotice;
  $("recommendationMixing").classList.toggle("hidden", !recommendations.mixingNotice);
  $("recommendationList").replaceChildren();
  for (const product of recommendations.products) {
    const card = textNode("article", "", "pick-card");
    const top = textNode("div", "", "pick-card-top");
    top.append(textNode("span", product.brand, "pick-brand"), textNode("span", product.type, "pick-type"));
    const tags = textNode("div", "", "pick-tags");
    product.labels.forEach(label => tags.append(textNode("span", label)));
    card.append(textNode("span", product.role, "pick-role"), top, textNode("h4", product.name), tags);
    card.append(textNode("p", "연결한 고민: " + product.matchedConcerns.join(" · "), "pick-matched"));
    card.append(textNode("p", product.selectionReason, "pick-selection"));
    product.reasons.forEach(reason => card.append(textNode("p", reason, "pick-reason")));
    card.append(textNode("p", "제품 성분 포인트: " + product.keyIngredients.join(" · "), "pick-ingredients"));
    card.append(textNode("p", product.note, "pick-note"));
    if (product.attention) card.append(textNode("p", product.attention, "pick-attention"));
    if (product.mixingStatus === "unknown") card.append(textNode("span", "이 팩과의 혼합 조합 미확인", "pick-mix-badge"));
    card.append(textNode("p", product.oliveYoung ? `올리브영 상품 등록 확인 · ${product.oliveYoung.checkedAt}`
      : "올리브영 상품 등록 미확인", "pick-shop-status"));
    if (product.oliveYoung) {
      const shopLink = textNode("a", "올리브영 상품 보기 ↗", "pick-shop-link");
      shopLink.href = product.oliveYoung.url;
      shopLink.target = "_blank";
      shopLink.rel = "noopener noreferrer";
      shopLink.setAttribute("aria-label", `${product.brand} ${product.name} 올리브영 상품 정보 (새 창)`);
      card.append(shopLink);
    }
    const link = textNode("a", "공식 제품 정보 ↗", "pick-link");
    link.href = product.sourceUrl;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.setAttribute("aria-label", `${product.brand} ${product.name} 공식 제품 정보 (새 창)`);
    card.append(link);
    $("recommendationList").append(card);
  }
}
// END SHARED RECOMMENDATION VIEW
function renderReport(kind, input, response) {
  const report = prepareReport(kind, input, response);
  renderRecommendations(report.recommendations);
  $("reportTitle").textContent = kind === "pack" ? "나의 모델링팩 성분 리포트" : "내 피부 성분 리포트";
  $("reportSubtitle").textContent = report.complete ? "확인된 정보와 아직 확인이 필요한 내용을 구분해 표시했어요." : "판독이 충분하지 않아 재촬영 안내를 먼저 확인해 주세요.";
  $("reportStatus").textContent = report.banner;
  $("reportStatus").dataset.mode = report.isMock ? "mock" : "live";
  $("reportStatus").dataset.extractionStatus = report.extractionStatus;
  $("resultProduct").textContent = report.productName;
  $("resultSummary").textContent = report.summary;
  $("resultSummary").dataset.analysisStatus = report.analysisStatus;
  $("resultTags").replaceChildren(...[input.skinType, ...input.concerns].map(tag => textNode("span", tag)));
  for (const id of ["helpfulList", "cautionList", "unknownList", "generalList", "warningsList", "allIngredients"]) $(id).replaceChildren();
  if (report.helpful.length) report.helpful.forEach(note => appendItem($("helpfulList"), note.ingredient, note.reason, "result-item"));
  else $("helpfulList").append(textNode("p", report.complete ? "선택한 고민과 연결할 일반 기능 근거가 아직 없어요. 개인 적합성을 판단한 뜻은 아니에요." : "전성분 판독이 완료되면 확인할 수 있어요.", "empty-result"));
  if (report.cautions.length) report.cautions.forEach(note => appendItem($("cautionList"), note.ingredient, note.reason, "result-item"));
  else $("cautionList").append(textNode("p", report.complete ? "현재 판독 목록과 검토된 안내에서 표시할 항목이 없어요. 개인별 안전성을 확인한 결과는 아니에요." : "현재 사진만으로 주의 성분을 판단하지 않아요.", "empty-result"));
  if (report.unknown.length) {
    const pills = textNode("div", "", "unknown-pills");
    report.unknown.slice(0, 7).forEach(name => pills.append(textNode("span", name)));
    $("unknownList").append(pills);
    if (report.unknown.length > 7) $("unknownList").append(textNode("p", `외 ${report.unknown.length - 7}개는 전체 전성분에서 확인할 수 있어요.`, "more-note"));
  } else $("unknownList").append(textNode("p", report.complete ? "별도로 표시할 성분이 없어요." : "확정해서 표시할 전성분이 없어요.", "empty-result"));
  if (report.notes.length) report.notes.forEach(note => appendItem($("generalList"), note.ingredient, note.explanation));
  else $("generalList").append(textNode("p", report.complete ? "설명할 일반 기능 근거가 부족하거나 이 응답에 성분별 설명이 없어요." : "전성분 판독 후 설명할 수 있어요.", "empty-result"));
  report.warnings.forEach(message => appendItem($("warningsList"), "", message));
  $("allIngredients").append(...report.ingredients.map(name => textNode("li", name)));
  $("ingredientCount").textContent = `${report.ingredients.length}개`;
  $("rawText").textContent = report.rawText;
  $("mixingBox").classList.toggle("hidden", kind !== "pack");
  $("mixingText").textContent = report.mixingText;
  lastReportText = report.copyText;
  $("results").classList.remove("hidden");
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
}
async function run(kind) {
  if (isBusy) return;
  clearMessages(); clearReport();
  const input = getInput(kind), message = $(kind + "Message"), file = uploaded[kind];
  if (!file) { message.textContent = "전성분 라벨 사진을 먼저 올려 주세요."; return; }
  if (!input.concerns.length) { message.textContent = "피부 고민을 하나 이상 선택해 주세요."; return; }
  let key = $("geminiApiKey").value.trim();
  if (!key) { message.textContent = "상단에 Gemini API 키를 입력해 주세요."; $("geminiApiKey").focus(); return; }
  maskApiKey();
  const controls = [...document.querySelectorAll("button, input, textarea")], previous = controls.map(el => el.disabled);
  isBusy = true;
  controls.forEach(el => { el.disabled = true; });
  message.textContent = "Gemini가 사진을 확인하고 있어요. 전성분 판독에 시간이 걸릴 수 있어요…";
  try {
    const response = await analyze(kind === "cosmetic" ? "/analyze_cosmetic" : "/consult_modeling_pack", file, input, key);
    if (!response.ok) {
      const failure = response.meta?.failure;
      const stages = { validation: "입력 확인", image_validation: "사진 확인", extraction: "전성분 판독",
        extraction_validation: "판독 응답 확인", explanation: "성분 설명",
        explanation_validation: "설명 응답 확인", evidence_validation: "근거 확인" };
      const reasons = { schema_complexity: "출력 규격 복잡도", unsupported_parameter: "지원하지 않는 요청 설정",
        invalid_schema: "출력 규격 오류", token_limit: "토큰 한도", billing_precondition: "프로젝트 사용 조건",
        overloaded: "Google 처리 용량 부족" };
      const details = [];
      if (stages[failure?.stage]) {
        details.push(stages[failure.stage]);
        message.dataset.failureStage = failure.stage;
        message.dataset.extractionCompleted = String(failure.extractionCompleted === true);
      }
      if (Number.isInteger(failure?.httpStatus) && failure.httpStatus >= 100 && failure.httpStatus <= 599) {
        details.push(`HTTP ${failure.httpStatus}`);
        message.dataset.httpStatus = String(failure.httpStatus);
      }
      if (reasons[failure?.reason]) {
        details.push(reasons[failure.reason]);
        message.dataset.failureReason = failure.reason;
      }
      // The client has already restricted this value to Google's documented codes.
      if (failure?.providerCode) message.dataset.providerCode = failure.providerCode;
      const prefix = failure?.extractionCompleted === true && ["explanation", "explanation_validation"].includes(failure.stage)
        ? "전성분 판독은 끝났지만 설명 생성에 실패했어요. " : "";
      throw new Error(`${prefix}${response.error?.message || "분석을 완료하지 못했어요."} (${response.error?.code || "UNKNOWN"} · ${[...details, `요청 ${response.requestId || "-"}`].join(" · ")})`);
    }
    renderReport(kind, input, response);
    message.textContent = response.meta?.isMock ? "모의 연동 시험 결과예요. 실제 판독 결과로 사용하지 마세요."
      : response.extraction.status === "complete" ? "성분 판독이 완료됐어요. 아래 결과를 확인해 주세요." : "사진 판독 안내를 확인해 주세요.";
  } catch (error) { clearReport(); message.textContent = error.message || "분석을 완료하지 못했어요."; }
  finally { key = ""; controls.forEach((el, index) => { el.disabled = previous[index]; }); isBusy = false; }
}
$("cosmeticAnalyze").addEventListener("click", () => run("cosmetic"));
$("packAnalyze").addEventListener("click", () => run("pack"));
$("copyReport").addEventListener("click", async () => {
  if (!lastReportText) return;
  try { await navigator.clipboard.writeText(lastReportText); $("copyReport").textContent = "복사 완료 ✓"; }
  catch { $("copyReport").textContent = "복사가 제한됐어요"; }
  copyTimer = setTimeout(() => { $("copyReport").textContent = "결과 복사 ↗"; }, 1700);
});
switchTab("cosmetic"); clearApiKey();
window.addEventListener("pageshow", clearApiKey);
window.addEventListener("pagehide", clearApiKey);
