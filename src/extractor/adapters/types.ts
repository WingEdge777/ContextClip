export type ExtractionContext = {
  documentTitle: string;
  sourceUrl: string;
  site: string;
  author?: string;
  createdAt?: string;
  modifiedAt?: string;
};

export type AdaptedContent = {
  root: HTMLElement;
  title: string;
  sourceUrl: string;
  site: string;
  author?: string;
  createdAt?: string;
  modifiedAt?: string;
};

export type DomainAdapter = {
  name: string;
  match(root: HTMLElement, context: ExtractionContext): boolean;
  transform(root: HTMLElement, context: ExtractionContext): AdaptedContent | null | Promise<AdaptedContent | null>;
};
