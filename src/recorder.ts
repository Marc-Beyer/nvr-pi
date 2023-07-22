import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import fs from "fs";
import { format } from "date-fns";
import path from "path";

export interface RecorderOptions{
    streamUrl: string;
    workingDirectory: string;
    recordingDirectory: string;
    segmentTime?: number | string;
    segmentWrap?: number | string;
    segmentFilename?: string;
    videoCodec?: string; 
    audioCodec?: string | null; 
    segmentFormat?: string;
    resetTimestamps?: number | string;
}

export class Recorder{
    private streamUrl: string;
    private workingDirectory: string;
    private recordingDirectory: string;
    private segmentTime: string;
    private segmentWrap: string;
    private segmentFilename: string;
    private videoCodec: string;
    private audioCodec: string | null;
    private segmentFormat: string;
    private resetTimestamps: string;

    private ffmpegProcess: ChildProcessWithoutNullStreams | undefined;
    private saveNextRecording: boolean = false;

    constructor(options: RecorderOptions){
        this.streamUrl = options.streamUrl;
        this.workingDirectory = options.workingDirectory;
        this.recordingDirectory = options.recordingDirectory;
        this.segmentTime = (options.segmentTime || 60).toString();
        this.segmentWrap = (options.segmentWrap || 10).toString();
        this.segmentFilename = (options.segmentFilename || "continuous%03d.mp4");
        this.videoCodec = (options.videoCodec || "copy");
        this.audioCodec = (options.audioCodec === undefined ? "aac" : options.audioCodec);
        this.segmentFormat = (options.segmentFormat || "mp4");
        this.resetTimestamps = (options.resetTimestamps || 1).toString();
    }

    public async startRecording(){
        if(this.ffmpegProcess !== undefined){
            throw new Error("Already recording!");
        }

        try {
            this.ffmpegProcess = spawn(
                "ffmpeg", 
                [
                    "-rtsp_transport", "tcp",
                    "-i", this.streamUrl,
                    "-c:v", this.videoCodec,
                    ...(this.audioCodec === null ? "-an" : ["-c:a", this.audioCodec]),
                    "-f", "segment",
                    "-segment_time", this.segmentTime, 
                    "-segment_wrap", this.segmentWrap,
                    "-segment_format", this.segmentFormat,
                    "-reset_timestamps", "1",
                    this.segmentFilename,
                ],
                {
                    detached: false,
                    cwd: this.workingDirectory,
                },
            );
            
            this.ffmpegProcess?.stdout?.on("data", (data) => {
                console.log(`ffmpeg stdout: ${data}`);
            });
        
            this.ffmpegProcess?.stderr?.on("data", (data: Buffer) => {
                const message = data.toString();
                const writingFileRegex = /.*Opening '.*' for writing/g;
                if(writingFileRegex.test(message)){
                    this.onFileCreated(message.split("'")[1]);
                }
            });
        
            this.ffmpegProcess?.on("close", (code) => {
                console.log(`ffmpeg process exited with code ${code}`);
            });
        } catch (error) {
            console.error(`ffmpeg error`, error);
        }
    }

    public async stopRecording(){
        this.ffmpegProcess?.kill();
    }

    public saveRecording(){
        console.log(`Save next recording! ${format( new Date(), "HH.mm.ss")}`);
        
        this.saveNextRecording = true;
    }

    private onFileCreated(filename: string){

        if(this.saveNextRecording){
            const currentDate = new Date();
            const destinationDir = path.join(this.recordingDirectory, format(currentDate, "yyyy.MM.dd"));
            if (!fs.existsSync(destinationDir)) {
                fs.mkdirSync(destinationDir, { recursive: true });
            }

            const sourcePath = path.join(this.workingDirectory, filename);
            const destinationPath = path.join(destinationDir, format(currentDate, "HH.mm.ss") + ".mp4");

            fs.copyFileSync(sourcePath, destinationPath);
    
            console.log(`File '${sourcePath}' copied to '${destinationPath}'!`);
            this.saveNextRecording = false;
        }
    }
}