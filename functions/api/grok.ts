interface Env {
  GROK_API_URL?: string;
  GROK_API_KEY?: string;
}

type CompatibilityMode = 'auto' | 'chat-completions' | 'openai-images';

interface GrokPayload {
  model?: string;
  prompt?: string;
  aspectRatio?: string;
  count?: number;
  imageDataUrl?: string;
  apiUrl?: string;
  apiKey?: string;
  compatibility?: CompatibilityMode;
}

const DEFAULT_API_URL = 'https://mpp.pp.ua/v1/chat/completions';
const DEFAULT_API_KEY = 'sk-uouOusVyI38S3LwEKkFdFS3wMZu0nxAH2yhz7AgL1SrqWgNp';
const JSON_HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const onRequestOptions = async () => new Response(null, { status: 204, headers: JSON_HEADERS });

export const onRequestPost = async ({ request, env }: { request: Request; env: Env }) => {
  try {
    const body = (await request.json()) as GrokPayload;
    const model = body.model?.trim();
    const prompt = body.prompt?.trim();
    const aspectRatio = body.aspectRatio?.trim() || '1:1';
    const count = clampCount(body.count ?? 1);
    const imageDataUrl = body.imageDataUrl?.trim();
    const isEditModel = model?.toLowerCase().includes('edit');
    const apiUrl = body.apiUrl?.trim() || env.GROK_API_URL || DEFAULT_API_URL;
    const apiKey = body.apiKey?.trim() || env.GROK_API_KEY || DEFAULT_API_KEY;
    const compatibility = resolveCompatibility(body.compatibility, apiUrl);

    if (!model) {
      return jsonResponse({ error: '缺少模型参数。' }, 400);
    }

    if (!prompt) {
      return jsonResponse({ error: '请输入提示词。' }, 400);
    }

    if (isEditModel && !imageDataUrl) {
      return jsonResponse({ error: '编辑模式需要先上传一张参考图片。' }, 400);
    }

    if (!apiKey) {
      return jsonResponse({ error: '缺少 API Key，请在设置面板中填写。' }, 400);
    }

    const upstreamResponse =
      compatibility === 'openai-images'
        ? await sendOpenAiImagesRequest({
            apiUrl,
            apiKey,
            model,
            prompt,
            aspectRatio,
            count,
            imageDataUrl,
            isEditModel,
          })
        : await sendChatCompletionsRequest({
            apiUrl,
            apiKey,
            model,
            prompt,
            aspectRatio,
            count,
            imageDataUrl,
          });

    const rawText = await upstreamResponse.text();
    const rawJson = safeJsonParse(rawText);

    if (!upstreamResponse.ok) {
      return jsonResponse(
        {
          error: extractErrorMessage(rawJson, rawText),
          mode: compatibility,
          endpoint: normalizeApiUrl(apiUrl, compatibility, Boolean(isEditModel && imageDataUrl)),
        },
        upstreamResponse.status,
      );
    }

    const images = extractImages(rawJson);

    if (!images.length) {
      return jsonResponse(
        {
          error: '接口调用成功，但未解析到图片结果。',
          providerMessage: extractText(rawJson),
          mode: compatibility,
          endpoint: normalizeApiUrl(apiUrl, compatibility, Boolean(isEditModel && imageDataUrl)),
        },
        502,
      );
    }

    return jsonResponse({
      images,
      providerMessage: extractText(rawJson),
      usage: rawJson?.usage ?? null,
      mode: compatibility,
      endpoint: normalizeApiUrl(apiUrl, compatibility, Boolean(isEditModel && imageDataUrl)),
      raw: rawJson,
    });
  } catch (error) {
    return jsonResponse(
      {
        error: error instanceof Error ? error.message : '请求处理失败。',
      },
      500,
    );
  }
};

