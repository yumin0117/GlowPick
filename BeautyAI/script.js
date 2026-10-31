import { analyze, health } from "./api-client.js";

const $ = (id) => document.getElementById(id);
const files = { cosmetic: null, pack: null };
const previewUrls = { cosmetic: null, pack: null };

// 1. 피부 타입별 한 줄 설명
const skinDescriptions = {
  "건성": "피지 분비가 적어 쉽게 당기고 건조해지는 피부 타입이에요.",
  "지성": "피지 분비가 많아 얼굴이 쉽게 번들거리는 피부 타입이에요.",
  "복합성": "이마와 코는 번들거리지만 볼은 건조한 등 부위별 특성이 달라요.",
  "민감성": "화장품이나 외부 자극에 따가움·붉어짐 등이 쉽게 나타나는 피부 특성이에요.",
  "중성": "건조함이나 번들거림이 비교적 심하지 않은 피부 타입이에요.",
  "잘 모르겠음": "피부 타입을 몰라도 괜찮아요. 선택한 고민을 중심으로 분석해요."
};

function updateSkinDescription() {
  const selected = document.querySelector('input[name="skinType"]:checked')?.value || "잘 모르겠음";
  $("skinTitle").textContent = "💡 " + selected;
  $("skinDescription").textContent = skinDescriptions[selected];
}

document.querySelectorAll('input[name="skinType"]').forEach((radio) => {
  radio.addEventListener("change", updateSkinDescription);
});
updateSkinDescription();

// 2. 사진 업로드: 화장품과 모델링팩에서 동일한 UI 사용
function setupUpload(prefix) {
  const toggle = $(prefix + "UploadButton");
  const menu = $(prefix + "UploadMenu");
  const gallery = $(prefix + "Gallery");
  const camera = $(prefix + "Camera");
  const preview = $(prefix + "Preview");
  const image = $(prefix + "PreviewImg");
  const fileName = $(prefix + "FileName");
  const remove = $(prefix + "Remove");
  const defaultText = toggle.querySelector("strong").textContent;

  function closeMenu() {
    menu.classList.add("hidden");
    toggle.setAttribute("aria-expanded", "false");
  }

  toggle.addEventListener("click", () => {
    const willOpen = menu.classList.contains("hidden");
    document.querySelectorAll(".upload-menu").forEach(el => el.classList.add("hidden"));
    document.querySelectorAll(".upload-main").forEach(el => el.setAttribute("aria-expanded", "false"));
    menu.classList.toggle("hidden", !willOpen);
    toggle.setAttribute("aria-expanded", String(willOpen));
  });

  $(prefix + "GalleryButton").addEventListener("click", () => {
    closeMenu();
    gallery.click();
  });

  $(prefix + "CameraButton").addEventListener("click", () => {
    closeMenu();
    camera.click();
  });

  function setImage(file, input) {
    if (!file) return;
    clearUpload();
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      $(prefix === "cosmetic" ? "cosmeticMessage" : "packMessage").textContent = "JPG, PNG, WEBP 파일만 지원합니다.";
      input.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      $(prefix === "cosmetic" ? "cosmeticMessage" : "packMessage").textContent = "이미지는 최대 10MB까지 업로드할 수 있어요.";
      input.value = "";
      return;
    }
    if (previewUrls[prefix]) URL.revokeObjectURL(previewUrls[prefix]);
    files[prefix] = file;
    previewUrls[prefix] = URL.createObjectURL(file);
    image.src = previewUrls[prefix];
    fileName.textContent = file.name;
    preview.classList.remove("hidden");
    toggle.querySelector("strong").textContent = "사진이 선택되었어요";
    $(prefix === "cosmetic" ? "results" : "packResults").classList.add("hidden");
    $(prefix === "cosmetic" ? "cosmeticMessage" : "packMessage").textContent = "";
  }

  gallery.addEventListener("change", () => setImage(gallery.files[0], gallery));
  camera.addEventListener("change", () => setImage(camera.files[0], camera));
  function clearUpload() {
    files[prefix] = null;
    gallery.value = "";
    camera.value = "";
    image.removeAttribute("src");
    fileName.textContent = "";
    preview.classList.add("hidden");
    toggle.querySelector("strong").textContent = defaultText;
    $(prefix === "cosmetic" ? "results" : "packResults").classList.add("hidden");
    if (previewUrls[prefix]) URL.revokeObjectURL(previewUrls[prefix]);
    previewUrls[prefix] = null;
    $(prefix === "cosmetic" ? "cosmeticMessage" : "packMessage").textContent = "";
  }
  remove.addEventListener("click", clearUpload);

  document.addEventListener("click", (event) => {
    if (!event.target.closest('[data-upload="' + prefix + '"]')) closeMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMenu();
  });
}
setupUpload("cosmetic");
setupUpload("pack");

