"""Stateless Gemini Interactions REST client. No automatic paid API calls."""
import base64
import json
import socket
import urllib.error
import urllib.request


class BackendError(Exception):
    def __init__(self, code, message, retryable=False):
        super().__init__(message)
        self.code, self.message, self.retryable = code, message, retryable


def generation_schema(schema):
    """Keep structural constraints small; Pydantic enforces all length limits locally.

    Nested bounded arrays/strings can exceed Gemini's serving constraint budget.
    Preserve property names, required fields, enums, references and object shape.
    """
    limits = {"minLength", "maxLength", "minItems", "maxItems", "title"}

    def visit(value):
        if isinstance(value, list):
            return [visit(item) for item in value]
        if not isinstance(value, dict):
            return value
        result = {}
        for key, item in value.items():
            if key in limits:
                continue
            if key in {"properties", "$defs", "definitions"}:
                result[key] = {name: visit(child) for name, child in item.items()}
            else:
                result[key] = visit(item)
        return result

    return visit(schema)


class GeminiClient:
    URL = "https://generativelanguage.googleapis.com/v1beta/interactions"

    def __init__(self, api_key, model, timeout=45, opener=None):
        self.api_key, self.model, self.timeout = api_key, model, timeout
        self.opener = opener or urllib.request.urlopen
        self.records = []

    def generate(self, system_prompt, user_text, schema, image=None):
        if not self.api_key:
            raise BackendError("KEY_NOT_CONFIGURED", "Space의 Secrets에 GEMINI_API_KEY를 설정해주세요.")
        parts = [{"type": "text", "text": user_text}]
        if image:
            raw, mime = image
            parts.append({"type": "image", "mime_type": mime, "data": base64.b64encode(raw).decode("ascii")})
        payload = {
            "model": self.model, "input": parts, "system_instruction": system_prompt,
            "response_format": {"type": "text", "mime_type": "application/json", "schema": generation_schema(schema)},
            "store": False,
            "generation_config": {"max_output_tokens": 6000},
        }
        request = urllib.request.Request(
            self.URL, data=json.dumps(payload).encode("utf-8"), method="POST",
            headers={"Content-Type": "application/json", "x-goog-api-key": self.api_key},
        )
        try:
            with self.opener(request, timeout=self.timeout) as response:
                raw_response = response.read(2_000_001)
            if len(raw_response) > 2_000_000:
                raise BackendError("MODEL_RESPONSE_INVALID", "모델 응답이 허용 크기를 넘었습니다.")
            body = json.loads(raw_response)
        except urllib.error.HTTPError as error:
            mapping = {
                400: ("GEMINI_REQUEST_REJECTED", "Gemini 요청 형식·모델 설정을 확인해주세요.", False),
                401: ("GEMINI_AUTH_ERROR", "서버의 API 키 설정을 확인해주세요.", False),
                402: ("BILLING_CONFIGURATION_ERROR", "결제 미연결 무료 프로젝트의 키인지 확인해주세요.", False),
                403: ("GEMINI_AUTH_ERROR", "서버 키 권한 또는 Gemini 사용 가능 여부를 확인해주세요.", False),
                404: ("MODEL_NOT_FOUND", "서버에 설정한 Gemini 모델 이름을 확인해주세요.", False),
                429: ("RATE_LIMITED", "Gemini 한도를 초과했습니다. 잠시 후 다시 시도해주세요.", True),
            }
            code, message, retryable = mapping.get(error.code, ("GEMINI_UNAVAILABLE", "Gemini 요청에 실패했습니다. 잠시 후 다시 시도해주세요.", error.code >= 500))
            # Do not expose upstream body, request headers or key in errors/logs.
            error.close()
            raise BackendError(code, message, retryable) from None
        except (TimeoutError, socket.timeout):
            raise BackendError("UPSTREAM_TIMEOUT", "Gemini 응답 시간이 초과되었습니다.", True) from None
        except (urllib.error.URLError, OSError):
            raise BackendError("NETWORK_ERROR", "Gemini에 연결할 수 없습니다.", True) from None
        except (ValueError, TypeError):
            raise BackendError("MODEL_RESPONSE_INVALID", "Gemini 응답을 해석할 수 없습니다.") from None
        if not isinstance(body, dict):
            raise BackendError("MODEL_RESPONSE_INVALID", "Gemini 응답 형식이 올바르지 않습니다.")
        self.records.append(body)
        if body.get("status") != "completed":
            raise BackendError("MODEL_INCOMPLETE", "모델 응답이 완료되지 않았습니다. 재시도해주세요.", True)
        text = body.get("output_text")
        if not isinstance(text, str):
            text = "".join(
                content.get("text", "")
                for step in body.get("steps", []) if isinstance(step, dict) and step.get("type") == "model_output"
                for content in step.get("content", []) if isinstance(content, dict) and content.get("type") == "text"
            )
        try:
            parsed = json.loads(text)
            if not isinstance(parsed, dict):
                raise ValueError("not an object")
            return parsed
        except (ValueError, TypeError):
            raise BackendError("MODEL_RESPONSE_INVALID", "모델이 약속한 JSON 객체를 반환하지 않았습니다.") from None
