import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createStaticClient, GEMINI_URL, MAX_IMAGE_BYTES, validateImage } from "../BeautyAI/gemini-client.js";
import { generationSchema, validate, validateExtraction } from "../BeautyAI/ai-core.js";
import { SCHEMAS, CLAIMS } from "../BeautyAI/ai-assets.js";

const key = "AIza" + "X".repeat(35); // Synthetic, never usable as a credential.
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=", "base64");
const image = () => new File([png], "test.png", { type: "image/png" });
const extraction = (status = "complete", names = ["알란토인"]) => ({ status, productName: null,
  rawText: names.join(", "), ingredients: ["complete", "partial"].includes(status) ? names : [],
  uncertainSpans: [], warnings: [], nextAction: status === "complete" ? "" : "한 제품의 전성분을 다시 촬영해주세요." });
const explanation = (id = "YSW_A001_KO", ingredient = "알란토인") => ({ summary: "일반 기능 참고입니다.",
  ingredientNotes: [{ ingredient, explanation: "피부 컨디셔닝 성분으로 사용됩니다.", evidenceIds: [id] }], warnings: [] });

function setup(answers = [], options = {}) {
  const calls = [];
  const client = createStaticClient({
    decodeImage: async () => ({ width: 1, height: 1, close() {} }),
    encodeImage: async file => Buffer.from(await file.arrayBuffer()).toString("base64"),
    fetcher: async (url, init) => {
      calls.push({ url, init, payload: JSON.parse(init.body) });
      const answer = answers.shift();
      if (answer instanceof Error) throw answer;
      if (answer instanceof Response) return answer;
      return Response.json({ status: "completed", output_text: JSON.stringify(answer) });
    }, ...options
  });
  return { client, calls, run: (request = {}, endpoint = "/analyze_cosmetic", apiKey = key) => client.analyze(endpoint, image(), request, apiKey) };
}

test("page initialization never calls Google or accesses a saved key", async () => {
  const { client, calls } = setup();
  const status = await client.health();
  assert.equal(status.transport, "browser-direct");
  assert.equal(status.requiresUserKey, true);
  assert.equal(calls.length, 0);
});

test("both tasks connect the two stages; key goes only to a fixed Google header", async () => {
  for (const endpoint of ["/analyze_cosmetic", "/consult_modeling_pack"]) {
    const { run, calls } = setup([extraction(), explanation()]);
    const out = await run({ skinType: "민감성", mixStatus: "allowed", concerns: ["보습"] }, endpoint);
    assert.equal(out.ok, true);
    assert.equal(out.analysis.status, "reference_only");
    assert.equal(out.analysis.sources.length, 1);
    assert.equal(out.analysis.sources[0].evidenceId, "YSW_A001_KO");
    assert.equal(out.mixing.status, endpoint === "/analyze_cosmetic" ? "not_applicable" : "unknown");
    assert.match(out.analysis.notice, /독립 사람/);
    assert.equal(calls.length, 2);
    for (const call of calls) {
      assert.equal(call.url, GEMINI_URL);
      assert.equal(call.init.headers["x-goog-api-key"], key);
      assert.equal(call.init.credentials, "omit");
      assert.equal(call.payload.store, false);
      assert.equal(call.payload.model, "gemini-3.5-flash-lite");
      assert.ok(!JSON.stringify(call.payload).includes(key));
    }
    assert.ok(!JSON.stringify(calls[0].payload).includes("민감성"));
    assert.ok(!JSON.stringify(calls[0].payload).includes("approvedClaims"));
    assert.equal(calls[0].payload.input[1].mime_type, "image/png");
    assert.equal(Buffer.from(calls[0].payload.input[1].data, "base64").compare(png), 0);
    assert.equal(calls[1].payload.input.length, 1);
    assert.ok(!JSON.stringify(out).includes(key));
  }
});

test("all six reviewed names select only the matching language row", async () => {
  for (const claim of CLAIMS) {
    const answer = { summary: "일반 기능", ingredientNotes: [{ ingredient: claim.ingredient, explanation: claim.statement, evidenceIds: [claim.evidenceId] }], warnings: [] };
    const { run } = setup([extraction("complete", [claim.ingredient]), answer]);
    const out = await run();
    assert.equal(out.ok, true);
    assert.deepEqual(out.analysis.sources.map(source => source.evidenceId), [claim.evidenceId]);
  }
});

test("every incomplete status stops before explanation even with a known ingredient", async () => {
  for (const status of ["partial", "unreadable", "no_ingredients", "multiple_products"]) {
    const { run, calls } = setup([extraction(status)]);
    const out = await run();
    assert.equal(out.ok, true);
    assert.equal(out.analysis.status, "not_run");
    assert.equal(calls.length, 1);
  }
});

