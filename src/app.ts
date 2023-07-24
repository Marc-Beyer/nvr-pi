import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { format, startOfMonth, endOfMonth, getDaysInMonth, subDays, addMonths, parse, isValid } from "date-fns";

import Day from "./interfaces.js";
import { Recorder } from "./recorder.js";

// Get envirement variables
dotenv.config();

const PORT = process.env.PORT || 3000;

const USER = process.env.USERNAME || "";
const PASSWORD = process.env.PASSWORD || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || `http://localhost:${PORT}`;

const RECORDING_PATH = process.env.RECORDING_PATH || "/media/cctv";
const TMP_RECORDING_PATH = process.env.TMP_RECORDING_PATH || "/media/.cctv-tmp";
const STREAM_URL = process.env.STREAM_URL || "rtsp://localhost";
const FFMPEG_PATH = process.env.FFMPEG_PATH || "ffmpeg";

const SEGMENT_TIME = process.env.SEGMENT_TIME;
const MIN_RECORDING_TIME = parseInt(process.env.MIN_RECORDING_TIME || "");
const OPTIONS_URL = process.env.OPTIONS_URL;

// Create the express app
const dirname = path.dirname(new URL(import.meta.url).pathname);
const app = express();
const publicFolderPath = path.join(dirname, "../public");

app.set("view engine", "ejs");
app.set("views", publicFolderPath);
app.use(bodyParser.json());

// Start the recoarding
const recorder = new Recorder({ 
    streamUrl: STREAM_URL, 
    workingDirectory: TMP_RECORDING_PATH, 
    recordingDirectory: RECORDING_PATH, 
    segmentTime: SEGMENT_TIME,
    minRecordingTime: (isNaN(MIN_RECORDING_TIME) ? undefined : MIN_RECORDING_TIME),
    ffmpegPath: FFMPEG_PATH,
});
recorder.startRecording();

function getFolderNames(path: string): string[] {
    return fs
        .readdirSync(path, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
}

function getFileNames(path: string): string[] {
    try {
        return fs
            .readdirSync(path, { withFileTypes: true })
            .filter((file) => file.name.toLowerCase().endsWith(".mp4"))
            .map((file) => file.name);
    } catch {
        return [];
    }
}

app.get("/", (req, res) => {
    const addMonthsParam: string | undefined = req.query.addMonths as string | undefined;
    let monthToAdd = parseInt(addMonthsParam || "");
    monthToAdd = isNaN(monthToAdd) ? 0 : monthToAdd;

    const currentTime = addMonths(new Date(), monthToAdd);
    const firstDayOfMonth = startOfMonth(currentTime);
    const lastDayOfLastMonth = parseInt(format(endOfMonth(subDays(firstDayOfMonth, 1)), "dd"));
    const dayOfTheWeek = parseInt(format(firstDayOfMonth, "i"));
    const nrOfDays = getDaysInMonth(currentTime);
    const month = format(firstDayOfMonth, "MMMM yyyy");

    const recordingDays = getFolderNames(RECORDING_PATH);
    const dayAndMonth = format(currentTime, "yyyy.MM.");
    const lastDayAndMonth = format(addMonths(currentTime, -1), "yyyy.MM.");

    let days: Day[] = [];
    if (dayOfTheWeek != 7) {
        for (let index = dayOfTheWeek; index > 0; index--) {
            const nr = lastDayOfLastMonth - index + 1;
            const date = lastDayAndMonth + (nr < 10 ? "0" + nr : nr);
            days.push({
                nr,
                isThisMonth: false,
                hasRecording: false,
                date,
            });
        }
    }
    for (let index = 1; index < nrOfDays + 1; index++) {
        const date = dayAndMonth + (index < 10 ? "0" + index : index);
        days.push({
            nr: index,
            isThisMonth: true,
            hasRecording: recordingDays.includes(date),
            date,
        });
    }

    res.render("index", { 
        days, 
        month, 
        monthToAdd,
        optionsUrl: OPTIONS_URL,
        showTodayBtn: (monthToAdd !== 0),
    });
});

app.get("/recordings", (req, res) => {
    const date: string | undefined = req.query.date as string | undefined;
    if (date === undefined) {
        return res.status(400).json({ error: "Date is missing." });
    }
    const parsedDate: Date = parse(date, "yyyy.MM.dd", new Date());

    if (!isValid(parsedDate)) {
        return res.status(400).json({ error: "Wrong date." });
    }

    let filenames = getFileNames(path.join(RECORDING_PATH, format(parsedDate, "yyyy.MM.dd")));

    const recordings: { [hour: string]: string[] } = {};
    for (let index = 0; index < filenames.length; index++) {
        const hour = filenames[index].split('.')[0];
        if (!recordings[hour]) {
            recordings[hour] = [];
        }
        recordings[hour].push(filenames[index]);
    }

    res.render("recordings", { 
        date: format(parsedDate, "dd.MM.yyyy"), 
        day: format(parsedDate, "eeee"), 
        recordingPath: path.join("/recording", format(parsedDate, "yyyy.MM.dd")), 
        recordings,
    });
});

app.use(express.static(publicFolderPath));
app.use("/recording", express.static(RECORDING_PATH));

// Handle a post request at /event
app.post("/event", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const origin = req.get('Origin');
    const requestData = req.body;
    const formattedTime = format(new Date(), "yyyy.MM.dd:HH.mm.ss");
    
    let username = origin;
    let password = "";

    if (origin !== ALLOWED_ORIGIN && (USER !== "" || PASSWORD !== "")) {
        if (!authHeader) {
            console.log(`[${formattedTime}] Authorization header missing.`, requestData);
            return res.status(401).json({ error: "Authorization header missing." });
            res.redirect('https://www.example.com');
        }

        const encodedCredentials = authHeader.split(" ")[1];
        const decodedCredentials = Buffer.from(encodedCredentials, "base64").toString();
        [username, password] = decodedCredentials.split(":");

        if (username !== USER || password !== PASSWORD) {
            console.log(`[${formattedTime}] Wrong credentials.`, username, password, requestData);
            return res.status(401).json({ error: "Wrong credentials." });
        }
    }

    recorder.saveRecording();
    console.log(`[${formattedTime}] New event`, username, requestData);

    // Send a redirect back to the client
    res.redirect('/');
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
