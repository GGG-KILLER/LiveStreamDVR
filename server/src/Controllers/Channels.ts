import express from "express";
import { generateStreamerList } from "../Helpers/StreamerList";
import { TwitchChannel } from "../Core/TwitchChannel";
import { ChannelConfig, VideoQuality } from "../../../common/Config";
import { ApiChannelResponse, ApiChannelsResponse, ApiErrorResponse } from "../../../common/Api/Api";

export async function ListChannels(req: express.Request, res: express.Response): Promise<void> {

    const { channels, total_size } = generateStreamerList();

    const streamer_list = await Promise.all(channels.map(async c => await c.toAPI()));
    
    res.send({
        data: {
            streamer_list: streamer_list,
            total_size: total_size,
            // free_size: fs.statSync(TwitchHelper.vodFolder()).size,
            free_size: -1, // broken until further notice
        },
        status: "OK",
    } as ApiChannelsResponse);
}

export async function GetChannel(req: express.Request, res: express.Response): Promise<void> {

    const channel = TwitchChannel.getChannelByLogin(req.params.login);

    if (!channel) {
        res.status(400).send({
            status: "ERROR",
            message: "Channel not found",
        } as ApiErrorResponse);
        return;
    }

    res.send({
        data: await channel.toAPI(),
        status: "OK",
    } as ApiChannelResponse);

}

export function UpdateChannel(req: express.Request, res: express.Response): void {

    const channel = TwitchChannel.getChannelByLogin(req.params.login);

    if (!channel || !channel.login) {
        res.status(400).send({
            status: "ERROR",
            message: "Channel not found",
        } as ApiErrorResponse);
        return;
    }

    const formdata: {
        quality: string;
        match: string;
        download_chat: boolean;
        burn_chat: boolean;
        no_capture: boolean;
    } = req.body;

    const quality        = formdata.quality ? formdata.quality.split(" ") as VideoQuality[] : [];
    const match          = formdata.match ? formdata.match.split(",").map(m => m.trim()) : [];
    const download_chat  = formdata.download_chat !== undefined;
    const burn_chat      = formdata.burn_chat !== undefined;
    const no_capture     = formdata.no_capture !== undefined;

    const channel_config: ChannelConfig = {
        login: channel.login,
        quality: quality,
        match: match,
        download_chat: download_chat,
        burn_chat: burn_chat,
        no_capture: no_capture,
    };

    channel.update(channel_config);

    res.send({
        status: "OK",
    });

}

export function DeleteChannel(req: express.Request, res: express.Response): void {

    const channel = TwitchChannel.getChannelByLogin(req.params.login);

    if (!channel || !channel.login) {
        res.status(400).send({
            status: "ERROR",
            message: "Channel not found",
        } as ApiErrorResponse);
        return;
    }

    channel.delete();

    res.send({
        status: "OK",
    });

}

export async function AddChannel(req: express.Request, res: express.Response): Promise<void> {

    const formdata: {
        login: string;
        quality: string;
        match: string;
        download_chat: boolean;
        burn_chat: boolean;
        no_capture: boolean;
    } = req.body;

    const channel_config: ChannelConfig = {
        login: formdata.login,
        quality: formdata.quality ? formdata.quality.split(" ") as VideoQuality[] : [],
        match: formdata.match ? formdata.match.split(",").map(m => m.trim()) : [],
        download_chat: formdata.download_chat !== undefined,
        burn_chat: formdata.burn_chat !== undefined,
        no_capture: formdata.no_capture !== undefined,
    };

    const channel = TwitchChannel.getChannelByLogin(channel_config.login);

    if (channel) {
        res.status(400).send({
            status: "ERROR",
            message: "Channel already exists",
        } as ApiErrorResponse);
        return;
    }

    const new_channel = await TwitchChannel.create(channel_config);

    res.send({
        data: new_channel,
        status: "OK",
    });

}