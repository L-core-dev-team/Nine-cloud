import { proxyHealthRequest } from './_lib/api-proxy.mjs';

export const onRequest = context => proxyHealthRequest(context, '/ready');
