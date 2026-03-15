import { onRequestOptions, onRequestPost } from '../functions/api/grok';
import { onOpenAiRequest } from '../functions/api/openai';

interface WorkerEnv {
 ASSETS?: {
 fetch: (request: Request) => Promise<Response>;
 };
 GROK_API_URL?: string;
 GROK_API_KEY?: string;
 API_AUTH_KEY?: string;
}

export default {
 async fetch(request: Request, env: WorkerEnv) {
 const url = new URL(request.url);

 if (url.pathname.startsWith('/v1/')) {
 return withAuth(request, env, () => onOpenAiRequest({ request, env }));
 }
 
 if (url.pathname === '/api/grok') {
 if (request.method === 'OPTIONS') {
 return onRequestOptions();
 }

 if (request.method === 'POST') {
 return onRequestPost({ request, env });
 }

 return new Response('Method Not Allowed', {
 status:405,
 headers: {
 Allow: 'POST, OPTIONS',
 },
 });
 }

 if (env.ASSETS) {
 return env.ASSETS.fetch(request);
 }

 return new Response('Static assets binding is not configured.', { status:500 });
 },
};

function withAuth(request: Request, env: WorkerEnv, next: () => Promise<Response> | Response) {
 if (request.method === 'OPTIONS') {
 return next();
 }

 const authHeader = request.headers.get('Authorization') || '';
 const match = authHeader.match(/Bearer\s+(.+)/i);
 const token = match?.[1]?.trim();

 if (!env.API_AUTH_KEY || !token || token !== env.API_AUTH_KEY) {
 return new Response(
 JSON.stringify({
 error: {
 message: 'Unauthorized',
 type: 'auth_error',
 code: 'invalid_api_key',
 },
 }),
 {
 status:401,
 headers: {
 'Content-Type': 'application/json; charset=utf-8',
 'Access-Control-Allow-Origin': '*',
 'Access-Control-Allow-Headers': 'Content-Type, Authorization',
 'Access-Control-Allow-Methods': 'POST, OPTIONS',
 },
 },
 );
 }

 return next();
}
