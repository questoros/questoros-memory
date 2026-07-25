export interface EmbeddingRequest {
  inputText: string;
  modelId: string;
  dimensions: 1024;
  normalize: true;
}

export interface EmbeddingResult {
  embedding: readonly number[];
  modelId: string;
  dimensions: 1024;
  normalized: true;
  inputTokenCount: number | null;
  provider: 'amazon-bedrock';
}

export interface EmbeddingProvider {
  readonly providerName: string;
  generate(request: EmbeddingRequest): Promise<EmbeddingResult>;
}
