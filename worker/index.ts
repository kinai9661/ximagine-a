import { onRequestOptions, onRequestPost } from '../functions/api/grok';

interface WorkerEnv {
  ASSETS?: {
    fetch: (request: Request) => Promise<Response>;
  };
  GROK_API_URL?: string;
  GROK_API_KEY?: string;
}

export default {
  async fetch(request: Request, env: WorkerEnv) {
    const url = new URL(request.url);

    if (url.pathname === '/api/grok') {
      if (request.method === 'OPTIONS') {
        return onRequestOptions();
      }

      if (request.method === 'POST') {
        return onRequestPost({ request, env });
      }

      return new Response('Method Not Allowed', {
        status: 405,
        headers: {
          Allow: 'POST, OPTIONS',
        },
      });
    }

    if (env.ASSETS) {
      return env.ASSETS.fetch(request);
    }

    return new Response('Static assets binding is not configured.', { status: 500 });
  },
};
