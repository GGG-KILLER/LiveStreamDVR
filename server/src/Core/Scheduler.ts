import cron from "cron";
import { Sleep } from "../Helpers/Sleep";
import path from "node:path";
import fs from "node:fs";
import * as CronController from "../Controllers/Cron";
import { BaseConfigDataFolder } from "./BaseConfig";
import { Config } from "./Config";
import { Log, LOGLEVEL } from "./Log";
import { TwitchChannel } from "./Providers/Twitch/TwitchChannel";
import { TwitchVOD } from "./Providers/Twitch/TwitchVOD";

export class Scheduler {

    public static jobs: Record<string, cron.CronJob> = {};

    public static schedule(name: string, cronTime: string, callback: () => void): cron.CronJob {
        if (this.hasJob(name)) {
            this.removeJob(name);
        }
        const job = new cron.CronJob(cronTime, callback);
        this.jobs[name] = job;
        job.start();
        return job;
    }

    public static defaultJobs() {
        // # 0 5 * * 1 curl http://localhost:8080/api/v0/cron/sub
        // 0 */12 * * * curl http://localhost:8080/api/v0/cron/check_muted_vods
        // 10 */12 * * * curl http://localhost:8080/api/v0/cron/check_deleted_vods

        // no blocks in testing
        if (process.env.NODE_ENV === "test") return;

        console.log("Scheduler: default jobs");

        this.schedule("check_muted_vods", "0 */12 * * *", () => {
            if (!Config.getInstance().cfg<boolean>("schedule_muted_vods")) return;
            CronController.fCheckMutedVods();
        });

        this.schedule("check_deleted_vods", "10 */12 * * *", () => {
            if (!Config.getInstance().cfg<boolean>("schedule_deleted_vods")) return;
            CronController.fCheckDeletedVods();
        });

        this.schedule("match_vods", "30 */12 * * *", () => {
            if (!Config.getInstance().cfg<boolean>("schedule_match_vods")) return;
            CronController.fMatchVods();
        });

        // once a day
        this.schedule("clipdownload", "0 0 * * *", this.scheduleClipDownload);

        // this.schedule("* * * * *", () => {
        //     console.log("Cronjob ran", new Date().toISOString());
        // });

    }

    public static hasJob(name: string) {
        return this.jobs[name] !== undefined;
    }

    public static removeJob(name: string) {
        if (this.hasJob(name)) {
            this.jobs[name].stop();
            delete this.jobs[name];
        }
    }

    public static removeAllJobs() {
        for (const job in this.jobs) {
            this.removeJob(job);
        }
    }

    public static restartScheduler() {
        this.removeAllJobs();
        this.defaultJobs();
    }

    public static async scheduleClipDownload() {

        if (!Config.getInstance().cfg<boolean>("scheduler.clipdownload.enabled")) return;

        Log.logAdvanced(LOGLEVEL.INFO, "Scheduler", "Scheduler: scheduleClipDownload - start");

        const amount = Config.getInstance().cfg<number>("scheduler.clipdownload.amount");
        const days = Config.getInstance().cfg<number>("scheduler.clipdownload.age");
        const logins = Config.getInstance().cfg<string>("scheduler.clipdownload.channels").split(",").map(s => s.trim());

        for (const login of logins) {
            const channel = TwitchChannel.getChannelByLogin(login);
            const clips = await channel?.getClips(days);

            if (clips) {

                for (let i = 0; i < Math.min(amount, clips.length); i++) {
                    const clip = clips[i];

                    const basefolder = path.join(BaseConfigDataFolder.saved_clips, "scheduler", login);
                    if (!fs.existsSync(basefolder)) {
                        fs.mkdirSync(basefolder, { recursive: true });
                    }

                    const out = path.join(basefolder, clip.id);

                    if (fs.existsSync(out + ".mp4")) {
                        Log.logAdvanced(LOGLEVEL.WARNING, "scheduler", `Clip ${clip.id} already exists`);
                        continue;
                    }

                    try {
                        await TwitchVOD.downloadClip(clip.id, `${out}.mp4`, "best");
                    } catch (error) {
                        Log.logAdvanced(LOGLEVEL.ERROR, "scheduler", `Failed to download clip ${clip.id}: ${(error as Error).message}`);
                        return;
                    }

                    try {
                        await TwitchVOD.downloadChatTD(clip.id, out + ".json");
                    } catch (error) {
                        Log.logAdvanced(LOGLEVEL.ERROR, "scheduler", `Failed to download chat for clip ${clip.id}: ${(error as Error).message}`);
                        return;
                    }

                    Log.logAdvanced(LOGLEVEL.INFO, "scheduler", `Downloaded clip ${clip.id}`);

                    await Sleep(5000); // hehe

                }

                await channel?.findClips();

            }

        }

        Log.logAdvanced(LOGLEVEL.INFO, "Scheduler", "Scheduler: scheduleClipDownload - end");

    }

}