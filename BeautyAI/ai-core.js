// Strict output checks shared with the Python contract.
const statuses = new Set(["complete", "partial", "unreadable", "no_ingredients", "multiple_products"]);

export class BackendError extends Error {
  constructor(code, message, retryable = false, httpStatus = 400) {
    super(message);
    Object.assign(this, { code, retryable, httpStatus });
  }
}

function invalid(code = "MODEL_RESPONSE_INVALID") {
  throw new BackendError(code, code === "INVALID_INPUT"
    ? "입력값의 이름·형식·길이를 확인해주세요."
    : "모델 응답이 출력 규격 검사를 통과하지 못했습니다.");
}

// Interpret the strict subset emitted by our Pydantic models, without coercion.
// Unknown schema keywords fail closed rather than silently weakening validation.
export function validate(value, schema, root = schema, code = "MODEL_RESPONSE_INVALID") {
  const supported = new Set(["$ref", "$defs", "title", "default", "type", "properties", "required",
    "additionalProperties", "anyOf", "enum", "const", "items", "minItems", "maxItems", "minLength", "maxLength"]);
  for (const key of Object.keys(schema)) if (!supported.has(key)) invalid(code);
  if (schema.$ref) {
    if (!schema.$ref.startsWith("#/$defs/")) invalid(code);
    const target = root.$defs?.[schema.$ref.slice(8)];
    if (!target) invalid(code);
    return validate(value, target, root, code);
  }
  if (schema.anyOf) {
    for (const option of schema.anyOf) {
      try { validate(value, option, root, code); return value; } catch (error) {
        if (!(error instanceof BackendError)) throw error;
      }
    }
    invalid(code);
  }
  if (schema.enum && !schema.enum.includes(value)) invalid(code);
  if (Object.hasOwn(schema, "const") && value !== schema.const) invalid(code);
  switch (schema.type) {
    case "null": if (value !== null) invalid(code); break;
    case "string": {
      if (typeof value !== "string") invalid(code);
      const length = [...value].length;
      if (length < (schema.minLength ?? 0) || length > (schema.maxLength ?? Infinity)) invalid(code);
      break;
    }
    case "array":
      if (!Array.isArray(value) || value.length < (schema.minItems ?? 0) || value.length > (schema.maxItems ?? Infinity)) invalid(code);
      for (const item of value) validate(item, schema.items, root, code);
      break;
    case "object":
      if (value === null || typeof value !== "object" || Array.isArray(value)) invalid(code);
      for (const key of schema.required || []) if (!Object.hasOwn(value, key)) invalid(code);
      for (const key of Object.keys(value)) {
        if (!Object.hasOwn(schema.properties || {}, key)) {
          if (schema.additionalProperties === false) invalid(code);
        } else validate(value[key], schema.properties[key], root, code);
      }
      break;
    default: invalid(code);
  }
  return value;
}

export function generationSchema(schema) {
  const omitted = new Set(["minLength", "maxLength", "minItems", "maxItems", "title"]);
  function visit(value) {
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !omitted.has(key)).map(([key, item]) =>
      [key, ["properties", "$defs", "definitions"].includes(key)
        ? Object.fromEntries(Object.entries(item).map(([name, child]) => [name, visit(child)])) : visit(item)]));
  }
  return visit(schema);
}

export function normalizeIngredient(name) {
  return name.normalize("NFKC").replace(/\s+/gu, " ").trim().replace(/\.$/u, "").trim().toLowerCase();
}

export function validateExtraction(value, schema) {
  validate(value, schema);
  if (!statuses.has(value.status) || value.ingredients.some(item => !item.trim())) invalid();
  if (value.status === "complete" && (!value.rawText.trim() || !value.ingredients.length || value.uncertainSpans.length)) invalid();
  if (value.status !== "complete" && !value.nextAction.trim()) invalid();
  if (["unreadable", "no_ingredients", "multiple_products"].includes(value.status) && value.ingredients.length) invalid();
  return value;
}

