import { arxivAdapter } from "./arxiv";
import { adaptGeneric } from "./generic";
import { githubAdapter } from "./github";
import { weixinAdapter } from "./weixin";
import { zhihuAdapter } from "./zhihu";
import type { AdaptedContent, DomainAdapter, ExtractionContext } from "./types";

const DOMAIN_ADAPTERS: DomainAdapter[] = [arxivAdapter, githubAdapter, weixinAdapter, zhihuAdapter];

export async function adaptPage(root: HTMLElement, context: ExtractionContext): Promise<AdaptedContent> {
  for (const adapter of DOMAIN_ADAPTERS) {
    if (!adapter.match(root, context)) {
      continue;
    }

    const adapted = await adapter.transform(root, context);
    if (adapted) {
      return adapted;
    }
  }

  return adaptGeneric(root, context);
}
