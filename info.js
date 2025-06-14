"use strict";
const lib = require("@clusterio/lib");

class InstanceActionEvent {
	static type = "event";
	static src = "instance";
	static dst = "controller";
	static plugin = "ClusterChatSync";

	constructor(instanceName, action, content) {
		this.instanceName = instanceName;
		this.action = action;
		this.content = content;
	}

	static jsonSchema = {
		type: "object",
		required: ["instanceName", "action", "content"],
		properties: {
			"instanceName": { type: "string" },
			"action": { type: "string" },
			"content": { type: "string" },
		},
	};

	static fromJSON(json) {
		return new this(json.instanceName, json.action, json.content);
	}
}

const plugin = {
	name: "ClusterChatSync",
	title: "Cluster Chat Sync",
	description: "One way chat sync.",
	instanceEntrypoint: "instance",
	controllerEntrypoint: "controller",
	controllerConfigFields: {
		"ClusterChatSync.discord_bot_token": {
			title: "Discord Bot Token",	
			description: "API Token",
			type: "string"
		},
		"ClusterChatSync.datetime_on_message": {
			title: "Message Datetime",
			description: "Append datetime in front",
			type: "boolean",
			initialValue: true
		},
		"ClusterChatSync.discord_channel_mapping": {
			title: "Channels",
			description: "Putting the discord channel id and instance relations here",
			type: "object",
			initialValue: {
				"S1": "123"
			},
		},
		"ClusterChatSync.use_libretranslate": {
			title: "Translate Message",
			description: "Using self host or paid service of libretranslate",
			type: "boolean",
			initialValue: false
		},
		"ClusterChatSync.libretranslate_url": {
			title: "Translate Server URL",
			description: "Including http protocol, and the port if needed",
			type: "string",
			initialValue: "http://localhost:5000"
		},
		"ClusterChatSync.libretranslate_key": {
			title: "Translate Server API Key",
			description: "The API key for the translate server",
			type: "string",
			initialValue: "123456"
		},
		"ClusterChatSync.libretranslate_language": {
			title: "Translate Server Target Language",
			description: "Put a space between each language, using ISO 639-1 codes",
			type: "string",
			initialValue: "zh-Hants en"
		},
	},

	messages: [
		InstanceActionEvent
	],
};

module.exports = {
	plugin,
	InstanceActionEvent
};
