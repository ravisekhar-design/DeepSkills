import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

async function test() {
    const ai = genkit({
        plugins: [googleAI({ apiKey: process.env.GOOGLE_GENAI_API_KEY })],
    });

    const models = ['googleai/gemini-1.5-flash', 'googleai/gemini-1.5-flash-latest', 'googleai/gemini-embedding-exp-03-26'];
    for (const m of models) {
        console.log("Trying", m);
        try {
            const result = await ai.generate({
                model: m,
                prompt: "Say Hello",
            });
            console.log("Success:", m, "->", result.text);
        } catch (e) {
            console.error("Fail:", m, e.message);
        }
    }
}

test();
