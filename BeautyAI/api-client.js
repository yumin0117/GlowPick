// Hugging Face Static: browser -> Google directly. No Gradio or external backend.
import { createStaticClient } from "./gemini-client.js";
import { createRecommendationClient } from "./recommendation-client.js";
export { MAX_IMAGE_BYTES } from "./gemini-client.js";
const client = createStaticClient();
const recommendations = createRecommendationClient();
export const health = () => client.health();
export const analyze = (...args) => client.analyze(...args);
export const recommendProducts = (...args) => recommendations.recommend(...args);
