import * as lib from "@clusterio/lib";
import { BaseInstancePlugin } from "@clusterio/host";
import { InstanceActionEvent } from "./info";

type MessageQueueItem = [string, unknown]; // [action, content]
type ControllerEvent = 'connect' | 'disconnect' | string;
type OutputMessage = {
    type: string;
    action: string;
    message: unknown;
};

export class InstancePlugin extends BaseInstancePlugin {
	private messageQueue: MessageQueueItem[] = [];

    async init(): Promise<void> {
        this.messageQueue = [];
    }

    onControllerConnectionEvent(event: ControllerEvent): void {
        if (event === 'connect') {
            for (const [action, content] of this.messageQueue) {
                try {
                    this.instance.sendTo('controller', 
                        new InstanceActionEvent(this.instance.name, action, content));
                } catch (err) {
                    this.messageQueue.push([action, content]);
                    
                    // Optional: Log the error
                    console.error('Failed to send queued message:', err);
                }
            }
            this.messageQueue = [];
        }
    }

    async onOutput(output: OutputMessage): Promise<void> {
        if (output.type !== 'action') return;
        
        if (this.host.connector.connected) {
            this.instance.sendTo('controller', 
                new InstanceActionEvent(this.instance.name, output.action, output.message));
        } else {
            this.messageQueue.push([output.action, output.message]);
        }
    }
}
