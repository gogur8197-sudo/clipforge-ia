import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import OpenAI from "openai";
import ffmpegPath from "ffmpeg-static";
import ffmpeg from "fluent-ffmpeg";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

dotenv.config();
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = Number(process.env.PORT || 3000);
const TMP = path.join(os.tmpdir(), "clipforge-ai");
fs.mkdirSync(TMP, { recursive: true });
ffmpeg.setFfmpegPath(ffmpegPath);
app.use(cors());
app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({
  dest: TMP,
  limits: { fileSize: Number(process.env.MAX_UPLOAD_MB || 30) * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith("audio/")) cb(null, true);
    else cb(new Error("Envie um arquivo de áudio válido."));
  }
});

const presets = {
  "Automático": "cinematic dynamic short video",
  "Velocity": "fast motion sports action",
  "Phonk": "night street neon cars energetic",
  "Cinematic": "cinematic dramatic landscape",
  "Aura": "dreamy aesthetic atmospheric",
  "Football": "football soccer stadium action",
  "Anime": "anime inspired dramatic atmosphere",
  "Sad": "melancholic rain solitude cinematic",
  "Luxury": "luxury architecture cars premium lifestyle",
  "Dark": "dark moody shadows dramatic",
  "Aggressive": "intense action high energy"
};

function cleanText(v, max = 500) {
  return String(v || "").trim().slice(0, max);
}
function safeName(v) {
  return v.replace(/[^a-z0-9_-]/gi, "_").slice(0, 60) || "clipforge";
}
function durationSeconds(v) {
  const n = Number(String(v || "30").match(/\d+/)?.[0] || 30);
  return Math.min(60, Math.max(10, n));
}
function aspectFor(format) {
  if (String(format).startsWith("16:9")) return "landscape";
  if (String(format).startsWith("1:1")) return "square";
  return "portrait";
}

async function makeSceneQueries({ theme, style, duration }) {
  if (process.env.OPENAI_API_KEY) {
    try {
      const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
      const response = await client.chat.completions.create({
        model: process.env.OPENAI_MODEL || "gpt-4o-mini",
        temperature: 0.65,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: "Você é um editor de vídeos curtos. Gere buscas curtas para vídeos stock no Pexels, sem nomes de celebridades ou conteúdo protegido específico. Responda JSON com scenes: array de 3 a 6 objetos {query, purpose}. Em português ou inglês simples, prefira buscas em inglês para o catálogo de stock. Não afirme que encontrou cenas." },
          { role: "user", content: `Tema: ${theme}\nEstilo: ${style}\nDuração: ${duration}s\nEstética: ${presets[style] || presets["Automático"]}` }
        ]
      });
      const parsed = JSON.parse(response.choices[0].message.content || "{}");
      if (Array.isArray(parsed.scenes) && parsed.scenes.length) {
        return parsed.scenes.slice(0, Number(process.env.MAX_SCENES || 6)).map((s) => ({
          query: cleanText(s.query, 100) || theme,
          purpose: cleanText(s.purpose, 140)
        }));
      }
    } catch (err) {
      console.warn("OpenAI planning unavailable; using fallback:", err.message);
    }
  }
  const base = cleanText(theme, 120);
  const vibe = presets[style] || presets["Automático"];
  return [
    { query: `${base} ${vibe}`, purpose: "Abertura visual" },
    { query: `${base} cinematic action`, purpose: "Momento de energia" },
    { query: `${base} close up detail`, purpose: "Detalhe e textura" },
    { query: `${base} dramatic slow motion`, purpose: "Pico visual" },
    { query: `${base} atmosphere`, purpose: "Encerramento" }
  ].slice(0, Math.min(5, Number(process.env.MAX_SCENES || 6)));
}

async function searchPexels(query, orientation) {
  if (!process.env.PEXELS_API_KEY) {
    const e = new Error("Falta configurar PEXELS_API_KEY no arquivo .env.");
    e.status = 503; throw e;
  }
  const url = new URL("https://api.pexels.com/videos/search");
  url.searchParams.set("query", query);
  url.searchParams.set("per_page", "8");
  url.searchParams.set("orientation", orientation);
  const res = await fetch(url, { headers: { Authorization: process.env.PEXELS_API_KEY } });
  if (!res.ok) throw new Error(`Pexels retornou erro ${res.status} na busca.`);
  const data = await res.json();
  return (data.videos || []).map(v => {
    const file = [...(v.video_files || [])].filter(f => f.link && f.file_type === "video/mp4")
      .sort((a,b) => (b.width*b.height)-(a.width*a.height))[0];
    return file ? { id: v.id, url: file.link, width: file.width, height: file.height, duration: v.duration, page: v.url, creator: v.user?.name || "Pexels creator" } : null;
  }).filter(Boolean);
}
async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Não foi possível baixar um clipe stock.");
  const buffer = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(dest, buffer);
}
function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const { spawn } = awaitImportChildProcess();
    const child = spawn(ffmpegPath, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    child.stderr.on("data", d => { err += d.toString(); if (err.length > 8000) err = err.slice(-8000); });
    child.on("error", reject);
    child.on("close", code => code === 0 ? resolve() : reject(new Error(`FFmpeg falhou: ${err.slice(-1500)}`)));
  });
}
function awaitImportChildProcess() {
  // Node's built-in spawn is synchronously imported at module initialization below.
  return { spawn: spawnProcess };
}
import { spawn as spawnProcess } from "node:child_process";

