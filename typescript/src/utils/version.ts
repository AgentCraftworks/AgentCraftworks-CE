import packageMetadata from "../../../package.json" with { type: "json" };

export const APP_VERSION = packageMetadata.version;
export const APP_USER_AGENT = `AgentCraftworks-CE/${APP_VERSION}`;
