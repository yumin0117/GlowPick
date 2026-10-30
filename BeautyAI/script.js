// GlowPick 통합 프론트엔드 프로토타입
// 실제 사진 OCR 및 Gemini API 호출은 하지 않습니다.
// 사용자 입력은 브라우저에서만 처리하며 서버로 전송하지 않습니다.

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
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      alert("JPG, PNG, WEBP 파일만 지원합니다.");
      input.value = "";
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      alert("이미지는 최대 10MB까지 업로드할 수 있어요.");
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
  remove.addEventListener("click", () => {
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
  });

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

function addCard(container, title, description) {
  const card = document.createElement("article");
  card.className = "recommend-card";
  const name = document.createElement("h4");
  name.textContent = title;
  const text = document.createElement("p");
  text.textContent = description;
  card.append(name, text);
  container.appendChild(card);
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

// 5. 화장품 분석 화면 (API 미연동: 시연용 데이터만 표시)
$("cosmeticAnalyze").addEventListener("click", () => {
  const data = getCosmeticInput();
  const message = $("cosmeticMessage");
  if (!data.image) {
    message.textContent = "화장품 전성분 라벨 사진을 먼저 업로드해 주세요.";
    return;
  }
  if (!data.concerns.length) {
    message.textContent = "피부 고민을 하나 이상 선택해 주세요.";
    return;
  }
  message.textContent = "";
  $("resultProduct").textContent = data.productName || "업로드한 화장품";
  $("resultSkin").textContent = data.skinType === "잘 모르겠음" ? "피부 타입 미확인" : data.skinType;
  renderTags($("resultTags"), data.concerns);

  const recommendationArea = $("cosmeticRecommendations");
  recommendationArea.replaceChildren();
  if (data.concerns.some(c => ["건조함", "속건조"].includes(c))) {
    addCard(recommendationArea, "💧 장벽 보습 크림 (예시)", "글리세린·세라마이드 계열 보습 성분을 고려해 보세요.");
  }
  if (data.concerns.some(c => ["민감함", "홍조", "피부 열감"].includes(c))) {
    addCard(recommendationArea, "🌿 진정 관리 (예시)", "판테놀이나 병풀 성분을 포함한 순한 제품 유형을 살펴보세요.");
  }
  if (data.concerns.some(c => ["여드름", "트러블", "피지", "모공"].includes(c))) {
    addCard(recommendationArea, "🫧 가벼운 보습제 (예시)", "피부 상태에 맞는 가벼운 보습제를 고려해 보세요.");
  }
  if (data.concerns.some(c => ["칙칙한 피부톤", "탄력", "주름"].includes(c))) {
    addCard(recommendationArea, "☀️ 기본 피부 관리 (예시)", "보습과 자외선 차단을 기본으로 관리해 보세요.");
  }
  if (!recommendationArea.children.length) {
    addCard(recommendationArea, "♡ 기본 루틴 (예시)", "순한 세안제, 보습제, 자외선 차단제를 기본으로 고려해 보세요.");
  }
  $("results").classList.remove("hidden");
  $("results").scrollIntoView({ behavior: "smooth", block: "start" });
});

// 6. 기존 화장품 고민을 모델링팩으로 복사
$("copyConcerns").addEventListener("click", () => {
  const cosmeticConcerns = [...document.querySelectorAll('input[name="concern"]:checked')].map(el => el.value);
  document.querySelectorAll('input[name="packConcern"]').forEach(el => {
    el.checked = cosmeticConcerns.includes(el.value);
  });
  $("packMessage").textContent = cosmeticConcerns.length
    ? "위에서 선택한 고민을 가져왔어요. 필요한 항목은 수정할 수 있어요."
    : "위에서 선택한 피부 고민이 없어요. 아래에서 직접 선택해 주세요.";
});

// 7. 보유 모델링팩에 대한 앰플/세럼 활용 예시
const ampouleGroups = [
  { concerns: ["건조함", "속건조"], name: "💧 글리세린·히알루론산 보습 앰플", desc: "건조함이 고민일 때 팩 전후의 보습 단계에서 사용할 후보 성분이에요." },
  { concerns: ["피부 열감", "홍조", "민감함"], name: "🌿 판테놀·병풀 진정 세럼", desc: "피부가 민감할 때 자극이 적은 진정 중심 제품을 살펴볼 수 있어요." },
  { concerns: ["여드름", "트러블"], name: "🫧 가벼운 진정·보습 앰플", desc: "트러블이 고민이라면 향이 강하거나 자극적인 제품보다 순한 보습을 우선해 보세요." },
  { concerns: ["피지", "모공"], name: "✨ 나이아신아마이드 세럼", desc: "피지 관리에 활용되는 성분이에요. 고함량 제품은 피부 반응을 확인하세요." },
  { concerns: ["칙칙한 피부톤"], name: "☀️ 피부톤 관리 세럼", desc: "나이아신아마이드 등을 별도 스킨케어 단계에서 고려할 수 있어요." },
  { concerns: ["탄력", "주름"], name: "♡ 보습·탄력 관리 세럼", desc: "보습 중심 성분을 선택하고 낮에는 자외선 차단을 병행해 보세요." }
];

$("packAnalyze").addEventListener("click", () => {
  const data = getPackInput();
  const message = $("packMessage");
  if (!data.image && !data.packName) {
    message.textContent = "보유 모델링팩의 제품명 또는 라벨 사진을 입력해 주세요.";
    return;
  }
  if (!data.concerns.length) {
    message.textContent = "모델링팩으로 관리할 피부 고민을 하나 이상 선택해 주세요.";
    return;
  }
  message.textContent = "";
  $("packResultName").textContent = data.packName || "사진으로 등록한 모델링팩";
  renderTags($("packResultTags"), data.concerns);

  const target = $("ampouleRecommendations");
  target.replaceChildren();
  ampouleGroups.filter(group => group.concerns.some(c => data.concerns.includes(c)))
    .forEach(group => addIngredient(target, group.name, group.desc));
  if (!target.children.length) addIngredient(target, "♡ 기본 보습 앰플", "피부 자극이 적은 보습 제품을 우선 고려해 보세요.");

  // 중요: 혼합 '허용' 선택은 증빙이 아닌 사용자 진술임
  if (data.mixStatus === "prohibited") {
    $("mixGuidance").textContent = "제품 설명서에서 혼합을 금지했다면 앰플이나 세럼을 모델링팩에 직접 섞지 마세요.";
  } else if (data.mixStatus === "allowed") {
    $("mixGuidance").textContent = "사용자가 제조사의 혼합 허용 안내를 확인했다고 선택했어요. 다만 어떤 앰플을 얼마만큼 넣어도 되는지 확인되지 않았으므로 지금은 직접 혼합을 권하지 않아요. 정확한 제품 지침 확인 후 판단해야 해요.";
  } else {
    $("mixGuidance").textContent = "제조사의 혼합 가능 여부가 확인되지 않았어요. 임의로 앰플이나 세럼을 팩에 넣지 말고, 우선 제품 설명서대로 사용하세요.";
  }
  $("separateGuidance").textContent = "현재는 추천 성분이 들어 있는 앰플·세럼을 모델링팩과 별도의 스킨케어 단계에 사용하는 방법을 우선 제안해요. 피부에 자극이 생기면 사용을 중단하세요.";
  $("packResults").classList.remove("hidden");
  $("packResults").scrollIntoView({ behavior: "smooth", block: "start" });
});

// 백엔드 연동 시:
// getCosmeticInput() -> { image, productName, skinType, concerns, extraConcern }
// getPackInput()     -> { image, packName, skinType, concerns, mixStatus, notes }
// 서버에 FormData로 전달하고 분석 응답을 위 결과 영역에 렌더링하면 됩니다.
// Gemini API 키는 브라우저 JS가 아닌 백엔드 환경변수에 보관하세요.
