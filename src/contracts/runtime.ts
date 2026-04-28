import type { ExtractResult } from "./extract-result";

export type RuntimeMessage =
  | { type: "ping" }
  | { type: "extract-page" }
  | { type: "start-selection" }
  | { type: "selection-complete"; payload: ExtractResult }
  | { type: "store-result"; payload: ExtractResult; tabId: number }
  | { type: "get-last-result"; tabId: number }
  | { type: "notify-copy"; payload: ExtractResult };
