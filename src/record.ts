import { Recorder, RecorderEvents } from "rtsp-video-recorder";

console.log("Started Recorder!");

export default async function record(segmentTime: number | string, destination: string) {
    new Recorder("rtsp://192.168.178.101:554/live/main", destination, {
        title: "CCTV Camera",
        segmentTime,
    })
        .on(RecorderEvents.START, () => {
            console.log("[R1] START");
        })
        .on(RecorderEvents.STARTED, () => {
            console.log("[R1] STARTED");
        })
        .on(RecorderEvents.STOP, () => {
            console.log("[R1] STOP");
        })
        .on(RecorderEvents.STOPPED, () => {
            console.log("[R1] STOPPED");
        })
        .on(RecorderEvents.FILE_CREATED, () => {
            console.log("[R1] FILE_CREATED");
        })
        .on(RecorderEvents.ERROR, () => {
            console.log("[R1] ERROR");
        })
        .on(RecorderEvents.SPACE_FULL, () => {
            console.log("[R1] SPACE_FULL");
        })
        .start();
}