app.get("/api/health", (_req, res) => res.json({
  ok: true,
  pexelsConfigured: Boolean(process.env.PEXELS_API_KEY),
  aiPlanningConfigured: Boolean(process.env.OPENAI_API_KEY),
  renderer: Boolean(ffmpegPath)
}));

app.post("/api/generate", upload.single("musicFile"), async (req, res) => {
  const work = path.join(TMP, crypto.randomUUID());
  fs.mkdirSync(work, { recursive: true });
  const cleanupInput = req.file?.path;
  try {
    const theme = cleanText(req.body.theme, 350);
    if (theme.length < 3) return res.status(400).json({ error: "Digite um tema com pelo menos 3 caracteres." });
    const style = cleanText(req.body.style, 40) || "Automático";
    const duration = durationSeconds(req.body.duration);
    const format = cleanText(req.body.format, 30) || "9:16 — TikTok/Reels";
    const quality = cleanText(req.body.quality, 20) || "1080p";
    const orientation = aspectFor(format);
    const scenePlan = await makeSceneQueries({ theme, style, duration });
    const found = [];
    for (const scene of scenePlan) {
      try {
        const videos = await searchPexels(scene.query, orientation);
        if (videos[0]) found.push({ ...scene, video: videos[0] });
      } catch (e) {
        if (e.status === 503) throw e;
        console.warn("Scene search skipped:", e.message);
      }
    }
    if (!found.length) throw new Error("Nenhum clipe encontrado. Tente um tema mais amplo ou confira a chave do Pexels.");
    const count = Math.min(found.length, Number(process.env.MAX_SCENES || 6));
    const clipSeconds = Math.max(2, Math.ceil(duration / count));
    const segments = [];
    for (let i=0; i<count; i++) {
      const item = found[i];
      const file = path.join(work, `scene_${i}.mp4`);
      await download(item.video.url, file);
      const segment = path.join(work, `part_${i}.mp4`);
      const size = quality === "4K" ? "2160" : quality === "720p" ? "720" : "1080";
      const vf = orientation === "landscape"
        ? `scale=-2:${size}:force_original_aspect_ratio=increase,crop=1920:${size},setsar=1,fps=30,format=yuv420p`
        : orientation === "square"
          ? `scale=${size}:${size}:force_original_aspect_ratio=increase,crop=${size}:${size},setsar=1,fps=30,format=yuv420p`
          : `scale=${Math.round(Number(size)*9/16)}:${size}:force_original_aspect_ratio=increase,crop=${Math.round(Number(size)*9/16)}:${size},setsar=1,fps=30,format=yuv420p`;
      await runFfmpeg(["-y","-stream_loop","-1","-i",file,"-t",String(clipSeconds),"-vf",vf,"-an","-c:v","libx264","-preset","veryfast","-crf","23","-movflags","+faststart",segment]);
      segments.push(segment);
    }
    const list = path.join(work, "concat.txt");
    fs.writeFileSync(list, segments.map(f => `file '${f.replace(/'/g, "'\\''")}'`).join("\n"));
    const outputName = `${safeName(theme)}-${Date.now()}.mp4`;
    const output = path.join(work, outputName);
    const concatArgs = ["-y","-f","concat","-safe","0","-i",list];
    if (cleanupInput) concatArgs.push("-i", cleanupInput);
    concatArgs.push("-t",String(duration));
    if (cleanupInput) concatArgs.push("-map","0:v:0","-map","1:a:0?","-c:a","aac","-b:a","192k","-shortest");
    concatArgs.push("-c:v","libx264","-preset","veryfast","-crf","22","-movflags","+faststart",output);
    await runFfmpeg(concatArgs);
    const id = crypto.randomUUID();
    const finalPath = path.join(TMP, `${id}.mp4`);
    fs.copyFileSync(output, finalPath);
    // Temporary render is retained for download; user can delete it from the session.
    res.json({
      ok: true, id, downloadUrl: `/api/download/${id}`, duration, quality, format,
      scenes: found.slice(0,count).map(s => ({ query:s.query, purpose:s.purpose, source:s.video.page, creator:s.video.creator })),
      note: "Use somente os clipes de acordo com a licença vigente e confira os termos do provedor antes de publicar."
    });
  } catch (e) {
    console.error(e);
    res.status(e.status || 500).json({ error: e.message || "Não foi possível gerar o vídeo." });
  } finally {
    if (cleanupInput) try { fs.unlinkSync(cleanupInput); } catch {}
    // Keep work for a short local debugging session; remove input clips and intermediates.
    try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
  }
});

app.get("/api/download/:id", (req, res) => {
  if (!/^[a-f0-9-]{36}$/i.test(req.params.id)) return res.status(400).send("ID inválido.");
  const file = path.join(TMP, `${req.params.id}.mp4`);
  if (!fs.existsSync(file)) return res.status(404).send("Vídeo não encontrado ou já removido.");
  res.download(file, "clipforge-edit.mp4", () => { try { fs.unlinkSync(file); } catch {} });
});
app.use((err, _req, res, _next) => res.status(400).json({ error: err.message || "Pedido inválido." }));

app.listen(PORT, () => console.log(`CLIPFORGE AI rodando em http://localhost:${PORT}`));
