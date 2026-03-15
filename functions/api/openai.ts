interface Env {
 GROK_API_URL?: string;
 GROK_API_KEY?: string;
 API_AUTH_KEY?: string;
}

type OpenAiErrorResponse = {
 error: {
 message: string;
 type?: string;
 code?: string | null;
 };
};

type ChatCompletionRequest = {
 model?: string;
 messages?: unknown[];
 stream?: boolean;
};

type ImageGenerationRequest = {
 model?: string;
 prompt?: string;
 n?: number;
 size?: string;
 response_format?: 'url' | 'b64_json';
};

const DEFAULT_API_URL = 'https://mpp.pp.ua/v1/chat/completions';
const JSON_HEADERS = {
 'Content-Type': 'application/json; charset=utf-8',
 'Cache-Control': 'no-store',
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
 'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const SSE_HEADERS = {
 'Content-Type': 'text/event-stream; charset=utf-8',
 'Cache-Control': 'no-cache, no-transform',
 Connection: 'keep-alive',
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
 'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const onOpenAiOptions = async () => new Response(null, { status:204, headers: JSON_HEADERS });

export const onOpenAiRequest = async ({ request, env }: { request: Request; env: Env }) => {
 const url = new URL(request.url);

 if (request.method === 'OPTIONS') {
 return onOpenAiOptions();
 }

 const authError = verifyAuth(request, env);
 if (authError) {
 return authError;
 }

 if (request.method !== 'POST') {
 return new Response('Method Not Allowed', {
 status:405,
 headers: {
 Allow: 'POST, OPTIONS',
 },
 });
 }

 if (url.pathname === '/v1/chat/completions') {
 return handleChatCompletions({ request, env });
 }

 if (url.pathname === '/v1/images/generations') {
 return handleImageGenerations({ request, env });
 }

 if (url.pathname === '/v1/images/edits') {
 return handleImageEdits({ request, env });
 }

 return jsonResponse({ error: { message: 'Not Found' } },404);
};

async function handleChatCompletions({ request, env }: { request: Request; env: Env }) {
 const bodyText = await request.text();
 const body = safeJsonParse(bodyText) as ChatCompletionRequest | null;

 if (!body) {
 return jsonResponse({ error: { message: 'Invalid JSON body.' } },400);
 }

 const model = typeof body.model === 'string' ? body.model : 'grok-imagine';
 const stream = Boolean(body.stream);
 const apiUrl = env.GROK_API_URL || DEFAULT_API_URL;
 const apiKey = extractApiKey(request, env);

 if (!apiKey) {
 return jsonResponse({ error: { message: 'Missing API key.' } },401);
 }

 const upstreamResponse = await fetch(normalizeApiUrl(apiUrl, 'chat-completions', false), {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${apiKey}`,
 },
 body: JSON.stringify({ ...body, stream }),
 });

 const rawText = await upstreamResponse.text();
 const parsedPayload = parseProviderPayload(rawText);

 if (!upstreamResponse.ok) {
 return jsonResponse(
 {
 error: {
 message: extractErrorMessage(parsedPayload, rawText),
 type: 'upstream_error',
 code: null,
 },
 },
 upstreamResponse.status,
 );
 }

 const providerMessage = extractText(parsedPayload);
 const images = extractImages(parsedPayload);
 const created = Math.floor(Date.now() /1000);

 const responsePayload = buildChatCompletionResponse({
 model,
 created,
 providerMessage,
 images,
 usage: extractUsage(parsedPayload),
 });

 if (stream) {
 const chunkPayload = buildChatCompletionChunk({
 id: responsePayload.id,
 model,
 created,
 providerMessage,
 images,
 });
 const sseBody = `data: ${JSON.stringify(chunkPayload)}\n\n` + 'data: [DONE]\n\n';
 return new Response(sseBody, { status:200, headers: SSE_HEADERS });
 }

 return jsonResponse(responsePayload,200);
}

async function handleImageGenerations({ request, env }: { request: Request; env: Env }) {
 const bodyText = await request.text();
 const body = safeJsonParse(bodyText) as ImageGenerationRequest | null;

 if (!body) {
 return jsonResponse({ error: { message: 'Invalid JSON body.' } },400);
 }

 if (!body.prompt || typeof body.prompt !== 'string') {
 return jsonResponse({ error: { message: 'Missing prompt.' } },400);
 }

 const apiUrl = env.GROK_API_URL || DEFAULT_API_URL;
 const apiKey = extractApiKey(request, env);

 if (!apiKey) {
 return jsonResponse({ error: { message: 'Missing API key.' } },401);
 }

 const upstreamResponse = await fetch(normalizeApiUrl(apiUrl, 'openai-images', false), {
 method: 'POST',
 headers: {
 'Content-Type': 'application/json',
 Authorization: `Bearer ${apiKey}`,
 },
 body: JSON.stringify(body),
 });

 const rawText = await upstreamResponse.text();
 const parsedPayload = parseProviderPayload(rawText);

 if (!upstreamResponse.ok) {
 return jsonResponse(
 {
 error: {
 message: extractErrorMessage(parsedPayload, rawText),
 type: 'upstream_error',
 code: null,
 },
 },
 upstreamResponse.status,
 );
 }

 return jsonResponse(buildImagesResponse(parsedPayload, body.response_format),200);
}

async function handleImageEdits({ request, env }: { request: Request; env: Env }) {
 const formData = await request.formData();
 const image = formData.get('image');

 if (!image) {
 return jsonResponse({ error: { message: 'Missing image.' } },400);
 }

 const apiUrl = env.GROK_API_URL || DEFAULT_API_URL;
 const apiKey = extractApiKey(request, env);

 if (!apiKey) {
 return jsonResponse({ error: { message: 'Missing API key.' } },401);
 }

 const upstreamResponse = await fetch(normalizeApiUrl(apiUrl, 'openai-images', true), {
 method: 'POST',
 headers: {
 Authorization: `Bearer ${apiKey}`,
 },
 body: formData,
 });

 const rawText = await upstreamResponse.text();
 const parsedPayload = parseProviderPayload(rawText);

 if (!upstreamResponse.ok) {
 return jsonResponse(
 {
 error: {
 message: extractErrorMessage(parsedPayload, rawText),
 type: 'upstream_error',
 code: null,
 },
 },
 upstreamResponse.status,
 );
 }

 const responseFormat = String(formData.get('response_format') || 'url') as 'url' | 'b64_json';
 return jsonResponse(buildImagesResponse(parsedPayload, responseFormat),200);
}

function extractApiKey(request: Request, env: Env) {
 const header = request.headers.get('Authorization') || '';
 const match = header.match(/Bearer\s+(.+)/i);

 if (match?.[1]) {
 return match[1].trim();
 }

 return null;
}

function buildChatCompletionResponse({
 model,
 created,
 providerMessage,
 images,
 usage,
}: {
 model: string;
 created: number;
 providerMessage: string;
 images: string[];
 usage: unknown;
}) {
 const messageContent = buildMessageContent(providerMessage, images);

 return {
 id: `chatcmpl-${crypto.randomUUID()}`,
 object: 'chat.completion',
 created,
 model,
 choices: [
 {
 index:0,
 message: {
 role: 'assistant',
 content: messageContent,
 },
 finish_reason: 'stop',
 },
 ],
 usage: usage ?? null,
 };
}

function buildChatCompletionChunk({
 id,
 model,
 created,
 providerMessage,
 images,
}: {
 id: string;
 model: string;
 created: number;
 providerMessage: string;
 images: string[];
}) {
 const contentText = buildContentText(providerMessage, images);

 return {
 id,
 object: 'chat.completion.chunk',
 created,
 model,
 choices: [
 {
 index:0,
 delta: {
 role: 'assistant',
 content: contentText,
 },
 finish_reason: 'stop',
 },
 ],
 };
}

function buildMessageContent(text: string, images: string[]) {
 if (!images.length) {
 return text;
 }

 const content: Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }> = [];

 if (text) {
 content.push({ type: 'text', text });
 }

 images.forEach((url) => {
 content.push({ type: 'image_url', image_url: { url } });
 });

 return content;
}

function buildContentText(text: string, images: string[]) {
 const parts = [text, ...images].filter(Boolean);
 return parts.join('\n');
}

function buildImagesResponse(payload: any, responseFormat: 'url' | 'b64_json' = 'url') {
 const images = extractImages(payload);

 if (!images.length) {
 return {
 created: Math.floor(Date.now() /1000),
 data: [],
 };
 }

 const data = images.map((value) => {
 if (responseFormat === 'b64_json') {
 return { b64_json: stripDataUrl(value) };
 }

 return { url: value };
 });

 return {
 created: Math.floor(Date.now() /1000),
 data,
 };
}

function stripDataUrl(value: string) {
 if (value.startsWith('data:image')) {
 const [, base64] = value.split('base64,');
 return base64 || value;
 }

 return value;
}

function normalizeApiUrl(input: string, mode: 'chat-completions' | 'openai-images', isEditRequest: boolean) {
 let url: URL;

 try {
 url = new URL(input);
 } catch {
 throw new Error('API 地址格式不正确，请输入完整的 http 或 https 地址。');
 }

 const trimmedPath = url.pathname.replace(/\/+$/, '');

 if (mode === 'chat-completions') {
 if (/\/chat\/completions$/i.test(trimmedPath)) {
 return url.toString();
 }

 if (/\/images\/(generations|edits)$/i.test(trimmedPath)) {
 url.pathname = trimmedPath.replace(/\/images\/(generations|edits)$/i, '/chat/completions');
 return url.toString();
 }

 url.pathname = `${trimmedPath}/chat/completions`.replace(/\/+/, '/');
 return url.toString();
 }

 const targetPath = `/images/${isEditRequest ? 'edits' : 'generations'}`;

 if (/\/images\/(generations|edits)$/i.test(trimmedPath)) {
 url.pathname = trimmedPath.replace(/\/images\/(generations|edits)$/i, targetPath);
 return url.toString();
 }

 if (/\/chat\/completions$/i.test(trimmedPath)) {
 url.pathname = trimmedPath.replace(/\/chat\/completions$/i, targetPath);
 return url.toString();
 }

 url.pathname = `${trimmedPath}${targetPath}`.replace(/\/+/, '/');
 return url.toString();
}

function parseProviderPayload(rawText: string) {
 const directJson = safeJsonParse(rawText);

 if (directJson) {
 return directJson;
 }

 const sseEvents = parseSsePayload(rawText);

 if (sseEvents.length) {
 return {
 object: 'sse_payload',
 events: sseEvents,
 choices: sseEvents.flatMap((event) => (Array.isArray(event?.choices) ? event.choices : [])),
 data: sseEvents.flatMap((event) => (Array.isArray(event?.data) ? event.data : [])),
 output: sseEvents.flatMap((event) => (Array.isArray(event?.output) ? event.output : [])),
 usage: getLastUsage(sseEvents),
 rawText,
 };
 }

 return rawText;
}

function parseSsePayload(rawText: string) {
 const events: any[] = [];
 const chunks = rawText.split(/\r?\n\r?\n/);

 for (const chunk of chunks) {
 const dataLines = chunk
 .split(/\r?\n/)
 .filter((line) => line.startsWith('data:'))
 .map((line) => line.replace(/^data:\s*/, '').trim())
 .filter(Boolean);

 if (!dataLines.length) {
 continue;
 }

 const data = dataLines.join('\n');

 if (data === '[DONE]') {
 continue;
 }

 const parsed = safeJsonParse(data);

 if (parsed) {
 events.push(parsed);
 continue;
 }

 events.push(data);
 }

 return events;
}

function extractUsage(payload: any) {
 if (!payload) {
 return null;
 }

 if (payload?.usage) {
 return payload.usage;
 }

 if (Array.isArray(payload?.events)) {
 return getLastUsage(payload.events);
 }

 return null;
}

function getLastUsage(events: any[]) {
 for (let index = events.length -1; index >=0; index -=1) {
 if (events[index]?.usage) {
 return events[index].usage;
 }
 }

 return null;
}

function extractImages(payload: any): string[] {
 const results = new Set<string>();

 const addImage = (value?: string) => {
 if (!value || typeof value !== 'string') {
 return;
 }

 const normalized = value.trim();

 if (!normalized) {
 return;
 }

 if (/^https?:\/\//i.test(normalized) || /^data:image\//i.test(normalized)) {
 results.add(normalized);
 return;
 }

 if (/^[A-Za-z0-9+/=\s]+$/.test(normalized) && normalized.length >128) {
 results.add(`data:image/png;base64,${normalized.replace(/\s+/g, '')}`);
 }
 };

 const inspectText = (value: string) => {
 const markdownMatches = value.match(/!\[[^\]]*\]\((https?:\/\/[^)\s]+|data:image\/[^)]+)\)/gi) || [];
 markdownMatches.forEach((match) => {
 const url = match.replace(/^!\[[^\]]*\]\(/, '').replace(/\)$/, '');
 addImage(url);
 });

 const urlMatches = value.match(/https?:\/\/[^\s)"']+/gi) || [];
 urlMatches.forEach((url) => addImage(url));

 const dataMatches = value.match(/data:image\/[a-zA-Z0-9.+-]+;base64,[A-Za-z0-9+/=]+/gi) || [];
 dataMatches.forEach((dataUri) => addImage(dataUri));
 };

 const visit = (node: any) => {
 if (!node) {
 return;
 }

 if (typeof node === 'string') {
 addImage(node);
 inspectText(node);
 return;
 }

 if (Array.isArray(node)) {
 node.forEach(visit);
 return;
 }

 if (typeof node !== 'object') {
 return;
 }

 addImage(node.url);
 addImage(typeof node.image_url === 'string' ? node.image_url : node.image_url?.url);
 addImage(node.result);
 addImage(node.base64);
 addImage(node.image_base64);

 if (typeof node.b64_json === 'string') {
 addImage(`data:image/png;base64,${node.b64_json}`);
 }

 if (typeof node.text === 'string') {
 inspectText(node.text);
 }

 if (typeof node.output_text === 'string') {
 inspectText(node.output_text);
 }

 if (typeof node.content === 'string' || Array.isArray(node.content)) {
 visit(node.content);
 }

 if (node.delta) {
 visit(node.delta);
 }

 if (typeof node.response === 'string' || Array.isArray(node.response) || typeof node.response === 'object') {
 visit(node.response);
 }

 if (Array.isArray(node.data)) {
 visit(node.data);
 }

 if (Array.isArray(node.images)) {
 visit(node.images);
 }

 if (Array.isArray(node.choices)) {
 visit(node.choices);
 }

 if (Array.isArray(node.output)) {
 visit(node.output);
 }

 if (Array.isArray(node.results)) {
 visit(node.results);
 }

 if (node.message) {
 visit(node.message);
 }
 };

 visit(payload);

 return Array.from(results);
}

function extractText(payload: any): string {
 const fragments = new Set<string>();

 const visit = (node: any) => {
 if (!node) {
 return;
 }

 if (typeof node === 'string') {
 const value = node.trim();
 if (value) {
 fragments.add(value);
 }
 return;
 }

 if (Array.isArray(node)) {
 node.forEach(visit);
 return;
 }

 if (typeof node !== 'object') {
 return;
 }

 if (typeof node.text === 'string') {
 visit(node.text);
 }

 if (typeof node.output_text === 'string') {
 visit(node.output_text);
 }

 if (typeof node.content === 'string' || Array.isArray(node.content)) {
 visit(node.content);
 }

 if (node.delta) {
 visit(node.delta);
 }

 if (Array.isArray(node.output)) {
 visit(node.output);
 }

 if (Array.isArray(node.choices)) {
 visit(node.choices);
 }

 if (node.message) {
 visit(node.message);
 }
 };

 visit(payload);

 return Array.from(fragments).join('\n').trim();
}

function extractErrorMessage(payload: any, fallback: string) {
 if (payload?.error?.message) {
 return payload.error.message;
 }

 if (typeof payload?.error === 'string') {
 return payload.error;
 }

 if (typeof payload?.message === 'string') {
 return payload.message;
 }

 return fallback || 'Upstream request failed.';
}

function safeJsonParse(text: string) {
 try {
 return JSON.parse(text);
 } catch {
 return null;
 }
}

function jsonResponse(data: OpenAiErrorResponse | Record<string, unknown>, status =200) {
 return new Response(JSON.stringify(data), {
 status,
 headers: JSON_HEADERS,
 });
}

function verifyAuth(request: Request, env: Env) {
 const authHeader = request.headers.get('Authorization') || '';
 const match = authHeader.match(/Bearer\s+(.+)/i);
 const token = match?.[1]?.trim();

 if (!env.API_AUTH_KEY || !token || token !== env.API_AUTH_KEY) {
 return jsonResponse(
 {
 error: {
 message: 'Unauthorized',
 type: 'auth_error',
 code: 'invalid_api_key',
 },
 },
401,
 );
 }

 return null;
}
