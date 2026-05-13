export type AiOutputRecord = {
  model: string;
  provider: string;
  promptVersion: string;
  inputEvidenceIds: string[];
  output: string;
  createdAt: string;
};

export interface AiProvider {
  name: string;
  summarizeEvidence(input: { evidenceIds: string[]; text: string }): Promise<AiOutputRecord>;
}
