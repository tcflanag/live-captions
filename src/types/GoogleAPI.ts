export interface SpeechResultData {
    results: SpeechResult[]
}

export interface SpeechResult extends SpeechRecognitionResult {
    languageCode: any;
    alternatives: SpeechRecognitionAlternative[]
}

export interface APIError extends Error {
    code: number
    details: string
}