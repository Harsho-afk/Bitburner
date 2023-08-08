import { getServers, getRootAccess } from "./utils.js";

/** @param {NS} ns */
export async function main(ns) {
    while (true) {
        let servers = getServers(ns);
        servers = servers.filter((server) => getRootAccess(ns, server));
        let target = "joesguns";
        let weakenTime = ns.getWeakenTime(target);
        for (const server of servers) {
            ns.scp("eWeaken.js", server, "home");
            let threads = Math.max(Math.floor((ns.getServerMaxRam(server) - ns.getServerUsedRam(server)) / 1.75), 1);
            ns.exec("eWeaken.js", server, threads, target);
        }
        await ns.sleep(weakenTime + 5);
    }
}