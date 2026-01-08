import { ConfigManager } from "../util/configManager";
import { Frame } from "../types/Frame";
import { APIError, SpeechResultData } from "../types/GoogleAPI";
import color from "colorts";
import { v2 } from '@google-cloud/speech';
const SpeechClient = v2.SpeechClient;
import { CancellableStream } from 'google-gax';
import { google } from '@google-cloud/speech/build/protos/protos';
import EventEmitter from 'events';

export class GoogleV2 {
    private config: ConfigManager;
    private speech?: v2.SpeechClient;
    private dead: boolean = false;
    private paused: boolean = false;
    private recognizeStream?: CancellableStream;
    private lastFrame: Frame = {
        device: 0,
        type: 'words',
        isFinal: false,
        text: '',
        confidence: 0
    };
    public emitter: EventEmitter = new EventEmitter();
    private inputId: number;
    private inputName: string;
    private sampleRate: number;
    private restart: () => void;
    private languages: string[];

    constructor(config: ConfigManager, sampleRate: number, inputId: number, inputName: string, languages: string[], restart: () => void) {
        this.config = config;
        this.sampleRate = sampleRate;
        this.inputId = inputId;
        this.inputName = inputName;
        this.restart = restart;
        this.languages = languages;

        if (config.server.google.credentials.client_email === '' || config.server.google.credentials.private_key === '') {
            console.error(color('Google API Authentication Failed').bold.red.toString());
        } else {
            this.speech = new SpeechClient({ ...config.server.google });
        }
        this.start();
    }

    public pause() {
        this.dead = true;
        this.recognizeStream?.destroy();
    }

    public resume() {
        this.dead = false;
        this.start();
    }

    private handleRecognitionEvent(data: SpeechResultData) {
        try {
            if (data.results.length < 1 && data.results[0].alternatives.length < 1) return;
            let frame: Frame = {
                device: this.inputId,
                type: 'words',
                isFinal: data.results[0].isFinal,
                text: data.results[0].alternatives[0]?.transcript,
                confidence: data.results[0].alternatives[0]?.confidence,
                speaker: this.inputName,
                languageCode: data.results[0].languageCode
            };

            // Or an empty text...
            if (!frame.text || frame.text.trim() === '') return;

            // Or the same frame twice
            if (frame.text === this.lastFrame.text && !frame.isFinal) return;

            // If this frame has fewer words and is not final let's not send the update
            // because otherwise the words kind of flicker as it detects
            // and if the last frame was final then this is a new sentence and obviously will have fewer words
            if (frame.text?.split(' ').length - this.lastFrame.text?.split(' ').length < 0 && !frame.isFinal && !this.lastFrame.isFinal) return;

            this.lastFrame = frame;

            frame.text = frame.text.trim();
            this.emitter.emit('frame', frame);
        } catch (err) {
            console.error(err);
        }
    }