// 3. 팀원에게 전달할 입력 데이터 구조
function getCosmeticInput() {
  return {
    image: files.cosmetic,
    productName: $("cosmeticName").value.trim(),
    skinType: document.querySelector('input[name="skinType"]:checked')?.value || "잘 모르겠음",
    concerns: [...document.querySelectorAll('input[name="concern"]:checked')].map(el => el.value),
    extraConcern: $("extraConcern").value.trim()
  };
}

function getPackInput() {
  return {
    image: files.pack,
    packName: $("packName").value.trim(),
    skinType: document.querySelector('input[name="skinType"]:checked')?.value || "잘 모르겠음",
    concerns: [...document.querySelectorAll('input[name="packConcern"]:checked')].map(el => el.value),
    mixStatus: document.querySelector('input[name="mixStatus"]:checked')?.value || "unknown",
    notes: $("packNotes").value.trim()
  };
}

// 4. 결과 영역을 안전하게 출력하기 위한 공통 도우미
function renderTags(element, values) {
  element.replaceChildren();
  values.forEach(value => {
    const tag = document.createElement("span");
    tag.textContent = "# " + value;
    element.appendChild(tag);
  });
}

function addIngredient(container, title, description) {
  const item = document.createElement("div");
  item.className = "ingredient-item";
  const heading = document.createElement("strong");
  heading.textContent = title;
  const text = document.createElement("p");
  text.textContent = description;
  item.append(heading, text);
  container.appendChild(item);
}

// 6. 기존 화장품 고민을 모델링팩으로 복사
$("copyConcerns").addEventListener("click", () => {
  const cosmeticConcerns = [...document.querySelectorAll('input[name="concern"]:checked')].map(el => el.value);
  document.querySelectorAll('input[name="packConcern"]').forEach(el => {
    el.checked = cosmeticConcerns.includes(el.value);
  });
  $("packMessage").textContent = cosmeticConcerns.length
    ? "위에서 선택한 고민을 가져왔어요. 필요한 항목은 수정할 수 있어요."
    : "위에서 선택한 피부 고민이 없어요. 아래에서 직접 선택해 주세요.";
  $("packResults").classList.add("hidden");
});

const extractionLabels = {
  complete: "전성분 판독 완료", partial: "일부만 판독됨", unreadable: "판독 불가",
  no_ingredients: "전성분 영역 없음", multiple_products: "여러 제품이 함께 보임"
};
let busy = false;

function renderResult(prefix, response, input) {
  const extraction = response.extraction;
  if (!extraction || !Array.isArray(extraction.ingredients)) {
    throw new Error("사진 판독 응답을 확인하지 못했어요.");
  }
  const analysis = response.analysis || {};
  const isMock = response.meta?.isMock === true;
  const state = extractionLabels[extraction.status] || "상태 확인 필요";
  const banner = $(prefix + "ResultStatus");
  banner.textContent = isMock
    ? "모의 연동 시험 · 업로드한 사진을 AI로 판독한 결과가 아니에요."
    : `실제 Gemini 응답 · ${state}`;
  if (response.meta?.promptStatus === "draft") banner.textContent += " · 임시 프롬프트";
  banner.dataset.mode = isMock ? "mock" : "live";
  banner.dataset.extractionStatus = extraction.status;
  $(prefix + "Summary").textContent = analysis.summary || "";
  $(prefix + "Summary").dataset.analysisStatus = analysis.status || "unknown";
  $(prefix + "RawText").textContent = extraction.rawText || "읽은 원문이 없어요.";
  const ingredients = $(prefix + "Ingredients");
  ingredients.replaceChildren();
  for (const ingredient of extraction.ingredients) {
    const item = document.createElement("li");
    item.textContent = ingredient;
    ingredients.append(item);
  }
  if (!ingredients.children.length) {
    const item = document.createElement("li");
    item.textContent = "확정해서 표시할 성분이 없어요.";
    ingredients.append(item);
  }
  const notes = $(prefix + "IngredientNotes");
  notes.replaceChildren();
  for (const note of analysis.ingredientNotes || []) {
    addIngredient(notes, note.ingredient, note.explanation);
  }
  if (!notes.children.length) {
    addIngredient(notes, "성분 기능 설명", analysis.status === "needs_evidence"
      ? "사진의 성분과 일치하는 기능 근거가 준비되면 설명을 제공해요. 개인 적합성이나 추천을 판단하지 않아요."
      : analysis.status === "reference_only"
      ? "이 응답에는 성분별 설명이 제공되지 않았어요. 사진과 표시된 근거를 함께 확인해 주세요."
      : "전성분을 판독한 뒤 근거가 있는 설명을 확인할 수 있어요.");
  }
  const warnings = $(prefix + "Warnings");
  warnings.replaceChildren();
  const messages = [extraction.nextAction, ...(extraction.warnings || []),
    ...(extraction.uncertainSpans || []).map(text => "판독 불확실: " + text),
    ...(analysis.warnings || []), analysis.notice].filter(Boolean);
  for (const message of messages.length ? messages : ["사진 원문과 성분 목록을 직접 대조해 주세요."]) {
    const paragraph = document.createElement("p");
    paragraph.className = "result-paragraph";
    paragraph.textContent = message;
    warnings.append(paragraph);
  }
  const sources = $(prefix + "Sources");
  sources.replaceChildren();
  for (const source of analysis.sources || []) {
    let url;
    try { url = new URL(source.sourceUrl); } catch { continue; }
    if (!["https:", "http:"].includes(url.protocol)) continue;
    const link = document.createElement("a");
    link.className = "recommend-card";
    link.textContent = `${source.ingredient} · ${source.evidenceId}`;
    link.href = url.href;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    sources.append(link);
  }
  $(prefix + "SourcesBlock").classList.toggle("hidden", !sources.children.length);
  const name = extraction.productName || input.productName || input.packName || "업로드한 제품";
  if (prefix === "cosmetic") {
    $("resultProduct").textContent = name;
    $("resultSkin").textContent = input.skinType;
    renderTags($("resultTags"), input.concerns);
  } else {
    $("packResultName").textContent = name;
    renderTags($("packResultTags"), input.concerns);
    $("mixGuidance").textContent = response.mixing?.status === "unknown"
      ? "혼합 가능 여부 미확인. " + response.mixing.reason
      : "현재는 직접 혼합 가능 여부를 판단하지 않아요. 제품 설명서를 확인해 주세요.";
  }
}

