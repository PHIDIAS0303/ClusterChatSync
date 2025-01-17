"use strict";
const lib = require("@clusterio/lib");
const { BaseInstancePlugin } = require("@clusterio/host");

class InstancePlugin extends BaseInstancePlugin {
	async init() {
		this.messageQueue = [];
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
