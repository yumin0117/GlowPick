// Hugging Face Static: browser -> Google directly. No Gradio or external backend.
import { createStaticClient } from "./gemini-client.js";
export { MAX_IMAGE_BYTES } from "./gemini-client.js";
const client = createStaticClient();
export const health = () => client.health();
export const analyze = (...args) => client.analyze(...args);
