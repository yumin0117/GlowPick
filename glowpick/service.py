import json
import logging
import os
import threading
import time
import uuid
import warnings
from collections import deque
from datetime import datetime, timezone
from io import BytesIO
from pathlib import Path

from PIL import Image, UnidentifiedImageError
from pydantic import ValidationError

from .gemini import BackendError, GeminiClient
from .models import Extraction, ModelAnalysis, ReviewedClaim, UserInput
from .validation import normalize_ingredient

ROOT = Path(__file__).resolve().parents[1]
PROMPT_VERSION = "draft-2026-10-30-v1"
MAX_BYTES = 10 * 1024 * 1024
MAX_PIXELS = 24_000_000
logger = logging.getLogger("glowpick")


def read_image(path):
    if not path:
        raise BackendError("IMAGE_REQUIRED", "전성분이 보이는 사진을 올려주세요.")
    p = Path(path)
    if p.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        raise BackendError("UNSUPPORTED_IMAGE", "JPG·PNG·WEBP 파일만 지원합니다.")
    try:
        if p.stat().st_size > MAX_BYTES:
            raise BackendError("IMAGE_TOO_LARGE", "사진은 10MiB 이하로 올려주세요.")
        with p.open("rb") as stream:
            raw = stream.read(MAX_BYTES + 1)
        if len(raw) > MAX_BYTES:
            raise BackendError("IMAGE_TOO_LARGE", "사진은 10MiB 이하로 올려주세요.")
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(raw)) as image:
                if image.format not in {"JPEG", "PNG", "WEBP"}:
                    raise BackendError("UNSUPPORTED_IMAGE", "실제 파일 내용이 JPG·PNG·WEBP 이미지가 아닙니다.")
                if image.width * image.height > MAX_PIXELS:
                    raise BackendError("IMAGE_TOO_LARGE", "이미지 해상도를 2,400만 픽셀 이하로 줄여주세요.")
                if getattr(image, "n_frames", 1) != 1:
                    raise BackendError("UNSUPPORTED_IMAGE", "정지 이미지 한 장을 올려주세요.")
                mime = Image.MIME[image.format]
                image.verify()
    except BackendError:
        raise
    except (OSError, UnidentifiedImageError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning):
        raise BackendError("INVALID_IMAGE", "사진 파일을 읽을 수 없습니다. 다시 올려주세요.") from None
    return raw, mime


class RequestLimiter:
    def __init__(self, limit):
        self.limit, self.events, self.lock = limit, deque(), threading.Lock()

    def check(self):
        with self.lock:
            now = time.monotonic()
            while self.events and now - self.events[0] >= 60:
                self.events.popleft()
            if len(self.events) >= self.limit:
                raise BackendError("SERVER_BUSY", "서버의 분당 처리 한도입니다. 잠시 후 다시 요청해주세요.", True)
            self.events.append(now)


def load_claims():
    # Model responses and user request fields can never add trusted evidence.
    rows = json.loads((ROOT / "data" / "reviewed_claims.json").read_text(encoding="utf-8"))
    return [ReviewedClaim.model_validate(row) for row in rows]


