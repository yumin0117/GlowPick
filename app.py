import json
import os

os.environ.setdefault("GRADIO_ANALYTICS_ENABLED", "False")

import gradio as gr
from starlette.responses import FileResponse
from starlette.routing import Route

from glowpick.config import load_local_env
from glowpick.service import GlowPickService, MAX_BYTES, ROOT

load_local_env()


def frontend_routes():
    # Only these public assets are served. Never mount the project directory.
    public_files = {"/": "index.html", "/index.html": "index.html",
                    "/style.css": "style.css", "/script.js": "script.js",
                    "/api-client.js": "api-client.js"}

    async def serve_public_file(request):
        return FileResponse(ROOT / "BeautyAI" / public_files[request.url.path],
                            headers={"Cache-Control": "no-cache"})

    return [Route(path, serve_public_file, methods=["GET", "HEAD"]) for path in public_files]


def parse_test_request(text):
    try:
        value = json.loads(text)
        if not isinstance(value, dict):
            raise ValueError()
        return value
    except (ValueError, TypeError):
        raise gr.Error("request에는 올바른 JSON 객체를 입력해주세요.") from None


def launch_options():
    blocked = [str(ROOT / ".env"), str(ROOT / "API_KEY.txt"), str(ROOT / ".venv")]
    if os.getenv("GLOWPICK_PRIVATE_RUN_DIR"):
        blocked.append(os.environ["GLOWPICK_PRIVATE_RUN_DIR"])
    return {
        "server_name": "0.0.0.0", "server_port": int(os.getenv("PORT", "7860")),
        "show_error": False, "max_file_size": MAX_BYTES, "blocked_paths": blocked,
        "app_kwargs": {"routes": frontend_routes()},
    }


def create_app(service=None):
    service = service or GlowPickService()
    with gr.Blocks(title="GlowPick 서버 연동 확인") as demo:
        gr.Markdown(
            "# GlowPick 서버 연동 확인\n"
            "프론트엔드 연결 전 API를 시험하는 개발용 화면입니다. "
            "live는 Gemini 호출, mock은 가상 응답입니다. 응답의 meta.isMock을 확인하세요.\n"
            "사진·자유 입력에 개인정보를 넣지 마세요."
        )
        with gr.Tab("화장품 분석"):
            image = gr.File(label="image", file_types=[".jpg", ".jpeg", ".png", ".webp"], type="filepath")
            request = gr.JSON(label="request", value={"productName": None, "skinType": "잘 모르겠음", "concerns": [], "extraConcern": ""})
            editor = gr.Textbox(label="테스트 request 편집 (수정 후 칸 밖을 클릭)", lines=4,
                                value='{"productName": null, "skinType": "잘 모르겠음", "concerns": [], "extraConcern": ""}')
            editor.change(parse_test_request, inputs=editor, outputs=request, api_name=False)
            button = gr.Button("화장품 분석 요청")
            result = gr.JSON(label="response")
            button.click(service.analyze_cosmetic, inputs=[image, request], outputs=result,
                         api_name="analyze_cosmetic", concurrency_id="gemini", concurrency_limit=1)
        with gr.Tab("모델링팩 컨설팅"):
            pack_image = gr.File(label="image", file_types=[".jpg", ".jpeg", ".png", ".webp"], type="filepath")
            pack_request = gr.JSON(label="request", value={"packName": None, "skinType": "잘 모르겠음", "concerns": [], "mixStatus": "unknown", "notes": ""})
            pack_editor = gr.Textbox(label="테스트 request 편집 (수정 후 칸 밖을 클릭)", lines=4,
                                     value='{"packName": null, "skinType": "잘 모르겠음", "concerns": [], "mixStatus": "unknown", "notes": ""}')
            pack_editor.change(parse_test_request, inputs=pack_editor, outputs=pack_request, api_name=False)
            pack_button = gr.Button("모델링팩 요청")
            pack_result = gr.JSON(label="response")
            pack_button.click(service.consult_modeling_pack, inputs=[pack_image, pack_request], outputs=pack_result,
                              api_name="consult_modeling_pack", concurrency_id="gemini", concurrency_limit=1)
        with gr.Tab("서버 상태"):
            health_button = gr.Button("서버 상태 확인")
            health_output = gr.JSON()
            health_button.click(service.health, inputs=[], outputs=health_output, api_name="health", queue=False)
    return demo.queue(max_size=8, default_concurrency_limit=1)


if __name__ == "__main__":
    create_app().launch(**launch_options())
