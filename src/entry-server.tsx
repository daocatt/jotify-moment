import * as React from "react";
import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router";
import { App } from "./App";

export function render(url: string, initialData?: Record<string, unknown>) {
  return renderToString(
    <StaticRouter location={url}>
      <App initialData={initialData} initialPath={url} />
    </StaticRouter>
  );
}
