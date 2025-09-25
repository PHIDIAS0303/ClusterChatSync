'use strict';
const lib = require('@clusterio/lib');

class InstanceActionEvent {
	static type = 'event';
	static src = 'instance';
	static dst = 'controller';
	static plugin = 'ClusterChatSync';

	constructor(instanceName, action, content) {
		this.instanceName = instanceName;
		this.action = action;
		this.content = content;
	}

	static jsonSchema = {
		type: 'object',
		required: ['instanceName', 'action', 'content'],
		properties: {'instanceName': {type: 'string'}, 'action': {type: 'string'}, 'content': {type: 'string'}}
	}

	static fromJSON(json) {
		return new this(json.instanceName, json.action, json.content);
	}

	static Response = lib.JsonString;
}

const plugin = {
	name: 'ClusterChatSync',
	title: 'Cluster Chat Sync',
	description: 'One way chat sync.',
	instanceEntrypoint: 'instance',
	controllerEntrypoint: 'controller',
	controllerConfigFields: {
		'ClusterChatSync.discord_bot_token': {
			title: 'Discord Bot Token',	
			description: 'API Token',
			type: 'string'
		},
		'ClusterChatSync.datetime_on_message': {
			title: 'Message Datetime',
			description: 'Append datetime in front',
			type: 'boolean',
			initialValue: true
		},
		'ClusterChatSync.discord_channel_mapping': {
			title: 'Channels',
			description: 'Putting the discord channel id and instance relations here',
			type: 'object',
			initialValue: {
				'S1': '123'
			},
		},
	},
	messages: [InstanceActionEvent],
};

module.exports = {plugin, InstanceActionEvent};
