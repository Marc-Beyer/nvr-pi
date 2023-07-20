import express, { Request, Response } from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import { format, startOfMonth, endOfMonth, getDaysInMonth, subDays, addMonths, parse, isValid } from "date-fns";

import record from "./record.js";
import Day from "./interfaces.js";

// Get envirement variables
dotenv.config();

const PORT = process.env.PORT || 3000;
const USER = process.env.USERNAME || "";
const PASSWORD = process.env.PASSWORD || "";
const VIDEO_PATH = process.env.VIDEO_PATH || "/media/CCTV";

// Create the express app
const dirname = path.dirname(new URL(import.meta.url).pathname);
const app = express();
const publicFolderPath = path.join(dirname, "../public");

app.set("view engine", "ejs");
app.set("views", publicFolderPath);
app.use(bodyParser.json());

//record("30s", VIDEO_PATH);

function getFolderNames(path: string): string[] {
    return fs
        .readdirSync(path, { withFileTypes: true })
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => dirent.name);
}

function getFileNames(path: string): string[] {
    return fs
        .readdirSync(path, { withFileTypes: true })
        .filter((file) => file.name.toLowerCase().endsWith(".mp4"))
        .map((file) => file.name);
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
    
    const recordingDays = getFolderNames(VIDEO_PATH);
    console.log("recordingDays", recordingDays);
    const dayAndMonth = format(currentTime, "yyyy.MM.");
    const lastDayAndMonth = format(addMonths(currentTime, -1), "yyyy.MM.");

    let days: Day[] = [];
    if(dayOfTheWeek != 7){
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
    
    res.render("index", { days, month, monthToAdd });
});

app.get("/recordings", (req, res) => {
    const date: string | undefined = req.query.date as string | undefined;
    if(date === undefined){
        return res.status(400).json({ error: "Date is missing." });
    }
    const parsedDate: Date = parse(date, 'yyyy.MM.dd', new Date());

    if(!isValid(parsedDate)){
        return res.status(400).json({ error: "Wrong date." });
    }

    const recordings = getFileNames(path.join(VIDEO_PATH, format(parsedDate, "yyyy.MM.dd")))

    res.render("recordings", { date: format(parsedDate, "dd.MM.yyyy"), recordings });
});

app.get('/video/:id', (req, res) => {
    let videoId = req.params.id;
    videoId = videoId.substring(0, videoId.length-4);
  
    const parsedDate: Date = parse(videoId, 'dd.MM.yyyy:HH.mm.ss', new Date());
    console.log("videoId", videoId);
    console.log("parsedDate", parsedDate);

    if(!isValid(parsedDate)){
        return res.status(400).json({ error: "Wrong date." });
    }

    const videoPath = path.join(VIDEO_PATH, format(parsedDate, "yyyy.MM.dd/HH.mm.ss") + '.mp4');
    if(!fs.existsSync(videoPath)){
        return res.status(404).json({ error: "No recording found." });
    }

    const stream = fs.createReadStream(videoPath);
    stream.on('error', (err) => {
        console.error('Error sending file:', err);
        res.status(404).send('Video not found');
    });

    res.setHeader('Content-Type', 'video/mp4');
    stream.pipe(res);
});

app.use(express.static(publicFolderPath));

// Handle a post request at /event
app.post("/event", (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const requestData = req.body;
    const formattedTime = format(new Date(), 'yyyy.MM.dd:HH.mm.ss');

    let username = "user";
    let password = "";

    if (USER !== "" || PASSWORD !== "") {
        if (!authHeader) {
            console.log(`[${formattedTime}] Authorization header missing.`, requestData);
            return res.status(401).json({ error: "Authorization header missing." });
        }

        const encodedCredentials = authHeader.split(" ")[1];
        const decodedCredentials = Buffer.from(encodedCredentials, "base64").toString();
        [username, password] = decodedCredentials.split(":");

        if (username !== USER || password !== PASSWORD) {
            console.log(`[${formattedTime}] Wrong credentials.`, username, password, requestData);
            return res.status(401).json({ error: "Wrong credentials." });
        }
    }

    console.log(`[${formattedTime}] New event`, username, requestData);

    // Send a response back to the client
    res.json({ message: "Data received successfully!" });
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
