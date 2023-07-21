import type { ApiErrorResponse } from "@common/Api/Api";
import type express from "express";
import { GetUser } from "../Providers/Kick";

export async function KickAPIUser(
    req: express.Request,
    res: express.Response
): Promise<void> {
    const slug = req.params.slug;

    if (!slug) {
        res.status(400).send({ status: "ERROR", message: "Invalid slug" });
        return;
    }

    let user;

    try {
        user = await GetUser(slug);
    } catch (error) {
        res.status(400).send({
            status: "ERROR",
            message: `Error while fetching user data: ${
                (error as Error).message
            }`,
        } as ApiErrorResponse);
        return;
    }

    if (!user) {
        res.status(400).send({
            status: "ERROR",
            message: "User not found",
        } as ApiErrorResponse);
        return;
    }

    res.send({
        data: user,
        status: "OK",
    });
}
