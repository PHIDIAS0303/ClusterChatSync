import { Client, GatewayIntentBits } from 'discord.js';
import fetch from 'node-fetch';
import { BaseControllerPlugin } from '@clusterio/controller';
import { InstanceActionEvent } from './info';
import { ChatEvent } from './message';

const MAX_DISCORD_MESSAGE_LENGTH = 1950;
const MIN_CONFIDENCE_SCORE = 10.0;

interface TranslationResult {
    action: boolean;
    passage: string[];
}

interface LanguageDetection {
    confidence: number;
    language: string;
    [key: string]: unknown;
}

class LibreTranslateAPI {
    private url: string;
    private apiKey: string;
    private logger: Console;
    private allowedLanguages: string[] = [];

    constructor(url: string, apiKey: string, logger: Console = console) {
        if (!url || !apiKey) {
            logger.error('[Chat Sync] LibreTranslate API configuration is incomplete.');
        }
        try {
            new URL(url);
        } catch {
            logger.error('[Chat Sync] LibreTranslate url is invalid');
        }
        this.url = url.endsWith('/') ? url : url + '/';
        this.apiKey = apiKey;
        this.logger = logger;
    }

    private async handleResponse(response: fetch.Response): Promise<any> {
        if (!response.ok) {
            this.logger.error(`[Chat Sync] API Request got HTTP ${response.status}`);
        }
        return response.json();
    }

    async init(): Promise<void> {
        try {
            const languages = await this.handleResponse(
                await fetch(`${this.url}languages?api_key=${this.apiKey}`, { method: 'GET' })
            );
            this.allowedLanguages = languages?.[0]?.targets || [];
        } catch (err) {
            this.logger.error(`[Chat Sync] failed to initialize languages:\n${err.stack}`);
        }
    }

    async translateRequest(q: string, source: string, target: string): Promise<string | undefined> {
        try {
            const response = await this.handleResponse(
                await fetch(`${this.url}translate`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ q, api_key: this.apiKey, source, target })
                })
            );
            return response?.translatedText;
        } catch (err) {
            this.logger.error(`[Chat Sync] Translation failed:\n${err.stack}`);
        }
    }

    async detectLanguage(q: string): Promise<LanguageDetection | undefined> {
        try {
            const response = await this.handleResponse(
                await fetch(`${this.url}detect`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ q, api_key: this.apiKey })
                })
            );
            return response?.[0];
        } catch (err) {
            this.logger.error(`[Chat Sync] Detection failed:\n${err.stack}`);
        }
    }

    async translate(query: string, targetLanguages: string[]): Promise<TranslationResult> {
        const result: TranslationResult = { action: false, passage: [] };
        try {
            const detection = await this.detectLanguage(query);
            if (!detection || typeof detection !== 'object' || !detection.confidence || !detection.language) {
                this.logger.warn('[Chat Sync] Invalid language detection result:', detection);
                return result;
            }

            if (detection.confidence > MIN_CONFIDENCE_SCORE) {
                for (const targetLang of targetLanguages) {
                    if (
                        !((detection.language === 'zh-Hans' || detection.language === 'zh-Hant') && 
                          (targetLang === 'zh-Hans' || targetLang === 'zh-Hant')) &&
                        detection.language !== targetLang &&
                        this.allowedLanguages.includes(detection.language) &&
                        this.allowedLanguages.includes(targetLang)
                    ) {
                        result.action = true;
                        const translated = await this.translateRequest(query, detection.language, targetLang);
                        if (translated) {
                            result.passage.push(`[${detection.language} -> ${targetLang}] ${translated}`);
                        }
                    }
                }
            }
        } catch (err) {
            this.logger.error(`[Chat Sync] translation failed:\n${err.stack}`);
        }
        return result;
    }
}

interface ControllerConfig {
    get(key: string): any;
    on(event: string, callback: (field: string, curr: any, prev: any) => void);
}

interface InstanceInfo {
    name: string;
    id: number;
    sendTo(target: string | { instanceId: number }, message: any): void;
}

export class ControllerPlugin extends BaseControllerPlugin {
    private client: Client | null = null;
    private translator?: LibreTranslateAPI;
    private translator_language: string[] = [];

    constructor(
        private controller: { 
            config: ControllerConfig;
            handle(event: any, handler: Function): void;
            logger: Console;
        },
        private instance: InstanceInfo
    ) {
        super();
    }

