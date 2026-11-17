import { createProviderTransport, type ProviderConfig } from '@jiuxiao/domain/provider-narrative';
import { createCardModel } from './card-model-provider.js';
import { createCardEgressFetch, type CardEgressPolicy } from './provider-egress.js';

/** Explicit server-owned configuration. This module does not mount or enable cards. */
export function createCardProvider(config:ProviderConfig,env:Record<string,string|undefined>,policy:CardEgressPolicy,maxOutputTokens:number) {
 const guardedFetch=createCardEgressFetch(policy);
 return createCardModel(createProviderTransport(config,env,guardedFetch),maxOutputTokens);
}
