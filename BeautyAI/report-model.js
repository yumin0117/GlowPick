import { normalizeIngredient } from "./ai-core.js";
import { CLAIMS, GUIDANCE, RECOMMENDATIONS } from "./ai-assets.js";

// BEGIN SHARED PRODUCT RECOMMENDATIONS (also embedded in ym's standalone script)
export function prepareRecommendations(kind, input, complete, isMock = false) {
  const notice = "선택한 고민과 제조사 공개 정보를 연결한 제품 후보예요. 개인 적합성·제품 간 우열·여드름 치료 효과를 평가한 결과는 아니에요. 표시된 제품은 비교·선택할 후보이며 모두 함께 쓰라는 뜻은 아니에요. 구입 전 현재 라벨과 사용법을 확인해 주세요.";
  // Canonical goal order makes selection independent of checkbox order or synonyms.
  const concerns = new Set(input.concerns || []);
  const goals = RECOMMENDATIONS.goals.filter(goal => goal.concerns.some(c => concerns.has(c)));
  const ready = complete && !isMock;
  const candidates = ready ? RECOMMENDATIONS.products.flatMap((product, index) => {
    const matched = goals.filter(goal => product.goals.includes(goal.id));
    if (!matched.length) return [];
    let source;
    try { source = new URL(product.sourceUrl); } catch { return []; }
    if (source.protocol !== "https:" || source.username || source.password
      || !["tonymoly.com", "www.skin1004.com", "www.aestura.com", "beautyofjoseon.com", "www.cosrx.com"].includes(source.hostname)) return [];
    const needsCheck = (product.attentionConcerns || []).some(c => concerns.has(c)
      || (c === "민감함" && input.skinType === "민감성"));
    let oliveYoung = null;
    try {
      const listing = product.oliveYoung, url = new URL(listing?.url);
      if (listing.status === "listing_confirmed" && listing.checkedAt && listing.matchScope === "product_name_only"
        && url.origin === "https://www.oliveyoung.co.kr" && !url.username && !url.password
        && url.pathname === "/store/goods/getGoodsDetail.do" && /^A\d{12}$/u.test(listing.goodsNo)
        && url.search === `?goodsNo=${listing.goodsNo}`)
        oliveYoung = { url: url.href, goodsNo: listing.goodsNo, checkedAt: listing.checkedAt, title: listing.title };
    } catch { /* An unverified or malformed retailer link never receives preferred status. */ }
    return [{ id: product.id, brand: product.brand, name: product.name, type: product.type, index,
      goalIds: matched.map(goal => goal.id),
      matchedConcerns: matched.flatMap(goal => goal.concerns.filter(c => concerns.has(c))),
      labels: matched.map(goal => goal.label), reasons: matched.map(goal => product.reasons[goal.id]),
      attention: needsCheck ? product.attentionReason : "",
      oliveYoung,
      keyIngredients: product.keyIngredients, note: product.note, sourceUrl: product.sourceUrl,
      checkedAt: product.checkedAt, mixingStatus: kind === "pack" ? "unknown" : "not_applicable" }];
  }) : [];
  const compare = (a, b) => b.goalIds.length - a.goalIds.length
    || Number(Boolean(a.attention)) - Number(Boolean(b.attention))
    || Number(Boolean(b.oliveYoung)) - Number(Boolean(a.oliveYoung)) || a.index - b.index;
  candidates.sort(compare);
  // Exhaustive bounded set cover, rather than a greedy list: maximize covered goals,
  // then minimize conditional checks, unconfirmed Olive Young listings and core size.
  let best = { items: [], covered: 0, checks: 0, unlisted: 0 };
  function choose(items, start) {
    const covered = new Set(items.flatMap(p => p.goalIds)).size;
    const checks = items.filter(p => p.attention).length;
    const unlisted = items.filter(p => !p.oliveYoung).length;
    if (covered > best.covered || (covered === best.covered && (checks < best.checks
      || (checks === best.checks && (unlisted < best.unlisted
        || (unlisted === best.unlisted && items.length < best.items.length))))))
      best = { items: [...items], covered, checks, unlisted };
    if (items.length === 3) return;
    for (let i = start; i < candidates.length; i++) choose([...items, candidates[i]], i + 1);
  }
  choose([], 0);
  const core = [...best.items].sort(compare);
  const alternatives = candidates.filter(p => !core.includes(p) && !p.attention)
    .sort((a,b) => Number(Boolean(b.oliveYoung)) - Number(Boolean(a.oliveYoung)) || compare(a,b))
    .slice(0, 3 - core.length);
  const products = [...core, ...alternatives].map((p, i) => ({ ...p,
    role: i === 0 ? "우선 후보" : i < core.length ? "보완 후보" : "대안 후보",
    selectionReason: i < core.length
      ? `선택한 ${goals.length}개 관리 목적 중 ${p.goalIds.length}개와 연결돼요.${core.length > 1 ? " 다른 보완 후보와 함께 살펴보면 선택한 목적을 더 넓게 비교할 수 있어요." : ""}`
      : `선택한 ${goals.length}개 관리 목적 중 ${p.goalIds.length}개에 대한 다른 후보예요. 우선 후보와 함께 사용할 필요는 없어요.${p.goalIds.length < goals.length ? " 선택한 모든 목적을 연결하는 대안은 아니에요." : ""}`
  }));
  const coveredGoalIds = goals.filter(g => core.some(p => p.goalIds.includes(g.id))).map(g => g.id);
  const uncoveredConcerns = [...concerns].filter(c => !goals.some(g => coveredGoalIds.includes(g.id) && g.concerns.includes(c)));
  const strategy = "등록된 후보의 최대 3개 조합을 비교해, 관리 목적을 가장 넓게 연결하는 우선·보완 후보를 골랐어요. 그다음 추가 확인이 필요한 제품 수가 적고, 올리브영 등록을 확인한 제품이 우선인 쪽을 택해요. 이 조건이 같으면 우선·보완 후보 수가 적은 쪽을 택해요. 대안은 별도 비교용이에요. 같은 관리 목적은 한 번만 계산하며 동률은 등록 순서로 표시해요. 효과 순위는 아니에요.";
  const shopNotice = "올리브영 상품명 기준으로 등록을 확인했어요. 성분은 제조사 공개 버전 기준이며, 가격·재고·기획 구성은 달라질 수 있어요. 구매 페이지의 현재 라벨·사용법을 확인해 주세요.";
  const coverage = `${goals.length}개 관리 목적 중 ${coveredGoalIds.length}개 연결 · 우선·보완 ${core.length}개${alternatives.length ? ` · 대안 ${alternatives.length}개` : ""}`;
  const contextNotice = concerns.has("피부 열감")
    ? "피부 열감은 진정 관리 목적에 연결했어요. 피부 온도를 낮추거나 열감의 원인을 해결하는 효과를 확인한 추천은 아니에요." : "";
  const mixingNotice = kind !== "pack" ? "" : input.mixStatus === "prohibited"
    ? "제조사의 혼합 금지 안내를 확인하셨으므로 이 팩에는 앰플·세럼을 섞지 마세요. 아래는 혼합용 추천이 아닌 별도 제품 후보예요."
    : "혼합 가능 여부 미확인. 아래 후보를 이 모델링팩에 섞어 써도 된다는 뜻은 아니에요. 제조사가 지정한 혼합액·사용법을 따라 주세요.";
  const matchedConcerns = goals.flatMap(goal => goal.concerns.filter(c => concerns.has(c)));
  const lead = !ready ? "전성분 판독을 완료한 뒤 제품 후보를 확인할 수 있어요."
    : !products.length ? "현재 선택한 고민에 맞춰 확인한 앰플·세럼 후보가 아직 없어요."
    : `${matchedConcerns.join(" · ")} 고민을 함께 고려해 앰플·세럼 후보를 골랐어요. 업로드한 제품과의 병용 적합성을 판정한 추천은 아니에요.`;
  const missingNotice = uncoveredConcerns.length ? `아직 연결하지 못한 고민: ${uncoveredConcerns.join(" · ")}` : "";
  const copyLines = ready ? ["", "[GlowPick 추천!]", lead, coverage, strategy,
    ...[contextNotice, missingNotice, mixingNotice].filter(Boolean),
    ...products.flatMap(product => [`[${product.role}] ${product.brand} ${product.name} · ${product.labels.join(" / ")}`,
      `연결한 고민: ${product.matchedConcerns.join(" · ")}`, product.selectionReason,
      ...product.reasons, `확인한 성분: ${product.keyIngredients.join(", ")}`, product.note, product.attention,
      product.oliveYoung ? `올리브영 상품 등록 확인 · ${product.oliveYoung.checkedAt}` : "올리브영 상품 등록 미확인"].filter(Boolean)), shopNotice, notice] : [];
  return { ready, products, lead, notice, mixingNotice, strategy, coverage, contextNotice, missingNotice,
    coreIds: core.map(p => p.id), coveredGoalIds, uncoveredConcerns, shopNotice, copyLines };
}
// END SHARED PRODUCT RECOMMENDATIONS