    async init(): Promise<void> {
        this.controller.config.on('fieldChanged', (field: string, curr: any, prev: any) => {
            if (field === 'ClusterChatSync.discord_bot_token') {
                this.connect().catch(err => {
                    this.controller.logger.error(`[Chat Sync] Discord bot token:\n${err.stack}`);
                });
            }
        });
        this.controller.handle(InstanceActionEvent, this.handleInstanceAction.bind(this));
        await this.connect();
    }

    private async clientDestroy(): Promise<void> {
        if (this.client) {
            this.client.destroy();
            this.client = null;
        }
    }

    private async connect(): Promise<void> {
        await this.clientDestroy();
        const token = this.controller.config.get('ClusterChatSync.discord_bot_token');
        if (!token) {
            this.controller.logger.error('[Chat Sync] Discord bot token not configured.');
            return;
        }

        this.client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.MessageContent
            ]
        });

        this.controller.logger.info('[Chat Sync] Logging into Discord.');
        try {
            await this.client.login(token);
        } catch (err) {
            this.controller.logger.error(`[Chat Sync] Discord login error:\n${err.stack}`);
            await this.clientDestroy();
            return;
        }

        this.controller.logger.info('[Chat Sync] Logged in Discord successfully.');
        
        if (this.controller.config.get('ClusterChatSync.use_libretranslate')) {
            this.translator = new LibreTranslateAPI(
                this.controller.config.get('ClusterChatSync.libretranslate_url'),
                this.controller.config.get('ClusterChatSync.libretranslate_key'),
                this.controller.logger
            );
            await this.translator.init();
            this.translator_language = this.controller.config.get('ClusterChatSync.libretranslate_language')
                .trim()
                .split(/\s+/) || ['zh-Hant', 'en'];
        }
    }

    async onShutdown(): Promise<void> {
        await this.clientDestroy();
    }

    private async sendMessage(request: { instanceName: string }, message: string): Promise<void> {
        if (!this.client) return;

        const channelMapping = this.controller.config.get('ClusterChatSync.discord_channel_mapping');
        const channel_id = channelMapping[request.instanceName];
        if (!channel_id) return;

        try {
            const channel = await this.client.channels.fetch(channel_id);
            if (!channel || !channel.isTextBased()) {
                this.controller.logger.error(`[Chat Sync] Discord Channel ID ${channel_id} not found or not text channel.`);
                return;
            }

            if (this.controller.config.get('ClusterChatSync.datetime_on_message')) {
                const now = new Date();
                const timestamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')} ` +
                                 `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
                message = `${timestamp} ${message}`;
            }

            while (message.length > 0) {
                let chunk = message.slice(0, MAX_DISCORD_MESSAGE_LENGTH);
                const lastSpace = chunk.lastIndexOf(' ');

                if (lastSpace !== -1 && chunk.length === MAX_DISCORD_MESSAGE_LENGTH) {
                    chunk = chunk.slice(0, lastSpace);
                    message = message.slice(lastSpace).trim();
                } else {
                    message = message.slice(chunk.length).trim();
                }

                await channel.send(chunk, { allowedMentions: { parse: [] } });
            }
        } catch (err: any) {
            if (err.code !== 10003) { // Unknown Channel error
                this.controller.logger.error(`[Chat Sync] Discord channel error:\n${err.stack}`);
            }
        }
    }

    private async handleInstanceAction(request: { 
        action: string; 
        content: string; 
        instanceName: string 
    }): Promise<void> {
        if (request.action !== 'CHAT' && request.action !== 'SHOUT') return;

        const sanitizedContent = request.content
            .replace(/\[special-item=.*?\]/g, '<blueprint>')
            .replace(/<@/g, '<@\u200c>');
        const colonIndex = sanitizedContent.indexOf(':');
        const username = sanitizedContent.substring(0, colonIndex);
        const message = sanitizedContent.substring(colonIndex + 1).trim();

        await this.sendMessage(request, `**\`${username}\`**: ${message}`);

        if (this.translator && this.controller.config.get('ClusterChatSync.use_libretranslate')) {
            const result = await this.translator.translate(message, this.translator_language);
            if (result?.action) {
                await this.sendMessage(request, `**\`${username}\`**: ${result.passage.join('\n')}`);
                this.instance.sendTo(
                    { instanceId: this.instance.id }, 
                    new ChatEvent(this.instance.name, `[color=255,255,255]\`${username}\`: ${result.passage.join('\n')}[/color]`)
                );
            }
        }
    }
}
