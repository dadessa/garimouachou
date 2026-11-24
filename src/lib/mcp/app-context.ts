import { defineTool } from "@lovable.dev/mcp-js";

export interface AppContext {
  readonly isAdmin: boolean;
}
export const defineAppTool = defineTool.withAppContext<AppContext>();