class GlowPickService:
    def __init__(self, mode=None, client_factory=None, claims=None, private_run_dir=None):
        self.mode = mode or os.getenv("GLOWPICK_MODE", "live")
        if self.mode not in {"live", "mock"}:
            raise ValueError("GLOWPICK_MODE는 live 또는 mock이어야 합니다.")
        self.model = os.getenv("GEMINI_MODEL", "gemini-3.5-flash-lite")
        self.client_factory = client_factory or self._new_client
        self.claims = claims if claims is not None else load_claims()
        self.private_run_dir = private_run_dir or os.getenv("GLOWPICK_PRIVATE_RUN_DIR")
        if self.private_run_dir:
            d = Path(self.private_run_dir).resolve()
            if not Path(self.private_run_dir).is_absolute() or d == ROOT or ROOT in d.parents:
                raise ValueError("원응답 보관은 프로젝트 밖의 비공개 절대경로만 허용합니다.")
        self.limiter = RequestLimiter(int(os.getenv("GLOWPICK_MAX_REQUESTS_PER_MINUTE", "6")))

    def _new_client(self):
        return GeminiClient(os.getenv("GEMINI_API_KEY", ""), self.model, timeout=float(os.getenv("GEMINI_TIMEOUT_SECONDS", "45")))

    def health(self):
        return {
            "status": "ok", "mode": self.mode, "schemaVersion": "1.0",
            "promptVersion": PROMPT_VERSION, "promptStatus": "draft",
            "configured": bool(os.getenv("GEMINI_API_KEY")) if self.mode == "live" else True,
            "readyForLive": self.mode == "live" and bool(os.getenv("GEMINI_API_KEY")),
        }

    def analyze_cosmetic(self, image, request):
        return self._handle("cosmetic", image, request)

    def consult_modeling_pack(self, image, request):
        return self._handle("modeling_pack", image, request)

    def _handle(self, task, image, request):
        request_id = uuid.uuid4().hex
        client = None
        result = {
            "ok": False, "requestId": request_id, "extraction": None,
            "analysis": None, "mixing": None, "error": None,
            "meta": {"schemaVersion": "1.0", "mode": self.mode,
                     "isMock": self.mode == "mock", "model": self.model if self.mode == "live" else None,
                     "promptVersion": PROMPT_VERSION, "promptStatus": "draft",
                     "timestamp": datetime.now(timezone.utc).isoformat()},
        }
        try:
            if not isinstance(request, dict):
                raise BackendError("INVALID_INPUT", "request에는 JSON 객체를 전달해주세요.")
            context = UserInput.model_validate(request)
            image_bytes = read_image(image)
            if self.mode == "mock":
                # Synthetic fixture only. Never look up labels/images/products to pretend OCR.
                fixture = json.loads((ROOT / "fixtures" / "mock_extraction.json").read_text(encoding="utf-8"))
                extraction = Extraction.model_validate(fixture)
                result["meta"]["notice"] = "모의 연동 시험입니다. 업로드한 사진을 AI로 판독하지 않았습니다."
            else:
                self.limiter.check()
                client = self.client_factory()
                system_prompt = (ROOT / "prompts" / "extract.txt").read_text(encoding="utf-8")
                raw = client.generate(system_prompt, "첨부 이미지의 전성분을 판독하세요. 제품 정답표·사용자 피부정보는 판독에 제공하지 않습니다.",
                                      Extraction.model_json_schema(), image=image_bytes)
                extraction = Extraction.model_validate(raw)
            result["extraction"] = extraction.model_dump()
            # No incomplete extraction may silently become a completed recommendation.
            if extraction.status != "complete":
                result["analysis"] = {"status": "not_run", "summary": "판독을 완료한 뒤 설명을 진행합니다.", "ingredientNotes": [], "warnings": []}
            else:
                result["analysis"] = self._explain(extraction, context, client)
            result["mixing"] = {
                "status": "unknown",
                "reason": "특정 모델링팩·앰플·제품 버전·사용 조건의 검토 완료 근거가 아직 없습니다.",
                "evidenceIds": [],
            } if task == "modeling_pack" else {"status": "not_applicable", "reason": "", "evidenceIds": []}
            result["ok"] = True
        except ValidationError:
            if result["extraction"] is None and client is None:
                code, message = "INVALID_INPUT", "입력값의 이름·형식·길이를 확인해주세요."
            else:
                code, message = "MODEL_RESPONSE_INVALID", "모델 응답이 출력 규격 또는 근거 검사를 통과하지 못했습니다."
            result["error"] = {"code": code, "message": message, "retryable": False}
        except BackendError as error:
            result["error"] = {"code": error.code, "message": error.message, "retryable": error.retryable}
        except Exception:
            logger.error("request=%s code=INTERNAL_ERROR", request_id)
            result["error"] = {"code": "INTERNAL_ERROR", "message": "서버 처리에 실패했습니다. 담당자에게 요청 번호를 알려주세요.", "retryable": False}
        # Key/input text/image are never put into application logs.
        logger.info("request=%s task=%s ok=%s code=%s", request_id, task, result["ok"],
                    result["error"]["code"] if result["error"] else "NONE")
        if client is not None and self.private_run_dir:
            try:
                directory = Path(self.private_run_dir)
                directory.mkdir(parents=True, exist_ok=True)
                record = {"requestId": request_id, "meta": result["meta"], "responses": client.records}
                (directory / (request_id + ".json")).write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
            except OSError:
                logger.error("request=%s code=AUDIT_WRITE_FAILED", request_id)
        return result

    def _explain(self, extraction, context, client):
        names = {normalize_ingredient(n) for n in extraction.ingredients}
        selected = [c for c in self.claims if normalize_ingredient(c.ingredient) in names]
        if not selected or self.mode == "mock":
            return {
                "status": "needs_evidence", "summary": "전성분 판독은 완료했습니다. 이 사진의 성분과 일치하는 검토 완료 기능 근거가 아직 없습니다.",
                "ingredientNotes": [],
                "warnings": ["미확인 성분 기능과 특정 제품 추천을 임의로 생성하지 않습니다."],
            }
        prompt = (ROOT / "prompts" / "explain.txt").read_text(encoding="utf-8")
        # All user strings are data in a JSON payload, never system instructions.
        payload = {"ingredients": extraction.ingredients, "skinType": context.skinType,
                   "concerns": context.concerns, "extraConcern": context.extraConcern,
                   "notes": context.notes, "approvedClaims": [c.model_dump() for c in selected]}
        raw = client.generate(prompt, json.dumps(payload, ensure_ascii=False), ModelAnalysis.model_json_schema())
        analysis = ModelAnalysis.model_validate(raw)
        evidence = {c.evidenceId: c for c in selected}
        for note in analysis.ingredientNotes:
            if normalize_ingredient(note.ingredient) not in names:
                raise BackendError("EVIDENCE_VALIDATION_FAILED", "설명에 판독되지 않은 성분이 포함되어 있습니다.")
            for evidence_id in note.evidenceIds:
                e = evidence.get(evidence_id)
                if e is None or normalize_ingredient(e.ingredient) != normalize_ingredient(note.ingredient):
                    raise BackendError("EVIDENCE_VALIDATION_FAILED", "성분 설명의 근거ID가 서버 자료와 일치하지 않습니다.")
        return {"status": "reference_only", **analysis.model_dump(),
                "sources": [c.model_dump() for c in selected],
                "notice": "일반 성분 기능에 대한 참고 설명입니다. 전체 성분·완제품 효능·개인 적합성·혼합 허용을 검증한 결과가 아닙니다. 근거ID 연결 검사와 별도로 문헌 해석·한영 표기의 독립 사람 교차검토가 필요합니다."}
