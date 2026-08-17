export type ProvenanceOutcome = 'detected' | 'not_detected'

export type C2PAValidationState =
  | 'trusted'
  | 'valid'
  | 'invalid'
  | 'not_present'

export interface C2PAResult {
  type: 'c2pa'
  outcome: ProvenanceOutcome
  validation_state: C2PAValidationState
  issuer: string | null
  model: string | null
  generated_at: string | null
}

export interface SynthIDResult {
  type: 'synthid'
  outcome: ProvenanceOutcome
  model: string | null
  generated_at: string | null
}

export interface ContentProvenanceResponse {
  object: 'content_provenance_check'
  created_at: number
  results: Array<C2PAResult | SynthIDResult>
}

export type NormalizedStatus =
  | 'detected'
  | 'not_detected'
  | 'invalid_metadata'

export interface NormalizedProvenanceResult {
  status: NormalizedStatus
  signalType: string
  issuer: string
  model: string
  generatedAt: string
  validationState: string
  details: string
}

export interface DetectedImageFormat {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp'
  extension: 'png' | 'jpg' | 'webp'
}
