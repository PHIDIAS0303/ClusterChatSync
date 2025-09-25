'use strict';
const Discord = require('discord.js');
const lib = require('@clusterio/lib');
const {BaseControllerPlugin} = require('@clusterio/controller');
const {InstanceActionEvent} = require('./info.js');

const MAX_DISCORD_MESSAGE_LENGTH = 1950;

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
		}
	}
}

module.exports = {ControllerPlugin};
