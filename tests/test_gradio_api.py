"""Local HTTP test; only synthetic images and explicitly mock mode."""
import os
import socket
import tempfile
import unittest
from pathlib import Path

os.environ.setdefault("GRADIO_ANALYTICS_ENABLED", "False")

from PIL import Image
from gradio_client import Client, handle_file
import httpx

from app import create_app, launch_options
from glowpick.service import GlowPickService


class GradioApiTest(unittest.TestCase):
    def test_http_upload_and_named_endpoints(self):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1", 0))
            port = sock.getsockname()[1]
        app = create_app(GlowPickService(mode="mock"))
        client = None
        try:
            options = launch_options()
            options.update(server_name="127.0.0.1", server_port=port, prevent_thread_lock=True, quiet=True)
            app.launch(**options)
            client = Client("http://127.0.0.1:" + str(port), verbose=False)
            base = "http://127.0.0.1:" + str(port)
            front = httpx.get(base + "/")
            self.assertEqual(front.status_code, 200)
            self.assertIn('id="cosmeticAnalyze"', front.text)
            self.assertNotIn("글리세린 (예시)", front.text)
            for asset in ["index.html", "style.css", "script.js", "api-client.js"]:
                self.assertEqual(httpx.get(base + "/" + asset).status_code, 200)
            for private_path in [".env", "API_KEY.txt", "README.md", "prompts/extract.txt", "docs/API.md"]:
                self.assertIn(httpx.get(base + "/" + private_path).status_code, {403, 404})
            health = client.predict(api_name="/health")
            self.assertEqual(health["mode"], "mock")
            self.assertFalse(health["readyForLive"])
            # Simulate the Host header the Hugging Face reverse proxy supplies.
            preflight = httpx.options("http://127.0.0.1:" + str(port) + "/gradio_api/upload",
                headers={"Host": "test-backend.hf.space", "Origin": "https://test-frontend.hf.space",
                         "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type"})
            self.assertEqual(preflight.status_code, 200)
            self.assertEqual(preflight.headers.get("access-control-allow-origin"), "https://test-frontend.hf.space")
            # No key contents are read or printed by this check.
            for secret_name in [".env", "API_KEY.txt"]:
                secret_path = str(Path(__file__).resolve().parents[1] / secret_name).replace("\\", "/")
                response = httpx.get("http://127.0.0.1:" + str(port) + "/gradio_api/file=" + secret_path)
                self.assertIn(response.status_code, {403, 404})
            with tempfile.TemporaryDirectory() as directory:
                image = Path(directory) / "synthetic.png"
                Image.new("RGB", (64, 64), "white").save(image)
                out = client.predict(image=handle_file(str(image)), request={"concerns": []}, api_name="/analyze_cosmetic")
                self.assertTrue(out["ok"])
                self.assertTrue(out["meta"]["isMock"])
                pack = client.predict(image=handle_file(str(image)), request={"mixStatus": "allowed"}, api_name="/consult_modeling_pack")
                self.assertTrue(pack["ok"])
                self.assertEqual(pack["mixing"]["status"], "unknown")
                bad = client.predict(image=handle_file(str(image)), request={"concerns": "not a list"}, api_name="/analyze_cosmetic")
                self.assertEqual(bad["error"]["code"], "INVALID_INPUT")
                missing = client.predict(image=None, request={}, api_name="/analyze_cosmetic")
                self.assertEqual(missing["error"]["code"], "IMAGE_REQUIRED")
        finally:
            if client is not None:
                client.close()
            app.close()


if __name__ == "__main__":
    unittest.main()
