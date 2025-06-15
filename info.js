'use strict';
const lib = require('@clusterio/lib');

class InstanceActionEvent {
	static type = 'event';
	static src = 'instance';
	static dst = 'controller';
	static plugin = 'chat_sync';

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
}

const plugin = {
	name: 'chat_sync',
	title: 'Cluster Chat Sync',
	description: 'One way chat sync.',
	instanceEntrypoint: 'instance',
	controllerEntrypoint: 'controller',
	controllerConfigFields: {
		'chat_sync.discord_bot_token': {
			title: 'Discord Bot Token',	
			description: 'API Token',
			type: 'string'
		},
		'chat_sync.datetime_on_message': {
			title: 'Message Datetime',
			description: 'Append datetime in front',
			type: 'boolean',
			initialValue: true
		},
		'chat_sync.discord_channel_mapping': {
			title: 'Channels',
			description: 'Putting the discord channel id and instance relations here',
			type: 'object',
			initialValue: {
				'S1': '123'
			},
		},
		'chat_sync.use_libretranslate': {
			title: 'Translate Message',
			description: 'Using self host or paid service of libretranslate',
			type: 'boolean',
			initialValue: false
		},
		'chat_sync.libretranslate_url': {
			title: 'Translate Server URL',
			description: 'Including http protocol, and the port if needed',
			type: 'string',
			initialValue: 'http://localhost:5000'
		},
		'chat_sync.libretranslate_key': {
			title: 'Translate Server API Key',
			description: 'The API key for the translate server',
			type: 'string',
			initialValue: '123456'
		},
		'chat_sync.libretranslate_language': {
			title: 'Translate Server Target Language',
			description: 'Put a space between each language, using ISO 639-1 codes',
			type: 'string',
			initialValue: 'zh-Hant en'
		},
	},
	messages: [InstanceActionEvent],
};

module.exports = {plugin, InstanceActionEvent};
