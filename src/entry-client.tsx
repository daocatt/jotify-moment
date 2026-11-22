import * as React from "react";
import { hydrateRoot, createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import "./app/globals.css";
import "@/lib/theme-css.gen";

const container = document.getElementById("root");

if (container) {
  const win = window as unknown as { __INITIAL_DATA__?: Record<string, unknown> };
  const initialData = win.__INITIAL_DATA__;

  if (container.hasChildNodes()) {
    hydrateRoot(
      container,
      <React.StrictMode>
        <BrowserRouter>
          <App initialData={initialData} />
        </BrowserRouter>
      </React.StrictMode>
    );
  } else {
    createRoot(container).render(
      <React.StrictMode>
        <BrowserRouter>
          <App initialData={initialData} />
        </BrowserRouter>
      </React.StrictMode>
    );
  }
}
