"use strict";
const Discord = require("discord.js");
const { BaseControllerPlugin } = require("@clusterio/controller");
const { InstanceActionEvent } = require("./info.js");

class ControllerPlugin extends BaseControllerPlugin {
	async init() {
		this.controller.config.on("fieldChanged", (field, curr, prev) => {
			if (field === "chat_sync.discord_bot_token") {
				this.connect().catch(err => { this.logger.error(`Unexpected error:\n${err.stack}`); });
			}
		});

		this.controller.handle(InstanceActionEvent, this.handleInstanceAction.bind(this));
		this.client = null;
		await this.connect();
	}

	async connect() {
		if (this.client) {
			this.client.destroy();
			this.client = null;
		}

		let token = this.controller.config.get("chat_sync.discord_bot_token");

		if (!token) {
			this.logger.warn("chat sync bot token not configured, so chat is offline");
			return;
		}

		this.client = new Discord.Client({
			intents: [
				Discord.GatewayIntentBits.Guilds,
				Discord.GatewayIntentBits.GuildMessages,
				Discord.GatewayIntentBits.MessageContent,
			],
		});

		this.logger.info("chat sync is logging in to Discord");

		try {
			await this.client.login(this.controller.config.get("chat_sync.discord_bot_token"));
		} catch (err) {
			this.logger.error(`chat sync have error logging in to discord, chat is offline:\n${err.stack}`);
			this.client.destroy();
			this.client = null;
			return;
		}

		this.logger.info("chat sync have successfully logged in");
	}

	async onShutdown() {
		if (this.client) {
			this.client.destroy();
			this.client = null;
		}
	}

	async handleInstanceAction(request, src) {
		if (request.action === "CHAT" || request.action === "SHOUT") {
			const channel_id = this.controller.config.get("chat_sync.discord_channel_mapping")[this.controller.instances.get(src.id) ?? ""];
			let channel = null;

			if (!channel_id) {
				return;
			}

			try {
				channel = await this.client.channels.fetch(channel_id);
			} catch (err) {
				if (err.code !== 10003) {
					throw err;
				}
			}

			if (channel === null) {
				this.logger.error(`chat sync discord hannel ID ${channel_id} was not found`);
				return;
			}

			const nrc = request.content.replace(/\[special-item=.*?\]/g, '<blueprint>').replace(/<@/g, '<@\u200c>');
			const nrc_index = nrc.indexOf(":");
			const nrc_username = nrc.substring(0, nrc_index);
			const nrc_message = nrc.substring(nrc_index + 1).trim();
			let nrc_msg = `**\`${nrc_username}\`** ${nrc_message}`

			if (this.controller.config.get("chat_sync.datetime_on_message")) {
				let now = new Date();
				let dt = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}${String(now.getSeconds()).padStart(2, '0')}`;
				nrc_msg = dt + ' ' + nrc_msg
			}

			await channel.send(nrc_msg, { allowedMentions: { parse: [] }});

			/*
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
			*/
		}
	}
}

module.exports = {
	ControllerPlugin
};