async function sendChatCompletionsRequest({
  apiUrl,
  apiKey,
  model,
  prompt,
  aspectRatio,
  count,
  imageDataUrl,
}: {
  apiUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  aspectRatio: string;
  count: number;
  imageDataUrl?: string;
}) {
  const providerRequest = {
    model,
    stream: false,
    n: count,
    messages: [
      {
        role: 'system',
        content:
          'You are an expert image generation and image editing assistant. Create or edit images exactly according to the user request. If the model can output images, return the image result directly as URL or base64.',
      },
      {
        role: 'user',
        content: imageDataUrl
          ? [
              {
                type: 'text',
                text: buildPrompt(prompt, aspectRatio, count, true),
              },
              {
                type: 'image_url',
                image_url: {
                  url: imageDataUrl,
                },
              },
            ]
          : buildPrompt(prompt, aspectRatio, count, false),
      },
    ],
  };

  return fetch(normalizeApiUrl(apiUrl, 'chat-completions', Boolean(imageDataUrl)), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(providerRequest),
  });
}

async function sendOpenAiImagesRequest({
  apiUrl,
  apiKey,
  model,
  prompt,
  aspectRatio,
  count,
  imageDataUrl,
  isEditModel,
}: {
  apiUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  aspectRatio: string;
  count: number;
  imageDataUrl?: string;
  isEditModel: boolean;
}) {
  const isEditRequest = Boolean(isEditModel && imageDataUrl);
  const endpoint = normalizeApiUrl(apiUrl, 'openai-images', isEditRequest);

  if (isEditRequest && imageDataUrl) {
    const formData = new FormData();
    formData.set('model', model);
    formData.set('prompt', `${prompt}\nPreserve the original composition when appropriate. Target aspect ratio: ${aspectRatio}`);
    formData.set('n', String(count));
    formData.set('size', aspectRatioToSize(aspectRatio));
    formData.set('image', dataUrlToFile(imageDataUrl, 'reference-image'));

    return fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
      },
      body: formData,
    });
  }

  const body = {
    model,
    prompt,
    n: count,
    size: aspectRatioToSize(aspectRatio),
    response_format: 'b64_json',
  };

  return fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
  });
}

function buildPrompt(prompt: string, aspectRatio: string, count: number, isEdit: boolean) {
  const segments = [
    isEdit ? 'Edit the provided reference image.' : 'Generate a brand new image.',
    `Prompt: ${prompt}`,
    `Aspect ratio: ${aspectRatio}`,
    count > 1 ? `Create ${count} distinct variations.` : 'Create 1 high-quality result.',
    'Return the image result directly whenever possible.',
  ];

  return segments.join('\n');
}

function resolveCompatibility(mode: CompatibilityMode | undefined, apiUrl: string): Exclude<CompatibilityMode, 'auto'> {
  if (mode === 'chat-completions' || mode === 'openai-images') {
    return mode;
  }

  return /\/images\/(generations|edits)\/?$/i.test(apiUrl) ? 'openai-images' : 'chat-completions';
}

function normalizeApiUrl(input: string, mode: Exclude<CompatibilityMode, 'auto'>, isEditRequest: boolean) {
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

    url.pathname = `${trimmedPath}/chat/completions`.replace(/\/+/g, '/');
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

  url.pathname = `${trimmedPath}${targetPath}`.replace(/\/+/g, '/');
  return url.toString();
}

function aspectRatioToSize(aspectRatio: string) {
  const normalized = aspectRatio.trim();

  if (normalized === '16:9' || normalized === '21:9') {
    return '1792x1024';
  }

  if (normalized === '9:16') {
    return '1024x1792';
  }

  return '1024x1024';
}

function clampCount(value: number) {
  if (Number.isNaN(value)) {
    return 1;
  }

  return Math.min(4, Math.max(1, Math.round(value)));
}

function dataUrlToFile(dataUrl: string, fileName: string) {
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);

  if (!match) {
    throw new Error('参考图格式不正确，只支持 Data URL 图片。');
  }

  const [, mimeType, base64Data] = match;
  const binary = atob(base64Data);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return new File([bytes], `${fileName}.${mimeType.split('/')[1] || 'png'}`, { type: mimeType });
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

    if (/^[A-Za-z0-9+/=\s]+$/.test(normalized) && normalized.length > 128) {
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

  return fallback || '上游接口请求失败。';
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}
