'use strict';
const Discord = require('discord.js');
const {BaseControllerPlugin} = require('@clusterio/controller');
const {InstanceActionEvent} = require('./info.js');
const {ChatEvent} = require("./message.js");

const MAX_DISCORD_MESSAGE_LENGTH = 1950;
const MIN_CONFIDENCE_SCORE = 10.0;

class LibreTranslateAPI {
    constructor(url, apiKey, logger = console) {
        if (!url || !apiKey) this.logger.error('[Chat Sync] LibreTranslate API configuration is incomplete.');
        try {new URL(url);} catch { this.logger.error('[Chat Sync] LibreTranslate url is invalid'); }
        this.url = url.endsWith('/') ? url : url + '/';
        this.apiKey = apiKey;
        this.logger = logger;
    }

	async handleResponse(response) {
		if (!response.ok) this.logger.error(`[Chat Sync] API Request got HTTP ${response.status}`);
		return response.json();
	}

    async init() {
		try {
            this.allowedLanguages = (await this.handleResponse(
                await fetch(`${this.url}languages?api_key=${this.apiKey}`, {method: 'GET'})
            ))?.[0]?.targets || [];
        } catch (err) {
            this.logger.error(`[Chat Sync] failed to initialize languages:\n${err.stack}`);
            throw err; // Re-throw to handle it upstream
        }
	}

    async translateRequest(q, source, target) {
		try {
			return (await this.handleResponse(await fetch(`${this.url}translate`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({q: q, api_key: this.apiKey, source: source, target: target})})))?.translatedText;
		} catch (err) {
			this.logger.error(`[Chat Sync] Translation failed:\n${err.stack}`);
		}
	}

    async detectLanguage(q) {
		try {
			return (await this.handleResponse(await fetch(`${this.url}detect`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({q: q, api_key: this.apiKey})})))?.[0];
		} catch (err) {
			this.logger.error(`[Chat Sync] Detection failed:\n${err.stack}`);
		}
	}

    async translate(query, targetLanguages) {
        console.log(query);
        const result = {action: false, passage: []};

        try {
            const detection = await this.detectLanguage(query);

			if (!detection || typeof detection !== 'object' || !detection.confidence || !detection.language) {
				this.logger.warn('[Chat Sync] Invalid language detection result:', detection);
				return result;
			}

            if (detection.confidence > MIN_CONFIDENCE_SCORE) {
                for (const targetLang of targetLanguages) {                    
                    if (!((detection.language === 'zh-Hans' || detection.language === 'zh-Hant') && (targetLang === 'zh-Hans' || targetLang === 'zh-Hant')) && detection.language !== targetLang && this.allowedLanguages.includes(detection.language) && this.allowedLanguages.includes(targetLang)) {
                        result.action = true;
                        const translated = await this.translateRequest(query, detection.language, targetLang);
                        result.passage.push(`[${detection.language} -> ${targetLang}] ${translated}`);
                    }
                }
            }

            return result;
        } catch (err) {
			this.logger.error(`[Chat Sync] translation failed:\n${err.stack}`);
		}
    }
}

class ControllerPlugin extends BaseControllerPlugin {
	async init() {
		this.controller.config.on('fieldChanged', (field, curr, prev) => {
			if (field === 'ClusterChatSync.discord_bot_token') {
				this.connect().catch(err => {
					this.logger.error(`[Chat Sync] Discord bot token:\n${err.stack}`);
				});
			}
		});
		this.controller.handle(InstanceActionEvent, this.handleInstanceAction.bind(this));
		this.client = null;
		await this.connect();
	}

	async clientDestroy() {
		if (this.client) {
			this.client.destroy();
			this.client = null;
		}
	}

	async connect() {
		await this.clientDestroy();

		if (!this.controller.config.get('ClusterChatSync.discord_bot_token')) {
			this.logger.error('[Chat Sync] Discord bot token not configured.');
			return;
		}

		this.client = new Discord.Client({intents: [Discord.GatewayIntentBits.Guilds, Discord.GatewayIntentBits.GuildMessages, Discord.GatewayIntentBits.MessageContent]});
		this.logger.info('[Chat Sync] Logging into Discord.');

		try {
			await this.client.login(this.controller.config.get('ClusterChatSync.discord_bot_token'));
		} catch (err) {
			this.logger.error(`[Chat Sync] Discord login error:\n${err.stack}`);
			await this.clientDestroy();
			return;
		}

		this.logger.info('[Chat Sync] Logged in Discord successfully.');

		if (this.controller.config.get('ClusterChatSync.use_libretranslate')) {
			this.translator = new LibreTranslateAPI(this.controller.config.get('ClusterChatSync.libretranslate_url'), this.controller.config.get('ClusterChatSync.libretranslate_key'), this.logger);
			await this.translator.init();
			this.translator_language = this.controller.config.get('ClusterChatSync.libretranslate_language').trim().split(/\s+/) || ['zh-Hant', 'en'];
		}
	}

	async onShutdown() {
		await this.clientDestroy();
	}

	async sendMessage(request, nrc_msg) {
		const channel_id = this.controller.config.get('ClusterChatSync.discord_channel_mapping')[request.instanceName];
		if (!channel_id) return;
		let channel;
		
		try {
			channel = await this.client.channels.fetch(channel_id);

			if (channel === null) {
				this.logger.error(`[Chat Sync] Discord Channel ID ${channel_id} not found.`);
				return;
			}
		} catch (err) {
			if (err.code !== 10003) {
				this.logger.error(`[Chat Sync] Discord channel fetch error:\n${err.stack}`);
			}
		}

		if (this.controller.config.get('ClusterChatSync.datetime_on_message')) {
			let now = new Date();
			nrc_msg = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')} ${nrc_msg}`
		}

		if (nrc_msg.length <= MAX_DISCORD_MESSAGE_LENGTH) {
			await channel.send(nrc_msg, {allowedMentions: {parse: []}});
		} else {
			while (nrc_msg.length > 0) {
				let nrc_cmsg = nrc_msg.slice(0, MAX_DISCORD_MESSAGE_LENGTH);
				let nrc_lindex = nrc_cmsg.lastIndexOf(' ');
			
				if (nrc_lindex !== -1) {
					nrc_cmsg = nrc_cmsg.slice(0, nrc_lindex);
					nrc_msg = nrc_msg.slice(nrc_lindex).trim();
				} else {
					nrc_msg = nrc_msg.slice(MAX_DISCORD_MESSAGE_LENGTH).trim();
				}

				await channel.send(nrc_cmsg, {allowedMentions: {parse: []}});
			}
		}
	}

	async handleInstanceAction(request, src) {
		if (request.action === 'CHAT' || request.action === 'SHOUT') {
			const nrc = request.content.replace(/\[special-item=.*?\]/g, '<blueprint>').replace(/<@/g, '<@\u200c>');
			const nrc_index = nrc.indexOf(':');
			const nrc_username = nrc.substring(0, nrc_index);
			const nrc_message = nrc.substring(nrc_index + 1).trim();
			await this.sendMessage(request, `**\`${nrc_username}\`**: ${nrc_message}`);

			if (this.controller.config.get('ClusterChatSync.use_libretranslate')) {
				const result = await this.translator.translate(nrc_message, this.translator_language);

				if (result && result.action) {
					await this.sendMessage(request, `**\`${nrc_username}\`**: ${result.passage}`);
					this.controller.sendTo({ instanceId: this.instance.id }, new ChatEvent(this.controller.name, `[color=255,255,255]\`${nrc_username}\`: ${result}[/color]`));
				}
			}
		}
	}
}

module.exports = {ControllerPlugin};
