import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import fs from "fs";
import { differenceInSeconds, format } from "date-fns";
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
    minRecordingTime?: number;
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
    private minRecordingTime: number;

    private ffmpegProcess: ChildProcessWithoutNullStreams | undefined;
    private recordEventTime: Date | undefined;
    private currentFile: string | undefined;

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
        this.minRecordingTime = options.minRecordingTime || 30;
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
                    "-reset_timestamps", this.resetTimestamps,
                    this.segmentFilename,
                ],
                {
                    detached: false,
                    cwd: this.workingDirectory,
                },
            );
        
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

            this.ffmpegProcess?.on("error", (error) => {
                console.log(`ffmpeg error: ${error}`);
            });
        } catch (error) {
            console.error(`fmpeg error: `, error);
        }
    }

    public async stopRecording(){
        this.ffmpegProcess?.kill();
    }

    public saveRecording(){
        this.recordEventTime = new Date();
    }


    private onFileCreated(filename: string){
        if(this.recordEventTime !== undefined && this.currentFile !== undefined){
            const destinationDir = path.join(this.recordingDirectory, format(this.recordEventTime, "yyyy.MM.dd"));
            if (!fs.existsSync(destinationDir)) {
                fs.mkdirSync(destinationDir, { recursive: true });
            }

            const sourcePath = path.join(this.workingDirectory, this.currentFile);
            const destinationPath = path.join(destinationDir, format(this.recordEventTime, "HH.mm.ss") + ".mp4");

            this.copyWhenReady(sourcePath, destinationPath);

            console.log(`File '${sourcePath}' copied to '${destinationPath}'!`);

            const currentTime = new Date();
            if(differenceInSeconds(currentTime, this.recordEventTime) < this.minRecordingTime){
                this.recordEventTime = currentTime;
            }else{
                this.recordEventTime = undefined;
            }
        }
        
        this.currentFile = filename;

        //console.log(`ffmpeg writes to '${filename}'`);

    }

    private async copyWhenReady(sourcePath: string, destinationPath: string, oldSize?: number) {
        const newSize = fs.statSync(sourcePath).size;
        
        if(oldSize == undefined || oldSize !== newSize){
            setTimeout(() => {
                this.copyWhenReady(sourcePath, destinationPath, newSize);
            }, 1000);
        }else{
            fs.copyFileSync(sourcePath, destinationPath);
        }
    }
}