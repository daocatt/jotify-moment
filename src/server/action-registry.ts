import * as postsActions from "@/app/actions/posts";
import * as authActions from "@/app/actions/auth";
import * as adminActions from "@/app/actions/admin";
import * as commentsActions from "@/app/actions/comments";
import * as apiTokensActions from "@/app/actions/api-tokens";
import * as initActions from "@/app/actions/init";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ActionFn = (...args: any[]) => Promise<any>;

const actionMap = new Map<string, ActionFn>();

function registerActions(module: Record<string, unknown>) {
  for (const [key, value] of Object.entries(module)) {
    if (typeof value === "function") {
      actionMap.set(key, value as ActionFn);
    }
  }
}

registerActions(postsActions);
registerActions(authActions);
registerActions(adminActions);
registerActions(commentsActions);
registerActions(apiTokensActions);
registerActions(initActions);

export function getAction(name: string): ActionFn | undefined {
  return actionMap.get(name);
}
