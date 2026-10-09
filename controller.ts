import type {ControllerPluginContext} from "@clusterio/controller";
import {ChatEvent} from './index.js';
import * as Discord from 'discord.js';

const MAX_DISCORD_MESSAGE_LENGTH = 1950;
const ACTION_VERBS: Record<string, string> = {
    JOIN: 'joined the game',
    LEAVE: 'left the game',
    KICK: 'was kicked from the game',
    BAN: 'was banned from the game',
};

export default async function(context: ControllerPluginContext) {
    const {controller, plugin, logger} = context;

    let client: Discord.Client | null = null;

    const clientDestroy = async () => {
        const old = client;
        client = null;
        if (old) await old.destroy();
    };

    const connect = async () => {
        await clientDestroy();

        const token = controller.config.get('ClusterChatSync.discord_bot_token') as string | undefined;

        if (!token) {
            logger.error('[Chat Sync] Discord bot token not configured.');
            return;
        }

        const discordClient = new Discord.Client({intents: [
            Discord.GatewayIntentBits.Guilds,
            Discord.GatewayIntentBits.GuildMessages,
            Discord.GatewayIntentBits.MessageContent,
        ]});

        client = discordClient;

        logger.info('[Chat Sync] Logging into Discord.');

        try {
            await discordClient.login(token);
        } catch (err) {
            logger.error(`[Chat Sync] Discord login error:\n${(err as Error).stack}`);
            await clientDestroy();
            return;
        }

        logger.info('[Chat Sync] Logged in Discord successfully.');
    };

    const sendMessage = async (instanceName: string, message: string) => {
        const discordClient = client;
        if (!discordClient) return;

        const mapping = controller.config.get('ClusterChatSync.discord_channel_mapping') as Record<string, string>;
        const channelId = mapping?.[instanceName];
        if (!channelId) return;

        let channel: Discord.Channel | null;

        try {
            channel = await discordClient.channels.fetch(channelId);
        } catch (err) {
            if ((err as {code?: number}).code !== 10003) {
                logger.error(`[Chat Sync] Discord channel fetch error:\n${(err as Error).stack}`);
            }
            return;
        }

        if (channel === null || !channel.isSendable()) {
            logger.error(`[Chat Sync] Discord Channel ID ${channelId} is not a usable channel.`);
            return;
        }

        let nrcMsg = message;

        if (controller.config.get('ClusterChatSync.datetime_on_message')) {
            const now = new Date();
            const p = (n: number) => String(n).padStart(2, '0');
            const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())} ${p(now.getHours())}${p(now.getMinutes())}${p(now.getSeconds())}`;
            nrcMsg = `${stamp} ${nrcMsg}`;
        }

        const send = (content: string) => channel.send({content, allowedMentions: {parse: []}});

        if (nrcMsg.length <= MAX_DISCORD_MESSAGE_LENGTH) {
            await send(nrcMsg);
            return;
        }

        let remaining = nrcMsg;

        while (remaining.length > 0) {
            let chunk = remaining.slice(0, MAX_DISCORD_MESSAGE_LENGTH);
            const lastSpace = chunk.lastIndexOf(' ');

            if (lastSpace > 0) {
                chunk = chunk.slice(0, lastSpace);
                remaining = remaining.slice(lastSpace).trim();
            } else {
                remaining = remaining.slice(MAX_DISCORD_MESSAGE_LENGTH).trim();
            }

            await send(chunk);
        }
    };

    controller.handle(ChatEvent, async (request: ChatEvent) => {
        const {instanceName, action, content} = request;

        if (action === 'CHAT' || action === 'SHOUT') {
            const nrc = content.replace(/\[special-item=.*?\]/g, '<blueprint>').replace(/<@/g, '<@\u200c>');
            const index = nrc.indexOf(':');
            const username = index === -1 ? nrc.trim() : nrc.slice(0, index);
            const msg = index === -1 ? '' : nrc.slice(index + 1).trim();
            await sendMessage(instanceName, `**\`${username}\`**: ${msg}`);
            return;
        }

        const verb = ACTION_VERBS[action];

        if (verb) {
            await sendMessage(instanceName, `**\`${content.trim()}\`** ${verb}`);
        }
    });

    controller.config.on('fieldChanged', (field) => {
        if (field === 'ClusterChatSync.discord_bot_token') {
            connect().catch(err => {
                logger.error(`[Chat Sync] Discord bot token:\n${(err as Error).stack}`);
            });
        }
    });

    controller.hooks.shutdown.attach(plugin.name, async () => {
        await clientDestroy();
    });

    await connect();
}
