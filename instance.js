"use strict";
const lib = require("@clusterio/lib");
const { BaseInstancePlugin } = require("@clusterio/host");
const { InstanceActionEvent } = require("./info.js");

class InstancePlugin extends BaseInstancePlugin {
	async init() {
		this.messageQueue = [];
	}

	onControllerConnectionEvent(event) {
		if (event === "connect") {
			for (let [action, content] of this.messageQueue) {
				this.instance.sendTo("controller", new InstanceActionEvent(this.instance.name, action, content));
			}
			this.messageQueue = [];
		}
	}

	async onOutput(output) {
		if (output.type == "action") {
			if (this.host.connector.connected) {
				this.instance.sendTo("controller", new InstanceActionEvent(this.instance.name, output.action, output.message));
			} else {
				this.messageQueue.push([output.action, output.message]);
			}
		}
	}
}

module.exports = {
	InstancePlugin
};
