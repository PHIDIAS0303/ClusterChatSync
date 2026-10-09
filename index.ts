import type * as lib from '@clusterio/lib';
import {Type, Static} from '@sinclair/typebox';

export class ChatEvent {
	declare ['constructor']: typeof ChatEvent;
	static type = 'event' as const;
	static src = 'instance' as const;
	static dst = 'controller' as const;
	static plugin = 'ClusterChatSync' as const;
	static permission = null;

	constructor(
		public instanceName: string,
		public action: string,
		public content: string,
	) {
	}

	static jsonSchema = Type.Object({
		'instanceName': Type.String(),
		'action': Type.String(),
		'content': Type.String(),
	});

	static fromJSON(json: Static<typeof ChatEvent.jsonSchema>) {
		return new this(json.instanceName, json.action, json.content);
	}
}

declare module '@clusterio/lib' {
    interface ControllerConfigFields {
        'ClusterChatSync.discord_bot_token': string;
        'ClusterChatSync.datetime_on_message': boolean;
		'ClusterChatSync.discord_channel_mapping': Record<string, string>;
	}
}

export const plugin: lib.PluginDeclaration = {
	name: 'ClusterChatSync',
	title: 'Cluster Chat Sync',
	description: 'One way chat forward to Discord.',
	instanceEntrypoint: 'dist/node/instance.js',
	controllerEntrypoint: 'dist/node/controller.js',
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
			title: 'Discord Channels',
			description: 'Instance and Discord channel ID relations',
			type: 'object',
			initialValue: {
				'S1': '123'
			},
		},
	},
	messages: [
		ChatEvent,
	],
};