async function runAnalysis(prefix) {
  if (busy) return;
  const input = prefix === "cosmetic" ? getCosmeticInput() : getPackInput();
  const message = $(prefix + "Message");
  const section = $(prefix === "cosmetic" ? "results" : "packResults");
  section.classList.add("hidden");
  message.textContent = "";
  if (!input.image) {
    message.textContent = "전성분이 보이는 라벨 사진을 먼저 업로드해 주세요.";
    return;
  }
  if (!input.concerns.length) {
    message.textContent = "피부 고민을 하나 이상 선택해 주세요.";
    return;
  }
  const controls = [...document.querySelectorAll("input, textarea, button")];
  const disabledBefore = controls.map(control => control.disabled);
  busy = true;
  controls.forEach(control => control.disabled = true);
  message.textContent = "사진 분석을 요청했어요. 대기열과 판독에 시간이 걸릴 수 있어요…";
  const { image, ...request } = input;
  try {
    const response = await analyze(prefix === "cosmetic" ? "/analyze_cosmetic" : "/consult_modeling_pack", image, request);
    if (!response.ok) {
      const detail = response.error || {};
      throw new Error(`${detail.message || "분석을 완료하지 못했어요."} (${detail.code || "UNKNOWN"} · 요청 ${response.requestId || "-"})`);
    }
    renderResult(prefix, response, request);
    section.classList.remove("hidden");
    message.textContent = response.meta?.isMock
      ? "모의 연동 시험 결과예요. 실제 판독 결과로 사용하지 마세요."
      : extractionLabels[response.extraction.status] || "결과를 확인해 주세요.";
    section.scrollIntoView({ behavior: "smooth", block: "start" });
  } catch (error) {
    section.classList.add("hidden");
    message.textContent = error.message || "연결을 확인하고 다시 시도해 주세요.";
  } finally {
    controls.forEach((control, index) => control.disabled = disabledBefore[index]);
    busy = false;
  }
}

$("cosmeticAnalyze").addEventListener("click", () => runAnalysis("cosmetic"));
$("packAnalyze").addEventListener("click", () => runAnalysis("pack"));
document.querySelectorAll("input:not([type=file]), textarea").forEach(control => {
  const hideResults = () => {
    $("results").classList.add("hidden");
    $("packResults").classList.add("hidden");
    $("cosmeticMessage").textContent = "";
    $("packMessage").textContent = "";
  };
  control.addEventListener("input", hideResults);
  control.addEventListener("change", hideResults);
});

health().then(status => {
  $("serverStatus").textContent = status.mode === "mock"
    ? "모의 연동 모드 · 사진을 AI로 판독하지 않아요."
    : status.readyForLive ? "Gemini 연결 준비됨 · 제품 라벨 사진을 올려주세요."
      : "서버 API 키가 아직 설정되지 않았어요. 담당자에게 알려주세요.";
}).catch(() => {
  $("serverStatus").textContent = "서버 연결을 확인하지 못했어요. 분석 요청 시 다시 연결해요.";
});
