// Google Gemini direkte fra nettleseren. Nøkkelen lagres kun lokalt hos deg og sendes bare til Google.
import { settingsStore } from "./store.js";

const API = "https://generativelanguage.googleapis.com/v1beta";

// Foretrukket rekkefølge. Ved kvotebrudd, overbelastning eller ukjent modell prøves neste.
export const PREFERRED_MODELS = [
  "gemini-3.8-flash",
  "gemini-3.6-flash",
  "gemini-flash-latest",
  "gemini-3.5-flash",
  "gemini-3.5-flash-lite",
  "gemini-3-flash-preview",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
];

export class ApiError extends Error {
  constructor(message, status = 0, retryDelay = null, raw = "") {
    super(message);
    this.status = status;
    this.retryDelay = retryDelay;
    this.raw = raw;
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

function friendly(status, raw = "") {
  if (status === 400 && /api key/i.test(raw)) return "API-nøkkelen er ugyldig. Sjekk den under Innstillinger.";
  if (status === 403) return "API-nøkkelen har ikke tilgang (403). Sjekk at den er laget i Google AI Studio.";
  if (status === 429) return "Gratiskvoten hos Google er brukt opp akkurat nå. Vent et minutt og prøv igjen.";
  if (status >= 500) return "Googles AI-servere er overbelastet akkurat nå. Prøv igjen om litt.";
  return `Feil fra AI-tjenesten (${status}): ${raw}`;
}

async function toApiError(res) {
  let body = {};
  try { body = await res.json(); } catch { /* tom */ }
  const err = body.error || {};
  const retry = (err.details || []).find(d => String(d["@type"]).includes("RetryInfo"))?.retryDelay;
  return new ApiError(friendly(res.status, err.message), res.status, retry ? parseFloat(retry) : null, err.message || "");
}

export async function listModels(apiKey) {
  const res = await fetch(`${API}/models?pageSize=1000`, { headers: { "x-goog-api-key": apiKey } });
  if (!res.ok) throw await toApiError(res);
  const data = await res.json();
  return (data.models || [])
    .filter(m => (m.supportedGenerationMethods || []).includes("generateContent"))
    .map(m => m.name.replace(/^models\//, ""))
    .filter(n => /^gemini/.test(n) && !/(tts|image|live|embed|audio|robotics|transcribe|translate|computer|omni|banana)/.test(n));
}

function candidateModels() {
  const { model, models } = settingsStore.get();
  const available = models?.length ? PREFERRED_MODELS.filter(m => models.includes(m)) : PREFERRED_MODELS;
  return [...new Set([model, ...available].filter(Boolean))].slice(0, 5);
}

function apiKey() {
  const { apiKey } = settingsStore.get();
  if (!apiKey) throw new ApiError("Legg inn Gemini API-nøkkelen under Innstillinger (tannhjulet øverst) først.");
  return apiKey;
}

/** Sender én forespørsel med automatisk modell-fallback og nye forsøk. */
async function call(body) {
  const key = apiKey();
  let lastError;
  for (const model of candidateModels()) {
    for (let attempt = 0; attempt < 2; attempt++) {
      let res;
      try {
        res = await fetch(`${API}/models/${model}:generateContent`, {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": key },
          body: JSON.stringify(body),
        });
      } catch {
        lastError = new ApiError("Fikk ikke kontakt med AI-tjenesten. Sjekk nettforbindelsen.");
        await sleep(1200);
        continue;
      }
      if (res.ok) return { data: await res.json(), model };
      lastError = await toApiError(res);
      const { status } = res;
      if (status === 429) {
        if (attempt === 0 && lastError.retryDelay != null && lastError.retryDelay <= 20) {
          await sleep(lastError.retryDelay * 1000 + 500);
          continue;
        }
        break; // prøv neste modell
      }
      if (status === 404 || status === 503 || (status === 400 && /model|tool|not supported/i.test(lastError.raw) && !/api key/i.test(lastError.raw))) break;
      if (status >= 500) { await sleep(1500); continue; }
      throw lastError;
    }
  }
  throw lastError;
}

function textOf(cand) {
  return (cand?.content?.parts || []).filter(p => p.text && !p.thought).map(p => p.text).join("");
}

function sourcesOf(cand) {
  const gm = cand?.groundingMetadata || {};
  const seen = new Set();
  return (gm.groundingChunks || [])
    .map(c => c.web)
    .filter(w => w?.uri && !seen.has(w.uri) && seen.add(w.uri))
    .map(w => ({ title: w.title || w.uri, url: w.uri }));
}

/**
 * Enkel tekstgenerering (markdown).
 * @param {{system:string, messages:{role:string,text:string}[], search?:boolean, urlContext?:boolean, temperature?:number}} o
 */
export async function generate({ system, messages, search = false, urlContext = false, temperature = 0.4 }) {
  const contents = messages.map(m => ({ role: m.role === "model" ? "model" : "user", parts: [{ text: m.text }] }));
  const tools = [...(search ? [{ google_search: {} }] : []), ...(urlContext ? [{ url_context: {} }] : [])];
  const body = {
    systemInstruction: { parts: [{ text: system }] },
    contents,
    ...(tools.length ? { tools } : {}),
    generationConfig: { temperature, maxOutputTokens: 4096 },
  };
  let out;
  try {
    out = await call(body);
  } catch (e) {
    // Noen kvoter tillater ikke søk/verktøy: prøv uten
    if (tools.length && (e.status === 429 || e.status === 400)) out = await call({ ...body, tools: undefined });
    else throw e;
  }
  const cand = out.data.candidates?.[0];
  const text = textOf(cand);
  if (!text) throw new ApiError(`AI-en ga ikke noe svar (${cand?.finishReason || out.data.promptFeedback?.blockReason || "ukjent grunn"}). Prøv igjen.`);
  return { text, sources: sourcesOf(cand), model: out.model };
}

/**
 * Agent-løkke med funksjonskall. AI-en kan kalle verktøyene våre (søke i boliger, endre filtre,
 * hente data ...) flere ganger før den svarer.
 * @param {object} o
 * @param {string} o.system
 * @param {Array} o.contents   tidligere samtale i Gemini-format (endres ikke)
 * @param {Array} o.declarations  funksjonsdeklarasjoner
 * @param {(name:string,args:object)=>Promise<any>} o.execute
 * @param {(step:{name:string,args:object})=>void} [o.onStep]
 */
export async function runAgent({ system, contents, declarations, execute, onStep, maxSteps = 8 }) {
  const convo = [...contents];
  let model = "";
  const steps = [];
  for (let i = 0; i < maxSteps; i++) {
    const out = await call({
      systemInstruction: { parts: [{ text: system }] },
      contents: convo,
      tools: [{ functionDeclarations: declarations }],
      generationConfig: { temperature: 0.3, maxOutputTokens: 4096 },
    });
    model = out.model;
    const cand = out.data.candidates?.[0];
    const parts = cand?.content?.parts || [];
    if (!parts.length) throw new ApiError(`AI-en ga ikke noe svar (${cand?.finishReason || "ukjent grunn"}). Prøv igjen.`);
    convo.push({ role: "model", parts }); // behold thoughtSignature uendret
    const calls = parts.filter(p => p.functionCall);
    if (!calls.length) {
      return { text: textOf(cand), contents: convo, steps, model };
    }
    const responses = [];
    for (const p of calls) {
      const { name, args = {}, id } = p.functionCall;
      onStep?.({ name, args });
      steps.push({ name, args });
      let result;
      try {
        result = await execute(name, args);
      } catch (e) {
        result = { feil: e.message || String(e) };
      }
      responses.push({ functionResponse: { name, ...(id ? { id } : {}), response: { result } } });
    }
    convo.push({ role: "user", parts: responses });
  }
  return { text: "Jeg brukte mange steg uten å bli ferdig. Prøv å stille et mer avgrenset spørsmål.", contents: convo, steps, model };
}
