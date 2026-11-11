import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { prepareReport } from "../BeautyAI/report-model.js";

// Exercise the real UI event handlers without a network connection or credential.
class Element {
  constructor(id = "") {
    Object.assign(this, { id, value: "", type: "", textContent: "", disabled: false,
      dataset: {}, children: [], handlers: new Map(), attrs: new Map() });
    const classes = new Set();
    this.classList = {
      add: name => classes.add(name), remove: name => classes.delete(name),
      contains: name => classes.has(name),
      toggle: (name, enabled) => enabled ? classes.add(name) : classes.delete(name)
    };
  }
  addEventListener(name, handler) {
    this.handlers.set(name, [...(this.handlers.get(name) || []), handler]);
  }
  async fire(name) { for (const handler of this.handlers.get(name) || []) await handler({}); }
  setAttribute(name, value) { this.attrs.set(name, value); }
  getAttribute(name) { return this.attrs.get(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  focus() {}
  scrollIntoView() {}
}

async function setup(answer) {
  const html = await readFile(new URL("../BeautyAI/index.html", import.meta.url), "utf8");
  const elements = new Map([...html.matchAll(/\bid="([^"]+)"/gu)].map(([, id]) => [id, new Element(id)]));
  const get = id => elements.get(id);
  const tabs = ["cosmetic", "pack"].map(kind => {
    const element = get("tab-" + kind); element.dataset.tab = kind; return element;
  });
  const skin = new Element(); skin.value = "잘 모르겠음";
  const concern = new Element(); concern.value = "건조함";
  const windows = new Map(), calls = [];
  get("geminiApiKey").value = "synthetic-autofilled-key";
  const document = {
    getElementById: get, createElement: () => new Element(),
    querySelector: selector => selector.includes("skinType") ? skin : null,
    querySelectorAll: selector => selector === ".tab-button" ? tabs
      : selector === 'input[name="skinType"]' ? [skin]
      : selector.includes(":checked") ? [concern]
      : selector === "button, input, textarea" ? [...elements.values()] : []
  };
  const context = vm.createContext({ document, URL, setTimeout, clearTimeout,
    window: { addEventListener: (name, handler) => windows.set(name, handler) },
    prepareReport, MAX_IMAGE_BYTES: 10 * 1024 * 1024,
    analyze: async (...args) => {
      calls.push(args);
      return answer || { ok: true,
        extraction: { status: "partial", productName: null, ingredients: ["성분"],
          rawText: "성분", nextAction: "전체 라벨을 다시 촬영해 주세요.", warnings: [], uncertainSpans: [] },
        analysis: { status: "not_run", summary: "전체 판독 후 설명", ingredientNotes: [], warnings: [] },
        mixing: { status: "unknown", reason: "근거 미확인" }, meta: { isMock: false, promptStatus: "final" } };
    }
  });
  const source = (await readFile(new URL("../BeautyAI/script.js", import.meta.url), "utf8"))
    .replace(/^import [^\n]+\r?\n/gmu, "");
  vm.runInContext(source, context);
  for (const prefix of ["cosmetic", "pack"]) {
    get(prefix + "File").files = [new File(["synthetic image"], "label.png", { type: "image/png" })];
    await get(prefix + "File").fire("change");
  }
  return { get, calls, windows };
}

test("one key is reused across successful cosmetic requests and the modeling-pack tab", async () => {
  const { get, calls } = await setup();
  assert.equal(get("geminiApiKey").value, "");
  const key = "synthetic-current-tab-key";
  get("geminiApiKey").value = key;
  await get("toggleKey").fire("click");
  assert.equal(get("geminiApiKey").type, "text");
  await get("cosmeticAnalyze").fire("click");
  assert.equal(get("geminiApiKey").value, key);
  assert.equal(get("geminiApiKey").type, "password");
  await get("cosmeticAnalyze").fire("click");
  await get("tab-pack").fire("click");
  await get("packAnalyze").fire("click");
  assert.equal(calls.length, 3);
  assert.deepEqual(calls.map(call => call[0]), ["/analyze_cosmetic", "/analyze_cosmetic", "/consult_modeling_pack"]);
  assert.ok(calls.every(call => call[3] === key));
});

test("an API failure retains the masked key for the user's next attempt", async () => {
  const { get, calls } = await setup({ ok: false, requestId: "synthetic-request",
    error: { code: "RATE_LIMITED", message: "무료 한도 초과" } });
  get("geminiApiKey").value = "synthetic-current-tab-key";
  await get("cosmeticAnalyze").fire("click");
  assert.match(get("cosmeticMessage").textContent, /RATE_LIMITED/u);
  assert.equal(get("geminiApiKey").value, "synthetic-current-tab-key");
  assert.equal(get("geminiApiKey").type, "password");
  await get("cosmeticAnalyze").fire("click");
  assert.equal(calls.length, 2);
});

test("navigation and page restoration clear the key; users can change or remove it", async () => {
  const { get, calls, windows } = await setup();
  get("geminiApiKey").value = "synthetic-first-key";
  await get("cosmeticAnalyze").fire("click");
  get("geminiApiKey").value = "synthetic-replacement-key";
  await get("cosmeticAnalyze").fire("click");
  assert.equal(calls[1][3], "synthetic-replacement-key");
  get("geminiApiKey").value = "";
  await get("cosmeticAnalyze").fire("click");
  assert.equal(calls.length, 2);
  get("geminiApiKey").value = "synthetic-navigation-key";
  windows.get("pagehide")();
  assert.equal(get("geminiApiKey").value, "");
  get("geminiApiKey").value = "synthetic-restored-key";
  windows.get("pageshow")();
  assert.equal(get("geminiApiKey").value, "");
  assert.equal(get("geminiApiKey").type, "password");
});

test("explanation failure shows its stage and HTTP status without presenting a completed report", async () => {
  const { get } = await setup({ ok: false, requestId: "synthetic-request", error: {
    code: "GEMINI_UNAVAILABLE", message: "Gemini 요청에 실패했습니다." }, meta: { failure: {
    stage: "explanation", httpStatus: 503, providerCode: "service_unavailable",
    reason: "overloaded", extractionCompleted: true } } });
  get("geminiApiKey").value = "synthetic-current-tab-key";
  await get("cosmeticAnalyze").fire("click");
  const message = get("cosmeticMessage");
  assert.match(message.textContent, /전성분 판독은 끝났지만 설명 생성에 실패/u);
  assert.match(message.textContent, /성분 설명 · HTTP 503 · Google 처리 용량 부족/u);
  assert.equal(message.dataset.failureStage, "explanation");
  assert.equal(message.dataset.httpStatus, "503");
  assert.equal(message.dataset.providerCode, "service_unavailable");
  assert.equal(get("results").classList.contains("hidden"), true);
  await get("cosmeticFile").fire("change");
  assert.equal(message.dataset.failureStage, undefined);
  assert.equal(message.dataset.httpStatus, undefined);
});
