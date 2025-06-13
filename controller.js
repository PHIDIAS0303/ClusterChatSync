"use strict";
const Discord = require("discord.js");
const { BaseControllerPlugin } = require("@clusterio/controller");
const { InstanceActionEvent } = require("./info.js");

class LibreTranslateAPI {
    constructor(url, apiKey) {
        if (!url) throw new Error('url is required for LibreTranslate API');
        if (!apiKey) throw new Error('API key is required for LibreTranslate API');
        this.url = url.endsWith('/') ? url : url + '/';
        this.apiKey = apiKey;
        this.allowedLanguages = [];
    }

    async init() {
        try {
            const response = await fetch(`${this.url}languages?api_key=${this.apiKey}`, {method: 'GET'});
            const data = await response.json();
            this.allowedLanguages = data[0].targets;
        } catch (error) {
            console.error('Failed to initialize languages:', error);
            throw error;
        }
    }

    async translateRequest(q, source, target) {
        const params = new URLSearchParams();
        params.append('q', q);
        params.append('api_key', this.apiKey);
        params.append('source', source);
        params.append('target', target);

        const response = await fetch(`${this.url}translate`, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: params});
        const data = await response.json();
        return data.translatedText;
    }

    async detectLanguage(q) {
        const params = new URLSearchParams();
        params.append('q', q);
        params.append('api_key', this.apiKey);

        const response = await fetch(`${this.url}detect`, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: params});
        const data = await response.json();
        return data[0];
    }

    async translate(query, targetLanguages = ['zh-Hant', 'en']) {
        console.log(query);
        
        const result = {action: false, passage: []};

        try {
            const detection = await this.detectLanguage(query);
            
            if (detection.confidence > 10.0) {
                for (const targetLang of targetLanguages) {                    
                    if (!((detection.language === 'zh-Hans' || detection.language === 'zh-Hant') && (targetLang === 'zh-Hans' || targetLang === 'zh-Hant')) && detection.language !== targetLang && this.allowedLanguages.includes(detection.language) && this.allowedLanguages.includes(targetLang)) {
                        result.action = true;
                        const translated = await this.translateRequest(query, detection.language, targetLang);
                        result.passage.push(translated);
                    }
                }
            }
            
            return result;
        } catch (error) {
            console.error('Translation failed:', error);
            throw error;
        }
    }
}

class ControllerPlugin extends BaseControllerPlugin {
	async init() {
		this.controller.config.on('fieldChanged', (field, curr, prev) => {
			if (field === 'chat_sync.discord_bot_token') this.connect().catch(err => {this.logger.error(`Unexpected error:\n${err.stack}`);});
		});

		this.controller.handle(InstanceActionEvent, this.handleInstanceAction.bind(this));
		this.client = null;

		if (this.controller.config.get('chat_sync.use_libretranslate')) {
			this.translator = new LibreTranslateAPI(this.controller.config.get('chat_sync.libretranslate_url'), this.controller.config.get('chat_sync.libretranslate_key'));
			await this.translator.init();
			this.translator_language = this.controller.config.get('chat_sync.libretranslate_language').trim().split(/\s+/);
		}

		await this.connect();
	}

	async connect() {
		if (this.client) {
			this.client.destroy();
			this.client = null;
		}

		let token = this.controller.config.get('chat_sync.discord_bot_token');

		if (!token) {
			this.logger.warn('chat sync bot token not configured, so chat is offline');
			return;
		}

		this.client = new Discord.Client({
			intents: [
				Discord.GatewayIntentBits.Guilds,
				Discord.GatewayIntentBits.GuildMessages,
				Discord.GatewayIntentBits.MessageContent,
			],
		});

		this.logger.info('chat sync is logging in to Discord');

		try {
			await this.client.login(this.controller.config.get('chat_sync.discord_bot_token'));
		} catch (err) {
			this.logger.error(`chat sync have error logging in to discord, chat is offline:\n${err.stack}`);
			this.client.destroy();
			this.client = null;
			return;
		}

		this.logger.info('chat sync have successfully logged in');
	}

	async onShutdown() {
		if (this.client) {
			this.client.destroy();
			this.client = null;
		}
	}

	async sendMessage(nrc_msg) {
		const channel_id = this.controller.config.get('chat_sync.discord_channel_mapping')[request.instanceName];
		let channel = null;

		if (!channel_id) return;
		
		try {
			channel = await this.client.channels.fetch(channel_id);
		} catch (err) {
			if (err.code !== 10003) throw err;
		}

		if (channel === null) {
			this.logger.error(`chat sync discord hannel ID ${channel_id} was not found`);
			return;
		}
		
		if (this.controller.config.get("chat_sync.datetime_on_message")) {
			let now = new Date();
			let dt = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
			nrc_msg = `${dt} ${nrc_msg}`
		}

		if (nrc_msg.length <= 1950) {
			await channel.send(nrc_msg, { allowedMentions: { parse: [] }});
		} else {
			while (nrc_msg.length > 0) {
				let nrc_cmsg = nrc_msg.slice(0, 1950);
				let nrc_lindex = nrc_cmsg.lastIndexOf(' ');
			
				if (nrc_lindex !== -1) {
					nrc_cmsg = nrc_cmsg.slice(0, nrc_lindex);
					nrc_msg = nrc_msg.slice(nrc_lindex).trim();
				} else {
					nrc_msg = nrc_msg.slice(1950).trim();
				}

				await channel.send(nrc_cmsg, { allowedMentions: { parse: [] }});
			}
		}
	}

	async handleInstanceAction(request, src) {
		if (request.action === 'CHAT' || request.action === 'SHOUT') {
			const nrc = request.content.replace(/\[special-item=.*?\]/g, '<blueprint>').replace(/<@/g, '<@\u200c>');
			const nrc_index = nrc.indexOf(":");
			const nrc_username = nrc.substring(0, nrc_index);
			const nrc_message = nrc.substring(nrc_index + 1).trim();
			
			if (this.controller.config.get('chat_sync.use_libretranslate')) {
				const result = await this.translator.translate(nrc_message, this.translator_language);
				this.sendChat(`[color=255,255,255]\`${nrc_username}\`: ${result}[/color]`);

				// await sendMessage(`**\`${nrc_username}\`**: ${result}`)
			}

			await sendMessage(`**\`${nrc_username}\`**: ${nrc_message}`)
		}
	}
}

module.exports = {
	ControllerPlugin
};
