# IAN TECH Schemes

Kenyan CBC desk for Junior School: schemes of work, textbook-style notes, lesson plans and exam papers. Teachers pick a strand and every sub-strand comes with it. Notes follow strand, sub-strand, meaning, importance, steps, worked examples and an exercise. Grade 9 Mathematics exams can use the 2026 paper layout (Section A and five Section B tasks).

## Local AI (no API keys)

The **Local AI** page (`/local-generate`) runs models entirely in the browser. No API key is required and nothing leaves the device after the model is cached.

**Engines:**
- **Chrome built-in** — Gemini Nano (zero download if already present in Chrome 148+)
- **WebLLM** — powerful WebGPU models (Llama 3.2, Qwen2.5, Phi-3.5, Gemma 2)
- **Transformers.js** — compatible ONNX models that work on more devices

## Deploy on Vercel from GitHub

1. Open [Vercel](https://vercel.com) and choose **Add New → Project**.
2. Import **ian-tech1/SCHEMES**.
3. Leave the framework as **Other**. The build already writes Vercel’s output.
4. Build command: `npm run build`
5. Install command: `npm install`
6. Add the environment variables from `.env.example`, then deploy.

`DATABASE_URL` must be a Postgres database (Neon works). Without it the site still starts, but saved schemes stay on the temporary database and do not last between deploys.

## Local check

```bash
npm install
npm run dev
```

The app listens on port 8080.
