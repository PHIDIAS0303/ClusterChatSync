import { Type, Static } from "@sinclair/typebox";
export class ChatEvent {
	// declare ["constructor"]: typeof ChatEvent;
	// as const
	static type = "event";
	// as const
	static src = ["control", "instance"];
	// as const
	static dst = "instance";
	// as const
	static plugin = "global_chat";
	static permission = null;

	/*
	constructor(
		public instanceName: string,
		public content: string,
	) {
	}
	*/

	static jsonSchema = Type.Object({
		"instanceName": Type.String(),
		"content": Type.String(),
	});

	// json: Static<typeof ChatEvent.jsonSchema>
	static fromJSON(json) {
		return new this(json.instanceName, json.content);
	}
}