test("unseen ingredients are read, but not invented into approved evidence", async () => {
  const { run, calls } = setup([extraction("complete", ["NEW_INGREDIENT", "1,2-Hexanediol", "티트리(1,500ppm)"])]);
  const out = await run();
  assert.equal(out.ok, true);
  assert.equal(out.analysis.status, "needs_evidence");
  assert.equal(out.extraction.ingredients.length, 3);
  assert.equal(calls.length, 1);
});

test("wrong-language IDs, invented IDs and unextracted ingredient notes fail", async () => {
  for (const answer of [explanation("YSW_A001_EN"), explanation("INVENTED"), explanation("YSW_A001_KO", "글리세린")]) {
    const { run } = setup([extraction(), answer]);
    const out = await run();
    assert.equal(out.ok, false);
    assert.equal(out.error.code, "EVIDENCE_VALIDATION_FAILED");
  }
});

test("all strict extraction rules reject malformed complete/incomplete lists", () => {
  for (const change of [{ rawText: "" }, { ingredients: [" "] }, { uncertainSpans: ["?"] }, { ingredients: [] },
    { productName: 42 }, { added: "not allowed" }, { ingredients: Array(257).fill("A") }]) {
    assert.throws(() => validateExtraction({ ...extraction(), ...change }, SCHEMAS.Extraction));
  }
  for (const status of ["partial", "unreadable", "no_ingredients", "multiple_products"]) {
    assert.throws(() => validateExtraction({ ...extraction(status), nextAction: " " }, SCHEMAS.Extraction));
  }
  assert.throws(() => validateExtraction({ ...extraction("multiple_products"), ingredients: ["A"] }, SCHEMAS.Extraction));
});

test("unknown inputs, coercion, too many concerns and long text are rejected before any call", async () => {
  for (const request of [null, [], { concerns: "A" }, { concerns: Array(13).fill("보습") }, { extraConcern: "X".repeat(2001) },
    { apiKey: "not allowed" }, { skinType: 42 }, { productName: 42 }]) {
    const { run, calls } = setup();
    const out = await run(request);
    assert.equal(out.error.code, "INVALID_INPUT");
    assert.equal(calls.length, 0);
  }
});

test("missing/invalid key never sends a photo", async () => {
  for (const credential of [undefined, "", "bad", 42]) {
    const { client, calls } = setup();
    const out = await client.analyze("/analyze_cosmetic", image(), {}, credential);
    assert.equal(out.error.code, "KEY_REQUIRED");
    assert.equal(calls.length, 0);
  }
});

test("key is per call and is never implicitly reused after success", async () => {
  const { client, run, calls } = setup([extraction("partial")]);
  assert.equal((await run()).ok, true);
  const second = await client.analyze("/analyze_cosmetic", image(), {});
  assert.equal(second.error.code, "KEY_REQUIRED");
  assert.equal(calls.length, 1);
});

test("new auth-key formats work without a legacy prefix, but header injection is rejected", async () => {
  const { run, calls } = setup([extraction("partial")]);
  const newKey = "AQ." + "X".repeat(50);
  assert.equal((await run({}, "/analyze_cosmetic", newKey)).ok, true);
  assert.equal(calls[0].init.headers["x-goog-api-key"], newKey);
  assert.equal((await run({}, "/analyze_cosmetic", newKey + "\r\n")).error.code, "KEY_REQUIRED");
  assert.equal(calls.length, 1);
});

test("mock mode is explicit, synthetic and makes zero network calls", async () => {
  const { run, calls } = setup([], { mode: "mock" });
  const out = await run();
  assert.equal(out.ok, true);
  assert.equal(out.meta.isMock, true);
  assert.match(out.meta.notice, /모의/);
  assert.match(out.extraction.ingredients[0], /TEST_/);
  assert.equal(calls.length, 0);
});

test("all upstream errors are sanitized; no automatic retries or mock fallback", async () => {
  for (const [status, code] of [[400, "GEMINI_REQUEST_REJECTED"], [401, "GEMINI_AUTH_ERROR"], [402, "BILLING_CONFIGURATION_ERROR"],
    [403, "GEMINI_AUTH_ERROR"], [404, "MODEL_NOT_FOUND"], [429, "RATE_LIMITED"], [503, "GEMINI_UNAVAILABLE"]]) {
    const { run, calls } = setup([new Response(key, { status })]);
    const out = await run();
    assert.equal(out.ok, false);
    assert.equal(out.error.code, code);
    assert.equal(out.meta.isMock, false);
    assert.equal(calls.length, 1);
    assert.ok(!JSON.stringify(out).includes(key));
  }
});

test("network exception never exposes its sensitive text", async () => {
  const { run } = setup([new Error(key)]);
  const out = await run();
  assert.equal(out.error.code, "NETWORK_ERROR");
  assert.ok(!JSON.stringify(out).includes(key));
});

