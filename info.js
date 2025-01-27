"use strict";
const lib = require("@clusterio/lib");

class InstanceActionEvent {
	static type = "event";
	static src = "instance";
	static dst = "controller";
	static plugin = "chat_sync";

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
	name: "chat_sync",
	title: "Chat Sync",
	description: "One way chat sync.",
	instanceEntrypoint: "instance",
	controllerEntrypoint: "controller",
	controllerConfigFields: {
		"chat_sync.discord_bot_token": {
			title: "Discord Bot Token",
			description: "API Token",
			type: "string",
			optional: true,
		},
		"chat_sync.datetime_on_message": {
			title: "Message Datetime",
			description: "Append datetime in front",
			type: "boolean",
			initialValue: true,
			optional: true,
		},
		"chat_sync.discord_channel_mapping": {
			title: "Channels",
			description: "Putting the discord channel id and instance relations here",
			type: "object",
			initialValue: {
				"S1": "123"
			},
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
