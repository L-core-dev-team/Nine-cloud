import { proxyApiRequest } from '../_lib/api-proxy.mjs';

export const onRequest = context => proxyApiRequest(context);