test("malformed, incomplete, oversized and invalid JSON model responses fail", async () => {
  const answers = [
    new Response("not JSON"),
    Response.json({ status: "in_progress" }),
    Response.json({ status: "completed", output_text: "[]" }),
    new Response("X".repeat(2_000_001)),
    Response.json({ status: "completed", output_text: '{"status":"invented"}' })
  ];
  for (const response of answers) {
    const { run } = setup([response]);
    const out = await run();
    assert.equal(out.ok, false);
    assert.ok(["MODEL_INCOMPLETE", "MODEL_RESPONSE_INVALID"].includes(out.error.code));
  }
});

test("steps-based Google output is also supported", async () => {
  const response = Response.json({ status: "completed", steps: [{ type: "model_output", content: [{ type: "text", text: JSON.stringify(extraction("partial")) }] }] });
  assert.equal((await setup([response]).run()).ok, true);
});

test("generation schema avoids serving-state explosion while local length checks stay strict", async () => {
  const original = structuredClone(SCHEMAS.ModelAnalysis);
  const generated = generationSchema(SCHEMAS.ModelAnalysis);
  assert.ok(!JSON.stringify(generated).includes('"maxLength"'));
  assert.ok(!JSON.stringify(generated).includes('"maxItems"'));
  assert.equal(generated.additionalProperties, false);
  assert.deepEqual(SCHEMAS.ModelAnalysis, original);
  const answer = explanation(); answer.ingredientNotes[0].explanation = "X".repeat(2001);
  const out = await setup([extraction(), answer]).run();
  assert.equal(out.error.code, "MODEL_RESPONSE_INVALID");
  assert.throws(() => validate("text", { type: "string", pattern: ".*" }));
});

test("missing, oversized, wrong MIME/extension, corrupt and animated images are rejected", async () => {
  const decode = async () => ({ width: 1, height: 1 });
  for (const file of [null, new File([], "empty.png", { type: "image/png" }),
    new File([new Uint8Array(MAX_IMAGE_BYTES + 1)], "large.png", { type: "image/png" }),
    new File([png], "wrong.jpg", { type: "image/jpeg" }), new File([png], "wrong.gif", { type: "image/gif" }),
    new File(["not an image"], "bad.png", { type: "image/png" })]) await assert.rejects(validateImage(file, decode));
  const apng = Buffer.concat([png.subarray(0, 33), Buffer.from([0, 0, 0, 0]), Buffer.from("acTL"), Buffer.alloc(4), png.subarray(33)]);
  await assert.rejects(validateImage(new File([apng], "animated.png", { type: "image/png" }), decode), /정지 이미지/u);
  await assert.rejects(validateImage(image(), async () => { throw new Error("decode failed"); }), /사진 파일/u);
  await assert.rejects(validateImage(image(), async () => ({ width: 6000, height: 6000 })), /2,400만/u);
});

test("same-tab quota and concurrency stop extra Google calls", async () => {
  const { run, calls } = setup(Array(6).fill(extraction("partial")));
  for (let i = 0; i < 6; i++) assert.equal((await run()).ok, true);
  assert.equal((await run()).error.code, "SERVER_BUSY");
  assert.equal(calls.length, 6);
  let release;
  const blocked = setup([], { fetcher: () => new Promise(resolve => { release = resolve; }) });
  const pending = blocked.run();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal((await blocked.run()).error.code, "SERVER_BUSY");
  release(Response.json({ status: "completed", output_text: JSON.stringify(extraction("partial")) }));
  assert.equal((await pending).ok, true);
});

test("request timeout aborts once without a retry", async () => {
  let calls = 0;
  const { run } = setup([], { timeoutMs: 5, fetcher: (_, init) => {
    calls++;
    return new Promise((_, reject) => init.signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true }));
  } });
  assert.equal((await run()).error.code, "UPSTREAM_TIMEOUT");
  assert.equal(calls, 1);
});

test("Static frontend has no persistence, external SDK or backend endpoint", async () => {
  const names = ["api-client.js", "gemini-client.js", "ai-core.js", "ai-assets.js", "script.js"];
  const sources = await Promise.all(names.map(name => readFile(new URL("../BeautyAI/" + name, import.meta.url), "utf8")));
  for (const source of sources) {
    assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|document\.cookie|@gradio\/client|workers\.dev/u);
    assert.ok(!source.includes(key));
  }
  const html = await readFile(new URL("../BeautyAI/index.html", import.meta.url), "utf8");
  assert.match(html, /id="geminiApiKey"[^>]+type="password"/u);
  assert.match(html, /connect-src https:\/\/generativelanguage\.googleapis\.com;/u);
  assert.match(sources.at(-1), /geminiApiKey"\)\.value = ""/u);
  assert.match(sources.at(-1), /pagehide/u);
  const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
  assert.match(readme, /sdk: static/u);
  assert.doesNotMatch(readme.split("---")[1], /sdk_version|python_version|app_file: app\.py/u);
});
