import { genkit } from 'genkit';
import { googleAI } from '@genkit-ai/google-genai';

async function test() {
    const ai = genkit({
        plugins: [googleAI()],
    });

    const models = ['googleai/gemini-embedding-exp-03-26', 'googleai/gemini-1.5-flash', 'googleai/gemini-1.5-flash-latest', 'googleai/gemini-1.5-flash-8b', 'googleai/gemini-1.5-pro', 'googleai/gemini-1.5-pro-latest'];
    for (const m of models) {
        console.log("Trying", m);
        try {
            const result = await ai.generate({
                model: m as any,
                prompt: "Hello",
            });
            console.log("Success:", m);
        } catch (e: any) {
            console.error("Fail:", m, e.message);
        }
    }
}

test();
