declare const process: {env:Record<string,string|undefined>};
import {defineConfig} from "vite";
import {svelte} from "@sveltejs/vite-plugin-svelte";
const repo=process.env.GITHUB_REPOSITORY?.split("/").at(-1) ?? "HKIA-Save-Editor";
export default defineConfig({plugins:[svelte()],base:process.env.GITHUB_ACTIONS==="true"?"/"+repo+"/":"/"});
