"use strict";
const lib = require("@clusterio/lib");
const { BaseInstancePlugin } = require("@clusterio/host");

class InstancePlugin extends BaseInstancePlugin {
	async init() {
		this.messageQueue = [];
	}

	onControllerConnectionEvent(event) {
		if (event === "connect") {
			for (let [action, content] of this.messageQueue) {
				this.sendChat(action, content);
			}
			this.messageQueue = [];
		}
	}

	sendChat(action, content) {
		this.instance.sendTo("controller",
			new InstanceActionEvent(this.instance.name, action, content)
		);
	}

	async onOutput(output) {
		if (output.type == "action") {
			this.messageQueue.push([output.action, output.message]);
		}
	}
}

module.exports = {
	InstancePlugin
};
