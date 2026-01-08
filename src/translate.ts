import WebSocket from "ws";
import { ConfigManager } from "./util/configManager";
import { InputConfig } from "./types/Config";
import { Frame } from "./types/Frame";
import {TranslationServiceClient} from "@google-cloud/translate";
import {APIError} from "./types/GoogleAPI";
import color from "colorts";
import {google} from "@google-cloud/translate/build/protos/protos";
import ITranslateTextResponse = google.cloud.translation.v3.ITranslateTextResponse;



export class Translator {
    private config: ConfigManager;
    public inputConfig: InputConfig;
    private tempCounter: number = 0;  //DELETE ME
    private tempRedoCounter: number = 0;  //DELETE ME

    private previousInput: string[] = [];
    private translated: string[] = [];
    private translationClient: TranslationServiceClient;
    private clients: WebSocket[];


    constructor(config: ConfigManager, clients: WebSocket[], input: InputConfig, mockMode: boolean = false) {
        input.sampleRate = 16000;
        this.config = config;
        this.inputConfig = input;
        this.clients = clients
        this.translationClient = new TranslationServiceClient();


    }

    public async translateFrame(frame: Frame) {
        if (frame.languageCode === undefined) { return }
        const sentences: string[] = frame.text.split('.')
        let changed = false
        let translateDepth = sentences.length - 2
        if (frame.isFinal) {
            translateDepth = sentences.length
            this.tempCounter += frame.text.length
            console.log("Running count", this.tempCounter, "Redo", this.tempRedoCounter)

            frame.text = await this.translateText(frame.text, true, frame.languageCode, {...frame});
            frame.device = frame.device + .1
            //if (!changed) {return}
            if (!frame.text) {return}
            let msg = JSON.stringify(frame);
            for (let ws of this.clients) {
                ws.send(msg);
            }
        }

        else {
            for (let i = 0; i < translateDepth; i++) {
                // check for decoding change without punctuation or case. (Since that fluctuates a lot)
                if (this.standardizeText(this.previousInput[i]) === this.standardizeText(sentences[i])) continue
                // check for empty sentences
                if (sentences[i].length == 0) continue

                if (this.previousInput[i]) this.tempRedoCounter += sentences[i].length
                this.tempCounter += sentences[i].length
                //console.log("Running count", this.tempCounter, frame.isFinal ? '-' : ' ', this.previousInput[i] ? '*' : '', this.tempRedoCounter, "Translate", i, sentences.length, sentences[i])
                console.log("Running count", this.tempCounter, "Redo", this.tempRedoCounter, "Partial")
                this.previousInput[i] = sentences[i]
                // Do the deed here
                changed = true
                const outputText = await this.translateText(sentences[i], false, frame.languageCode, {...frame});
                if(outputText){
                    this.translated[i] = outputText
                }

            }

            frame.text = this.translated.join('.')

            frame.device = frame.device + .1
            if (!changed) {return}
            if (!frame.text) {return}
            let msg = JSON.stringify(frame);
            for (let ws of this.clients) {
                ws.send(msg);
            }
        }

    }
    private standardizeText(input: string){
        // Don't want to re-translate text for minor changes like case, or punctuation.
        return input?.replace('/,/g', '').toLowerCase()
    }
    private async translateText(translateSource: string, isFinal: boolean, languageCode: string, frame: Frame): Promise<string>  {
        if (isFinal) {
            this.previousInput = []
            this.translated = []
        }

        // Construct request
        const request = {
            parent: `projects/${this.config.server.google.projectId}/locations/global`, // TODO Tie this to region
            contents: [translateSource],
            mimeType: 'text/plain',
            sourceLanguageCode: languageCode,
            targetLanguageCode: 'es',
        };

        // Run

        if (request.sourceLanguageCode.substring(0, 2) == request.targetLanguageCode.substring(0, 2)) {
            // Will error if src/target are the same
            console.log("src/target languages match, no need to translate")
            return ""
        }


        try {
            //console.log(request)
            const [response,a,b] = await this.translationClient.translateText(request)
            if (response.translations === null) return "";
            //console.log(response)
            if (!response?.translations) return ""
            if (!response?.translations[0]) return ""
            if (!response?.translations[0]?.translatedText) return ""
            return response.translations[0].translatedText
        } catch (err) {
            // Error maxing out the 305 second limit, so we just restart

            console.error(err);
            console.log("Update setting and hit Apply to try again");

        }
        return ""

    }
}