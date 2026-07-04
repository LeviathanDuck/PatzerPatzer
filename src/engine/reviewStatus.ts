export let analysisComplete = false;

export function setAnalysisComplete(v: boolean): void {
  analysisComplete = v;
}

export function resetReviewStatusRuntime(): void {
  analysisComplete = false;
}
