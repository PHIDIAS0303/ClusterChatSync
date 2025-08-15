const { Type } = require("@sinclair/typebox");

class ChatEvent {
    static type = "event";
    static src = ["control", "instance"];
    static dst = "instance";
    static plugin = "global_chat";
    static permission = null;
    
    static jsonSchema = Type.Object({
        "instanceName": Type.String(),
        "content": Type.String(),
    });

    constructor(instanceName, content) {
        this.instanceName = instanceName;
        this.content = content;
    }

    static fromJSON(json) {
        return new ChatEvent(json.instanceName, json.content);
    }
}

// If you need to use this class in other files
module.exports = { ChatEvent };
