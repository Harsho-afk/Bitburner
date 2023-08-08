import { getServers } from './utils.js'

/** @param {NS} ns **/
export async function main(ns) {
    var startingNode = "home";
    const serverList = getServers(ns);
    for (const server of serverList) {
        if (server == startingNode)
            continue;

        if (ns.ps(server) === 0)
            continue;

        ns.killall(server);
    }
    for (const server of serverList) {
        if (server == startingNode)
            continue;
        while (ns.ps(server) > 0) {
            await ns.sleep(20);
        }
        for (let file of ns.ls(server, '.js'))
            ns.rm(file, server)
    }
}