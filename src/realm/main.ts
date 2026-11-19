import "./realm.css";
import { RealmApp } from "./app";

const root = document.querySelector<HTMLElement>("#app");
if (!root) throw new Error("Missing #app root element");

new RealmApp(root);
