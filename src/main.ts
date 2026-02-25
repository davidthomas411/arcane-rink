import "./styles.css";
import "./ui-theme.css";
import { mountApp } from "./app/App";

const root = document.querySelector<HTMLElement>("#app");

if (!root) {
  throw new Error("Missing #app root element");
}

mountApp(root);
