import { ChildProcessWithoutNullStreams, spawn } from "child_process";

export interface VlcOptions{
    streamUrl: string;
    vlcPath?: string;
    fullscreen?: boolean;
}

export class Vlc{
    private streamUrl: string;
    private vlcPath: string;
    private fullscreen: boolean;

    private vlcProcess: ChildProcessWithoutNullStreams | undefined;

    constructor(options: VlcOptions){
        this.streamUrl = options.streamUrl;
        this.vlcPath = options.vlcPath ?? "vlc";
        this.fullscreen = options.fullscreen ?? false;
    }
    
    public async start(){
        if(this.vlcProcess !== undefined){
            console.log(`[vlc]: Already running VLC!`);
        }
        
        try {
            this.vlcProcess = spawn(
                this.vlcPath, 
                [
                    this.streamUrl,
                    ...(this.fullscreen ? [ "-f" ] : []),
                ],
                {
                    detached: false,
                },
            );
        
            this.vlcProcess?.stderr?.on("data", (data: Buffer) => {
                const message = data.toString();
                console.log(`[vlc]: ${message}`);
            });
        
            this.vlcProcess?.on("close", (code) => {
                console.log(`[vlc]: process exited with code ${code}`);
            
                this.stop();
                setTimeout(() => {
                    this.start();
                }, 5000);
            });

            this.vlcProcess?.on("error", (error) => {
                console.log(`[vlc]: error: ${error}`);
            });
        } catch (error) {
            console.error(`[vlc]: error: `, error);
        }
    }

    public stop(){
        this.vlcProcess?.kill();
        this.vlcProcess = undefined;
    }
}