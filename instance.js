"use strict";
const lib = require("@clusterio/lib");
const {BaseInstancePlugin} = require("@clusterio/host");
const {InstanceActionEvent} = require("./info.js");

class InstancePlugin extends BaseInstancePlugin {
	async init() {this.messageQueue = [];}

	onControllerConnectionEvent(event) {
		if (event === 'connect') {
			for (const [action, content] of this.messageQueue) {try {this.instance.sendTo('controller', new InstanceActionEvent(this.instance.name, action, content))} catch (err) {this.messageQueue.push([output.action, output.message])}}
			this.messageQueue = [];
		}
	}

	async onOutput(output) {
		if (output.type !== 'action') return;
		if (this.host.connector.connected) {this.instance.sendTo('controller', new InstanceActionEvent(this.instance.name, output.action, output.message))} else {this.messageQueue.push([output.action, output.message])}
	}
}

module.exports = {InstancePlugin};