const STATUS_LABELS = { complete: "전성분 판독 완료", partial: "일부 성분만 판독",
  unreadable: "이미지 판독 어려움", no_ingredients: "전성분 영역을 찾지 못함", multiple_products: "여러 제품이 함께 확인됨" };
const SCOPE_NOTICE = "일반 성분 기능에 대한 참고 설명입니다. 전체 성분·완제품 효능·개인 적합성·혼합 허용을 검증한 결과가 아닙니다. 근거ID 연결 검사와 별도로 문헌 해석·한영 표기의 독립 사람 교차검토가 필요합니다.";

// Only the bundled, sourced rules may classify a label ingredient. Model prose cannot add rules.
export function prepareReport(kind, input, response) {
  if (!["cosmetic", "pack"].includes(kind) || !response?.ok || !response.extraction || !response.analysis)
    throw new Error("완료되지 않은 요청을 리포트로 표시할 수 없습니다.");
  const extraction = response.extraction, analysis = response.analysis;
  const complete = extraction.status === "complete", isMock = response.meta?.isMock === true;
  const sources = analysis.sources || [];
  const trusted = new Map(CLAIMS.map(claim => [claim.evidenceId, claim]));
  const evidence = sources.filter(source => {
    const local = trusted.get(source.evidenceId);
    return local && source.reviewStatus === local.reviewStatus && source.statement === local.statement
      && source.sourceUrl === local.sourceUrl && normalizeIngredient(source.ingredient) === normalizeIngredient(local.ingredient);
  });
  const canExplain = complete && !isMock && analysis.status === "reference_only";
  // Fill omissions with the reviewed statement, never with an invented model explanation.
  const notes = canExplain ? extraction.ingredients.flatMap(ingredient => {
    const matched = evidence.filter(source => normalizeIngredient(source.ingredient) === normalizeIngredient(ingredient));
    if (!matched.length) return [];
    const suggested = (analysis.ingredientNotes || []).filter(note => normalizeIngredient(note.ingredient) === normalizeIngredient(ingredient));
    if (suggested.some(note => !note.evidenceIds?.length || note.evidenceIds.some(id => !matched.some(source => source.evidenceId === id)))) return [];
    return [{ ingredient, explanation: matched[0].statement, evidenceIds: matched.map(source => source.evidenceId) }];
  }) : [];
  const helpful = notes.flatMap(note => {
    const rule = GUIDANCE.helpful.find(rule => rule.concerns.some(c => input.concerns.includes(c))
      && note.evidenceIds.some(id => rule.evidenceIds.includes(id)));
    return rule ? [{ ingredient: note.ingredient, reason: rule.reason, evidenceIds: note.evidenceIds }] : [];
  });
  const cautions = complete && !isMock ? extraction.ingredients.flatMap(ingredient => {
    const rule = GUIDANCE.cautions.find(rule => rule.aliases.some(alias => normalizeIngredient(alias) === normalizeIngredient(ingredient))
      && ((!rule.concerns.length && !rule.skinTypes.length) || rule.concerns.some(c => input.concerns.includes(c))
        || rule.skinTypes.includes(input.skinType)));
    return rule ? [{ ingredient, reason: rule.statement, evidenceIds: [rule.evidenceId] }] : [];
  }) : [];
  const classified = new Set([...notes, ...cautions].map(note => normalizeIngredient(note.ingredient)));
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
    summary: canExplain ? `판독된 성분 ${extraction.ingredients.length}개 중 ${notes.length}개의 일반 기능 근거를 연결했어요. 주의해서 확인할 일반 안내는 ${cautions.length}개이며, 개인 적합성이나 완제품 효능을 판정한 결과는 아니에요.`
      : analysis.summary || "분석한 성분 정보를 확인해 주세요.",
    analysisStatus: analysis.status, extractionStatus: extraction.status,
    ingredients: extraction.ingredients, rawText: extraction.rawText || "읽은 원문이 없습니다.",
    helpful, cautions, unknown: extraction.ingredients.filter(name => !classified.has(normalizeIngredient(name))),
    notes, sources, warnings, mixingText };
  model.recommendations = prepareRecommendations(kind, input, complete, isMock);
  model.copyText = [kind === "pack" ? "GlowPick 모델링팩 리포트" : "GlowPick 화장품 리포트",
    `제품: ${model.productName}`, `피부 타입: ${input.skinType}`, `피부 고민: ${input.concerns.join(", ")}`,
    banner, `설명 상태: ${analysis.status}`, "", "[도움과 관련된 일반 기능]",
    ...(helpful.length ? helpful.map(note => `${note.ingredient}: ${note.reason}`) : ["연결할 일반 기능 근거가 부족합니다."]),
    "", "[일반 성분 기능]", ...notes.map(note => `${note.ingredient}: ${note.explanation} (${note.evidenceIds.join(", ")})`),
    "", "[주의해서 확인할 일반 안내]",
    ...cautions.map(note => `${note.ingredient}: ${note.reason} (${note.evidenceIds.join(", ")})`),
    "개인별 주의 판단은 확정할 수 없습니다. 모든 성분이 안전하다는 뜻은 아닙니다.",
    "", `[전성분 ${extraction.ingredients.length}개]`, ...extraction.ingredients, "", "[사진 원문]", model.rawText,
    "", "[다음 단계·검토 한계]", ...warnings,
    ...(mixingText ? ["", "[혼합 안내]", mixingText] : []), ...model.recommendations.copyLines
  ].join("\n");
  return model;
}