    private start() {

        // console.log("-", this.speech?.listPhraseSets, this.speech.createPhraseSet)
        // this.speech?.listPhraseSets({parent:`projects/${this.config.server.google.projectId}/locations/${this.config.server.google.region}`}).then((phraseSets)=>{
        //     //TODO How to only call this once globally?
        //     const existingPhraseSets = phraseSets[0].map(set => set.name)
        //     console.log(existingPhraseSets)
        //     //console.log(JSON.stringify(phraseSets[0][0].phrases))
        //     //console.log(JSON.stringify(phraseSets[0][1].phrases))
        //     for (let set of this.config.transcription.phraseSets ){
        //         if (!existingPhraseSets.includes(set)) {
        //             console.log("Add",set)
        //             let phrases = [  { value: 'Red Alliance', boost: 19 },
        //                 { value: 'Blue Alliance', boost: 19 },
        //                 { value: 'qualification match', boost: 19 },
        //                 { value: 'qualification match number', boost: 19 },
        //                 { value: 'Gracious Professionalism', boost: 19 },
        //                 { value: 'Ranking points', boost: 19 },
        //                 { value: 'Base', boost: 19 },
        //                 { value: 'Loading Zone', boost: 19 },
        //                 { value: 'Motif', boost: 19 },
        //                 { value: 'Pattern', boost: 19 },
        //                 { value: 'Ramp', boost: 19 },
        //                 { value: 'RTX', boost: 19 },
        //                 { value: 'Secret Tunnel', boost: 19 },
        //                 { value: 'Classifier', boost: 19 },
        //                 { value: 'alliance partner', boost: 19 },
        //                 { value: 'match number', boost: 19 },
        //                 { value: 'teleop', boost: 19 },
        //                 { value: 'teleop period', boost: 19 }]
        //
        //             const request: google.cloud.speech.v2.ICreatePhraseSetRequest = {
        //                 parent:`projects/${this.config.server.google.projectId}/locations/${this.config.server.google.region}`,
        //                 phraseSetId:`ftc-terms`, //todo get this from phraseset
        //                 phraseSet: {phrases: phrases}
        //             }
        //             console.log("A", this.speech?.listPhraseSets, this.speech.createPhraseSet)
        //
        //             this.speech?.createPhraseSet(request)
        //             console.log("B")
        //             const request2: google.cloud.speech.v2.ICreatePhraseSetRequest = {
        //                 parent:`projects/${this.config.server.google.projectId}/locations/${this.config.server.google.region}`,
        //                 phraseSetId:`oregon-team-names`, //todo get this from phraseset
        //                 phraseSet: {phrases: [{"value":"ORTOP","boost":10},{"value":"Phoenix","boost":10},{"value":"EMP","boost":10},{"value":"Gears in Motion","boost":10},{"value":"Twisted Metal","boost":10},{"value":"The Pac-Bots","boost":10},{"value":"Viridescent Vipers","boost":10},{"value":"Ursa Mechanica","boost":10},{"value":"DevilBots","boost":10},{"value":"Tech-Tite","boost":10},{"value":"Mustangs","boost":10},{"value":"CTRL Freak","boost":10},{"value":"Good Enough","boost":10},{"value":"Mystery Bots","boost":10},{"value":"Code Crusher","boost":10},{"value":"Deewalt","boost":10},{"value":"Optimusprime 1.0","boost":10},{"value":"The IDKs","boost":10},{"value":"Shed Squatter","boost":10},{"value":"Avobotos","boost":10},{"value":"DWAI","boost":10},{"value":"The Loose Screws","boost":10},{"value":"Cougarbots","boost":10},{"value":"Gear Heads","boost":10},{"value":"The Hackers","boost":10},{"value":"Gear Heads","boost":10},{"value":"PHRED","boost":10},{"value":"N.E.R.D.","boost":10},{"value":"Uma","boost":10},{"value":"Kinetic Kittens","boost":10},{"value":"HardestWare","boost":10},{"value":"Code Red","boost":10},{"value":"Cybernetic Elks","boost":10},{"value":"MPHS Botcats","boost":10},{"value":"Technical Difficulties","boost":10},{"value":"Boxtrolls","boost":10},{"value":"Chronobreak","boost":10},{"value":"Dread Pirate Robots","boost":10},{"value":"Tech No Logic","boost":10},{"value":"Valley Catholic Robotics","boost":10},{"value":"AEMBOT","boost":10},{"value":"Event Horizon","boost":10},{"value":"The Swagletons","boost":10},{"value":"AxolBots","boost":10},{"value":"Overcharged","boost":10},{"value":"Shock","boost":10},{"value":"ROBOTICS TEAM","boost":10},{"value":"RevAmped Robotics","boost":10},{"value":"Scorpio","boost":10},{"value":"Medieval Mechs","boost":10},{"value":"Juntos Unidos","boost":10},{"value":"Lightning","boost":10},{"value":"That's Fine","boost":10},{"value":"Control Alt Elite","boost":10},{"value":"Din-o-s","boost":10},{"value":"Fibonacci","boost":10},{"value":"Tsunami Zone","boost":10},{"value":"JavaDaHutt","boost":10},{"value":"Leo","boost":10},{"value":"Lightning 42","boost":10},{"value":"Femgineers","boost":10},{"value":"The Ramen Boys","boost":10},{"value":"Fried Chicken","boost":10},{"value":"LAGDOA","boost":10},{"value":"Order of VanArchy","boost":10},{"value":"Dominators","boost":10},{"value":"Giraffe Guardians","boost":10},{"value":"Robomonkeys","boost":10},{"value":"Lab Rats","boost":10},{"value":"High Voltage","boost":10},{"value":"Mostly Operational","boost":10},{"value":"All Hands on Tech","boost":10},{"value":"Disconnect","boost":10},{"value":"Almost Reliable Robotics","boost":10},{"value":"Bob the Builders","boost":10},{"value":"Mechanical Mages","boost":10},{"value":"RoboWaffles","boost":10},{"value":"Hawkbot1cs","boost":10},{"value":"01Cowboys","boost":10},{"value":"42","boost":10},{"value":"PDX OPPS","boost":10},{"value":"Fiendroids","boost":10},{"value":"Green Needle","boost":10},{"value":"His name is Clydz","boost":10},{"value":"L.O.V.E.M.U.F.F.I.N.","boost":10},{"value":"NautilusTech","boost":10},{"value":"Error Code","boost":10},{"value":"Wire Fire","boost":10},{"value":"AURORA","boost":10},{"value":"Ground Control","boost":10},{"value":"Jagwires","boost":10},{"value":"Eagle Tech","boost":10},{"value":"SUPER SIGMA ROBOTICS","boost":10},{"value":"Digital Dragons","boost":10},{"value":"MechRobots","boost":10},{"value":"PHRED2.0","boost":10},{"value":"Aerospace","boost":10},{"value":"S.0.S. (Scholars of STEAM)","boost":10},{"value":"Rock Robots","boost":10},{"value":"Circuit Breakers","boost":10},{"value":"Ladies First","boost":10},{"value":"PDX Bots","boost":10},{"value":"Proxima Nova","boost":10},{"value":"Fancy Tomb Crabs","boost":10},{"value":"Syb@rEagles","boost":10},{"value":"Beyond Tech","boost":10},{"value":"CHIPS","boost":10},{"value":"neurocket1","boost":10},{"value":"Over-Caffeinated Engineers","boost":10},{"value":"CC Rambotics","boost":10},{"value":"Axle-otls","boost":10},{"value":"VanGuard","boost":10},{"value":"REVoltage","boost":10},{"value":"Going Nuts","boost":10},{"value":"Apollo","boost":10},{"value":"Artemis","boost":10},{"value":"Mercury","boost":10},{"value":"Style Points","boost":10},{"value":"Aqua Avengers","boost":10},{"value":"PDX Pandas","boost":10},{"value":"Code Raiders","boost":10},{"value":"PHRED3.0","boost":10},{"value":"Technical Difficulties","boost":10},{"value":"Ah Dang It","boost":10},{"value":"Loggerbots","boost":10},{"value":"Nuclear Fishin","boost":10},{"value":"MicroBots","boost":10},{"value":"Infernovators","boost":10},{"value":"Associated Documentationist","boost":10},{"value":"Otto-Bots SHS","boost":10},{"value":"TBD","boost":10},{"value":"Resistor Robotics","boost":10},{"value":"Techno Sharks","boost":10},{"value":"Northwest Academy Robotics Team","boost":10},{"value":"Everyone Say WOW!","boost":10},{"value":"Maneframe","boost":10},{"value":"GearUp","boost":10},{"value":"GO4BOTZ","boost":10},{"value":"CapyBearings","boost":10},{"value":"MV=P","boost":10},{"value":"T.R.O.U.T","boost":10},{"value":"Ti Binturongs","boost":10},{"value":"Ducky Dynamics","boost":10},{"value":"Leaping Lionesses","boost":10},{"value":"Unreal Crafters","boost":10},{"value":"Denied","boost":10},{"value":"Code Crusaders","boost":10},{"value":"Crash and Burn","boost":10},{"value":"Potato Heads","boost":10},{"value":"Dread Buccaneer Robots","boost":10},{"value":"Dark Horse","boost":10},{"value":"LVCS Robot Nerds","boost":10},{"value":"Syntax Terror","boost":10},{"value":"Grizzlers678","boost":10},{"value":"Team 187","boost":10},{"value":"Team 267","boost":10},{"value":"Team 750","boost":10},{"value":"Team 3965","boost":10},{"value":"Team 4097","boost":10},{"value":"Team 4239","boost":10},{"value":"Team 4711","boost":10},{"value":"Team 5039","boost":10},{"value":"Team 5627","boost":10},{"value":"Team 5951","boost":10},{"value":"Team 6727","boost":10},{"value":"Team 7100","boost":10},{"value":"Team 7470","boost":10},{"value":"Team 7473","boost":10},{"value":"Team 7474","boost":10},{"value":"Team 7496","boost":10},{"value":"Team 7497","boost":10},{"value":"Team 7498","boost":10},{"value":"Team 7499","boost":10},{"value":"Team 7604","boost":10},{"value":"Team 7776","boost":10},{"value":"Team 7878","boost":10},{"value":"Team 8132","boost":10},{"value":"Team 8153","boost":10},{"value":"Team 8188","boost":10},{"value":"Team 8892","boost":10},{"value":"Team 9044","boost":10},{"value":"Team 9060","boost":10},{"value":"Team 9339","boost":10},{"value":"Team 9357","boost":10},{"value":"Team 9487","boost":10},{"value":"Team 9567","boost":10},{"value":"Team 10274","boost":10},{"value":"Team 10332","boost":10},{"value":"Team 10531","boost":10},{"value":"Team 11441","boost":10},{"value":"Team 11545","boost":10},{"value":"Team 11547","boost":10},{"value":"Team 11556","boost":10},{"value":"Team 11591","boost":10},{"value":"Team 11703","boost":10},{"value":"Team 12000","boost":10},{"value":"Team 12076","boost":10},{"value":"Team 12599","boost":10},{"value":"Team 12693","boost":10},{"value":"Team 12695","boost":10},{"value":"Team 12808","boost":10},{"value":"Team 13189","boost":10},{"value":"Team 13688","boost":10},{"value":"Team 13727","boost":10},{"value":"Team 13784","boost":10},{"value":"Team 13907","boost":10},{"value":"Team 13908","boost":10},{"value":"Team 13909","boost":10},{"value":"Team 14126","boost":10},{"value":"Team 14687","boost":10},{"value":"Team 15036","boost":10},{"value":"Team 15341","boost":10},{"value":"Team 15365","boost":10},{"value":"Team 15435","boost":10},{"value":"Team 15436","boost":10},{"value":"Team 16843","boost":10},{"value":"Team 16844","boost":10},{"value":"Team 17151","boost":10},{"value":"Team 17365","boost":10},{"value":"Team 17366","boost":10},{"value":"Team 17367","boost":10},{"value":"Team 17368","boost":10},{"value":"Team 18108","boost":10},{"value":"Team 18119","boost":10},{"value":"Team 18127","boost":10},{"value":"Team 19439","boost":10},{"value":"Team 19856","boost":10},{"value":"Team 20177","boost":10},{"value":"Team 20288","boost":10},{"value":"Team 20300","boost":10},{"value":"Team 20790","boost":10},{"value":"Team 20855","boost":10},{"value":"Team 21231","boost":10},{"value":"Team 21609","boost":10},{"value":"Team 21739","boost":10},{"value":"Team 22392","boost":10},{"value":"Team 22488","boost":10},{"value":"Team 22559","boost":10},{"value":"Team 23139","boost":10},{"value":"Team 23246","boost":10},{"value":"Team 23260","boost":10},{"value":"Team 23295","boost":10},{"value":"Team 23299","boost":10},{"value":"Team 23444","boost":10},{"value":"Team 23664","boost":10},{"value":"Team 23918","boost":10},{"value":"Team 23980","boost":10},{"value":"Team 24077","boost":10},{"value":"Team 24195","boost":10},{"value":"Team 24197","boost":10},{"value":"Team 24261","boost":10},{"value":"Team 24509","boost":10},{"value":"Team 24672","boost":10},{"value":"Team 24886","boost":10},{"value":"Team 25239","boost":10},{"value":"Team 25631","boost":10},{"value":"Team 25682","boost":10},{"value":"Team 25921","boost":10},{"value":"Team 25952","boost":10},{"value":"Team 26056","boost":10},{"value":"Team 26307","boost":10},{"value":"Team 26407","boost":10},{"value":"Team 26817","boost":10},{"value":"Team 26843","boost":10},{"value":"Team 26848","boost":10},{"value":"Team 27201","boost":10},{"value":"Team 27205","boost":10},{"value":"Team 27229","boost":10},{"value":"Team 27230","boost":10},{"value":"Team 27231","boost":10},{"value":"Team 27237","boost":10},{"value":"Team 27355","boost":10},{"value":"Team 27357","boost":10},{"value":"Team 27410","boost":10},{"value":"Team 27416","boost":10},{"value":"Team 27419","boost":10},{"value":"Team 27491","boost":10},{"value":"Team 28236","boost":10},{"value":"Team 28385","boost":10},{"value":"Team 28448","boost":10},{"value":"Team 28521","boost":10},{"value":"Team 28823","boost":10},{"value":"Team 30406","boost":10},{"value":"Team 30603","boost":10},{"value":"Team 30702","boost":10},{"value":"Team 30705","boost":10},{"value":"Team 31023","boost":10},{"value":"Team 31128","boost":10},{"value":"Team 31130","boost":10},{"value":"Team 31242","boost":10},{"value":"Team 31653","boost":10},{"value":"Team 31724","boost":10},{"value":"Team 31725","boost":10},{"value":"Team 31744","boost":10},{"value":"Team 32047","boost":10},{"value":"Team 32154","boost":10},{"value":"Team 32215","boost":10},{"value":"Team 32216","boost":10},{"value":"Team 32217","boost":10},{"value":"Team 32253","boost":10},{"value":"Team 32298","boost":10},{"value":"Team 32944","boost":10},{"value":"Team 33414","boost":10},{"value":"Team 33477","boost":10},{"value":"Team 33676","boost":10},{"value":"Team 33744","boost":10},{"value":"Team 33913","boost":10},{"value":"Hillsboro","boost":19}
        //                     ]
        //                     }}
        //
        //
        //
        //             console.log("C")
        //             this.speech?.createPhraseSet(request2)
        //          }
        //     }
        // })

        const recognitionConfig: google.cloud.speech.v2.IRecognitionConfig = {
            autoDecodingConfig: {},
            explicitDecodingConfig: {
                encoding: 'LINEAR16',
                sampleRateHertz: this.sampleRate,
                audioChannelCount: 1,
            },
            languageCodes: this.languages,
            model: this.config.server.google.model,
            adaptation: {
                phraseSets: this.config.transcription.phraseSets.map(s => ({ phraseSet: s }))
            },
            features: {
                enableAutomaticPunctuation: true
            }
        };

        const streamingRecognitionConfig: google.cloud.speech.v2.IStreamingRecognitionConfig = {
            config: recognitionConfig,
            streamingFeatures: {
                interimResults: true,
            }
        };

        const streamingRecognizeRequest: google.cloud.speech.v2.IStreamingRecognizeRequest = {
            recognizer: `projects/${this.config.server.google.projectId}/locations/${this.config.server.google.region}/recognizers/_`,
            streamingConfig: streamingRecognitionConfig,
        };

        if (this.speech) {
            console.log(color(`GoogleV2: Starting ${this.inputId} stream`).green.toString());
            this.recognizeStream = this.speech
                ._streamingRecognize()
                .on('error', (err: APIError) => {
                    // Error maxing out the 305 second limit, so we just restart
                    if (err.toString().includes('305') || err.details?.includes('Max duration')) {
                        this.recognizeStream?.destroy();
                        this.resume();
                    } else if (err.code === 16 || // Bad username
                        err.code===2 || // Bad Private key
                        err.toString().includes('does not contain a client_email field') ||
                        err.toString().includes('does not contain a private_key field')) {
                        console.error(color('Google API Authentication Failed').bold.red.toString());
                        console.error(err.code, err.details);
                        this.pause();
                        this.paused = true;
                        console.log("Update setting and hit Apply to try again");
                    } else if (err.message.includes('Cannot call write after a stream was destroyed')) {
                        console.log(color(`${err.message}: ${err.code}.  Restarting...`).red.toString());
                        this.pause();
                        this.resume();
                    } else if (err.code===7) {
                        console.error(color('Permission denied or bad ProjectID').bold.red.toString());
                        console.error(err.code, err.details);
                        this.pause();
                        this.paused = true;
                        console.log("Update setting and hit Apply to try again");
                    } else if (err.code===5) {
                        console.error(color('Phraseset Missing').bold.red.toString());
                        console.error(err.code, err.details);
                        this.paused = true;
                        console.log("Update setting and hit Apply to try again");
                    } else if (err.code===3) {
                        console.error(color("Phraseset region doesn't match").bold.red.toString());
                        console.error(err.code, err.details,err);
                        this.paused = true;
                        console.log("Update setting and hit Apply to try again");
                    } else {
                        console.error(err);
                        this.paused = true;
                    }
                })
                .on('data', (data: any) => this.handleRecognitionEvent(data));

            this.recognizeStream.write(streamingRecognizeRequest);
        }
    }

    public write(pcm: Buffer) {
        if (this.paused) { return}
        if (this.dead || this.recognizeStream?.closed || this.recognizeStream?.destroyed) {
            console.error('Tried to write to a dead GoogleV2 instance');
            this.recognizeStream?.destroy();
            this.speech?.close();
            console.error('Attempting to restart server');
            this.restart();
            return;
        }
        this.recognizeStream?.write({ audio: pcm });
    }

    public destroy() {
        this.dead = true;
        this.recognizeStream?.destroy();
        this.speech?.close();
        delete this.speech;
    }
}
